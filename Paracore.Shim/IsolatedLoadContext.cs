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

            // ASP.NET Core and Extensions assemblies MUST come from the shared framework.
            // These DLLs have internal cross-references and type forwarding that only work
            // when loaded as a complete unit by the .NET host. Loading individual DLLs from
            // our bundle causes MissingMethodException because the internal wiring is broken.
            //
            // PREREQUISITE: The ASP.NET Core 8 Runtime must be installed on the machine.
            // The installer validates this before allowing installation.
            // pyRevit does not use these assemblies, so skipping them is safe for isolation.
            if (assemblyName.Name.StartsWith("Microsoft.Extensions.", StringComparison.OrdinalIgnoreCase) ||
                assemblyName.Name.StartsWith("Microsoft.AspNetCore.", StringComparison.OrdinalIgnoreCase))
                return null;

            // 1. Bundle folder takes priority (our isolated dependencies: Grpc, Protobuf, CodeAnalysis, etc.)
            string bundlePath = Path.Combine(_basePath, assemblyName.Name + ".dll");
            if (File.Exists(bundlePath))
                return LoadFromAssemblyPath(bundlePath);

            // 2. Dependency resolver (.deps.json based)
            string? resolved = _resolver.ResolveAssemblyToPath(assemblyName);
            if (resolved != null && File.Exists(resolved))
                return LoadFromAssemblyPath(resolved);

            // 3. Delegate to Default context (Revit, .NET runtime, WPF, etc.)
            return null;
        }

        protected override IntPtr LoadUnmanagedDll(string unmanagedDllName)
        {
            string? path = _resolver.ResolveUnmanagedDllToPath(unmanagedDllName);
            return path != null ? LoadUnmanagedDllFromPath(path) : IntPtr.Zero;
        }
    }
}
