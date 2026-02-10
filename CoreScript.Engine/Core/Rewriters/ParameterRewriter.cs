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
                var pullExpression = SyntaxFactory.ParseExpression("CoreScript.Engine.Globals.ExecutionGlobals.Get<" + node.Type.ToString() + ">(\"" + paramName + "\")");
                
                // Ensure trivia (like #endregion) starts on a new line by attaching trailing trivia to the semicolon after a newline.
                var originalTrailingTrivia = node.GetTrailingTrivia();
                
                var updatedNode = node.WithInitializer(SyntaxFactory.EqualsValueClause(pullExpression).WithLeadingTrivia(SyntaxFactory.Space))
                                    .WithTrailingTrivia(SyntaxFactory.TriviaList()) // Clear from property
                                    .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)
                                        .WithTrailingTrivia(SyntaxFactory.TriviaList(SyntaxFactory.CarriageReturnLineFeed).Concat(originalTrailingTrivia)));
                
                return updatedNode;
            }
            
            return base.VisitPropertyDeclaration(node);
        }
    }
}