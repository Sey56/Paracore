using System;
using System.Reflection;
using System.Runtime.Loader;
using System.IO;

namespace Paracore.Addin.Helpers
{
    public class ParacoreLoadContext : AssemblyLoadContext
    {
        private readonly string _addinPath;
        private readonly AssemblyDependencyResolver _resolver;

        public ParacoreLoadContext(string addinPath) : base("ParacoreIsolatedContext", isCollectible: false)
        {
            _addinPath = addinPath;
            _resolver = new AssemblyDependencyResolver(addinPath);
        }

        protected override Assembly? Load(AssemblyName assemblyName)
        {
            // 1. Prioritize Add-in Bundle Folder
            string bundlePath = Path.Combine(_addinPath, assemblyName.Name + ".dll");
            if (File.Exists(bundlePath))
            {
                return LoadFromAssemblyPath(bundlePath);
            }

            // 2. Fallback to Resolver (may resolve to System/GAC)
            string? assemblyPath = _resolver.ResolveAssemblyToPath(assemblyName);
            if (assemblyPath != null && File.Exists(assemblyPath))
            {
                return LoadFromAssemblyPath(assemblyPath);
            }

            // 3. Delegate back to Default context
            return null;
        }

        protected override IntPtr LoadUnmanagedDll(string unmanagedDllName)
        {
            string? libraryPath = _resolver.ResolveUnmanagedDllToPath(unmanagedDllName);
            if (libraryPath != null)
            {
                return LoadUnmanagedDllFromPath(libraryPath);
            }

            return IntPtr.Zero;
        }
    }
}
