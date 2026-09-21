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
using CoreScript.Engine.Core.Rewriters;

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
            // Reference + import lists live in ScriptReferenceProvider — shared
            // with ReplSessionManager and SemanticTrackingGuard.
            var coreRefs = ScriptReferenceProvider.GetCoreReferences("ScriptCompiler");
            var revitRefs = ScriptReferenceProvider.GetRevitReferences("ScriptCompiler");

            return ScriptOptions.Default
                .WithReferences(coreRefs.Concat(revitRefs))
                .WithImports(ScriptReferenceProvider.GetImports(includeRevitSelection: false))
                .WithFilePath(scriptName);
        }


    }
}
