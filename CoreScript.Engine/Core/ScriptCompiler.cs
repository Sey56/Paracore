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
            // ⚠⚠ THE CAPABILITY BOUNDARY — see ScriptSandbox. Harden() refuses `#r` and `#load`
            //   so the reference set cannot be re-opened at compile time, and ThrowIfForbidden()
            //   refuses a snippet that NAMES a machine capability (process, network, registry,
            //   native code, reflection). This is the compile-time half; the MCP's text scan is
            //   the other half, and it is a filter, not a boundary.
            var options = ScriptSandbox.Harden(GetScriptOptions(scriptName));
            // Inject ScriptApi parity and resolve Parameter ambiguity
            string fullCode = "using static CoreScript.Engine.Globals.ScriptApi;" + CoreScript.Engine.Globals.ScriptSurface.StaticImportsLine + Environment.NewLine +
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

            var script = CSharpScript.Create(fullCode, options, assemblyLoader: loader);

            // ⚠⚠ THE SEMANTIC CHECK IS HERE **AND** IN ReplSessionManager — both, unconditionally.
            //   Two gRPC entry points reach the compiler, and NEITHER is "the human one":
            //     execute_repl   → ReplSessionManager   (mcp_core/tools.py, both MCP tools)
            //     execute_script → CodeRunner → HERE     (paracore-forge/forge_core/engine.py:200,
            //                                             source=AGENT_SOURCE)
            //   A gallery script IS agent-generated code — forge writes it — and an earlier
            //   version of this comment claimed the opposite. OPERATOR RULING (2026-11-01): the
            //   protection belongs to the CODE, not to who runs it, so it is not gated on the
            //   caller's source string the way the text scan is.
            //   ⚠ The consequence, stated plainly: a hand-written gallery tool that spawns a
            //   process or touches the registry is refused too. That is the intended trade — the
            //   capability set is the product's boundary, not a per-caller setting.
            ScriptSandbox.ThrowIfForbidden(script);
            return script;
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
