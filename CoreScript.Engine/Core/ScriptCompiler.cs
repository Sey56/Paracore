using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    public class ScriptCompiler : IScriptCompiler
    {
        public Script<object> CreateScript(string code, string scriptName)
        {
            var options = GetScriptOptions(scriptName);
            return CSharpScript.Create(code, options);
        }

        public byte[] CompileToBytes(string code)
        {
            // Implementation for binary compilation if needed
            return Array.Empty<byte>();
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
            var coreRefs = coreTypes.Select(t => MetadataReference.CreateFromFile(t.Assembly.Location)).ToList();

            string engineDir = Path.GetDirectoryName(typeof(ScriptCompiler).Assembly.Location) ?? "";
            string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll", "MathNet.Numerics.dll" };
            foreach (var dllName in extraDlls)
            {
                string dllPath = Path.Combine(engineDir, dllName);
                if (File.Exists(dllPath)) coreRefs.Add(MetadataReference.CreateFromFile(dllPath));
            }

            return ScriptOptions.Default
                .WithReferences(coreRefs.Concat(revitRefs))
                .WithImports(
                    "System", "System.IO", "System.Linq", "System.Collections.Generic", "System.Text.Json", 
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
                    "RestSharp", "MiniExcelLibs", 
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
