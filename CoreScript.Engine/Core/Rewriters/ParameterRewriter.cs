using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Core.Rewriters
{
    public class ParameterRewriter : CSharpSyntaxRewriter
    {
        private readonly Dictionary<string, object> _parameters;
        public ParameterRewriter(Dictionary<string, object> parameters) { _parameters = parameters; }

        public override SyntaxNode VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            var parent = node.Parent;
            bool isInsideParams = false;
            while (parent != null) { if (parent is ClassDeclarationSyntax c && c.Identifier.Text == "Params") { isInsideParams = true; break; } parent = parent.Parent; }

            if (!isInsideParams || !node.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword))) return base.VisitPropertyDeclaration(node);

            var paramName = node.Identifier.Text;
            if (_parameters.TryGetValue(paramName, out _))
            {
                // V3.1 FIX: Ensure the AccessorList (the { get; set; } part) does NOT carry a newline into the initializer.
                // We clear the trailing trivia from the AccessorList and move it to the SemicolonToken at the end of the line.
                var cleanAccessorList = node.AccessorList?.WithTrailingTrivia(SyntaxFactory.Space);

                var pullExpression = SyntaxFactory.ParseExpression($"CoreScript.Engine.Globals.ExecutionGlobals.Get<{node.Type}>(\"{paramName}\")");
                
                var initializer = SyntaxFactory.EqualsValueClause(pullExpression)
                    .WithLeadingTrivia(SyntaxFactory.Space);
                
                // Get the original trailing trivia (which usually contains the newline)
                var originalTrailingTrivia = node.GetTrailingTrivia();

                var updatedNode = node
                    .WithAccessorList(cleanAccessorList)
                    .WithInitializer(initializer)
                    .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)
                        .WithTrailingTrivia(originalTrailingTrivia));
                
                return updatedNode;
            }
            
            return base.VisitPropertyDeclaration(node);
        }
    }
}
