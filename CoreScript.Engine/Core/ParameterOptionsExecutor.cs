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
    public class ParameterOptionsExecutor
    {
        private readonly ILogger _logger;

        public ParameterOptionsExecutor(ILogger logger)
        {
            _logger = logger;
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
                if (File.Exists(dllPath)) scriptOptions = scriptOptions.AddReferences(MetadataReference.CreateFromFile(dllPath));
            }

            return scriptOptions;
        }

        public async Task<List<string>> ExecuteOptionsFunction(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema)
        {
            try
            {
                _logger.Log($"[ParameterOptionsExecutor] Executing options function for parameter: {parameterName}", LogLevel.Debug);

                // FIX: Use the authoritative schema passed from the service
                var parameters = MapAndHarden(parametersJson, schema);

                string functionName = $"{parameterName}_Options";
                string filterName = $"{parameterName}_Filter";
                
                var tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot();
                var paramsClass = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault(c => c.Identifier.Text == "Params");

                var functionNode = paramsClass?.Members.FirstOrDefault(n => (n is MethodDeclarationSyntax m && m.Identifier.Text == functionName) || (n is PropertyDeclarationSyntax p && p.Identifier.Text == functionName));
                if (functionNode == null)
                {
                    functionNode = paramsClass?.Members.FirstOrDefault(n => (n is MethodDeclarationSyntax m && m.Identifier.Text == filterName) || (n is PropertyDeclarationSyntax p && p.Identifier.Text == filterName));
                    if (functionNode != null) functionName = filterName;
                }

                if (functionNode == null) return new List<string>();

                string membersSource;
                if (paramsClass != null)
                {
                    var rewriter = new ParameterPullingRewriter();
                    var rewrittenClass = (ClassDeclarationSyntax)rewriter.Visit(paramsClass);
                    membersSource = string.Join("\n", rewrittenClass.Members.Select(m => m.ToString()));
                }
                else membersSource = functionNode.ToString();

                var scriptOptions = GetScriptOptions();

                var executionGlobals = new ExecutionGlobals(context, parameters);
                ExecutionGlobals.SetContext(executionGlobals);

                var sb = new StringBuilder();
                sb.AppendLine("using Autodesk.Revit.DB; using Autodesk.Revit.DB.Architecture; using Autodesk.Revit.UI; using System; using System.Collections.Generic; using System.Linq; using CoreScript.Engine.Globals; using static CoreScript.Engine.Globals.ScriptApi;");
                sb.AppendLine("using Microsoft.CSharp; using Autodesk.Revit.DB.Structure; using Autodesk.Revit.DB.Mechanical; using Autodesk.Revit.DB.Plumbing; using Autodesk.Revit.DB.Electrical;");
                sb.AppendLine($"var result = (new ParamsWrapper()).{(functionNode is PropertyDeclarationSyntax ? functionName : $"{functionName}()")};");
                sb.AppendLine("return result;");
                sb.AppendLine("public class ParamsWrapper { " + membersSource + " }");

                // --- V3 CRITICAL DEBUG LOGGING ---
                try {
                    string debugPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "paracore-data", "logs", "OptionsDebug.cs");
                    Directory.CreateDirectory(Path.GetDirectoryName(debugPath));
                    var debugContent = new StringBuilder();
                    debugContent.AppendLine("// PARAMETERS STATE (HARDENED):");
                    foreach (var kv in parameters) debugContent.AppendLine($"// {kv.Key}: {kv.Value} ({kv.Value?.GetType().Name})");
                    debugContent.AppendLine("\n" + sb.ToString());
                    File.WriteAllText(debugPath, debugContent.ToString());
                } catch { }

                var rawResult = await CSharpScript.EvaluateAsync<object>(sb.ToString(), scriptOptions);
                if (rawResult == null) return new List<string>();

                List<string> result = new List<string>();
                if (rawResult is System.Collections.IEnumerable enumerable)
                {
                    foreach (var item in enumerable)
                    {
                        if (item == null) continue;
                        if (item is Element el) result.Add(ParameterOptionsComputer.GetElementIdentity(el));
                        else result.Add(item.ToString() ?? "");
                    }
                }
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError($"[ParameterOptionsExecutor] Error: {ex.Message}");
                throw new InvalidOperationException(ex.Message);
            }
        }

        public async Task<(double Min, double Max, double Step)?> ExecuteRangeFunction(string scriptContent, string parameterName, ICoreScriptContext context, string parametersJson, List<ScriptParameter> schema)
        {
            try
            {
                var parameters = MapAndHarden(parametersJson, schema);
                string functionName = $"{parameterName}_Range";
                var tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot();
                var paramsClass = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault(c => c.Identifier.Text == "Params");
                var functionNode = paramsClass?.Members.FirstOrDefault(n => (n is MethodDeclarationSyntax m && m.Identifier.Text == functionName) || (n is PropertyDeclarationSyntax p && p.Identifier.Text == functionName));
                if (functionNode == null) return null;

                string membersSource;
                if (paramsClass != null)
                {
                    var rewriter = new ParameterPullingRewriter();
                    var rewrittenClass = (ClassDeclarationSyntax)rewriter.Visit(paramsClass);
                    membersSource = string.Join("\n", rewrittenClass.Members.Select(m => m.ToString()));
                }
                else membersSource = functionNode.ToString();

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
                if (result == null) return null;

                var type = result.GetType();
                if (type.IsGenericType && type.Name.StartsWith("ValueTuple"))
                {
                    var fields = type.GetFields();
                    if (fields.Length >= 3) return (Convert.ToDouble(fields[0].GetValue(result)), Convert.ToDouble(fields[1].GetValue(result)), Convert.ToDouble(fields[2].GetValue(result)));
                }
                return null;
            }
            catch { return null; }
        }

        private Dictionary<string, object> MapAndHarden(string json, List<ScriptParameter> schema)
        {
            var dict = new Dictionary<string, object>();
            if (string.IsNullOrWhiteSpace(json)) return dict;
            try
            {
                using (JsonDocument doc = JsonDocument.Parse(json))
                {
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        var rich = JsonSerializer.Deserialize<List<ScriptParameter>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<ScriptParameter>();
                        foreach (var p in rich) if (!string.IsNullOrEmpty(p.Name)) dict[p.Name] = ConvertJsonElement(p.Value);
                        Harden(dict, rich);
                    }
                    else
                    {
                        var raw = JsonSerializer.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
                        foreach (var kv in raw) if (!string.IsNullOrEmpty(kv.Key)) dict[kv.Key] = kv.Value is JsonElement e ? ConvertJsonElement(e) : kv.Value;
                        Harden(dict, schema); // FIX: Use the authoritative schema passed as argument
                    }
                }
            } catch (Exception ex) { FileLogger.LogError($"[MapAndHarden] Failed: {ex.Message}"); }
            return dict;
        }

        private void Harden(Dictionary<string, object> parameters, List<ScriptParameter> schema)
        {
            if (schema == null) return;
            foreach (var p in schema)
            {
                if (parameters.TryGetValue(p.Name, out var val) && !string.IsNullOrEmpty(p.Unit))
                {
                    try {
                        double d = 0;
                        bool success = false;
                        if (val is double dv) { d = dv; success = true; }
                        else if (val is int iv) { d = (double)iv; success = true; }
                        else if (val is long lv) { d = (double)lv; success = true; }
                        else if (val != null) success = double.TryParse(val.ToString(), NumberStyles.Any, CultureInfo.InvariantCulture, out d);

                        if (success) {
                            ForgeTypeId unitTypeId = null;
                            string u = p.Unit.ToLower().Trim();
                            if (u == "mm") unitTypeId = UnitTypeId.Millimeters;
                            else if (u == "cm") unitTypeId = UnitTypeId.Centimeters;
                            else if (u == "m") unitTypeId = UnitTypeId.Meters;
                            else if (u == "ft") unitTypeId = UnitTypeId.Feet;
                            else if (u == "in" || u == "inch") unitTypeId = UnitTypeId.Inches;
                            else if (u == "m2" || u == "sqm" || u == "square meters") unitTypeId = UnitTypeId.SquareMeters;
                            else if (u == "ft2" || u == "sqft" || u == "square feet") unitTypeId = UnitTypeId.SquareFeet;
                            else if (u == "m3" || u == "cum" || u == "cubic meters") unitTypeId = UnitTypeId.CubicMeters;
                            else if (u == "ft3" || u == "cuft" || u == "cubic feet") unitTypeId = UnitTypeId.CubicFeet;

                            if (unitTypeId != null) 
                            {
                                double internalVal = UnitUtils.ConvertToInternalUnits(d, unitTypeId);
                                parameters[p.Name] = internalVal;
                                _logger.Log($"[OptionsExecutor] Hardened parameter '{p.Name}': {d} {u} -> {internalVal} (Internal)", LogLevel.Debug);
                            }
                        }
                    } catch {}
                }
            }
        }

        private object ConvertJsonElement(JsonElement element)
        {
            switch (element.ValueKind) {
                case JsonValueKind.String: return element.GetString() ?? "";
                case JsonValueKind.Number: return element.TryGetInt32(out int i) ? i : element.GetDouble();
                case JsonValueKind.True: return true;
                case JsonValueKind.False: return false;
                case JsonValueKind.Array: return element.EnumerateArray().Select(ConvertJsonElement).ToList();
                default: return element.GetRawText();
            }
        }

        public bool HasOptionsFunction(string scriptContent, string parameterName) => scriptContent.Contains($" {parameterName}_Options") || scriptContent.Contains($" {parameterName}_Filter");
        public bool HasRangeFunction(string scriptContent, string parameterName) => scriptContent.Contains($" {parameterName}_Range");
    }
}
