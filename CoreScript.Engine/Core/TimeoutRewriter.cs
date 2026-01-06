using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Roslyn syntax rewriter that injects timeout checks into all loop constructs.
    /// This prevents infinite loops from freezing Revit by checking execution time on each iteration.
    /// </summary>
    public class TimeoutRewriter : CSharpSyntaxRewriter
    {
        private static readonly StatementSyntax TimeoutCheckStatement = 
            SyntaxFactory.ParseStatement("CoreScript.Engine.Globals.ExecutionGlobals.CheckTimeout();");

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
