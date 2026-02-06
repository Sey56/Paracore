using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace CoreScript.Engine.Core.Rewriters
{
    public class ParameterRewriter : CSharpSyntaxRewriter
    {
        private readonly Dictionary<string, object> _values;
        public ParameterRewriter(Dictionary<string, object> values) { _values = values; }

        public override SyntaxNode VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            if (_values.TryGetValue(node.Identifier.Text, out var val))
            {
                var literal = SyntaxFactory.ParseExpression(JsonSerializer.Serialize(val));
                return node.WithInitializer(SyntaxFactory.EqualsValueClause(literal)).WithSemicolonToken(SyntaxFactory.Token(SyntaxKind.SemicolonToken));
            }
            return base.VisitPropertyDeclaration(node);
        }
    }
}
