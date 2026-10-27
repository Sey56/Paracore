using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CoreScript.Engine.Core.Rewriters
{
    /// <summary>
    /// Roslyn syntax rewriter that injects timeout checks into all loop constructs.
    /// This prevents infinite loops from freezing Revit by checking execution time on each iteration.
    ///
    /// ⚠⚠ WHAT THIS CANNOT COVER (measured live 2026-10-27, pre-release review). The check is a
    /// STATEMENT injected into a loop body that exists in the script's OWN syntax. It therefore
    /// cannot interrupt:
    ///   * a single blocking call — Thread.Sleep(100000) ran its full 100 s. (Now refused by the
    ///     agent policy, since sleeping has no use in a takeoff script, but an equivalent blocking
    ///     call would behave the same.)
    ///   * a loop that lives inside a LIBRARY method — Enumerable.Range(0, int.MaxValue)
    ///     .Select(…).ToList() has no loop statement here to inject into, so it runs to the end.
    ///     Revit stays frozen; the client gives up at its own gRPC deadline and reports "Revit did
    ///     not answer" while Revit is still busy.
    /// Cancelling a thread mid-call would need a separate process or Thread.Abort, which .NET 8
    /// does not support. So this is a loop guard, not a kill switch — say so, do not imply more.
    /// </summary>
    public class TimeoutRewriter : CSharpSyntaxRewriter
    {
        private static readonly StatementSyntax TimeoutCheckStatement =
            SyntaxFactory.ParseStatement("CoreScript.Engine.Globals.ExecutionGlobals.CheckTimeout();");

        // ⚠ LAMBDAS TOO (added 2026-10-27). A spin written inside a LINQ predicate —
        //   list.Where(x => { while (…) { … } return true; }) — is a loop body in the script's
        //   syntax, but it sits inside a lambda, and the loop visitors above never reached it
        //   because the lambda's body was not visited as a loop. Measured live: such a spin ran
        //   past 100 s. A lambda with a BLOCK body is a delegate, never an expression tree (which
        //   forbids block bodies), so prepending a statement here cannot break LINQ-to-objects
        //   compilation.
        public override SyntaxNode VisitSimpleLambdaExpression(SimpleLambdaExpressionSyntax node)
        {
            if (node.Block != null)
                return base.VisitSimpleLambdaExpression(node.WithBlock(
                    (BlockSyntax)InjectTimeoutCheck(node.Block)));
            return base.VisitSimpleLambdaExpression(node);
        }

        public override SyntaxNode VisitParenthesizedLambdaExpression(
            ParenthesizedLambdaExpressionSyntax node)
        {
            if (node.Block != null)
                return base.VisitParenthesizedLambdaExpression(node.WithBlock(
                    (BlockSyntax)InjectTimeoutCheck(node.Block)));
            return base.VisitParenthesizedLambdaExpression(node);
        }

        public override SyntaxNode VisitForStatement(ForStatementSyntax node)
        {
            // Inject timeout check at the start of the loop body
            var newBody = InjectTimeoutCheck(node.Statement);
            return base.VisitForStatement(node.WithStatement(newBody));
        }

        public override SyntaxNode VisitForEachStatement(ForEachStatementSyntax node)
        {
            // Inject timeout check at the start of the loop body
            var newBody = InjectTimeoutCheck(node.Statement);
            return base.VisitForEachStatement(node.WithStatement(newBody));
        }

        public override SyntaxNode VisitWhileStatement(WhileStatementSyntax node)
        {
            // Inject timeout check at the start of the loop body
            var newBody = InjectTimeoutCheck(node.Statement);
            return base.VisitWhileStatement(node.WithStatement(newBody));
        }

        public override SyntaxNode VisitDoStatement(DoStatementSyntax node)
        {
            // Inject timeout check at the start of the loop body
            var newBody = InjectTimeoutCheck(node.Statement);
            return base.VisitDoStatement(node.WithStatement(newBody));
        }

        private StatementSyntax InjectTimeoutCheck(StatementSyntax originalStatement)
        {
            // If the statement is already a block, prepend the timeout check
            if (originalStatement is BlockSyntax block)
            {
                var newStatements = new[] { TimeoutCheckStatement }.Concat(block.Statements);
                return block.WithStatements(SyntaxFactory.List(newStatements));
            }

            // If it's a single statement, wrap it in a block with the timeout check
            return SyntaxFactory.Block(
                TimeoutCheckStatement,
                originalStatement
            );
        }
    }
}
