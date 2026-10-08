using System.Reflection;
using System.Runtime.Loader;

namespace CoreScript.Engine.Packs
{
    /// <summary>
    /// Discovers packs in <see cref="PackCatalog"/> and registers them with the engine.
    ///
    /// This is the generic add-in's pack host: it is what turns "a specialist tool was
    /// installed on this machine" into "its script-facing API is callable from every script
    /// the engine compiles, and its enterprise gate is open".
    ///
    /// ⚠ Packs are loaded into the SAME AssemblyLoadContext that holds this engine, not into
    /// a fresh one. That is deliberate and load-bearing: a pack registers itself by calling
    /// into engine statics (<c>LicenseContext</c>, <c>ScriptSurface</c>, <c>RibbonSurface</c>),
    /// and those statics only mean anything if both assemblies share one context. Loading a
    /// pack into its own bubble would give it a private copy of the engine's statics and it
    /// would register into a surface nobody reads.
    /// </summary>
    public static class PackLoader
    {
        private static readonly object _gate = new();
        private static readonly List<string> _loaded = [];
        private static readonly List<string> _failures = [];

        /// <summary>
        /// The <see cref="IParacorePack.Name"/> of every pack registered in this process, in
        /// load order. Empty when no pack is installed — which is the normal state of a
        /// free-only install, and is exactly what the enterprise gates key off.
        /// </summary>
        public static IReadOnlyList<string> LoadedPacks
        {
            get
            {
                lock (_gate)
                {
                    return [.. _loaded];
                }
            }
        }

        /// <summary>
        /// <c>"&lt;pack name&gt;: &lt;message&gt;"</c> for every pack that was FOUND but could
        /// not be registered, in load order.
        ///
        /// ⚠ A pack that throws is skipped, not fatal — losing the whole add-in because one
        /// specialist pack announced itself badly is a far worse outcome than losing the pack.
        /// But a skipped pack is invisible otherwise: its ribbon button simply never appears,
        /// which reads as "the installer did not work". Callers must therefore REPORT this
        /// list, not just log it.
        /// </summary>
        public static IReadOnlyList<string> LoadFailures
        {
            get
            {
                lock (_gate)
                {
                    return [.. _failures];
                }
            }
        }

        /// <summary>
        /// Loads and registers every pack found in every pack root.
        /// Call once at add-in startup, before any script can be compiled.
        /// Never throws: a broken pack must not stop Revit from loading.
        /// </summary>
        /// <returns>How many packs were registered.</returns>
        public static int LoadAll()
        {
            AssemblyLoadContext context =
                AssemblyLoadContext.GetLoadContext(typeof(PackLoader).Assembly)
                ?? AssemblyLoadContext.Default;

            int count = 0;
            foreach (string path in PackCatalog.EnumerateAssemblies())
            {
                if (TryRegister(path, context))
                {
                    count++;
                }
            }

            return count;
        }

        private static bool TryRegister(string path, AssemblyLoadContext context)
        {
            Assembly assembly;
            try
            {
                assembly = context.LoadFromAssemblyPath(path);
            }
            catch (FileLoadException)
            {
                // Already loaded in this context — a second copy on disk is not an error.
                return false;
            }
            catch (BadImageFormatException)
            {
                // A native or non-managed DLL that happens to sit in a pack folder.
                return false;
            }
            catch (FileNotFoundException)
            {
                return false;
            }

            return RegisterPacksIn(assembly);
        }

        private static bool RegisterPacksIn(Assembly assembly)
        {
            Type[] types;
            try
            {
                types = assembly.GetTypes();
            }
            catch (ReflectionTypeLoadException ex)
            {
                // A pack whose dependencies are missing still gets a chance: whatever types
                // DID load are inspected, and the rest are simply not packs.
                List<Type> loaded = [];
                foreach (Type? t in ex.Types)
                {
                    if (t != null)
                    {
                        loaded.Add(t);
                    }
                }

                types = [.. loaded];
            }

            bool registeredAny = false;
            foreach (Type type in types)
            {
                if (type.IsAbstract || type.IsInterface || type.IsGenericTypeDefinition)
                {
                    continue;
                }

                if (!typeof(IParacorePack).IsAssignableFrom(type))
                {
                    continue;
                }

                if (type.GetConstructor(Type.EmptyTypes) == null)
                {
                    // A pack must be constructible by the host; one that is not is a defect in
                    // the pack, and is skipped rather than allowed to break startup.
                    continue;
                }

                IParacorePack? pack;
                try
                {
                    pack = Activator.CreateInstance(type) as IParacorePack;
                }
                catch (Exception ex)
                {
                    RecordFailure(type.FullName ?? type.Name, ex);
                    continue;
                }

                if (pack == null)
                {
                    continue;
                }

                // ⚠ Guarded. Register() is where a pack announces itself, and an announcement
                // it gets wrong — a ribbon contribution that is not an IExternalCommand, a
                // missing icon path, a bad setting file — would otherwise propagate straight
                // out of OnStartup and take the ENTIRE add-in down. Revit would then load with
                // no ribbon at all, which is a much worse failure than one absent button and
                // is very hard to attribute back to the pack.
                try
                {
                    pack.Register();
                }
                catch (Exception ex)
                {
                    RecordFailure(pack.Name, ex);
                    continue;
                }

                lock (_gate)
                {
                    if (!_loaded.Contains(pack.Name))
                    {
                        _loaded.Add(pack.Name);
                    }
                }

                registeredAny = true;
            }

            return registeredAny;
        }

        private static void RecordFailure(string packName, Exception ex)
        {
            lock (_gate)
            {
                _failures.Add($"{packName}: {ex.Message}");
            }

            CoreScript.Engine.Logging.FileLogger.LogError(
                $"[PackLoader] Pack '{packName}' failed to register and was skipped: {ex}");
        }
    }
}
