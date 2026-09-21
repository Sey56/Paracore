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

                var tree = CSharpSyntaxTree.ParseText(text,
                    new CSharpParseOptions(languageVersion: LanguageVersion.Latest, kind: SourceCodeKind.Script));

                var compilation = CSharpCompilation.Create(
                    "ParacoreTrackingAnalysis",
                    new[] { tree },
                    references,
                    new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

                var model = compilation.GetSemanticModel(tree);

                foreach (var node in tree.GetRoot().DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    if (!TryGetTrackedName(node, out var name))
                        continue;

                    var method = model.GetSymbolInfo(node).Symbol as IMethodSymbol;
                    if (method == null)
                        continue; // unresolved → keep current (wrap) behavior

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
            sb.Append("using static CoreScript.Engine.Globals.ScriptApi;\n");
            sb.Append("using Parameter = Autodesk.Revit.DB.Parameter;\n");
            return sb.ToString();
        }
    }
}
