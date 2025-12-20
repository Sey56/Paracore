using System;
using System.IO;
using System.Reflection;

namespace Paracore.Addin.Helpers
{
    public static class CustomAssemblyResolver
    {
        private static bool _initialized = false;

        public static void Initialize()
        {
            if (!_initialized)
            {
                AppDomain.CurrentDomain.AssemblyResolve += ResolveAssembly;
                _initialized = true;
            }
        }

        private static Assembly? ResolveAssembly(object? sender, ResolveEventArgs args)
        {
            var assemblyName = new AssemblyName(args.Name);
            var assemblyPath = Path.Combine(GetExecutingAssemblyDirectory(), assemblyName.Name + ".dll");

            if (File.Exists(assemblyPath))
            {
                return Assembly.LoadFrom(assemblyPath);
            }

            // Check in the parent directory for Revit assemblies
            var parentDirectory = Directory.GetParent(GetExecutingAssemblyDirectory())?.FullName;
            if (parentDirectory != null)
            {
                assemblyPath = Path.Combine(parentDirectory, assemblyName.Name + ".dll");
                if (File.Exists(assemblyPath))
                {
                    return Assembly.LoadFrom(assemblyPath);
                }
            }

            return null;
        }

        private static string GetExecutingAssemblyDirectory()
        {
            var codeBase = Assembly.GetExecutingAssembly().Location;
            var uri = new UriBuilder(codeBase);
            var path = Uri.UnescapeDataString(uri.Path);
            return Path.GetDirectoryName(path)!;
        }
    }
}
