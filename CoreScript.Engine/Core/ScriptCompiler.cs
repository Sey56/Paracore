using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CoreScript.Engine.Logging;

namespace CoreScript.Engine.Core
{
    public class ScriptCompiler : IScriptCompiler
    {
        public Script<object> CreateScript(string code, string scriptName)
        {
            var options = GetScriptOptions(scriptName);
            // Inject ScriptApi parity and resolve Parameter ambiguity
            string fullCode = "using static CoreScript.Engine.Globals.ScriptApi;" + Environment.NewLine +
                              "using Parameter = Autodesk.Revit.DB.Parameter;" + Environment.NewLine +
                              code;

            // Create a loader that is aware of assemblies in our isolated ALC.
            // Without this, Roslyn's default loader only sees Default context assemblies,
            // causing "Script context is not available" when running inside the shim.
            var loader = new Microsoft.CodeAnalysis.Scripting.Hosting.InteractiveAssemblyLoader();
            var currentAlc = AssemblyLoadContext.GetLoadContext(typeof(ScriptCompiler).Assembly);
            if (currentAlc != null)
            {
                foreach (var asm in currentAlc.Assemblies)
                {
                    try { loader.RegisterDependency(asm); } catch { }
                }
            }

            return CSharpScript.Create(fullCode, options, assemblyLoader: loader);
        }


        public string GetCodeHash(string code)
        {
            if (string.IsNullOrEmpty(code))
            {
                return string.Empty;
            }

            using (var sha = SHA256.Create())
            {
                var bytes = Encoding.UTF8.GetBytes(code);
                var hash = sha.ComputeHash(bytes);
                return Convert.ToBase64String(hash);
            }
        }

        public byte[] CompileToBytes(string code)
        {
            var script = CreateScript(code, "ScriptAssembly");
            var compilation = script.GetCompilation();

            using (var ms = new MemoryStream())
            {
                var result = compilation.Emit(ms);
                if (!result.Success)
                {
                    var errors = string.Join(Environment.NewLine, result.Diagnostics
                        .Where(d => d.Severity == DiagnosticSeverity.Error)
                        .Select(d => d.ToString()));
                    throw new Exception($"Compilation failed: {errors}");
                }
                return ms.ToArray();
            }
        }

        private ScriptOptions GetScriptOptions(string scriptName)
        {
            string revitInstallPath = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
            var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
            var revitRefs = revitDllPaths.Where(IsManagedAssembly).Select(path => MetadataReference.CreateFromFile(path)).ToList();

            var coreTypes = new[] {
                typeof(object), typeof(Enumerable), typeof(Assembly), typeof(List<>),
                typeof(Math), typeof(ScriptCompiler), typeof(JsonSerializer),
                typeof(Microsoft.CSharp.RuntimeBinder.Binder),
                typeof(System.Runtime.CompilerServices.DynamicAttribute),
                typeof(System.Linq.Expressions.Expression),
                typeof(System.Dynamic.DynamicObject)
            };
            var coreRefs = coreTypes
                .Select(t => {
                    try
                    {
                        var loc = t.Assembly.Location;
                        if (!string.IsNullOrEmpty(loc) && File.Exists(loc))
                            return MetadataReference.CreateFromFile(loc);
                    }
                    catch { }
                    // Fallback: resolve by simple name (handles shared framework
                    // churn after .NET runtime updates — e.g. 8.0.27 → 8.0.28).
                    string asmName = t.Assembly.GetName().Name;
                    if (!string.IsNullOrEmpty(asmName))
                    {
                        try
                        {
                            var resolved = Assembly.Load(asmName);
                            if (!string.IsNullOrEmpty(resolved.Location) && File.Exists(resolved.Location))
                                return MetadataReference.CreateFromFile(resolved.Location);
                        }
                        catch { }
                    }
                    FileLogger.LogWarning($"[ScriptCompiler] Could not resolve reference for {t.FullName}");
                    return null;
                })
                .Where(r => r != null)
                .Cast<MetadataReference>()
                .ToList();

            string engineDir = Path.GetDirectoryName(typeof(ScriptCompiler).Assembly.Location) ?? "";
            string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll", "MathNet.Numerics.dll" };
            foreach (var dllName in extraDlls)
            {
                string dllPath = Path.Combine(engineDir, dllName);
                if (File.Exists(dllPath))
                {
                    coreRefs.Add(MetadataReference.CreateFromFile(dllPath));
                }
            }

            return ScriptOptions.Default
                .WithReferences(coreRefs.Concat(revitRefs))
                .WithImports(
                    "System", "System.IO", "System.Linq", "System.Collections.Generic", "System.Text.Json", "System.Globalization",
                    "Microsoft.CSharp",
                    "Autodesk.Revit.DB",
                    "Autodesk.Revit.DB.Architecture",
                    "Autodesk.Revit.DB.Structure",
                    "Autodesk.Revit.DB.Mechanical",
                    "Autodesk.Revit.DB.Plumbing",
                    "Autodesk.Revit.DB.Electrical",
                    "Autodesk.Revit.UI",
                    "CoreScript.Engine.Globals", "CoreScript.Engine.Runtime",
                    "SixLabors.ImageSharp", "SixLabors.ImageSharp.Processing", "SixLabors.ImageSharp.PixelFormats",
                    "MiniExcelLibs",
                    "MathNet.Numerics", "MathNet.Numerics.LinearAlgebra", "MathNet.Numerics.Statistics"
                )
                .WithFilePath(scriptName);
        }

        private static bool IsManagedAssembly(string path)
        {
            try
            {
                AssemblyName.GetAssemblyName(path);
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
