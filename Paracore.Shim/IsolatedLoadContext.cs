using System;
using System.IO;
using System.Reflection;
using System.Runtime.Loader;

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
