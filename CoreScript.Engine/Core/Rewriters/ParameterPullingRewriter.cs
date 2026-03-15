using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Linq;

namespace CoreScript.Engine.Core.Rewriters
{
    public class ParameterPullingRewriter : CSharpSyntaxRewriter
    {
        public override SyntaxNode VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            var parent = node.Parent;
            bool isInsideParams = false;
            while (parent != null) { if (parent is ClassDeclarationSyntax c && c.Identifier.Text == "Params") { isInsideParams = true; break; } parent = parent.Parent; }

            if (!isInsideParams || !node.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)) || node.Modifiers.Any(m => m.IsKind(SyntaxKind.StaticKeyword)))
            {
                return base.VisitPropertyDeclaration(node);
            }

            string name = node.Identifier.Text;

            // Skip providers and logic-based helpers to avoid circular logic
            if (name.EndsWith("_Options") || name.EndsWith("_Filter") || name.EndsWith("_Range") ||
                name.EndsWith("_Visible") || name.EndsWith("_Enabled") || name.EndsWith("_Unit"))
            {
                return base.VisitPropertyDeclaration(node);
            }

            // REWRITE LOGIC:
            // Transform: public string MyParam { get; set; }
            // Into:      public string MyParam { get; set; } = CoreScript.Engine.Globals.ExecutionGlobals.Get<string>("MyParam");

            string type = node.Type.ToString();

            // V4 FIX: Keep the original { get; set; } so the property remains writable.
            // Add an initializer that pulls the value from globals at construction time.
            var pullExpression = SyntaxFactory.ParseExpression($"CoreScript.Engine.Globals.ExecutionGlobals.Get<{type}>(\"{name}\")");

            var initializer = SyntaxFactory.EqualsValueClause(pullExpression)
                .WithLeadingTrivia(SyntaxFactory.Space);

            // Construct the updated node
            var updatedNode = node
                .WithInitializer(initializer)
                .WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken)
                    .WithTrailingTrivia(node.GetTrailingTrivia()));

            return updatedNode;
        }
    }
}
