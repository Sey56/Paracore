using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Product-owned implementation of the Paracore → Dynamo Params/Methods export.
    ///
    /// <para>
    /// This is the single implementation used by both the desktop "Export Dynamo" action and the
    /// gallery harness. It performs no writes: it returns artifact bytes and relative paths, and
    /// the caller decides where to place them. That keeps the contract deterministic and lets a
    /// dry run prove the same code path as a real write.
    /// </para>
    /// </summary>
    public static partial class DynamoExportService
    {
        /// <summary>Input to a Params, Methods, Graph or DesignTables export.</summary>
        public sealed record Request(
            string Mode,
            string SourceParamsFile = "",
            string SourceScriptFile = "",
            string ClassPrefix = "",
            string NodeClassName = "",
            string AssemblyName = "",
            string PackageName = "",
            string OutputFolder = "",
            string DynamoVersion = "3.3",
            bool WriteFiles = false,
            bool OverwriteExisting = false,
            string GraphName = "");

        /// <summary>One file to write, relative to the package folder.</summary>
        public sealed record Artifact(string RelativePath, byte[] Bytes);

        /// <summary>Result of an export build. On failure <see cref="ErrorMessage"/> is populated.</summary>
        public sealed record Result(
            bool Success,
            IReadOnlyList<string> Report,
            IReadOnlyList<Artifact> Artifacts,
            string GeneratedSource,
            string AssemblyName,
            string PackageName,
            string ContractJson,
            string ContractSha256,
            string PackageDir,
            string ErrorMessage)
        {
            /// <summary>Stable JSON envelope for the backend endpoint.</summary>
            public string ToJson() => JsonSerializer.Serialize(this, new JsonSerializerOptions
            {
                WriteIndented = false
            });
        }

        /// <summary>
        /// Build a Dynamo ZeroTouch package in memory for one gallery source.
        /// </summary>
        public static Result Build(Request request)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));

            try
            {
                string exportMode = (request.Mode ?? "Methods").Trim();
                bool paramsMode = exportMode.Equals("Params", StringComparison.OrdinalIgnoreCase);
                bool methodsMode = exportMode.Equals("Methods", StringComparison.OrdinalIgnoreCase);
                bool graphMode = exportMode.Equals("Graph", StringComparison.OrdinalIgnoreCase);
                if (!paramsMode && !methodsMode && !graphMode)
                    throw new InvalidOperationException(
                        "Export Mode must be 'Methods' or 'Graph'. Got: " + exportMode);

                // Graph owns its artifact set and contract.
                if (graphMode) return BuildGraph(request);

                string dynamoVersion = string.IsNullOrWhiteSpace(request.DynamoVersion)
                    ? "3.3"
                    : request.DynamoVersion.Trim();

                string outRoot = string.IsNullOrWhiteSpace(request.OutputFolder)
                    ? Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                        "Dynamo", "Dynamo Revit", dynamoVersion, "packages")
                    : Path.GetFullPath(request.OutputFolder.Trim());

                var report = new List<string>();
                var contractLines = new List<string>();
                var declaredUnits = new List<string>();
                var excludedUiMembers = new List<string>();
                int exportedNodeCount = 0;
                string sourceFile = "";
                string generatedSource = "";
                string assemblyName = "";
                string packageName = "";
                string manifestDescription = "";
                string manifestContents = "";

                if (paramsMode)
                {
                    sourceFile = (request.SourceParamsFile ?? "").Trim();
                    if (string.IsNullOrEmpty(sourceFile))
                        throw new InvalidOperationException("Source Params File is empty. Paste the full path to a gallery tool's Params.cs.");
                    if (!File.Exists(sourceFile))
                        throw new FileNotFoundException("Source Params File not found", sourceFile);

                    string className = (request.NodeClassName ?? "").Trim();
                    if (string.IsNullOrEmpty(className)) className = "ParacoreParamsNodes";

                    assemblyName = (request.AssemblyName ?? "").Trim();
                    if (string.IsNullOrEmpty(assemblyName)) assemblyName = className;

                    packageName = (request.PackageName ?? "").Trim();
                    if (string.IsNullOrEmpty(packageName)) packageName = "Paracore_" + className;

                    manifestDescription = "ZeroTouch input nodes generated from the Params class of " +
                        Path.GetFileName(sourceFile).Replace("\"", "") + ".";
                    manifestContents = "One pass-through node per parameter plus BuildParamSet.";

                    string srcText = File.ReadAllText(sourceFile);
                    string[] lines = ExtractParamsClassLines(srcText, sourceFile);
                    bool inlineClass = !Path.GetFileName(sourceFile).Equals("Params.cs", StringComparison.OrdinalIgnoreCase);
                    var props = new List<PParam>();
                    string pendingSummary = "";
                    string pendingUnit = "";
                    string pendingRange = "";

                    foreach (string raw in lines)
                    {
                        string s = raw.Trim();

                        int a = s.IndexOf("<summary>");
                        int b = s.IndexOf("</summary>");
                        if (a >= 0 && b > a)
                        {
                            pendingSummary = s.Substring(a + 9, b - a - 9).Trim();
                            continue;
                        }
                        if (s.StartsWith("[Unit(\""))
                        {
                            int q1 = s.IndexOf('"') + 1;
                            int q2 = s.IndexOf('"', q1);
                            if (q2 > q1)
                            {
                                pendingUnit = s.Substring(q1, q2 - q1);
                                if (!declaredUnits.Contains(pendingUnit)) declaredUnits.Add(pendingUnit);
                            }
                            continue;
                        }
                        if (s.StartsWith("[Range("))
                        {
                            int o = s.IndexOf('(');
                            int c = s.LastIndexOf(')');
                            if (c > o) pendingRange = s.Substring(o + 1, c - o - 1).Trim();
                            continue;
                        }
                        if (s.Contains("_Options") || s.Contains("_Visible"))
                        {
                            string memberName = s;
                            int arrow = memberName.IndexOf("=>");
                            if (arrow >= 0) memberName = memberName.Substring(0, arrow).Trim();
                            int braceAt = memberName.IndexOf('{');
                            if (braceAt >= 0) memberName = memberName.Substring(0, braceAt).Trim();
                            int publicAt = memberName.IndexOf("public ");
                            if (publicAt >= 0) memberName = memberName.Substring(publicAt + 7).Trim();
                            string[] nameBits = memberName.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                            if (nameBits.Length > 0)
                            {
                                string kind = s.Contains("_Visible") ? "visible" : "options";
                                excludedUiMembers.Add(nameBits[nameBits.Length - 1] + " (" + kind + ")");
                            }
                            continue;
                        }
                        if (s.StartsWith("[") || s.StartsWith("//") || s.StartsWith("#")) continue;
                        if (!s.StartsWith("public ")) continue;

                        int brace = s.IndexOf("{ get; set; }");
                        if (brace < 0) continue;
                        string head = s.Substring(7, brace - 7).Trim();
                        string[] parts = head.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length < 2) continue;
                        string type = parts[parts.Length - 2];
                        string name = parts[parts.Length - 1];
                        if (name == "Params") continue;

                        string def = "";
                        int eq = s.IndexOf('=', brace + 13);
                        if (eq >= 0)
                        {
                            int semi = s.IndexOf(';', eq);
                            def = semi > eq ? s.Substring(eq + 1, semi - eq - 1).Trim() : s.Substring(eq + 1).Trim();
                        }

                        props.Add(new PParam
                        {
                            Name = name,
                            Type = type,
                            Summary = pendingSummary,
                            Unit = pendingUnit,
                            Range = pendingRange,
                            Default = def
                        });
                        pendingSummary = ""; pendingUnit = ""; pendingRange = "";
                    }

                    if (props.Count == 0)
                        throw new InvalidOperationException("No auto-properties parsed from " + sourceFile +
                            ". Expected `public TYPE Name { get; set; } = ...;` lines.");

                    var sb = new StringBuilder();
                    sb.AppendLine("using System;");
                    sb.AppendLine("using System.Collections.Generic;");
                    sb.AppendLine("using System.Reflection;");
                    sb.AppendLine();
                    sb.AppendLine("[assembly: AssemblyVersion(\"1.0.0.0\")]");
                    sb.AppendLine("[assembly: AssemblyFileVersion(\"1.0.0.0\")]");
                    sb.AppendLine();
                    sb.AppendLine("namespace ParacoreDynamoBridge");
                    sb.AppendLine("{");
                    sb.AppendLine("    /// <summary>");
                    sb.AppendLine("    /// ZeroTouch input nodes generated from a Paracore gallery script's Params class.");
                    sb.AppendLine("    /// Each node takes one value and returns it unchanged; BuildParamSet assembles all of them.");
                    sb.AppendLine("    /// </summary>");
                    sb.AppendLine("    public static class " + className);
                    sb.AppendLine("    {");

                    foreach (var pr in props)
                    {
                        string safe = char.ToUpperInvariant(pr.Name[0]) + pr.Name.Substring(1);
                        string nt = NodeType(pr.Type);
                        string sum = string.IsNullOrEmpty(pr.Summary) ? "Dynamo input for " + pr.Name + "." : pr.Summary;
                        string unit = string.IsNullOrEmpty(pr.Unit) ? "" : " Units: " + pr.Unit + ".";
                        string rng = string.IsNullOrEmpty(pr.Range) ? "" : " Range: " + pr.Range + ".";

                        sb.AppendLine("        /// <summary>");
                        sb.AppendLine("        /// " + XmlEscape(sum + unit + rng));
                        sb.AppendLine("        /// </summary>");
                        sb.AppendLine("        /// <param name=\"value\">" + XmlEscape(pr.Name) + "</param>");
                        sb.AppendLine("        /// <returns name=\"result\">" + XmlEscape(pr.Name) + " passed through.</returns>");
                        sb.AppendLine("        /// <search>paracore, params, " + pr.Name.ToLowerInvariant() + "</search>");
                        sb.AppendLine("        public static " + nt + " " + safe + "(" + nt + " value)");
                        sb.AppendLine("        {");
                        sb.AppendLine("            return value;");
                        sb.AppendLine("        }");
                        sb.AppendLine();
                    }

                    var sig = new List<string>();
                    var joins = new List<string>();
                    foreach (var pr in props)
                    {
                        sig.Add(NodeType(pr.Type) + " " + pr.Name);
                        joins.Add("\"" + pr.Name + "=\" + " + pr.Name);
                    }
                    sb.AppendLine("        /// <summary>");
                    sb.AppendLine("        /// Build a parameter record from one gallery script's Params class.");
                    sb.AppendLine("        /// </summary>");
                    foreach (var pr in props)
                        sb.AppendLine("        /// <param name=\"" + pr.Name + "\">" + XmlEscape(pr.Name) + " value.</param>");
                    sb.AppendLine("        /// <returns name=\"paramSet\">The assembled parameter values.</returns>");
                    sb.AppendLine("        public static string BuildParamSet(" + string.Join(", ", sig) + ")");
                    sb.AppendLine("        {");
                    sb.AppendLine("            return string.Join(\"|\",");
                    sb.AppendLine("                " + string.Join(",\n                ", joins) + ");");
                    sb.AppendLine("        }");
                    sb.AppendLine("    }");
                    sb.AppendLine("}");

                    generatedSource = sb.ToString();
                    report.Add("mode              Params");
                    report.Add("source            " + sourceFile);
                    report.Add("params class      " + (inlineClass
                        ? "inline public class Params in entry script"
                        : "isolated Params.cs"));
                    report.Add("parsed properties " + props.Count);
                    exportedNodeCount = props.Count;
                    report.Add("class             " + className);
                    report.Add("nodes: " + string.Join(", ", props.Select(q => q.Name)));
                }
                else
                {
                    sourceFile = (request.SourceScriptFile ?? "").Trim();
                    if (string.IsNullOrEmpty(sourceFile))
                        throw new InvalidOperationException("Source Script File is empty. Paste the full path to the gallery script .cs containing static methods.");
                    if (!File.Exists(sourceFile))
                        throw new FileNotFoundException("Source Script File not found", sourceFile);

                    string classPrefix = (request.ClassPrefix ?? "").Trim();
                    assemblyName = (request.AssemblyName ?? "").Trim();
                    if (string.IsNullOrEmpty(assemblyName)) assemblyName = "ParacoreMethodNodes";

                    packageName = (request.PackageName ?? "").Trim();
                    if (string.IsNullOrEmpty(packageName)) packageName = "Paracore_MethodNodes";

                    manifestDescription = "ZeroTouch capability methods exported from " +
                        Path.GetFileName(sourceFile).Replace("\"", "") + ".";
                    manifestContents = "Public static Paracore methods exported as Dynamo nodes.";

                    string srcText = File.ReadAllText(sourceFile);
                    var classes = MethodExportParser.Parse(srcText, classPrefix);
                    if (classes.Count == 0)
                        throw new InvalidOperationException("No public static classes with exportable methods were found in " + sourceFile +
                            ".\nUse a public static class whose name starts with '" +
                            (string.IsNullOrEmpty(classPrefix) ? "any name" : classPrefix) +
                            "' and public static methods with scalar parameters.");

                    int methodCount = 0;
                    foreach (var c in classes) methodCount += c.Methods.Count;
                    if (methodCount == 0)
                        throw new InvalidOperationException("Classes were found but no public static methods were parsed in " + sourceFile);

                    generatedSource = MethodExportParser.GenerateSource(classes);

                    report.Add("mode              Methods");
                    report.Add("source            " + sourceFile);
                    foreach (var c in classes)
                    {
                        report.Add("class             " + c.Name);
                        foreach (var m in c.Methods)
                        {
                            var ps = new List<string>();
                            foreach (var a in m.Parameters) ps.Add(a.Type + " " + a.Name);
                            report.Add("  method          " + m.Name + "(" + string.Join(", ", ps) + ") -> " + m.ReturnType);
                        }
                    }
                    report.Add("methods exported  " + methodCount);
                    exportedNodeCount = methodCount;
                }

                string packageDir = Path.Combine(outRoot, packageName);
                string binDir = Path.Combine(packageDir, "bin");
                string dllPath = Path.Combine(binDir, assemblyName + ".dll");
                if (request.WriteFiles && File.Exists(dllPath) && !request.OverwriteExisting)
                    throw new InvalidOperationException("Package already exists: " + packageDir + "\nTurn ON Overwrite Existing to replace it.");

                var built = DynamoLibraryCompiler.Build(generatedSource, assemblyName);
                if (!built.Success)
                    throw new InvalidOperationException("Dynamo library compilation failed:\n" + built.Errors);

                string contractPath = Path.Combine(packageDir, "contract.json");
                string sourceHash = Sha256Hex(File.ReadAllBytes(sourceFile));

                string engineDll = EngineIdentityFile();
                string engineHash = EngineIdentityHash();
                if (engineHash == "unknown")
                    report.Add("WARNING: installed engine DLL not found: " + engineDll);

                string unitConvention = "source-declared; no conversion in ZeroTouch nodes; " +
                    "engine-internal feet apply only when values reach Paracore execution";

                contractLines.Add("\"contract_version\": " + JsonString("1.1"));
                contractLines.Add("\"tool_id\": " + JsonString(packageName));
                contractLines.Add("\"export_mode\": " + JsonString(exportMode));
                contractLines.Add("\"source_file\": " + JsonString(Path.GetFileName(sourceFile)));
                contractLines.Add("\"source_sha256\": " + JsonString(sourceHash));
                contractLines.Add("\"engine_identity_file\": " + JsonString(Path.GetFileName(engineDll)));
                contractLines.Add("\"engine_sha256\": " + JsonString(engineHash));
                contractLines.Add("\"dynamo_target_version\": " + JsonString(dynamoVersion));
                contractLines.Add("\"assembly_name\": " + JsonString(assemblyName));
                contractLines.Add("\"package_name\": " + JsonString(packageName));
                contractLines.Add("\"node_count\": " + exportedNodeCount);
                contractLines.Add("\"unit_convention\": " + JsonString(unitConvention));
                contractLines.Add("\"declared_units\": " + JsonArray(declaredUnits));
                contractLines.Add("\"ui_members_excluded\": " + JsonArray(excludedUiMembers));
                contractLines.Add("\"options_policy\": " + JsonString(
                    "UI data provider; never a ZeroTouch input; recorded here as metadata"));
                contractLines.Add("\"visible_policy\": " + JsonString(
                    "UI visibility provider; never a ZeroTouch input; recorded here as metadata"));

                string contractJson = "{\n  " + string.Join(",\n  ", contractLines) + "\n}\n";
                string contractHash = Sha256Hex(Encoding.UTF8.GetBytes(contractJson));

                if (File.Exists(contractPath))
                {
                    var oldLines = new HashSet<string>();
                    foreach (string raw in File.ReadAllLines(contractPath))
                    {
                        string line = raw.Trim().TrimEnd(',');
                        if (line.Length > 0 && line != "{" && line != "}") oldLines.Add(line);
                    }
                    var newLines = new HashSet<string>(contractLines);
                    var added = new List<string>();
                    foreach (string line in contractLines) if (!oldLines.Contains(line)) added.Add(line);
                    var removed = new List<string>();
                    foreach (string line in oldLines) if (!newLines.Contains(line)) removed.Add(line);
                    added.Sort();
                    removed.Sort();
                    report.Add("contract diff       +" + added.Count + " / -" + removed.Count + " field lines");
                    foreach (string line in added) report.Add("    + " + line);
                    foreach (string line in removed) report.Add("    - " + line);
                }
                else
                {
                    report.Add("contract diff       no previous contract (first export)");
                }

                var manifestLines = new List<string>();
                manifestLines.Add("  \"license\": " + JsonString("Paracore"));
                manifestLines.Add("  \"name\": " + JsonString(packageName));
                manifestLines.Add("  \"version\": " + JsonString("1.0.0"));
                manifestLines.Add("  \"description\": " + JsonString(manifestDescription));
                manifestLines.Add("  \"group\": " + JsonString("Paracore"));
                manifestLines.Add("  \"keywords\": " + JsonArray(new List<string> { "paracore", "dynamo", exportMode.ToLowerInvariant() }));
                manifestLines.Add("  \"dependencies\": []");
                manifestLines.Add("  \"contents\": " + JsonString(manifestContents));
                manifestLines.Add("  \"engine_version\": " + JsonString(dynamoVersion));
                manifestLines.Add("  \"engine\": " + JsonString("dynamo"));
                manifestLines.Add("  \"engine_metadata\": " + JsonString(""));
                manifestLines.Add("  \"site_url\": " + JsonString(""));
                manifestLines.Add("  \"repository_url\": " + JsonString(""));
                manifestLines.Add("  \"contains_binaries\": true");
                manifestLines.Add("  \"node_libraries\": " + JsonArray(new List<string> {
                    assemblyName + ", Version=1.0.0.0, Culture=neutral, PublicKeyToken=null" }));
                string manifestHead = string.Join(",\n", manifestLines);
                string contractBlock = "  \"paracore_contract\": {\n    " +
                    string.Join(",\n    ", contractLines) + "\n  }";
                string manifestTail = "  \"generated_utc\": " + JsonString(DateTime.UtcNow.ToString("o")) +
                    ",\n  \"contract_sha256\": " + JsonString(contractHash);
                string manifest = "{\n" + manifestHead + ",\n" + contractBlock + ",\n" + manifestTail + "\n}\n";

                var artifacts = new List<Artifact>
                {
                    new Artifact(Path.Combine("bin", assemblyName + ".dll"), built.Assembly),
                    new Artifact(Path.Combine("bin", assemblyName + ".xml"), built.Documentation),
                    new Artifact(Path.Combine("bin", assemblyName + ".generated.cs"), Encoding.UTF8.GetBytes(generatedSource)),
                    new Artifact("pkg.json", Encoding.UTF8.GetBytes(manifest)),
                    new Artifact("contract.json", Encoding.UTF8.GetBytes(contractJson))
                };

                report.Add("assembly          " + assemblyName + " (" + built.Assembly.Length + " bytes)");
                report.Add("xml docs          " + built.Documentation.Length + " bytes");
                report.Add("package           " + packageDir);
                report.Add("contract sha256   " + contractHash);
                report.Add("WriteFiles        " + request.WriteFiles);
                report.Add(request.WriteFiles
                    ? "DONE — restart Dynamo, then search for the exported class names in the node library."
                    : "DRY RUN — nothing written. Turn ON Write Files to create the package.");

                return new Result(true, report, artifacts, generatedSource, assemblyName, packageName,
                    contractJson, contractHash, packageDir, string.Empty);
            }
            catch (Exception ex)
            {
                return new Result(false, Array.Empty<string>(), Array.Empty<Artifact>(), string.Empty,
                    string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, ex.Message);
            }
        }

        /// <summary>
        /// Return only the lines of a public Params class. A single-file gallery tool declares
        /// the class after its top-level statements; scanning the whole file would pick up
        /// unrelated auto-properties from other types.
        /// </summary>
        private static string[] ExtractParamsClassLines(string sourceText, string sourceFile)
        {
            string normalized = (sourceText ?? "").Replace("\r\n", "\n");
            var tree = CSharpSyntaxTree.ParseText(normalized);
            var declaration = tree.GetRoot().DescendantNodes()
                .OfType<ClassDeclarationSyntax>()
                .FirstOrDefault(c => c.Identifier.Text == "Params" &&
                                     c.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)));
            if (declaration == null)
                throw new InvalidOperationException(
                    "No public class Params found in " + sourceFile +
                    ". Expected `public class Params { ... }` in Params.cs or in the entry script.");

            var span = tree.GetLineSpan(declaration.Span);
            string[] allLines = normalized.Split('\n');
            int start = Math.Max(0, span.StartLinePosition.Line);
            int end = Math.Min(allLines.Length - 1, span.EndLinePosition.Line);
            return allLines.Skip(start).Take(end - start + 1).ToArray();
        }

        private static string NodeType(string type)
        {
            if (type == "string" || type == "bool" || type == "double" || type == "int") return type;
            return "object";
        }

        /// <summary>Installed engine DLL used as the contract identity for every export kind.</summary>
        private static string EngineIdentityFile() => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Autodesk", "Revit", "Addins", "2025", "Paracore", "CoreScript.Engine.dll");

        private static string EngineIdentityHash()
        {
            string path = EngineIdentityFile();
            return File.Exists(path) ? Sha256Hex(File.ReadAllBytes(path)) : "unknown";
        }

        private static string JsonString(string v)
        {
            var jb = new StringBuilder("\"");
            foreach (char ch in v ?? "")
            {
                if (ch == '"') jb.Append("\\\"");
                else if (ch == '\\') jb.Append("\\\\");
                else if (ch == '\n') jb.Append("\\n");
                else if (ch == '\r') jb.Append("\\r");
                else if (ch == '\t') jb.Append("\\t");
                else if (ch < ' ') jb.Append("\\u").Append(((int)ch).ToString("x4"));
                else jb.Append(ch);
            }
            return jb.Append('"').ToString();
        }

        private static string JsonArray(IEnumerable<string> items) =>
            "[" + string.Join(", ", (items ?? Enumerable.Empty<string>()).Select(JsonString)) + "]";

        private static string XmlEscape(string value) => (value ?? "")
            .Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

        private static string Sha256Hex(byte[] data) =>
            Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();

        private sealed class PParam
        {
            public string Name = "";
            public string Type = "";
            public string Summary = "";
            public string Unit = "";
            public string Range = "";
            public string Default = "";
        }

        private sealed class MethodExportParam
        {
            public string Type = "";
            public string Name = "";
        }

        private sealed class MethodExportMethod
        {
            public string Name = "";
            public string ReturnType = "";
            public string Body = "";
            public string Summary = "";
            public List<MethodExportParam> Parameters = new();
        }

        private sealed class MethodExportClass
        {
            public string Name = "";
            public string Summary = "";
            public List<MethodExportMethod> Methods = new();
        }

        private static class MethodExportParser
        {
            private static readonly HashSet<string> SupportedTypes = new(StringComparer.Ordinal)
            {
                "int", "long", "short", "byte", "double", "float", "decimal", "bool", "string", "object"
            };

            private static readonly string[] HostOnlyTokens =
            {
                "ScriptApi", "Println", "GetElements", "Transact(", "Autodesk.", "FilteredElementCollector"
            };

            public static List<MethodExportClass> Parse(string source, string classPrefix)
            {
                string[] lines = source.Replace("\r\n", "\n").Split('\n');
                var result = new List<MethodExportClass>();
                MethodExportClass? current = null;
                int classDepth = 0;
                string pendingSummary = "";
                int i = 0;

                while (i < lines.Length)
                {
                    string s = lines[i].Trim();

                    if (s.StartsWith("/// <summary>") && s.Contains("</summary>"))
                    {
                        pendingSummary = ExtractTag(s, "summary");
                        i++;
                        continue;
                    }

                    if (s.StartsWith("public static class "))
                    {
                        string name = ClassName(s);
                        bool include = string.IsNullOrWhiteSpace(classPrefix) ||
                                       name.StartsWith(classPrefix, StringComparison.OrdinalIgnoreCase);
                        if (!include)
                        {
                            current = null;
                            pendingSummary = "";
                            i++;
                            continue;
                        }

                        current = new MethodExportClass { Name = name, Summary = pendingSummary };
                        result.Add(current);
                        classDepth = BraceDelta(s);
                        pendingSummary = "";
                        i++;
                        continue;
                    }

                    if (current == null)
                    {
                        i++;
                        continue;
                    }

                    classDepth += BraceDelta(s);
                    if (classDepth <= 0)
                    {
                        current = null;
                        pendingSummary = "";
                        i++;
                        continue;
                    }

                    if (s.StartsWith("public static "))
                    {
                        MethodExportMethod? method = ParseMethod(lines, ref i, pendingSummary, current.Summary, ref classDepth);
                        if (method != null) current.Methods.Add(method);
                        pendingSummary = "";
                        continue;
                    }

                    i++;
                }

                return result;
            }

            private static MethodExportMethod? ParseMethod(
                string[] lines, ref int i, string methodSummary, string classSummary, ref int classDepth)
            {
                string sig = lines[i].Trim();
                string after = sig.Substring("public static ".Length).Trim();
                int open = after.IndexOf('(');
                int close = after.LastIndexOf(')');
                if (open <= 0 || close <= open) { i++; return null; }

                string head = after.Substring(0, open).Trim();
                string[] headParts = head.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                if (headParts.Length < 2) { i++; return null; }

                string name = headParts[headParts.Length - 1];
                string returnType = string.Join(" ", headParts.Take(headParts.Length - 1));
                if (!SupportedTypes.Contains(returnType))
                    throw new InvalidOperationException("Unsupported return type '" + returnType + "' on " + name +
                        ". Use int/long/short/byte/double/float/decimal/bool/string/object.");

                var parameters = new List<MethodExportParam>();
                string paramsText = after.Substring(open + 1, close - open - 1).Trim();
                if (!string.IsNullOrEmpty(paramsText))
                {
                    foreach (string raw in paramsText.Split(','))
                    {
                        string part = raw.Trim();
                        if (string.IsNullOrEmpty(part)) continue;
                        string[] bits = part.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                        if (bits.Length < 2) continue;
                        string pname = bits[bits.Length - 1];
                        string ptype = string.Join(" ", bits.Take(bits.Length - 1))
                            .Replace("params ", "").Trim();
                        if (!SupportedTypes.Contains(ptype))
                            throw new InvalidOperationException("Unsupported parameter type '" + ptype + "' on " + name +
                                "." + pname + ". Use scalar types only.");
                        parameters.Add(new MethodExportParam { Type = ptype, Name = pname });
                    }
                }

                var bodyLines = new List<string>();
                int depth = BraceDelta(sig);
                i++;
                while (i < lines.Length)
                {
                    string line = lines[i];
                    bodyLines.Add(line);
                    int d = BraceDelta(line);
                    depth += d;
                    classDepth += d;
                    i++;
                    if (depth <= 0) break;
                }

                string body = string.Join("\n", bodyLines).Trim();
                if (body.StartsWith("{") && body.EndsWith("}"))
                    body = body.Substring(1, body.Length - 2).Trim();

                foreach (string token in HostOnlyTokens)
                {
                    if (body.Contains(token))
                        throw new InvalidOperationException("Method " + name + " cannot be exported: it uses the " +
                            "host-only token '" + token + "'. A Methods export is a standalone Dynamo node compiled " +
                            "against plain .NET, so it cannot call Revit or Paracore engine APIs. Remove the token " +
                            "and express the logic as pure .NET, or keep this script as a gallery script.");
                }

                string summary = string.IsNullOrWhiteSpace(methodSummary)
                    ? (string.IsNullOrWhiteSpace(classSummary)
                        ? "Dynamo node generated from Paracore method " + name + "."
                        : classSummary)
                    : methodSummary;

                return new MethodExportMethod
                {
                    Name = name,
                    ReturnType = returnType,
                    Body = body,
                    Summary = summary,
                    Parameters = parameters
                };
            }

            public static string GenerateSource(List<MethodExportClass> classes)
            {
                var sb = new StringBuilder();
                sb.AppendLine("using System;");
                sb.AppendLine("using System.Collections.Generic;");
                sb.AppendLine("using System.Reflection;");
                sb.AppendLine();
                sb.AppendLine("[assembly: AssemblyVersion(\"1.0.0.0\")]");
                sb.AppendLine("[assembly: AssemblyFileVersion(\"1.0.0.0\")]");
                sb.AppendLine();
                sb.AppendLine("namespace ParacoreDynamoBridge");
                sb.AppendLine("{");

                foreach (MethodExportClass c in classes)
                {
                    sb.AppendLine("    /// <summary>");
                    sb.AppendLine("    /// " + XmlEscape(string.IsNullOrWhiteSpace(c.Summary)
                        ? "Paracore capability methods exported to Dynamo."
                        : c.Summary));
                    sb.AppendLine("    /// </summary>");
                    sb.AppendLine("    public static class " + c.Name);
                    sb.AppendLine("    {");

                    foreach (MethodExportMethod m in c.Methods)
                    {
                        sb.AppendLine("        /// <summary>");
                        sb.AppendLine("        /// " + XmlEscape(m.Summary));
                        sb.AppendLine("        /// </summary>");
                        foreach (MethodExportParam a in m.Parameters)
                            sb.AppendLine("        /// <param name=\"" + a.Name + "\">" +
                                          XmlEscape(a.Name + " value.") + "</param>");
                        sb.AppendLine("        /// <returns name=\"result\">Result of " +
                                      XmlEscape(m.Name) + ".</returns>");
                        sb.AppendLine("        /// <search>paracore, " + m.Name.ToLowerInvariant() + "</search>");

                        var sig = new List<string>();
                        foreach (MethodExportParam a in m.Parameters) sig.Add(a.Type + " " + a.Name);
                        sb.AppendLine("        public static " + m.ReturnType + " " + m.Name +
                                      "(" + string.Join(", ", sig) + ")");
                        sb.AppendLine("        {");
                        foreach (string line in m.Body.Split('\n'))
                            sb.AppendLine("            " + line.Trim());
                        sb.AppendLine("        }");
                        sb.AppendLine();
                    }

                    sb.AppendLine("    }");
                }

                sb.AppendLine("}");
                return sb.ToString();
            }

            private static string ClassName(string line)
            {
                string rest = line.Substring("public static class ".Length).Trim();
                int brace = rest.IndexOf('{');
                if (brace >= 0) rest = rest.Substring(0, brace).Trim();
                return rest;
            }

            private static int BraceDelta(string line)
            {
                int open = 0, close = 0;
                foreach (char ch in line)
                {
                    if (ch == '{') open++;
                    else if (ch == '}') close++;
                }
                return open - close;
            }

            private static string ExtractTag(string line, string tag)
            {
                string open = "<" + tag + ">";
                string close = "</" + tag + ">";
                int a = line.IndexOf(open, StringComparison.Ordinal);
                int b = line.IndexOf(close, StringComparison.Ordinal);
                if (a < 0 || b <= a) return "";
                return line.Substring(a + open.Length, b - a - open.Length).Trim();
            }
        }
    }
}
