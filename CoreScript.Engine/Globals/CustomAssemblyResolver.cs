using System;
using System.IO;
using System.Reflection;

namespace CoreScript.Engine.Globals
{
    public class CustomAssemblyResolver
    {
        private static readonly string HomePath = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile); // Define here

        public static void Initialize()
        {
            AppDomain.CurrentDomain.AssemblyResolve += (sender, args) =>
            {
                var name = new AssemblyName(args.Name);
                if (name.Name != "Microsoft.CodeAnalysis") return null;

                var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Microsoft.CodeAnalysis.dll");
                if (!File.Exists(path)) return null;

                try
                {
                    return Assembly.LoadFrom(path);
                }
                catch (Exception ex)
                {
                    File.AppendAllText(Path.Combine(HomePath, "Loader.log"),
                        $"[{DateTime.Now}] Load failed: {ex}");
                    return null;
                }
            };
        }
    }
}