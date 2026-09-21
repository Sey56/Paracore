using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System;
using System.Collections.Generic;

namespace CoreScript.Engine.Core.Rewriters
{
    /// <summary>
    /// Roslyn syntax rewriter that injects pipeline tracking after LINQ method calls.
    /// This makes every LINQ method in a fluent chain report its element count to
    /// <c>PipelineDiagnostics</c> — no per-method shadowing needed.
    ///
    /// Intermediate methods (Where, Select, OrderBy, etc.) are wrapped with
    /// <c>ExecutionGlobals.TrackEnumerable()</c>, which materializes and tracks the count.
    ///
    /// Terminal methods (First, Last, Single, etc.) are wrapped with
    /// <c>ExecutionGlobals.TrackSingle()</c>, which tracks 1 (or 0 for null results).
    /// </summary>
    public class PipelineTrackingRewriter : CSharpSyntaxRewriter
    {
        /// <summary>
        /// LINQ methods that return IEnumerable&lt;T&gt; — wrap with TrackEnumerable.
        /// "Where" is included; TrackEnumerable is idempotent (skips AlreadyTracked PipelineEnumerable).
        /// "Select" with 0 args is Paracore's UI Select, not LINQ — handled in visitor.
        /// </summary>
        internal static readonly HashSet<string> IntermediateMethods = new HashSet<string>
        {
            "Where",
            "Select",
            "SelectMany",
            "OrderBy",
            "OrderByDescending",
            "ThenBy",
            "ThenByDescending",
            "Take",
            "Skip",
            "TakeWhile",
            "SkipWhile",
            "Distinct",
            "Reverse",
            "Cast",
            "OfType",
            "Concat",
            "Union",
            "Intersect",
            "Except",
            "Zip",
            "Append",
            "Prepend",
            "DefaultIfEmpty",
            "GroupBy",
            "Join",
            "GroupJoin",
        };

        /// <summary>
        /// LINQ methods that return a single T — wrap with TrackSingle.
        /// </summary>
        internal static readonly HashSet<string> TerminalSingleMethods = new HashSet<string>
        {
            "First",
            "FirstOrDefault",
            "Last",
            "LastOrDefault",
            "Single",
            "SingleOrDefault",
            "ElementAt",
            "ElementAtOrDefault",
            "Find",        // List&lt;T&gt;.Find — common in scripts
            "FindLast",    // List&lt;T&gt;.FindLast
        };

        /// <summary>
        /// (start, name) pairs resolved unsafe-to-wrap by SemanticTrackingGuard.
        /// Start positions (not spans) are matched deliberately: earlier chain
        /// links grow when wrapped, shifting spans but never start positions.
        /// </summary>
        private readonly HashSet<(int Start, string Name)> _skipCalls;

        public PipelineTrackingRewriter(HashSet<(int Start, string Name)>? skipCalls = null)
        {
            _skipCalls = skipCalls ?? new HashSet<(int, string)>();
        }

        public override SyntaxNode VisitInvocationExpression(InvocationExpressionSyntax node)
        {
            // Bottom-up: visit children first so nested chains are already rewritten
            node = (InvocationExpressionSyntax)base.VisitInvocationExpression(node);

            // Bare (identifier) GetElements(...) / GetElements<T>(...) calls in
            // USER scripts are wrapped with TrackSource — logs the source count
            // while preserving the PipelineEnumerable type. Engine internals
            // call ScriptApi.GetElements but are never rewritten → silent.
            if ((node.Expression is IdentifierNameSyntax idExpr
                    && idExpr.Identifier.Text == "GetElements")
                || (node.Expression is GenericNameSyntax genName
                    && genName.Identifier.Text == "GetElements"))
            {
                return WrapWithTrackSource(node);
            }

            if (node.Expression is not MemberAccessExpressionSyntax memberAccess)
                return node;

            var methodName = memberAccess.Name.Identifier.Text;

            // Semantic guard verdict — proven unsafe to wrap (void/string returns)
            if (_skipCalls.Count > 0 && _skipCalls.Contains((node.SpanStart, methodName)))
                return node;

            if (IntermediateMethods.Contains(methodName))
            {
                // Special case: Paracore's UI Select() takes 0 args, LINQ Select() takes ≥1.
                // 0 args = Paracore UI selection (already tracked internally) → skip.
                if (methodName == "Select" && node.ArgumentList.Arguments.Count == 0)
                    return node;

                // Special case: System.String.Join collides with LINQ Join by
                // name only — this rewriter is syntax-only and cannot see
                // receiver types. string.Join returns a string
                // (IEnumerable<char>), so TrackEnumerable would materialize it
                // into a List<char> and silently change the expression's
                // result type.
                if (methodName == "Join" && IsStringJoin(node))
                    return node;

                return WrapWithTrackEnumerable(node);
            }

            if (TerminalSingleMethods.Contains(methodName))
            {
                return WrapWithTrackSingle(node);
            }

            return node;
        }

        /// <summary>
        /// True for System.String.Join invocations. Detection is syntactic:
        /// the receiver is `string`/`String`/`System.String` (the static call
        /// form), or the first argument is a string literal (safe — LINQ
        /// Join's first argument is the inner source, never a literal).
        /// </summary>
        private static bool IsStringJoin(InvocationExpressionSyntax node)
        {
            if (node.Expression is MemberAccessExpressionSyntax ma)
            {
                var recv = ma.Expression.ToString().Trim();
                if (recv == "string" || recv == "String" || recv == "System.String")
                    return true;
            }
            if (node.ArgumentList.Arguments.Count > 0
                && node.ArgumentList.Arguments[0].Expression is LiteralExpressionSyntax le
                && le.IsKind(SyntaxKind.StringLiteralExpression))
                return true;
            return false;
        }

        private static InvocationExpressionSyntax WrapWithTrackSource(InvocationExpressionSyntax node)
        {
            try
            {
                var innerText = node.ToFullString();
                var wrapped = SyntaxFactory.ParseExpression(
                    $"CoreScript.Engine.Globals.ExecutionGlobals.TrackSource({innerText})");
                return ((InvocationExpressionSyntax)wrapped)
                    .WithLeadingTrivia(node.GetLeadingTrivia())
                    .WithTrailingTrivia(node.GetTrailingTrivia());
            }
            catch
            {
                return node;
            }
        }

        private static InvocationExpressionSyntax WrapWithTrackEnumerable(InvocationExpressionSyntax node)
        {
            try
            {
                var innerText = node.ToFullString();
                var wrapped = SyntaxFactory.ParseExpression(
                    $"CoreScript.Engine.Globals.ExecutionGlobals.TrackEnumerable({innerText})");
                return ((InvocationExpressionSyntax)wrapped)
                    .WithLeadingTrivia(node.GetLeadingTrivia())
                    .WithTrailingTrivia(node.GetTrailingTrivia());
            }
            catch
            {
                // If parsing fails (malformed expression, etc.), return unchanged
                return node;
            }
        }

        private static InvocationExpressionSyntax WrapWithTrackSingle(InvocationExpressionSyntax node)
        {
            try
            {
                var innerText = node.ToFullString();
                var wrapped = SyntaxFactory.ParseExpression(
                    $"CoreScript.Engine.Globals.ExecutionGlobals.TrackSingle({innerText})");
                return ((InvocationExpressionSyntax)wrapped)
                    .WithLeadingTrivia(node.GetLeadingTrivia())
                    .WithTrailingTrivia(node.GetTrailingTrivia());
            }
            catch
            {
                return node;
            }
        }
    }
}
