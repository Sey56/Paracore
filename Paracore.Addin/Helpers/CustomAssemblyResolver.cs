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
                try { return Assembly.LoadFrom(assemblyPath); }
                catch (Exception ex) { LogErrorToLoaderLog($"Load failed for {args.Name}: {ex}"); }
            }

            // Check in the parent directory for Revit assemblies
            var parentDirectory = Directory.GetParent(GetExecutingAssemblyDirectory())?.FullName;
            if (parentDirectory != null)
            {
                assemblyPath = Path.Combine(parentDirectory, assemblyName.Name + ".dll");
                if (File.Exists(assemblyPath))
                {
                    try { return Assembly.LoadFrom(assemblyPath); }
                    catch (Exception ex) { LogErrorToLoaderLog($"Load failed for {args.Name}: {ex}"); }
                }
            }

            return null;
        }

        private static void LogErrorToLoaderLog(string message)
        {
            try
            {
                var logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs");
                if (!Directory.Exists(logDir)) Directory.CreateDirectory(logDir);
                File.AppendAllText(Path.Combine(logDir, "Loader.log"), $"[{DateTime.Now}] {message}{Environment.NewLine}");
            }
            catch { /* Silent fail */ }
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
