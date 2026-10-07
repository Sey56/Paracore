using Microsoft.CodeAnalysis;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using CoreScript.Engine.Logging;

namespace CoreScript.Engine.Core.Rewriters
{
    /// <summary>
    /// Single source of truth for the script compilation reference set and
    /// using imports. Used by ScriptCompiler (one-shot scripts),
    /// ReplSessionManager (REPL) and SemanticTrackingGuard (pre-rewrite
    /// semantic analysis), so a new reference or import is added in exactly
    /// one place. The lists mirror what those three consumers compiled before
    /// this class existed — ReplSessionManager additionally imports
    /// Autodesk.Revit.UI.Selection.
    /// </summary>
    public static class ScriptReferenceProvider
    {
        /// <summary>
        /// Core + engine + third-party metadata references (mirror of the list
        /// previously built inline by ScriptCompiler.GetScriptOptions and
        /// ReplSessionManager). A fresh list is returned on every call —
        /// callers may extend it, so mutating the result must not affect
        /// other callers.
        /// </summary>
        public static List<MetadataReference> GetCoreReferences(string logPrefix)
        {
            var coreTypes = new[] {
                typeof(object), typeof(Enumerable), typeof(Assembly), typeof(List<>),
                typeof(Math), typeof(ScriptCompiler), typeof(JsonSerializer),
                typeof(Microsoft.CSharp.RuntimeBinder.Binder),
                typeof(System.Runtime.CompilerServices.DynamicAttribute),
                typeof(System.Linq.Expressions.Expression),
                typeof(System.Dynamic.DynamicObject)
            };
            var coreRefs = coreTypes
                .Select(t => {
                    try
                    {
                        var loc = t.Assembly.Location;
                        if (!string.IsNullOrEmpty(loc) && File.Exists(loc))
                            return MetadataReference.CreateFromFile(loc);
                    }
                    catch { }
                    // Fallback: resolve by simple name (handles shared framework
                    // churn after .NET runtime updates — e.g. 8.0.27 → 8.0.28).
                    string asmName = t.Assembly.GetName().Name;
                    if (!string.IsNullOrEmpty(asmName))
                    {
                        try
                        {
                            var resolved = Assembly.Load(asmName);
                            if (!string.IsNullOrEmpty(resolved.Location) && File.Exists(resolved.Location))
                                return MetadataReference.CreateFromFile(resolved.Location);
                        }
                        catch { }
                    }
                    FileLogger.LogWarning($"[{logPrefix}] Could not resolve reference for {t.FullName}");
                    return null;
                })
                .Where(r => r != null)
                .Cast<MetadataReference>()
                .ToList();

            string engineDir = Path.GetDirectoryName(typeof(ScriptCompiler).Assembly.Location) ?? "";
            string[] extraDlls = { "SixLabors.ImageSharp.dll", "RestSharp.dll", "MiniExcel.dll", "MathNet.Numerics.dll" };
            foreach (var dllName in extraDlls)
            {
                string dllPath = Path.Combine(engineDir, dllName);
                if (File.Exists(dllPath))
                {
                    coreRefs.Add(MetadataReference.CreateFromFile(dllPath));
                }
            }

            return coreRefs;
        }

        /// <summary>
        /// RevitAPI*.dll references from the running Revit install directory
        /// (empty when the engine runs outside Revit — e.g. tooling/tests).
        /// </summary>
        public static List<MetadataReference> GetRevitReferences(string logPrefix)
        {
            string revitInstallPath = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule?.FileName) ?? string.Empty;
            if (string.IsNullOrEmpty(revitInstallPath) || !Directory.Exists(revitInstallPath))
                return new List<MetadataReference>();

            var revitDllPaths = Directory.GetFiles(revitInstallPath, "RevitAPI*.dll");
            return revitDllPaths
                .Where(Parsers.ExtractionUtils.IsManagedAssembly)
                .Select(path => (MetadataReference)MetadataReference.CreateFromFile(path))
                .ToList();
        }

        /// <summary>
        /// The using-imports every script compilation gets. When
        /// <paramref name="includeRevitSelection"/> is true the REPL's extra
        /// Autodesk.Revit.UI.Selection import is appended.
        /// </summary>
        public static string[] GetImports(bool includeRevitSelection)
        {
            // ⚠ THIS LIST IS THE IMPORT SURFACE FOR SCRIPTS. A namespace carried
            // here needs no `using` in any REPL snippet or Gallery script — that is
            // the whole point of the engine owning it. The doc
            // (paracore/copilot-instructions.md) and the scaffolded Globals.cs both
            // describe this list, so add a namespace HERE and nowhere else.
            //
            // ⚠ System.Text.RegularExpressions is deliberately ABSENT: it declares
            // `Group`, which collides with Autodesk.Revit.DB.Group (verified live —
            // bare `Group` resolves to the Revit type). A script needing Regex must
            // write `using System.Text.RegularExpressions;` explicitly, exactly like
            // the RestSharp case.
            var imports = new List<string>
            {
                "System", "System.IO", "System.Linq", "System.Collections.Generic",
                "System.Text", "System.Text.Json", "System.Globalization",
                "Microsoft.CSharp",
                "Autodesk.Revit.DB",
                "Autodesk.Revit.DB.Architecture",
                "Autodesk.Revit.DB.Structure",
                "Autodesk.Revit.DB.Mechanical",
                "Autodesk.Revit.DB.Plumbing",
                "Autodesk.Revit.DB.Electrical",
                "Autodesk.Revit.UI",
            };
            if (includeRevitSelection)
                imports.Add("Autodesk.Revit.UI.Selection");
            imports.AddRange(new[]
            {
                "CoreScript.Engine.Globals", "CoreScript.Engine.Runtime",
                "SixLabors.ImageSharp", "SixLabors.ImageSharp.Processing", "SixLabors.ImageSharp.PixelFormats",
                "MiniExcelLibs",
                "MathNet.Numerics", "MathNet.Numerics.LinearAlgebra", "MathNet.Numerics.Statistics"
            });
            return imports.ToArray();
        }
    }
}
