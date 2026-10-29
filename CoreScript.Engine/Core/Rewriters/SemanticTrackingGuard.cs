using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace CoreScript.Engine.Core.Rewriters
{
    /// <summary>
    /// Pre-rewrite semantic analysis for <see cref="PipelineTrackingRewriter"/>.
    ///
    /// The tracking rewriter is syntax-only: it matches method names and cannot
    /// see receiver/return types, so name collisions get wrapped too —
    /// e.g. List&lt;T&gt;.Reverse() / Array.Reverse (void returns) break compilation
    /// with "cannot convert from 'void'", and string.Join silently becomes a
    /// List&lt;char&gt;. This guard builds a throwaway compilation of the script with
    /// the SAME references and imports as the real compilation (script globals
    /// such as Doc resolve via the injected <c>using static ...ScriptApi</c>),
    /// resolves every candidate invocation, and reports the (start position,
    /// method name) pairs that must NOT be wrapped:
    ///   • void-returning candidates (cannot convert void to IEnumerable),
    ///   • string.Join (TrackEnumerable would materialize the string),
    ///   • intermediate candidates whose return type is not IEnumerable-like.
    ///
    /// Unresolved calls (REPL variables declared in earlier submissions, missing
    /// references) are left out — the rewriter keeps its current behavior for
    /// them. Any failure in this class degrades to "wrap everything" (empty
    /// result), i.e. exactly the pre-guard behavior. Analysis never throws.
    /// </summary>
    public static class SemanticTrackingGuard
    {
        /// <summary>
        /// Computes the calls the tracking rewriter must skip. Keys are
        /// (SpanStart, methodName) of the invocation in the coordinate space of
        /// <paramref name="targetRoot"/> — the exact node the rewriter will
        /// visit. Start positions (not full spans) are used deliberately:
        /// earlier chain links grow when wrapped, which shifts spans but never
        /// start positions of the nodes as the rewriter visits them.
        /// </summary>
        public static HashSet<(int Start, string Name)> ComputeSkipCalls(
            SyntaxNode targetRoot,
            IReadOnlyCollection<string> imports,
            IReadOnlyList<MetadataReference> references)
        {
            var skip = new HashSet<(int, string)>();
            try
            {
                if (targetRoot == null || imports == null || imports.Count == 0
                    || references == null || references.Count == 0)
                    return skip;

                bool hasCandidates = targetRoot.DescendantNodes()
                    .OfType<InvocationExpressionSyntax>()
                    .Any(TryGetTrackedName);
                if (!hasCandidates)
                    return skip;

                string prefix = BuildPrefixUsings(imports);
                string text = prefix + targetRoot.ToFullString();

                // ⚠⚠ PARSE-KIND MATCH (2026-10-29). The guard MUST parse with the SAME
                // SourceCodeKind as the tree the rewriter will visit — otherwise the
                // SpanStart positions of the same logical invocation differ between the
                // guard's tree and the rewriter's tree, the (SpanStart, Name) skip-set
                // entries never match, and name-collision calls that ShouldSkip flagged
                // get wrapped anyway.
                //
                // MEASURED: the REPL path (ReplSessionManager line 163) and the tool
                // path (ScriptRewriter line 13) BOTH call CSharpSyntaxTree.ParseText(code)
                // with DEFAULT options — Regular kind. This guard was hardcoded to
                // SourceCodeKind.Script. For a bare-statement REPL snippet, Regular kind
                // wraps top-level statements in error-recovery nodes with shifted spans,
                // while Script kind wraps them in GlobalStatement nodes — the same
                // `sb.Append(...)` invocation landed at a different SpanStart in each.
                // StringBuilder.Append was correctly identified as "skip" by ShouldSkip,
                // but the skip entry's position matched nothing in the rewriter's tree.
                // Result: CS0411 TrackEnumerable<T> on a legal StringBuilder.Append.
                //
                // Inheriting the source tree's options preserves the kind AND the
                // language version. If the source tree has no explicit options (null),
                // fall back to Regular kind with Latest — matching what
                // CSharpSyntaxTree.ParseText(code) uses by default.
                var sourceOptions = targetRoot.SyntaxTree?.Options as CSharpParseOptions
                    ?? new CSharpParseOptions(languageVersion: LanguageVersion.Latest);
                var tree = CSharpSyntaxTree.ParseText(text, sourceOptions);

                var compilation = CSharpCompilation.Create(
                    "ParacoreTrackingAnalysis",
                    new[] { tree },
                    references,
                    new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

                var model = compilation.GetSemanticModel(tree);

                // ⚠ THE FAIL-OPEN GATE.
                //
                // If this throwaway compilation cannot bind — missing references, a
                // typo in the submission, a variable that does not exist yet — then
                // its answers are untrustworthy, and the rewriter's fallback for an
                // unresolved call is to WRAP it. Wrapping is only ever valid when
                // the receiver really is IEnumerable<T>. When it is not, the user
                // gets an engine-branded compile error (CS0411) for code that is
                // perfectly legal, with a line number pointing into the injected
                // wrapper. Skipping instead costs one pipeline token.
                //
                // So: an unusable analysis skips EVERY candidate. That is the
                // deliberate principle — a failed rewrite falls back to the
                // original expression rather than failing the compile.
                //
                // A CLEAN compilation keeps the old behaviour on purpose: there an
                // unresolved call is a variable declared in an EARLIER submission,
                // and wrapping those is exactly what makes a cross-submission chain
                // still report its counts.
                bool analysisUsable = !compilation.GetDiagnostics()
                    .Any(d => d.Severity == DiagnosticSeverity.Error);

                var candidates = new List<(InvocationExpressionSyntax Node, string Name)>();
                foreach (var node in tree.GetRoot().DescendantNodes().OfType<InvocationExpressionSyntax>())
                    if (TryGetTrackedName(node, out var candidateName))
                        candidates.Add((node, candidateName));

                if (!analysisUsable)
                {
                    foreach (var (node, name) in candidates)
                    {
                        int mappedAll = node.Span.Start - prefix.Length;
                        if (mappedAll >= 0)
                            skip.Add((mappedAll, name));
                    }
                    return skip;
                }

                foreach (var (node, name) in candidates)
                {
                    var method = model.GetSymbolInfo(node).Symbol as IMethodSymbol;
                    if (method == null)
                        continue; // unresolved in a CLEAN compilation → earlier-submission variable → wrap

                    if (!ShouldSkip(name, method))
                        continue;

                    int mapped = node.Span.Start - prefix.Length;
                    if (mapped >= 0)
                        skip.Add((mapped, name));
                }
            }
            catch
            {
                skip.Clear(); // analysis must never break or alter compilation
            }
            return skip;
        }

        private static bool ShouldSkip(string name, IMethodSymbol method)
        {
            var returnType = method.ReturnType;

            // System.String.Join — wrapping would materialize the string into
            // List<char> and change the expression's result type.
            if (name == "Join" && returnType?.SpecialType == SpecialType.System_String)
                return true;

            // Void-returning name matches (List<T>.Reverse(), Array.Reverse,
            // List<T>.ForEach, ...) cannot bind to TrackEnumerable/TrackSingle.
            if (method.ReturnsVoid || returnType == null
                || returnType.SpecialType == SpecialType.System_Void)
                return true;

            // Intermediate wraps must produce something TrackEnumerable accepts.
            if (PipelineTrackingRewriter.IntermediateMethods.Contains(name)
                && !IsEnumerableLike(returnType))
                return true;

            return false;
        }

        private static bool IsEnumerableLike(ITypeSymbol t)
        {
            if (t.TypeKind == TypeKind.Error)
                return false;
            if (t.TypeKind == TypeKind.Dynamic)
                return true;
            if (t is IArrayTypeSymbol)
                return true;
            if (t.SpecialType == SpecialType.System_String)
                return true; // string is IEnumerable<char> — wraps compile fine

            for (var cur = t; cur != null; cur = cur.BaseType)
            {
                if (cur.SpecialType == SpecialType.System_Collections_IEnumerable)
                    return true;

                // ⚠ The type ITSELF, not only its interfaces. AllInterfaces EXCLUDES
                // the type it is called on, so `IEnumerable<T>` — the return type of
                // Where, Select, Take, Skip, Distinct, Concat, … — matched nothing
                // below and was reported NOT enumerable-like. Every such call was
                // then SKIPPED, i.e. the pipeline silently reported nothing at all.
                // (Measured 2026-10-08 out of process: with the reference set fixed,
                // `Where` moved from WRAP to SKIP purely because of this missing
                // self-test.)
                if (cur.OriginalDefinition.SpecialType
                        == SpecialType.System_Collections_Generic_IEnumerable_T)
                    return true;

                if (cur.AllInterfaces.Any(i =>
                    i.OriginalDefinition.SpecialType == SpecialType.System_Collections_Generic_IEnumerable_T))
                    return true;
            }
            return false;
        }

        private static bool TryGetTrackedName(InvocationExpressionSyntax node)
            => TryGetTrackedName(node, out _);

        private static bool TryGetTrackedName(InvocationExpressionSyntax node, out string name)
        {
            name = null;
            if (node.Expression is MemberAccessExpressionSyntax ma && ma.Name is SimpleNameSyntax sns)
                name = sns.Identifier.ValueText;
            else if (node.Expression is GenericNameSyntax g)
                name = g.Identifier.ValueText;

            return name != null
                && (PipelineTrackingRewriter.IntermediateMethods.Contains(name)
                    || PipelineTrackingRewriter.TerminalSingleMethods.Contains(name));
        }

        /// <summary>
        /// Mirrors the injections ScriptCompiler/ReplSessionManager prepend to
        /// the script code (ScriptOptions imports are not part of the source,
        /// so they are materialized as usings here) plus the two fixed lines
        /// both paths add.
        /// </summary>
        private static string BuildPrefixUsings(IReadOnlyCollection<string> imports)
        {
            var sb = new StringBuilder();
            foreach (var i in imports)
                sb.Append("using ").Append(i).Append(";\n");
            sb.Append("using static CoreScript.Engine.Globals.ScriptApi;" + CoreScript.Engine.Globals.ScriptSurface.StaticImportsLine + "\n");
            sb.Append("using Parameter = Autodesk.Revit.DB.Parameter;\n");
            return sb.ToString();
        }
    }
}
