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
        private static readonly HashSet<string> IntermediateMethods = new HashSet<string>
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
        private static readonly HashSet<string> TerminalSingleMethods = new HashSet<string>
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

        public override SyntaxNode VisitInvocationExpression(InvocationExpressionSyntax node)
        {
            // Bottom-up: visit children first so nested chains are already rewritten
            node = (InvocationExpressionSyntax)base.VisitInvocationExpression(node);

            if (node.Expression is not MemberAccessExpressionSyntax memberAccess)
                return node;

            var methodName = memberAccess.Name.Identifier.Text;

            if (IntermediateMethods.Contains(methodName))
            {
                // Special case: Paracore's UI Select() takes 0 args, LINQ Select() takes ≥1.
                // 0 args = Paracore UI selection (already tracked internally) → skip.
                if (methodName == "Select" && node.ArgumentList.Arguments.Count == 0)
                    return node;

                return WrapWithTrackEnumerable(node);
            }

            if (TerminalSingleMethods.Contains(methodName))
            {
                return WrapWithTrackSingle(node);
            }

            return node;
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
