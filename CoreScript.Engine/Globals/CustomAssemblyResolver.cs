using System;
using System.IO;
using System.Reflection;

namespace CoreScript.Engine.Globals
{
    public class CustomAssemblyResolver
    {

        public static void Initialize()
        {
            AppDomain.CurrentDomain.AssemblyResolve += (sender, args) =>
            {
                var name = new AssemblyName(args.Name).Name;
                if (string.IsNullOrEmpty(name)) return null;

                // Only attempt to resolve Roslyn-related assemblies that are known to conflict
                if (!name.StartsWith("Microsoft.CodeAnalysis")) return null;

                try
                {
                    // Attempt to find the DLL in the engine's base directory
                    var baseDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                    if (string.IsNullOrEmpty(baseDir)) return null;

                    var path = Path.Combine(baseDir, name + ".dll");
                    if (File.Exists(path))
                    {
                        return Assembly.LoadFrom(path);
                    }
                }
                catch (Exception ex)
                {
                    LogErrorToLoaderLog($"Load failed for {args.Name}: {ex}");
                }
                return null;
            };
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
    }
}
