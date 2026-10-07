using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CoreScript.Engine.Core.Rewriters
{
    /// <summary>
    /// Pre-compile guard for the TRANSACTION GRANULARITY footgun.
    ///
    /// ⚠ The defect this exists to catch. The single-element write helpers
    /// (<c>SetVal</c>, <c>SetNum</c>, <c>Delete</c>, <c>Hide</c>, …) check
    /// <c>Document.IsModifiable</c> and open their OWN transaction when none is open.
    /// That is what makes them convenient — and it is also what makes them dangerous
    /// inside a loop:
    ///
    ///     foreach (var d in GetElements("Doors")) d.SetVal("Mark", "");   // ⚠ N transactions
    ///
    /// Each pass finds no open transaction, so each pass commits its own. 143 doors
    /// therefore cost 143 undo entries, and Revit's undo stack is finite — past its
    /// limit you can no longer undo back to where you started. The fix is one enclosing
    /// <c>Transact</c>, which makes every write run directly and costs a single undo entry:
    ///
    ///     Transact("Clear marks", () => { foreach (var d in …) d.SetVal("Mark", ""); });
    ///
    /// ⚠ The discriminator is the RECEIVER TYPE, not the method name. The collection
    /// helpers (<c>SetParam</c>, <c>SetTypeParam</c>) are declared on
    /// <c>this IEnumerable&lt;T&gt;</c> and already wrap the whole enumeration in ONE
    /// transaction — they are safe, and flagging them would be a false positive. Only the
    /// extensions declared on <c>this Element</c> auto-transact per call. Resolving the
    /// symbol and reading <c>Parameters[0].Type</c> separates the two exactly.
    ///
    /// ⚠ Raw API writes (e.g. <c>parameter.Set(…)</c>) are deliberately NOT reported: they
    /// do not open a transaction, so without one they throw immediately rather than
    /// silently creating N of them. Loud, therefore not this guard's business.
    ///
    /// Like <see cref="SemanticTrackingGuard"/> this is advisory analysis and must NEVER
    /// throw: any failure degrades to "no findings" rather than breaking compilation.
    /// </summary>
    public static class TransactionLoopGuard
    {
        /// <summary>A single reported call site. Line/column are 1-based in SCRIPT coordinates
        /// (the injected usings are subtracted back out).</summary>
        public sealed class Finding
        {
            /// <summary>1-based line of the offending call, in SCRIPT coordinates.</summary>
            public int Line { get; init; }

            /// <summary>1-based column of the offending call, in SCRIPT coordinates.</summary>
            public int Column { get; init; }

            /// <summary>Which loop form contains it — "foreach", "for", "while", "do", or the LINQ method name.</summary>
            public string LoopKind { get; init; } = string.Empty;

            /// <summary>The mutator that was called, e.g. "SetVal".</summary>
            public string Call { get; init; } = string.Empty;
        }

        /// <summary>
        /// The single-element mutators. Membership is checked AFTER the receiver type, so a
        /// collection overload with the same name can never match.
        /// </summary>
        private static readonly HashSet<string> MutatorNames = new HashSet<string>(System.StringComparer.Ordinal)
        {
            "SetVal", "SetNum", "SetTypeVal", "SetTypeNum",
            "Delete", "Hide", "Unhide", "Isolate"
        };

        /// <summary>LINQ-style iteration that carries a lambda body — the non-statement loops.</summary>
        private static readonly HashSet<string> LambdaLoopNames = new HashSet<string>(System.StringComparer.Ordinal)
        {
            "ForEach", "Select", "Where", "All", "Any"
        };

        /// <summary>
        /// Returns the offending call sites, or an empty list. Never throws.
        /// </summary>
        public static IReadOnlyList<Finding> Analyze(
            SyntaxNode targetRoot,
            IReadOnlyCollection<string> imports,
            IReadOnlyList<MetadataReference> references)
        {
            var findings = new List<Finding>();

#pragma warning disable CA1031 // Deliberate: advisory analysis must never break compilation.
            try
            {
                if (targetRoot == null || imports == null || imports.Count == 0
                    || references == null || references.Count == 0)
                    return findings;

                string prefix = BuildPrefixUsings(imports);
                int prefixLines = CountLines(prefix);
                string text = prefix + targetRoot.ToFullString();

                var tree = CSharpSyntaxTree.ParseText(text,
                    new CSharpParseOptions(languageVersion: LanguageVersion.Latest, kind: SourceCodeKind.Script));

                var compilation = CSharpCompilation.Create(
                    "ParacoreTransactionLoopAnalysis",
                    new[] { tree },
                    references,
                    new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

                var model = compilation.GetSemanticModel(tree);

                // ⚠ Keyed by span start so a call inside NESTED loops is reported once, not N times.
                var seen = new HashSet<int>();

                foreach (var body in EnumerateLoopBodies(tree.GetRoot()))
                {
                    var (bodyNode, loopKind) = body;

                    // An enclosing Transact makes every write inside run directly — correct.
                    if (HasEnclosingTransact(bodyNode))
                        continue;

                    foreach (var call in bodyNode.DescendantNodes().OfType<InvocationExpressionSyntax>())
                    {
                        if (!IsElementMutator(call, model))
                            continue;
                        if (!seen.Add(call.SpanStart))
                            continue;

                        var pos = call.GetLocation().GetLineSpan().StartLinePosition;
                        findings.Add(new Finding
                        {
                            Line = pos.Line + 1 - prefixLines,
                            Column = pos.Character + 1,
                            LoopKind = loopKind,
                            Call = GetInvokedName(call)
                        });
                    }
                }
            }
            catch
            {
                findings.Clear(); // never break or alter compilation
            }
#pragma warning restore CA1031

            return findings;
        }

        /// <summary>
        /// Source-text entry point. The callers that have already parsed (a rewriter) pass the
        /// root; the one that has only the script (CodeRunner) passes the text. Pure delegation
        /// so the two can never disagree about what is analysed.
        /// </summary>
        public static IReadOnlyList<Finding> Analyze(
            string code,
            IReadOnlyCollection<string> imports,
            IReadOnlyList<MetadataReference> references)
        {
            if (string.IsNullOrEmpty(code))
                return new List<Finding>();

            return Analyze(CSharpSyntaxTree.ParseText(code).GetRoot(), imports, references);
        }

        /// <summary>
        /// The nodes whose contents constitute "one iteration". Loop statements plus the
        /// lambda argument of a LINQ/ForEach call.
        /// </summary>
        private static IEnumerable<(SyntaxNode Body, string Kind)> EnumerateLoopBodies(SyntaxNode root)
        {
            foreach (var node in root.DescendantNodes())
            {
                switch (node)
                {
                    case ForEachStatementSyntax fes:
                        yield return (fes.Statement, "foreach");
                        break;
                    case ForStatementSyntax fs:
                        yield return (fs.Statement, "for");
                        break;
                    case WhileStatementSyntax ws:
                        yield return (ws.Statement, "while");
                        break;
                    case DoStatementSyntax ds:
                        yield return (ds.Statement, "do");
                        break;
                    case InvocationExpressionSyntax inv when IsLambdaLoop(inv):
                        // Only a BLOCK-bodied lambda is treated as a loop body. An expression
                        // lambda (x => x.SetVal(…)) returns the value, which is a different
                        // shape; reporting it risks false positives, so it is left alone.
                        foreach (var arg in inv.ArgumentList.Arguments)
                        {
                            if (arg.Expression is SimpleLambdaExpressionSyntax sl && sl.Block != null)
                                yield return (sl.Block, GetInvokedName(inv));
                            else if (arg.Expression is ParenthesizedLambdaExpressionSyntax pl && pl.Block != null)
                                yield return (pl.Block, GetInvokedName(inv));
                        }
                        break;
                }
            }
        }

        private static bool IsLambdaLoop(InvocationExpressionSyntax inv)
            => LambdaLoopNames.Contains(GetInvokedName(inv));

        private static bool HasEnclosingTransact(SyntaxNode node)
        {
            for (var cur = node.Parent; cur != null; cur = cur.Parent)
            {
                if (cur is InvocationExpressionSyntax inv && GetInvokedName(inv) == "Transact")
                    return true;
            }
            return false;
        }

        /// <summary>
        /// True only for an extension declared on <c>this Element</c> whose name is a known
        /// mutator. The receiver-type test is what exempts the collection overloads.
        /// </summary>
        private static bool IsElementMutator(InvocationExpressionSyntax call, SemanticModel model)
        {
            var symbol = model.GetSymbolInfo(call).Symbol as IMethodSymbol;
            if (symbol == null)
                return false;

            // A reduced extension method (e.SetVal(…)) hides the `this` parameter; the
            // unreduced form (ElementExtensions.SetVal(e, …)) keeps it. Normalize to the original.
            var original = symbol.ReducedFrom ?? symbol;
            if (!original.IsExtensionMethod || original.Parameters.Length == 0)
                return false;

            if (!MutatorNames.Contains(original.Name))
                return false;

            return IsElementType(original.Parameters[0].Type);
        }

        private static bool IsElementType(ITypeSymbol type)
        {
            for (var cur = type; cur != null; cur = cur.BaseType)
            {
                if (cur.Name == "Element"
                    && cur.ContainingNamespace != null
                    && cur.ContainingNamespace.ToDisplayString() == "Autodesk.Revit.DB")
                    return true;
            }
            return false;
        }

        /// <summary>
        /// The invoked method's simple name, for both call shapes:
        ///   * <c>d.SetVal(...)</c> / <c>ScriptApi.Transact(...)</c> — a member access
        ///   * <c>Transact(...)</c> / <c>ForEach(...)</c> — a bare identifier
        ///
        /// ⚠ The bare form is NOT optional. <c>Transact</c> is static-imported, so it is
        /// almost always written bare; missing this case made
        /// <see cref="HasEnclosingTransact"/> blind to every correct usage, and the guard
        /// then reported a violation for code that was already right — a false positive on
        /// the single most common good pattern. Both <c>IdentifierNameSyntax</c> and
        /// <c>GenericNameSyntax</c> derive from <c>SimpleNameSyntax</c>, so one case covers
        /// them.
        /// </summary>
        private static string GetInvokedName(InvocationExpressionSyntax node)
        {
            if (node.Expression is MemberAccessExpressionSyntax ma)
                return (ma.Name as SimpleNameSyntax)?.Identifier.ValueText ?? string.Empty;

            if (node.Expression is SimpleNameSyntax sns)
                return sns.Identifier.ValueText;

            return string.Empty;
        }

        private static int CountLines(string s)
        {
            int n = 0;
            foreach (var c in s)
                if (c == '\n') n++;
            return n;
        }

        /// <summary>
        /// Mirrors the injections ScriptCompiler/ReplSessionManager prepend to the script code,
        /// exactly as <see cref="SemanticTrackingGuard"/> does — the analysis must resolve the
        /// same symbols the real compilation will.
        /// </summary>
        private static string BuildPrefixUsings(IReadOnlyCollection<string> imports)
        {
            var sb = new StringBuilder();
            foreach (var i in imports)
                sb.Append("using ").Append(i).Append(";\n");
            sb.Append("using static CoreScript.Engine.Globals.ScriptApi;\n");
            sb.Append("using Parameter = Autodesk.Revit.DB.Parameter;\n");
            return sb.ToString();
        }
    }
}
