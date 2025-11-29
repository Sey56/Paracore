using System;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

class Program
{
    static void Main()
    {
        string code = System.IO.File.ReadAllText(@"C:\Users\seyou\RAP\Agent-Library\01_Element_Creation\Walls\Create_Walls\Create_Walls.cs");

        // Test 1: Regular Mode
        var treeRegular = CSharpSyntaxTree.ParseText(code);
        var rootRegular = treeRegular.GetRoot();
        Console.WriteLine("--- Regular Mode ---");
        foreach (var member in rootRegular.ChildNodes())
        {
            Console.WriteLine($"Node: {member.GetType().Name}");
            if (member is GlobalStatementSyntax gs)
            {
                Console.WriteLine($"  Statement: {gs.Statement.GetType().Name}");
                if (gs.Statement is LocalDeclarationStatementSyntax lds)
                {
                    Console.WriteLine($"  Attributes: {lds.AttributeLists.Count}");
                }
            }
        }

        // Test 2: Script Mode
        var options = CSharpParseOptions.Default.WithKind(SourceCodeKind.Script);
        var treeScript = CSharpSyntaxTree.ParseText(code, options);
        var rootScript = treeScript.GetRoot();
        Console.WriteLine("\n--- Script Mode ---");
        foreach (var member in rootScript.ChildNodes())
        {
            Console.WriteLine($"Node: {member.GetType().Name}");
            if (member is FieldDeclarationSyntax fd)
            {
                Console.WriteLine($"  Attributes: {fd.AttributeLists.Count}");
            }
            else if (member is GlobalStatementSyntax gs)
            {
                 Console.WriteLine($"  Statement: {gs.Statement.GetType().Name}");
            }
        }
    }
}
