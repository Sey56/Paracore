using System;
using System.IO;
using System.Reflection;
using System.Runtime.Loader;
using System.Threading;

namespace Paracore.Shim
{
    /// <summary>
    /// Isolated AssemblyLoadContext that ensures Paracore's dependencies
    /// are loaded from its own bundle folder, not from the Default context
    /// where pyRevit or other add-ins may have loaded conflicting versions.
    /// </summary>
    public sealed class IsolatedLoadContext : AssemblyLoadContext
    {
        private readonly string _basePath;
        private readonly AssemblyDependencyResolver _resolver;

        /// <summary>
        /// The ONE assembly whose duplication is fatal. <c>ExecutionGlobals.Current</c> is an
        /// <c>AsyncLocal</c> static, so two copies of this DLL mean two disjoint sets of statics:
        /// the host sets context in the bubble, the script reads it in Default and sees null.
        /// All other bundles (Roslyn, Grpc, …) are merely unwanted in Default; this one is
        /// a correctness bug as soon as it appears there.
        /// </summary>
        private const string EngineAssemblyName = "CoreScript.Engine";

        private static int _engineResolverInstalled;
        private static int _engineGuardHitLogged;

        /// <summary>
        /// Roots searched for specialist packs. A pack (takeoff, clash detection, …) is
        /// installed OUTSIDE the add-in folder on purpose: the add-in installer's
        /// `[InstallDelete]` wipes the whole `Addins\&lt;year&gt;\Paracore` tree on every
        /// upgrade, so anything kept in there would be destroyed.
        ///
        /// ⚠ MIRRORS `CoreScript.Engine.Packs.PackCatalog`. The shim is deliberately
        /// dependency-free — it must not reference the engine, or it could conflict with
        /// another add-in — so the two roots cannot be shared. <b>Change both together.</b>
        /// </summary>
        private static readonly string[] PackRoots =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Paracore", "Packs"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "packs"),
        };

        public IsolatedLoadContext(string basePath)
            : base("ParacoreIsolated", isCollectible: false)
        {
            _basePath = basePath;
            _resolver = new AssemblyDependencyResolver(
                Path.Combine(basePath, "Paracore.Addin.dll"));

            InstallEngineResolver();
        }

        // -------------------------------------------------------------------
        //  THE 2027 REPL FIX — keep the script bound to THIS bubble's engine.
        //
        //  Measured 2026-11-06 in Revit 2027: the same physical
        //  CoreScript.Engine.dll was loaded twice — once here (ParacoreIsolated)
        //  and once in Default. ScriptApi.Globals threw "Script context is not
        //  available" from the Default copy, where ExecutionGlobals.Current was
        //  null. RegisterDependency had registered all 20 bubble assemblies, so
        //  this was NOT a missing-dependency problem.
        //
        //  Roslyn's CoreAssemblyLoaderImpl deliberately returns null from Load()
        //  and resolves in this order: TPA -> Default.Resolving -> its own
        //  Resolving (the interactive loader). A host resolver that answers
        //  Default.Resolving therefore wins BEFORE RegisterDependency is ever
        //  consulted, and loads a second copy of the engine into Default.
        //
        //  Fix: answer that same Default.Resolving request with the engine from
        //  this bubble. Then the script, the host, the timeout/budget guards and
        //  every engine type all share ONE assembly — no statics bridge, no
        //  dynamic casts, and no change to engine source.
        //
        //  ⚠ Registering last is NOT enough: Default.Resolving handlers run in
        //  registration order and the first non-null wins, and Revit registers
        //  its own handler before our shim is loaded. So the handler is
        //  promoted to the front of the invocation list. It answers ONE name
        //  and returns null for everything else, so every other handler keeps
        //  its behaviour and its order.
        // -------------------------------------------------------------------

        /// <summary>
        /// Installs the guard once per process. Idempotent: a second bubble (or a second
        /// OnStartup) must not add a second handler to a process-wide event.
        /// </summary>
        private void InstallEngineResolver()
        {
            if (Interlocked.Exchange(ref _engineResolverInstalled, 1) != 0)
                return;

            // Evidence, not an assertion: if a Default copy already predates us, no
            // Resolving event will ever fire for it and this guard cannot help. Say so
            // in the shim log instead of pretending the fix is in place.
            bool alreadyInDefault = false;
            foreach (var a in AssemblyLoadContext.Default.Assemblies)
            {
                if (string.Equals(a.GetName().Name, EngineAssemblyName, StringComparison.OrdinalIgnoreCase))
                {
                    alreadyInDefault = true;
                    break;
                }
            }

            Func<AssemblyLoadContext, AssemblyName, Assembly?> handler = (_, name) =>
                string.Equals(name.Name, EngineAssemblyName, StringComparison.OrdinalIgnoreCase)
                    ? ResolveEngineInBubble()
                    : null;

            bool promoted = TryInstallFirst(handler);
            ParacoreShim.Log(
                $"Engine guard: installed {(promoted ? "FIRST" : "LAST (backing delegate unavailable)")}" +
                $"; engine already in Default at startup={alreadyInDefault}");

            if (alreadyInDefault)
            {
                ParacoreShim.Log(
                    "WARNING: a Default-context CoreScript.Engine predates this shim; " +
                    "the guard cannot retroactively remove it. Check ParacoreShimLog on restart.");
            }
        }

        /// <summary>
        /// The bubble's own engine assembly, loading it from the bundle on first use.
        /// Never loads into Default — that is the exact failure this prevents.
        /// </summary>
        private Assembly? ResolveEngineInBubble()
        {
            try
            {
                Assembly? found = null;
                foreach (var a in Assemblies)
                {
                    if (string.Equals(a.GetName().Name, EngineAssemblyName, StringComparison.OrdinalIgnoreCase))
                    {
                        found = a;
                        break;
                    }
                }

                if (found == null)
                {
                    string path = Path.Combine(_basePath, EngineAssemblyName + ".dll");
                    if (File.Exists(path))
                        found = LoadFromAssemblyPath(path);
                }

                if (found != null && Interlocked.Exchange(ref _engineGuardHitLogged, 1) == 0)
                {
                    var alc = AssemblyLoadContext.GetLoadContext(found);
                    ParacoreShim.Log(
                        $"Engine guard: served CoreScript.Engine from '{alc?.Name ?? "<default>"}' — script bound to the bubble");
                }

                return found;
            }
            catch (Exception ex)
            {
                ParacoreShim.Log($"Engine guard: could not resolve engine in bubble: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Adds <paramref name="handler"/> at the FRONT of Default.Resolving, preserving every
        /// existing handler and their relative order. Reflection is used only to read the
        /// event's invocation list; the actual edit uses the public add/remove accessors.
        /// Returns false when the runtime layout changed — in that case the handler is still
        /// installed (last), which is correct on hosts with no competing resolver.
        /// </summary>
        private static bool TryInstallFirst(Func<AssemblyLoadContext, AssemblyName, Assembly?> handler)
        {
            Delegate[]? existing = null;
            bool fieldFound = false;
            try
            {
                var field = typeof(AssemblyLoadContext).GetField(
                    "_resolving", BindingFlags.Instance | BindingFlags.NonPublic);
                fieldFound = field != null;
                existing = (field?.GetValue(AssemblyLoadContext.Default) as MulticastDelegate)
                    ?.GetInvocationList();
            }
            catch (Exception ex)
            {
                ParacoreShim.Log($"Engine guard: cannot inspect Default.Resolving: {ex.Message}");
            }

            if (existing == null)
            {
                // A present-but-null backing field means there are NO host handlers yet,
                // so a plain add still puts us first. Only a missing field is a real
                // downgrade — handlers we cannot read cannot be reordered.
                AssemblyLoadContext.Default.Resolving += handler;
                return fieldFound;
            }

            try
            {
                foreach (var d in existing)
                    AssemblyLoadContext.Default.Resolving -= (Func<AssemblyLoadContext, AssemblyName, Assembly?>)d;

                AssemblyLoadContext.Default.Resolving += handler;

                foreach (var d in existing)
                    AssemblyLoadContext.Default.Resolving += (Func<AssemblyLoadContext, AssemblyName, Assembly?>)d;

                return true;
            }
            catch (Exception ex)
            {
                // A half-rebuilt resolver chain is worse than a late handler: it could
                // strip a host handler permanently. Rebuild the ORIGINAL chain from
                // `existing` (remove clears any partial duplicates), then append ours.
                ParacoreShim.Log($"Engine guard: promotion failed, restoring host handlers: {ex.Message}");
                foreach (var d in existing)
                {
                    try { AssemblyLoadContext.Default.Resolving -= (Func<AssemblyLoadContext, AssemblyName, Assembly?>)d; } catch { }
                }
                foreach (var d in existing)
                {
                    try { AssemblyLoadContext.Default.Resolving += (Func<AssemblyLoadContext, AssemblyName, Assembly?>)d; } catch { }
                }
                try { AssemblyLoadContext.Default.Resolving += handler; } catch { }
                return false;
            }
        }

        protected override Assembly? Load(AssemblyName assemblyName)
        {
            if (string.IsNullOrEmpty(assemblyName.Name))
                return null;

            // 1. Bundle folder takes priority (our isolated dependencies: Grpc, Protobuf, CodeAnalysis, etc.)

            string bundlePath = Path.Combine(_basePath, assemblyName.Name + ".dll");
            if (File.Exists(bundlePath))
                return LoadFromAssemblyPath(bundlePath);

            // 1b. Pack roots. The generic add-in loads packs by path at startup
            //     (CoreScript.Engine.Packs.PackLoader); this probe is what lets the runtime
            //     resolve a pack by NAME afterwards — e.g. when a script's compiled assembly
            //     reaches for a type the pack declares.
            string? packPath = FindInPackRoots(assemblyName.Name);
            if (packPath != null)
                return LoadFromAssemblyPath(packPath);

            // 2. Dependency resolver (.deps.json based)
            string? resolved = _resolver.ResolveAssemblyToPath(assemblyName);
            if (resolved != null && File.Exists(resolved))
                return LoadFromAssemblyPath(resolved);

            // 3. Delegate to Default context (Revit, .NET runtime, WPF, etc.)
            return null;
        }

        /// <summary>
        /// Finds &lt;paramref name="simpleName"/&gt;.dll inside one folder per pack, under each
        /// pack root. Unreadable or absent roots are skipped — a missing pack folder must not
        /// stop the add-in from loading.
        /// </summary>
        private static string? FindInPackRoots(string simpleName)
        {
            foreach (string root in PackRoots)
            {
                try
                {
                    if (!Directory.Exists(root))
                        continue;

                    foreach (string packDir in Directory.EnumerateDirectories(root))
                    {
                        string candidate = Path.Combine(packDir, simpleName + ".dll");
                        if (File.Exists(candidate))
                            return candidate;
                    }
                }
                catch (UnauthorizedAccessException) { }
                catch (DirectoryNotFoundException) { }
            }

            return null;
        }

        protected override IntPtr LoadUnmanagedDll(string unmanagedDllName)
        {
            string? path = _resolver.ResolveUnmanagedDllToPath(unmanagedDllName);
            return path != null ? LoadUnmanagedDllFromPath(path) : IntPtr.Zero;
        }
    }
}
