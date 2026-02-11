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
                
                // Create the initializer with a space before the equals sign
                var initializer = SyntaxFactory.EqualsValueClause(pullExpression)
                    .WithLeadingTrivia(SyntaxFactory.Space)
                    .WithTrailingTrivia(SyntaxFactory.Space);
                
                // Remove any existing initializer and add the new one
                // Keep everything on the same line by preserving only the trailing trivia from the original node
                var updatedNode = node
                    .WithInitializer(initializer)
                    .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)
                        .WithTrailingTrivia(node.GetTrailingTrivia()));
                
                return updatedNode;
            }
            
            return base.VisitPropertyDeclaration(node);
        }
    }
}