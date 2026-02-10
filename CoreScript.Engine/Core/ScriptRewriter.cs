using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using System.Collections.Generic;
using CoreScript.Engine.Core.Rewriters;

namespace CoreScript.Engine.Core
{
    public class ScriptRewriter : IScriptRewriter
    {
        public string Rewrite(string code, Dictionary<string, object> parameters)
        {
            SyntaxTree tree = CSharpSyntaxTree.ParseText(code);
            var root = tree.GetRoot();

            // 1. Parameter Rewriting
            var parameterRewriter = new ParameterRewriter(parameters);
            root = parameterRewriter.Visit(root);

            // 2. Timeout Rewriting
            var timeoutRewriter = new TimeoutRewriter();
            root = timeoutRewriter.Visit(root);

            return root.ToFullString();
        }
    }
}
