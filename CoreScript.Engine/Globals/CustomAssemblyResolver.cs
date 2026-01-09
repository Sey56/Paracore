using System;
using System.IO;
using System.Reflection;

namespace CoreScript.Engine.Globals
{
    public class CustomAssemblyResolver
    {
        private static string? _addinFolder;

        public static void Initialize()
        {
            // Capture the folder where Paracore.Addin is located
            _addinFolder = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

            AppDomain.CurrentDomain.AssemblyResolve += ResolveAssembly;
        }

        private static Assembly? ResolveAssembly(object? sender, ResolveEventArgs args)
        {
            if (string.IsNullOrEmpty(_addinFolder)) return null;

            var assemblyName = new AssemblyName(args.Name).Name;
            if (string.IsNullOrEmpty(assemblyName)) return null;

            // We only care about assemblies we ship that might conflict (Roslyn, Immutable, etc.)
            bool isTarget = assemblyName.StartsWith("Microsoft.CodeAnalysis") || 
                             assemblyName.StartsWith("System.Collections.Immutable") ||
                             assemblyName.StartsWith("System.Reflection.Metadata") ||
                             assemblyName.StartsWith("Microsoft.CSharp");

            if (!isTarget) return null;

            var assemblyPath = Path.Combine(_addinFolder, assemblyName + ".dll");

            if (File.Exists(assemblyPath))
            {
                try
                {
                    // Load the assembly from our folder to bypass Revit's conflict
                    return Assembly.LoadFrom(assemblyPath);
                }
                catch (Exception ex)
                {
                    var logPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "ParacoreLoader.log");
                    File.AppendAllText(logPath, $"[{DateTime.Now}] Failed to load {assemblyName} from {assemblyPath}: {ex.Message}\n");
                }
            }

            return null;
        }
    }
}
