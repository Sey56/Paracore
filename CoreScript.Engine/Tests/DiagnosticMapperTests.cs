using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using CoreScript.Engine.Core;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CoreScript.Engine.Tests
{
    public class DiagnosticMapperTests
    {
        public static void RunTest()
        {
            // Simulate the combined script with #line directives
            string combinedCode = @"#line hidden
using static CoreScript.Engine.Globals.ScriptApi;
#line 1 ""Main.cs""
var p = new Params();
Println(""Hello"");

#line 1 ""Params.cs""
public class Params 
{
    public Leve AssociatedLevel { get; set; }
}
";

            // Parse and get diagnostics
            var tree = CSharpSyntaxTree.ParseText(combinedCode);
            var compilation = CSharpCompilation.Create("Test")
                .AddSyntaxTrees(tree)
                .AddReferences(MetadataReference.CreateFromFile(typeof(object).Assembly.Location));

            var diagnostics = compilation.GetDiagnostics()
                .Where(d => d.Severity == DiagnosticSeverity.Error);

            Console.WriteLine("=== RAW DIAGNOSTICS ===");
            foreach (var d in diagnostics)
            {
                Console.WriteLine(d.ToString());
            }

            // Map using DiagnosticMapper
            var mapped = DiagnosticMapper.MapAndDeduplicate(diagnostics, combinedCode);

            Console.WriteLine("\n=== MAPPED DIAGNOSTICS ===");
            foreach (var m in mapped)
            {
                Console.WriteLine(m.ToString());
            }

            // Verify
            if (mapped.Any(m => m.FileName == "Params.cs" && m.Line == 4))
            {
                Console.WriteLine("\n✅ TEST PASSED: Error correctly mapped to Params.cs line 4");
            }
            else
            {
                Console.WriteLine("\n❌ TEST FAILED: Error not correctly mapped");
            }
        }
    }
}
