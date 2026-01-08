using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Context;
using CoreScript.Engine.Globals;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Executes parameter options functions to compute dropdown values from Revit document.
    /// </summary>
    public class ParameterOptionsExecutor
    {
        private readonly ILogger _logger;

        public ParameterOptionsExecutor(ILogger logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Executes the {parameterName}_Options() function to get a list of element names.
        /// </summary>
        /// <param name="scriptContent">The full script content</param>
        /// <param name="parameterName">The parameter name (e.g., "wallTypeName")</param>
        /// <param name="context">The Revit execution context</param>
        /// <returns>List of element names for the dropdown</returns>
        public async Task<List<string>> ExecuteOptionsFunction(string scriptContent, string parameterName, ICoreScriptContext context)
        {
            try
            {
                _logger.Log($"[ParameterOptionsExecutor] Executing options function for parameter: {parameterName}", LogLevel.Debug);

                // The function name is {parameterName}_Options
                string functionName = $"{parameterName}_Options";
                
                // 1. Parse the script and extract the function and usings
                var tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot();
                
                var usings = root.DescendantNodes().OfType<UsingDirectiveSyntax>()
                    .Select(u => u.ToString())
                    .ToList();
                
                // Find method, local function, or property
                var functionNode = root.DescendantNodes()
                    .FirstOrDefault(n => (n is MethodDeclarationSyntax m && m.Identifier.Text == functionName) ||
                                         (n is LocalFunctionStatementSyntax l && l.Identifier.Text == functionName) ||
                                         (n is PropertyDeclarationSyntax p && p.Identifier.Text == functionName));

                if (functionNode == null)
                {
                    _logger.Log($"[ParameterOptionsExecutor] Function or Property {functionName} not found in script content.", LogLevel.Warning);
                    return new List<string>();
                }

                bool isProperty = functionNode is PropertyDeclarationSyntax;
                string functionSource = functionNode.ToString();
                string allUsings = string.Join("\n", usings);

                // Create script options with Revit API references
                var scriptOptions = ScriptOptions.Default
                    .AddReferences(
                        typeof(Autodesk.Revit.DB.Document).Assembly,  // RevitAPI.dll
                        typeof(Autodesk.Revit.UI.UIDocument).Assembly, // RevitAPIUI.dll
                        Assembly.GetExecutingAssembly() // CoreScript.Engine.dll
                    )
                    .AddImports(
                        "Autodesk.Revit.DB",
                        "Autodesk.Revit.UI",
                        "System",
                        "System.Collections.Generic",
                        "System.Linq"
                    );

                // Create execution globals
                var executionGlobals = new ExecutionGlobals(context, new Dictionary<string, object>());
                ExecutionGlobals.SetContext(executionGlobals);

                // Build the script that only contains usings, the function, and the call
                string executionScript = $@"
{allUsings}
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;

{functionSource}

{(isProperty ? functionName : $"{functionName}()")}
";

                _logger.Log($"[ParameterOptionsExecutor] Compiling and executing isolated {functionName}...", LogLevel.Debug);
                
                // Execute the script
                var result = await CSharpScript.EvaluateAsync<List<string>>(
                    executionScript,
                    scriptOptions,
                    executionGlobals,
                    typeof(ExecutionGlobals)
                );

                if (result == null || result.Count == 0)
                {
                    _logger.Log($"[ParameterOptionsExecutor] Function {functionName} returned empty list", LogLevel.Warning);
                    return new List<string>();
                }

                _logger.Log($"[ParameterOptionsExecutor] Successfully computed {result.Count} options for {parameterName}", LogLevel.Debug);
                return result;
            }
            catch (CompilationErrorException ex)
            {
                _logger.LogError($"[ParameterOptionsExecutor] Compilation error: {ex.Message}");
                _logger.LogError($"Diagnostics: {string.Join("\n", ex.Diagnostics)}");
                throw new InvalidOperationException($"Failed to compile options function: {ex.Message}");
            }
            catch (Exception ex)
            {
                // Extract the most relevant error message
                // If the script threw an exception, use that message
                // Otherwise, use the outer exception message
                string errorMessage = ex.InnerException?.Message ?? ex.Message;
                
                _logger.LogError($"[ParameterOptionsExecutor] Error executing options function: {errorMessage}");
                
                // Re-throw with the custom error message so it can be shown to the user
                throw new InvalidOperationException(errorMessage);
            }
        }

        /// <summary>
        /// Executes the {parameterName}_Range property to get (min, max, step).
        /// </summary>
        public async Task<(double Min, double Max, double Step)?> ExecuteRangeFunction(string scriptContent, string parameterName, ICoreScriptContext context)
        {
            try
            {
                _logger.Log($"[ParameterOptionsExecutor] Executing range function for parameter: {parameterName}", LogLevel.Debug);

                string functionName = $"{parameterName}_Range";
                
                var tree = CSharpSyntaxTree.ParseText(scriptContent);
                var root = tree.GetRoot();
                
                var usings = root.DescendantNodes().OfType<UsingDirectiveSyntax>()
                    .Select(u => u.ToString())
                    .ToList();
                
                var functionNode = root.DescendantNodes()
                    .FirstOrDefault(n => (n is MethodDeclarationSyntax m && m.Identifier.Text == functionName) ||
                                         (n is PropertyDeclarationSyntax p && p.Identifier.Text == functionName));

                if (functionNode == null)
                {
                    _logger.Log($"[ParameterOptionsExecutor] Function or Property {functionName} not found.", LogLevel.Warning);
                    return null;
                }

                bool isProperty = functionNode is PropertyDeclarationSyntax;
                
                // NEW LOGIC: Extract ALL members from the parent class to ensure helpers are available
                string membersSource;
                if (functionNode.Parent is ClassDeclarationSyntax parentClass)
                {
                    // "Unwrap" the class by taking all members and putting them at the top level of the script
                    membersSource = string.Join("\n\n", parentClass.Members.Select(m => m.ToString()));
                }
                else
                {
                    // Fallback for top-level functions (V0 style or simple snippets)
                    membersSource = functionNode.ToString();
                }

                string allUsings = string.Join("\n", usings);

                var scriptOptions = ScriptOptions.Default
                    .AddReferences(
                        typeof(Autodesk.Revit.DB.Document).Assembly,
                        typeof(Autodesk.Revit.UI.UIDocument).Assembly,
                        Assembly.GetExecutingAssembly(),
                        typeof(System.ValueTuple<,,>).Assembly // Ensure tuple support
                    )
                    .AddImports(
                        "Autodesk.Revit.DB",
                        "Autodesk.Revit.UI",
                        "System",
                        "System.Collections.Generic",
                        "System.Linq",
                        "CoreScript.Engine.Globals" // Added for attributes
                    );

                var executionGlobals = new ExecutionGlobals(context, new Dictionary<string, object>());
                ExecutionGlobals.SetContext(executionGlobals);

                string executionScript = $@"
{allUsings}
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using System;
using System.Collections.Generic;
using System.Linq;
using CoreScript.Engine.Globals;

{membersSource}

{(isProperty ? functionName : $"{functionName}()")}
";

                _logger.Log($"[ParameterOptionsExecutor] Compiling and executing isolated {functionName}...", LogLevel.Debug);
                
                // Execute and expect a tuple
                var result = await CSharpScript.EvaluateAsync<(double, double, double)>(
                    executionScript,
                    scriptOptions,
                    executionGlobals,
                    typeof(ExecutionGlobals)
                );

                return result;
            }
            catch (CompilationErrorException ex)
            {
                _logger.LogError($"[ParameterOptionsExecutor] Compilation error: {ex.Message}");
                throw new InvalidOperationException($"Failed to compile range function: {ex.Message}");
            }
            catch (Exception ex)
            {
                string errorMessage = ex.InnerException?.Message ?? ex.Message;
                _logger.LogError($"[ParameterOptionsExecutor] Error executing range function: {errorMessage}");
                throw new InvalidOperationException(errorMessage);
            }
        }

        public bool HasOptionsFunction(string scriptContent, string parameterName)
        {
            string functionName = $"{parameterName}_Options";
            string filterName = $"{parameterName}_Filter";
            string rangeName = $"{parameterName}_Range";
            
            // Simple check: does the script contain a function or property with this name?
            return scriptContent.Contains($" {functionName}") || 
                   scriptContent.Contains($" {filterName}") ||
                   scriptContent.Contains($" {rangeName}");
        }

        public bool HasRangeFunction(string scriptContent, string parameterName)
        {
             return scriptContent.Contains($" {parameterName}_Range");
        }

    }
}
