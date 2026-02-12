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
            // Parse the code (which already has #line directives from ScriptParser)
            SyntaxTree tree = CSharpSyntaxTree.ParseText(code);
            var root = tree.GetRoot();

            // 1. Parameter Rewriting
            if (parameters == null || parameters.Count == 0)
            {
                // This is likely build-time for a binary tool.
                // Replace all Params properties with dynamic getter/setter lookups.
                var pullingRewriter = new ParameterPullingRewriter();
                root = pullingRewriter.Visit(root);
            }
            else
            {
                // This is likely runtime for a standard .cs script.
                // Replace Params properties with initializers matching the current values.
                var parameterRewriter = new ParameterRewriter(parameters);
                root = parameterRewriter.Visit(root);
            }

            // 2. Timeout Rewriting
            var timeoutRewriter = new TimeoutRewriter();
            root = timeoutRewriter.Visit(root);

            // Roslyn's ToFullString() preserves trivia including #line directives
            // No need to manually re-insert them
            return root.ToFullString();
        }
    }
}
