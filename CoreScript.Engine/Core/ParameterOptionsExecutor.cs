using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using CoreScript.Engine.Core.Rewriters;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Text;
using System.Text.Json;
using System.Globalization;

namespace CoreScript.Engine.Core
{
    public class OptionsGlobals
    {
        public ExecutionGlobals Context { get; set; }
    }

    public class ParameterOptionsExecutor : IParameterOptionsExecutor
    {
        private readonly ILogger _logger;
        private readonly IParameterService _parameterService;

        public ParameterOptionsExecutor(ILogger logger, IParameterService parameterService)
        {
            _logger = logger;
            _parameterService = parameterService;
        }

        private ScriptOptions GetScriptOptions()
        {
            var refs = new List<Assembly> {
                typeof(Autodesk.Revit.DB.Document).Assembly,
                typeof(UIDocument).Assembly,
                typeof(Autodesk.Revit.DB.Architecture.Room).Assembly,
                Assembly.GetExecutingAssembly(),
                typeof(ValueTuple<,,>).Assembly,
                typeof(System.Collections.IEnumerable).Assembly,
                typeof(object).Assembly,
                typeof(Enumerable).Assembly
            };

            var scriptOptions = ScriptOptions.Default
                .AddReferences(refs)
                .AddImports(
                    "System", "System.IO", "System.Linq", "System.Collections.Generic", "System.Text.Json",
                    "Microsoft.CSharp",
                    "Autodesk.Revit.DB",
                    "Autodesk.Revit.DB.Architecture",
                    "Autodesk.Revit.DB.Structure",
                    "Autodesk.Revit.DB.Mechanical",
                    "Autodesk.Revit.DB.Plumbing",
                    "Autodesk.Revit.DB.Electrical",
                    "Autodesk.Revit.UI",
                    "CoreScript.Engine.Globals",
                    "SixLabors.ImageSharp", "SixLabors.ImageSharp.Processing", "SixLabors.ImageSharp.PixelFormats",
                    "RestSharp", "MiniExcelLibs",
                    "MathNet.Numerics", "MathNet.Numerics.LinearAlgebra", "MathNet.Numerics.Statistics"
                );

            string engineDir = Path.GetDirectoryName(typeof(ParameterOptionsExecutor).Assembly.Location) ?? "";
            string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll", "MathNet.Numerics.dll" };
            foreach (var dllName in extraDlls)
            {
                string dllPath = Path.Combine(engineDir, dllName);
                if (File.Exists(dllPath))
                {
                    scriptOptions = scriptOptions.AddReferences(MetadataReference.CreateFromFile(dllPath));
                }
            }

            return scriptOptions;
        }

        public async Task<List<string>> ExecuteOptionsFunction(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema)
        {
            var rawResult = await ExecuteInternal(scriptContent, parameterName, context, parametersJson, schema);
            if (rawResult == null)
            {
                return new List<string>();
            }

            List<string> result = new List<string>();
            if (rawResult is System.Collections.IEnumerable enumerable)
            {
                foreach (var item in enumerable)
                {
                    if (item == null)
                    {
                        continue;
                    }

                    if (item is Element el)
                    {
                        result.Add(ParameterOptionsComputer.GetElementIdentity(el));
                    }
                    else
                    {
                        result.Add(item.ToString() ?? "");
                    }
                }
            }
            return result;
        }

        public async Task<List<object>> ExecuteElementOptionsFunction(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema)
        {
            var rawResult = await ExecuteInternal(scriptContent, parameterName, context, parametersJson, schema);
            if (rawResult == null)
            {
                return new List<object>();
            }

            List<object> result = new List<object>();
            if (rawResult is System.Collections.IEnumerable enumerable)
            {
                foreach (var item in enumerable)
                {
                    if (item != null)
                    {
                        result.Add(item);
                    }
                }
            }
            return result;
        }

        private async Task<object> ExecuteInternal(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema)
        {
            try
            {
                _logger.Log($"[ParameterOptionsExecutor] Executing options function for parameter: {parameterName}", LogLevel.Debug);

                var parameters = _parameterService.MapParameters(parametersJson, out var richParams);
                _parameterService.HardenParameters(parameters, schema);

                string functionName = $"{parameterName}_Options";
                string filterName = $"{parameterName}_Filter";

                var tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot();
                var paramsClass = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault(c => c.Identifier.Text == "Params");

                var functionNode = paramsClass?.Members.FirstOrDefault(n => (n is MethodDeclarationSyntax m && m.Identifier.Text == functionName) || (n is PropertyDeclarationSyntax p && p.Identifier.Text == functionName));
                if (functionNode == null)
                {
                    functionNode = paramsClass?.Members.FirstOrDefault(n => (n is MethodDeclarationSyntax m && m.Identifier.Text == filterName) || (n is PropertyDeclarationSyntax p && p.Identifier.Text == filterName));
                    if (functionNode != null)
                    {
                        functionName = filterName;
                    }
                }

                if (functionNode == null)
                {
                    return null;
                }

                bool isFilter = functionName == filterName;
                string membersSource;
                if (paramsClass != null)
                {
                    var rewriter = new ParameterPullingRewriter();
                    var rewrittenClass = (ClassDeclarationSyntax)rewriter.Visit(paramsClass);
                    membersSource = string.Join("\n", rewrittenClass.Members.Select(m => m.ToString()));
                }
                else
                {
                    membersSource = functionNode.ToString();
                }

                var scriptOptions = GetScriptOptions();

                var executionGlobals = new ExecutionGlobals(context, parameters);
                // Set the async local for the current pre-execution thread just in case
                ExecutionGlobals.SetContext(executionGlobals);

                var sb = new StringBuilder();
                sb.AppendLine("using Autodesk.Revit.DB; using Autodesk.Revit.DB.Architecture; using Autodesk.Revit.UI; using System; using System.Collections.Generic; using System.Linq; using CoreScript.Engine.Globals; using CoreScript.Engine.Core; using static CoreScript.Engine.Globals.ScriptApi;");
                sb.AppendLine("using Microsoft.CSharp; using Autodesk.Revit.DB.Structure; using Autodesk.Revit.DB.Mechanical; using Autodesk.Revit.DB.Plumbing; using Autodesk.Revit.DB.Electrical;");
                    
                    // Bulletproof context injection using Roslyn's globals object
                    sb.AppendLine("ExecutionGlobals.SetContext(Context);");
                    
                    sb.AppendLine("var wrapper = new ParamsWrapper();");

                var properties = paramsClass?.Members
                    .OfType<PropertyDeclarationSyntax>()
                    .Where(p => p.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)))
                    .ToList() ?? new List<PropertyDeclarationSyntax>();

                var param = schema.FirstOrDefault(p => p.Name == parameterName);
                string targetItemType = param?.RevitElementType ?? "Element";
                string category = param?.RevitElementCategory ?? "";

                foreach (var propSyntax in properties)
                {
                    string propName = propSyntax.Identifier.Text;
                    if (propName == parameterName)
                    {
                        continue;
                    }

                    if (propSyntax.ExpressionBody != null)
                    {
                        continue;
                    }

                    bool hasSetter = false;
                    if (propSyntax.AccessorList != null)
                    {
                        hasSetter = propSyntax.AccessorList.Accessors.Any(probs =>
                            probs.IsKind(SyntaxKind.SetAccessorDeclaration) ||
                            probs.IsKind(SyntaxKind.InitAccessorDeclaration));
                    }

                    if (!hasSetter)
                    {
                        continue;
                    }

                    var typeName = propSyntax.Type.ToString();
                    sb.AppendLine($"try {{ wrapper.{propName} = ExecutionGlobals.Get<{typeName}>(\"{propName}\"); }} catch {{ }}");
                }

                if (isFilter)
                {
                    sb.AppendLine($"var baseItems = new ParameterOptionsComputer(ExecutionGlobals.Current.Value.Doc).ComputeElementOptions(\"{targetItemType}\", \"{category}\");");
                    // Use dynamic to avoid strict assembly/type matching issues in Roslyn for loadable families
                    sb.AppendLine($"var result = baseItems.Where(item => {{ try {{ return wrapper.{functionName}((dynamic)item); }} catch {{ return false; }} }}).ToList();");
                }
                else
                {
                    sb.AppendLine($"var result = wrapper.{(functionNode is PropertyDeclarationSyntax ? functionName : $"{functionName}()")};");
                }

                sb.AppendLine("return result;");
                sb.AppendLine("public class ParamsWrapper { " + membersSource + " }");

                var globalsObj = new OptionsGlobals { Context = executionGlobals };

                var loader = new Microsoft.CodeAnalysis.Scripting.Hosting.InteractiveAssemblyLoader();
                var currentAlc = System.Runtime.Loader.AssemblyLoadContext.GetLoadContext(typeof(ParameterOptionsExecutor).Assembly);
                if (currentAlc != null)
                {
                    foreach (var asm in currentAlc.Assemblies)
                    {
                        try { loader.RegisterDependency(asm); } catch { }
                    }
                }

                var script = CSharpScript.Create<object>(sb.ToString(), scriptOptions, globalsType: typeof(OptionsGlobals), assemblyLoader: loader);
                var resultState = await script.RunAsync(globalsObj);
                return resultState.ReturnValue;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ParameterOptionsExecutor] Error: {ex.Message}");
                return null;
            }
        }

        public async Task<(double Min, double Max, double Step)?> ExecuteRangeFunction(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema)
        {
            try
            {
                var parameters = _parameterService.MapParameters(parametersJson, out var richParams);
                _parameterService.HardenParameters(parameters, schema);

                string functionName = $"{parameterName}_Range";
                var tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot();
                var paramsClass = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault(c => c.Identifier.Text == "Params");
                var functionNode = paramsClass?.Members.FirstOrDefault(n => (n is MethodDeclarationSyntax m && m.Identifier.Text == functionName) || (n is PropertyDeclarationSyntax p && p.Identifier.Text == functionName));
                if (functionNode == null)
                {
                    return null;
                }

                string membersSource;
                if (paramsClass != null)
                {
                    var rewriter = new ParameterPullingRewriter();
                    var rewrittenClass = (ClassDeclarationSyntax)rewriter.Visit(paramsClass);
                    membersSource = string.Join("\n", rewrittenClass.Members.Select(m => m.ToString()));
                }
                else
                {
                    membersSource = functionNode.ToString();
                }

                var scriptOptions = GetScriptOptions();

                var executionGlobals = new ExecutionGlobals(context, parameters);
                ExecutionGlobals.SetContext(executionGlobals);

                var sb = new StringBuilder();
                sb.AppendLine("using Autodesk.Revit.DB; using Autodesk.Revit.DB.Architecture; using Autodesk.Revit.UI; using System; using System.Collections.Generic; using System.Linq; using CoreScript.Engine.Globals; using static CoreScript.Engine.Globals.ScriptApi;");
                sb.AppendLine("using Microsoft.CSharp; using Autodesk.Revit.DB.Structure; using Autodesk.Revit.DB.Mechanical; using Autodesk.Revit.DB.Plumbing; using Autodesk.Revit.DB.Electrical;");
                sb.AppendLine($"var result = (new ParamsWrapper()).{(functionNode is PropertyDeclarationSyntax ? functionName : $"{functionName}()")};");
                sb.AppendLine("return result;");
                sb.AppendLine("public class ParamsWrapper { " + membersSource + " }");

                var result = await CSharpScript.EvaluateAsync(sb.ToString(), scriptOptions);
                if (result == null)
                {
                    return null;
                }

                var type = result.GetType();
                if (type.IsGenericType && type.Name.StartsWith("ValueTuple"))
                {
                    var fields = type.GetFields();
                    if (fields.Length >= 3)
                    {
                        return (Convert.ToDouble(fields[0].GetValue(result)), Convert.ToDouble(fields[1].GetValue(result)), Convert.ToDouble(fields[2].GetValue(result)));
                    }
                }
                return null;
            }
            catch { return null; }
        }

        public bool HasOptionsFunction(string scriptContent, string parameterName)
        {
            return scriptContent.Contains($" {parameterName}_Options") || scriptContent.Contains($" {parameterName}_Filter");
        }

        public bool HasRangeFunction(string scriptContent, string parameterName)
        {
            return scriptContent.Contains($" {parameterName}_Range");
        }
    }
}
