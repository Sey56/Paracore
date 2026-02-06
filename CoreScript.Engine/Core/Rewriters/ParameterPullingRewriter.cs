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
            string name = node.Identifier.Text;
            
            // Skip non-public properties or static properties
            if (!node.Modifiers.Any(m => m.IsKind(SyntaxKind.PublicKeyword)) || node.Modifiers.Any(m => m.IsKind(SyntaxKind.StaticKeyword)))
            {
                return base.VisitPropertyDeclaration(node);
            }

            // Skip providers and logic-based helpers to avoid circular logic
            if (name.EndsWith("_Options") || name.EndsWith("_Filter") || name.EndsWith("_Range") || 
                name.EndsWith("_Visible") || name.EndsWith("_Enabled") || name.EndsWith("_Unit"))
            {
                return base.VisitPropertyDeclaration(node);
            }

            // REWRITE LOGIC:
            // Transform: public string MyParam { get; set; }
            // Into:      public string MyParam { get { return ExecutionGlobals.Get<string>("MyParam"); } set { } }
            
            string type = node.Type.ToString();
            
            // 1. Create the GET accessor block
            // return CoreScript.Engine.Globals.ExecutionGlobals.Get<TYPE>("NAME");
            var getStatement = SyntaxFactory.ReturnStatement(
                SyntaxFactory.ParseExpression($"CoreScript.Engine.Globals.ExecutionGlobals.Get<{type}>(\"{name}\")")
            );
            
            var getter = SyntaxFactory.AccessorDeclaration(SyntaxKind.GetAccessorDeclaration)
                .WithBody(SyntaxFactory.Block(getStatement)); // Use Block body {} instead of expression body =>

            // 2. Create the SET accessor block (empty)
            // set { }
            var setter = SyntaxFactory.AccessorDeclaration(SyntaxKind.SetAccessorDeclaration)
                .WithBody(SyntaxFactory.Block()); 

            // 3. Construct the new property
            return node
                .WithAccessorList(SyntaxFactory.AccessorList(SyntaxFactory.List(new[] { getter, setter })))
                .WithInitializer(null) // Remove = "Default";
                .WithSemicolonToken(default); // Remove ; at end
        }
    }
}
