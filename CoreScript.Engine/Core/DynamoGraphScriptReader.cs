using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Reads a Paracore gallery script and decides whether it can become a Dynamo graph.
    ///
    /// A gallery script is graphable when it declares a public Params class (the parameter
    /// contract) and its logic is pure .NET that a Dynamo CodeBlock can execute. Host-bound
    /// logic — Revit API calls, the engine's own helper APIs — cannot run inside a Dynamo
    /// CodeBlock, so those scripts are refused with a message that names the offending token.
    /// </summary>
    internal sealed class GraphScriptModel
    {
        public string ScriptName = "";
        public string SourceFile = "";
        public string GraphName = "";
        public string Summary = "";

        /// <summary>One Params property, in declaration order.</summary>
        public sealed class Param
        {
            public string Name = "";
            public string Type = "";
            public string Summary = "";
            public string Unit = "";
            public string Default = "";
        }

        public readonly List<Param> Params = new List<Param>();

        /// <summary>Non-null when the script's logic is a public static method we can call.</summary>
        public string MethodClass = "";
        public string MethodName = "";
        public string MethodReturnType = "";
        public string MethodBody = "";
        public readonly List<string> MethodParameters = new List<string>();

        /// <summary>The CodeBlock body the graph will run. Never contains host-only tokens.</summary>
        public string Code = "";

        /// <summary>Names the CodeBlock reads, in first-read order (Dynamo binds ports this way).</summary>
        public readonly List<string> CodeInputs = new List<string>();

        /// <summary>Names the CodeBlock produces, in output order.</summary>
        public readonly List<string> CodeOutputs = new List<string>();
    }

    internal static class GraphScriptReader
    {
        /// <summary>
        /// Tokens that only exist inside the Paracore engine / Revit host. A Dynamo CodeBlock
        /// has no access to them, so a script that uses one cannot become a graph.
        /// </summary>
        private static readonly string[] HostOnlyTokens =
        {
            "GetElements<", "GetElements(", "Doc", "Doc.", "FilteredElementCollector",
            "ScriptApi", "Println(", "Show(", "Transact(", "Autodesk.",
            "GetNum(", "GetStr(", "SetParam(", "GetElements",
            "List<Wall>", "Wall>", "Wall ", "ElementId", "Element "
        };

        /// <summary>
        /// Engine APIs the gallery provides that have no Dynamo equivalent.
        /// </summary>
        private static readonly string[] EngineOnlyTokens =
        {
            "GetNum(", "GetStr(", "SetParam("
        };

        /// <summary>
        /// Parses the script and returns its graph model, or throws with a message the user can
        /// act on: what is missing and what would make it exportable.
        /// </summary>
        public static GraphScriptModel Read(string sourceFile)
        {
            if (string.IsNullOrWhiteSpace(sourceFile))
                throw new InvalidOperationException(
                    "Graph export needs the selected tool's source file, but none was resolved. " +
                    "Reopen the gallery, pick a script, and try again.");

            if (!File.Exists(sourceFile))
                throw new InvalidOperationException("Graph export could not read the tool source: " + sourceFile);

            string source = File.ReadAllText(sourceFile);
            string scriptName = Path.GetFileNameWithoutExtension(sourceFile);

            var model = new GraphScriptModel
            {
                ScriptName = scriptName,
                SourceFile = sourceFile,
                GraphName = "Paracore_" + scriptName,
                Summary = scriptName
            };

            var tree = CSharpSyntaxTree.ParseText(source.Replace("\r\n", "\n"));

            // ---- 1. The Params class is the parameter contract. Without it there is nothing
            //         for Dynamo to supply, so the script cannot become a graph.
            ClassDeclarationSyntax? paramsClass = tree.GetRoot().DescendantNodes()
                .OfType<ClassDeclarationSyntax>()
                .FirstOrDefault(c => c.Identifier.Text == "Params" &&
                                     c.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)));

            if (paramsClass == null)
                throw new InvalidOperationException(
                    "'" + scriptName + "' cannot be exported as a Dynamo graph because it has no " +
                    "'public class Params'. A graph needs a parameter contract so Dynamo can supply " +
                    "the inputs. Add a 'public class Params' with public auto-properties " +
                    "('public int MaxLengthMm { get; set; } = 2000;') and export again.");

            ReadParams(paramsClass, model);

            if (model.Params.Count == 0)
                throw new InvalidOperationException(
                    "'" + scriptName + "' declares 'public class Params' but it has no public " +
                    "auto-properties, so there is nothing for Dynamo to supply. Use lines like " +
                    "'public int MaxLengthMm { get; set; } = 2000;' and export again.");

            // ---- 2. Find the logic. Either a public static method, or top-level statements.
            MethodDeclarationSyntax? method = tree.GetRoot().DescendantNodes()
                .OfType<MethodDeclarationSyntax>()
                .FirstOrDefault(m => m.Modifiers.Any(x => x.IsKind(SyntaxKind.PublicKeyword)) &&
                                     m.Modifiers.Any(x => x.IsKind(SyntaxKind.StaticKeyword)) &&
                                     m.Body != null);

            string topLevel = ExtractTopLevelStatements(tree);

            if (method != null)
            {
                model.MethodClass = method.Parent is ClassDeclarationSyntax cls ? cls.Identifier.Text : "";
                model.MethodName = method.Identifier.Text;
                model.MethodReturnType = method.ReturnType.ToString();
                model.MethodBody = method.Body.ToString();
                foreach (ParameterSyntax p in method.ParameterList.Parameters)
                    model.MethodParameters.Add(p.Identifier.Text);
            }

            // ---- 3. The graph body. The shipped .dyn must be a standard Dynamo graph:
            //         the CodeBlock contains the script's own expressions, NOT a call to a
            //         method that only exists in a Paracore-exported ZeroTouch DLL. A method
            //         is inlined here; top-level statements are used as-is.
            string body;
            if (method != null)
            {
                body = InlineMethod(method, model);
            }
            else if (!string.IsNullOrWhiteSpace(topLevel))
            {
                body = topLevel;
            }
            else
            {
                throw new InvalidOperationException(
                    "'" + scriptName + "' cannot be exported as a Dynamo graph: it has no public " +
                    "static method and no top-level statements for a Dynamo CodeBlock to run. " +
                    "Give it a 'public static' method, or move the logic into top-level statements, " +
                    "and export again.");
            }

            // ---- 4. Refuse host-bound logic. This is the case the user must be told about
            //         clearly: the script is a Revit tool, not a pure computation.
            foreach (string token in HostOnlyTokens)
            {
                if (!body.Contains(token)) continue;

                // A method body may legitimately mention Doc/Revit types inside a comment.
                string meaningful = StripComments(body);
                if (!meaningful.Contains(token)) continue;

                if (EngineOnlyTokens.Contains(token))
                    throw new InvalidOperationException(
                        "'" + scriptName + "' cannot be exported as a Dynamo graph because it uses the " +
                        "Paracore engine helper '" + token.TrimEnd('(') + "'. A graph is a native Dynamo " +
                        "CodeBlock: it cannot call engine helpers or Revit APIs. The Methods kind refuses " +
                        "the same token — it compiles against plain .NET only. To export a graph, author a " +
                        "separate script whose logic is pure .NET and which declares 'public class Params'; " +
                        "otherwise keep this script as a gallery script.");

                throw new InvalidOperationException(
                    "'" + scriptName + "' cannot be exported as a Dynamo graph because it uses the " +
                    "host-only token '" + token.TrimEnd('(') + "'. A graph is a native Dynamo CodeBlock: " +
                    "it cannot touch Revit or the Paracore engine. The Methods kind refuses the same token " +
                    "— it compiles against plain .NET only. To export a graph, author a separate script " +
                    "whose logic is pure .NET and which declares 'public class Params'; otherwise keep " +
                    "this script as a gallery script.");
            }

            // ---- 5. Rewrite the body so it reads the Dynamo inputs directly.
            //         'p.MaxLengthMm' -> 'maxLengthMm', and 'Params p = new();' disappears.
            string code = RewriteBody(body, model);
            code = code.Replace("Params p = new();", "")
                        .Replace("Params p = new Params();", "")
                        .Replace("Params p = new();", "")
                        .Replace("var p = new Params();", "");

            // Drop the now-empty leading lines the removals left behind.
            var kept = new List<string>();
            foreach (string line in code.Replace("\r\n", "\n").Split('\n'))
            {
                string t = StripTypeKeyword(line.Trim());
                if (t.Length == 0) continue;
                kept.Add(t);
            }
            code = string.Join("\n", kept);

            if (code.Length == 0)
                throw new InvalidOperationException(
                    "'" + scriptName + "' cannot be exported as a Dynamo graph: nothing is left to run once the " +
                    "parameter plumbing is removed.");

            model.Code = code;
            AnalyzeCode(code, model);
            return model;
        }

        /// <summary>Reads the public auto-properties of the Params class.</summary>
        private static void ReadParams(ClassDeclarationSyntax paramsClass, GraphScriptModel model)
        {
            string pendingSummary = "";
            string pendingUnit = "";

            foreach (MemberDeclarationSyntax member in paramsClass.Members)
            {
                string trivia = member.GetLeadingTrivia()
                    .Select(t => t.ToString())
                    .Aggregate("", (a, b) => a + b);

                // Same rule as the Gallery's parameter descriptions: <summary> when present,
                // otherwise a one-line /// comment. Read the member's OWN trivia so a comment
                // directly above a property becomes that graph input's label.
                string summary = Parsers.XmlDocParser.ExtractDescription(member.GetLeadingTrivia());

                string unit = "";
                int u = trivia.IndexOf("[Unit(\"");
                if (u >= 0)
                {
                    int q1 = trivia.IndexOf('"', u) + 1;
                    int q2 = trivia.IndexOf('"', q1);
                    if (q2 > q1) unit = trivia.Substring(q1, q2 - q1);
                }

                if (member is PropertyDeclarationSyntax prop &&
                    prop.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)) &&
                    prop.AccessorList != null &&
                    prop.AccessorList.Accessors.Any(a => a.IsKind(SyntaxKind.GetAccessorDeclaration)) &&
                    prop.AccessorList.Accessors.Any(a => a.IsKind(SyntaxKind.SetAccessorDeclaration)))
                {
                    string type = prop.Type.ToString();
                    string name = prop.Identifier.Text;

                    // [Unit("mm")] is an attribute on the property, not leading trivia.
                    string attributeUnit = "";
                    foreach (AttributeListSyntax list in prop.AttributeLists)
                    {
                        foreach (AttributeSyntax attr in list.Attributes)
                        {
                            if (!attr.Name.ToString().EndsWith("Unit", StringComparison.Ordinal) ||
                                attr.ArgumentList == null) continue;
                            foreach (AttributeArgumentSyntax arg in attr.ArgumentList.Arguments)
                            {
                                string text = arg.ToString().Trim();
                                if (text.Length >= 2 && text.StartsWith("\"") && text.EndsWith("\""))
                                    attributeUnit = text.Substring(1, text.Length - 2);
                            }
                        }
                    }
                    string effectiveUnit = !string.IsNullOrWhiteSpace(attributeUnit)
                        ? attributeUnit
                        : (!string.IsNullOrWhiteSpace(unit) ? unit : pendingUnit);

                    var p = new GraphScriptModel.Param
                    {
                        Name = name,
                        Type = type,
                        Summary = string.IsNullOrWhiteSpace(summary) ? pendingSummary : summary,
                        Unit = effectiveUnit
                    };

                    if (prop.Initializer != null)
                    {
                        string init = prop.Initializer.Value.ToString().Trim();
                        p.Default = init;
                    }

                    model.Params.Add(p);
                    pendingSummary = "";
                    pendingUnit = "";
                    continue;
                }

                // A comment on a non-property member still carries to the next property.
                if (!string.IsNullOrWhiteSpace(summary)) pendingSummary = summary;
                if (!string.IsNullOrWhiteSpace(unit)) pendingUnit = unit;
            }
        }

        /// <summary>
        /// Collects the top-level statements of a script — the code before any type declaration.
        /// This is the body a gallery tool actually runs.
        /// </summary>
        private static string ExtractTopLevelStatements(SyntaxTree tree)
        {
            // Same approach as ScriptParser: DescendantNodes().OfType<GlobalStatementSyntax>().
            // Each GlobalStatementSyntax wraps the actual statement in its .Statement property.
            var lines = new List<string>();
            foreach (GlobalStatementSyntax global in tree.GetRoot().DescendantNodes().OfType<GlobalStatementSyntax>())
            {
                if (global.Statement != null)
                    lines.Add(global.Statement.ToString());
            }
            return string.Join("\n", lines).Trim();
        }

        /// <summary>
        /// Inline a public static method into CodeBlock statements. Its parameters bind to
        /// the script's Params properties by position, and 'return' becomes 'result = ...'.
        /// No method call survives — the emitted graph needs no Paracore assembly at runtime.
        /// </summary>
        private static string InlineMethod(MethodDeclarationSyntax method, GraphScriptModel model)
        {
            if (model.Params.Count == 0)
                throw new InvalidOperationException(
                    "'" + model.ScriptName + "' cannot be exported as a Dynamo graph: method '" +
                    model.MethodName + "' has no Params properties to take its arguments.");

            var ps = method.ParameterList.Parameters;
            if (ps.Count != model.Params.Count)
                throw new InvalidOperationException(
                    "'" + model.ScriptName + "' cannot be exported as a Dynamo graph: method '" +
                    model.MethodName + "' takes " + ps.Count + " argument(s) but Params declares " +
                    model.Params.Count + ". Give the method one parameter per Params property, " +
                    "in the same order, and export again.");

            var bindings = new Dictionary<string, string>(StringComparer.Ordinal);
            for (int i = 0; i < ps.Count; i++)
                bindings[ps[i].Identifier.Text] = model.Params[i].Name;

            var lines = new List<string>();
            int returnCount = 0;
            foreach (StatementSyntax stmt in method.Body.Statements)
            {
                if (stmt is ReturnStatementSyntax ret)
                {
                    if (ret.Expression == null)
                        throw new InvalidOperationException(
                            "'" + model.ScriptName + "' cannot be exported as a Dynamo graph: method '" +
                            model.MethodName + "' has a bare 'return' with no value, so the graph " +
                            "would have nothing to Watch.");
                    if (++returnCount > 1)
                        throw new InvalidOperationException(
                            "'" + model.ScriptName + "' cannot be exported as a Dynamo graph: method '" +
                            model.MethodName + "' has more than one 'return'. Use a single return " +
                            "expression so the graph has one deterministic output.");
                    lines.Add("result = " + Bind(ret.Expression.ToString(), bindings) + ";");
                    continue;
                }

                lines.Add(StripTypeKeyword(Bind(stmt.ToString(), bindings)));
            }

            if (returnCount == 0)
                throw new InvalidOperationException(
                    "'" + model.ScriptName + "' cannot be exported as a Dynamo graph: method '" +
                    model.MethodName + "' does not return a value. Add a 'return <expression>;' " +
                    "so the graph has an output to Watch.");

            return string.Join("\n", lines);
        }

        /// <summary>Bind method parameter identifiers to Params names on word boundaries.</summary>
        private static string Bind(string text, Dictionary<string, string> bindings)
        {
            foreach (var kv in bindings)
                text = Regex.Replace(text, @"\b" + Regex.Escape(kv.Key) + @"\b", kv.Value);
            return text;
        }

        /// <summary>Strip a leading C# type so DesignScript sees a plain assignment.</summary>
        private static string StripTypeKeyword(string line)
        {
            foreach (string type in new[] { "double", "int", "long", "float", "decimal", "bool", "string", "var" })
            {
                string prefix = type + " ";
                if (!line.StartsWith(prefix, StringComparison.Ordinal)) continue;
                string rest = line.Substring(prefix.Length);
                int eq = rest.IndexOf('=');
                if (eq > 0 && rest.Substring(0, eq).Trim().All(char.IsLetterOrDigit))
                    return rest;
            }
            return line;
        }

        /// <summary>Removes // and /* */ comments so token checks do not trip on prose.</summary>
        private static string StripComments(string source)
        {
            var sb = new StringBuilder();
            bool inBlock = false;
            bool inLine = false;
            bool inString = false;
            bool inChar = false;

            for (int i = 0; i < source.Length; i++)
            {
                char ch = source[i];
                char next = i + 1 < source.Length ? source[i + 1] : '\0';

                if (inBlock)
                {
                    if (ch == '*' && next == '/') { inBlock = false; i++; }
                    continue;
                }
                if (inLine)
                {
                    if (ch == '\n') { inLine = false; sb.Append(ch); }
                    continue;
                }
                if (inString)
                {
                    sb.Append(ch);
                    if (ch == '\\' && i + 1 < source.Length) { sb.Append(source[i + 1]); i++; }
                    else if (ch == '"') inString = false;
                    continue;
                }
                if (inChar)
                {
                    sb.Append(ch);
                    if (ch == '\\' && i + 1 < source.Length) { sb.Append(source[i + 1]); i++; }
                    else if (ch == '\'') inChar = false;
                    continue;
                }

                if (ch == '/' && next == '/') { inLine = true; i++; continue; }
                if (ch == '/' && next == '*') { inBlock = true; i++; continue; }
                if (ch == '"') { inString = true; sb.Append(ch); continue; }
                if (ch == '\'') { inChar = true; sb.Append(ch); continue; }

                sb.Append(ch);
            }
            return sb.ToString();
        }

        /// <summary>
        /// Rewrites the script body so the Dynamo CodeBlock reads the inputs directly:
        /// 'p.MaxLengthMm' becomes 'maxLengthMm', and a 'p.' prefix is dropped entirely.
        /// </summary>
        private static string RewriteBody(string body, GraphScriptModel model)
        {
            string code = body;

            foreach (GraphScriptModel.Param p in model.Params)
            {
                code = code.Replace("p." + p.Name, p.Name);
                code = code.Replace("params." + p.Name, p.Name);
            }

            // A bare 'p.' reference that we could not resolve means the script reads a field
            // that is not in Params. That is a graph-blocking ambiguity.
            if (code.Contains("p.") || code.Contains("params."))
            {
                string leftover = code.Contains("p.") ? "p." : "params.";
                throw new InvalidOperationException(
                    "'" + model.ScriptName + "' cannot be exported as a Dynamo graph: its logic reads '" +
                    leftover + "<field>', which is not declared in the Params class. Every value the " +
                    "graph supplies must be a public auto-property of 'public class Params'.");
            }

            return code;
        }

        /// <summary>
        /// Determines the CodeBlock's inputs (first-read order — this is how Dynamo binds
        /// CodeBlock ports) and its outputs (the assigned names, in order).
        /// </summary>
        private static void AnalyzeCode(string code, GraphScriptModel model)
        {
            var expected = new List<string>();
            var assigned = new List<string>();
            var outputs = new List<string>();
            string[] builtins = { "Math", "Ceiling", "Floor", "Abs", "Sqrt", "Min", "Max", "Pow", "Round", "Truncate", "Double", "Int", "String", "Boolean" };

            foreach (string raw in code.Split('\n'))
            {
                string line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("//")) continue;

                int eq = line.IndexOf('=');
                if (eq < 0)
                {
                    // A call statement like 'DoThing(a, b);' — its arguments are inputs.
                    foreach (string token in Tokens(line))
                    {
                        if (Array.IndexOf(builtins, token) >= 0) continue;
                        if (assigned.Contains(token)) continue;
                        if (IsDeclaredLocal(model, token)) continue;
                        if (!expected.Contains(token)) expected.Add(token);
                    }
                    continue;
                }

                string lhs = line.Substring(0, eq).Trim();
                int k = 0;
                while (k < lhs.Length && (char.IsLetterOrDigit(lhs[k]) || lhs[k] == '_')) k++;
                if (k > 0)
                {
                    string name = lhs.Substring(0, k);
                    if (!assigned.Contains(name)) assigned.Add(name);
                    if (!outputs.Contains(name)) outputs.Add(name);
                }

                foreach (string token in Tokens(line.Substring(eq + 1)))
                {
                    if (Array.IndexOf(builtins, token) >= 0) continue;
                    if (assigned.Contains(token)) continue;
                    if (IsDeclaredLocal(model, token)) continue;
                    if (!expected.Contains(token)) expected.Add(token);
                }
            }

            foreach (GraphScriptModel.Param p in model.Params)
                if (!expected.Contains(p.Name)) expected.Insert(0, p.Name);

            model.CodeInputs.AddRange(expected);
            model.CodeOutputs.AddRange(outputs);
        }

        /// <summary>A name is a local when it is a Params property or an assigned variable.</summary>
        private static bool IsDeclaredLocal(GraphScriptModel model, string token) =>
            model.Params.Any(p => p.Name == token);

        /// <summary>Splits a line into identifier tokens.</summary>
        private static IEnumerable<string> Tokens(string text)
        {
            var sb = new StringBuilder();
            bool inToken = false;
            foreach (char ch in text)
            {
                if (!inToken && (char.IsLetter(ch) || ch == '_'))
                {
                    sb.Append(ch);
                    inToken = true;
                }
                else if (inToken && (char.IsLetterOrDigit(ch) || ch == '_'))
                {
                    sb.Append(ch);
                }
                else if (inToken)
                {
                    yield return sb.ToString();
                    sb.Length = 0;
                    inToken = false;
                }
            }
            if (inToken) yield return sb.ToString();
        }
    }
}
