using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using CoreScript.Engine.Core;
using CoreScript.Engine.Logging;
using CoreScript.Engine.Models;

namespace Paracore.PackSdk;

/// <summary>
/// What the "Discover" button runs — the same two paths the desktop's Compute runs, in the same order.
///
/// ⚠⚠ NO <c>FilteredElementCollector</c> IN THIS FILE, and that is the whole point. The engine already
/// owns the conventions that make a list correct:
///
///   1. <c>{Name}_Options</c> and <c>{Name}_Filter</c> — <see cref="ParameterOptionsExecutor"/>
///      compiles the script's own provider against the CURRENT parameter values and returns the pool.
///      A curated list the author wrote must win; a private collector would silently ignore it.
///   2. Automatic discovery — <see cref="ParameterOptionsComputer"/> resolves the type name and
///      applies the collector quirks the engine documents (a Room is a <c>SpatialElement</c>, a
///      <c>*Type</c> needs <c>WhereElementIsElementType</c>, …). Hand-rolling this is how the form
///      shows an empty room list while the desktop shows twelve.
///
/// The label is <c>GetElementIdentity</c> for the same reason: "Kitchen [101]" and
/// "Basic Wall: Generic 200mm" are what the desktop displays, and two front-ends must name a thing
/// the same way.
/// </summary>
public static class ParameterDiscovery
{
    public static async Task<(List<ElementChoice> Items, string? Error)> DiscoverAsync(
        UIApplication uiApp,
        UIDocument uiDoc,
        string source,
        List<ScriptParameter> parameters,
        ScriptParameter parameter,
        IReadOnlyDictionary<string, object?> values)
    {
        Document doc = uiDoc.Document;

        if (string.IsNullOrWhiteSpace(parameter.RevitElementType))
        {
            return ([], "this parameter declares no element type");
        }

        try
        {
            string parametersJson = ParameterBridge.ToJson(parameters, values);
            var context = new PackScriptContext(uiApp, uiDoc);
            var executor = new ParameterOptionsExecutor(new FileLoggerWrapper(), new ParameterService());

            bool curated = executor.HasOptionsFunction(source, parameter.Name);
            List<ElementChoice> items;
            string via;

            if (curated)
            {
                // The author's own curation — _Options provider or _Filter predicate.
                List<object> pool = await executor
                    .ExecuteElementOptionsFunction(source, parameter.Name, context, parametersJson, parameters)
                    .ConfigureAwait(true);

                items = ToChoices(pool);
                via = " via _Options/_Filter";
            }
            else if (IsEnumType(parameter.RevitElementType))
            {
                // ⚠⚠ THE ENUM BRANCH — the whole of "BuiltInCategory and BuiltInParameter discover
                // nothing".
                //
                // The engine has TWO computers and they answer different questions:
                //   ComputeElementOptions → List<Element>, and for an enum it answers EMPTY BY
                //                           DESIGN ("Enums don't return elements");
                //   ComputeOptions        → List<string>, and it is the one that knows
                //                           Enum.GetNames.
                // This file called the ELEMENT overload for every type, so an enum came back as an
                // empty list with no error to explain it. The add-in's own Compute
                // (ContextHandler.ComputeParameterOptions) calls ComputeOptions — the pack was the
                // only caller asking the wrong question.
                //
                // The value is the member NAME, not an id: there is no element to point at, and
                // ParameterHydrator resolves an enum with `Enum.TryParse`.
                var computer = new ParameterOptionsComputer(doc);
                items = computer
                    .ComputeOptions(parameter.RevitElementType, parameter.RevitElementCategory)
                    .Select(name => new ElementChoice(0, name, name))
                    .ToList();

                via = " via Enum.GetNames";
            }
            else
            {
                // Automatic discovery: every element of the declared type.
                var computer = new ParameterOptionsComputer(doc);
                items = ToChoices(computer.ComputeElementOptions(parameter.RevitElementType).Cast<object>());
                via = " via automatic discovery";
            }

            FileLogger.Log(
                $"[PackSdk] Discover '{parameter.Name}' ({parameter.RevitElementType}): {items.Count} item(s){via}");

            return (items, null);
        }
        catch (Exception ex)
        {
            // ⚠ RETURNED, not swallowed. A silently empty list is what made "Discover doesn't work"
            // impossible to diagnose; this message reaches the watermark under the combo.
            FileLogger.LogError($"[PackSdk] Discover '{parameter.Name}' failed: {ex}");
            return ([], ex.Message);
        }
    }

    /// <summary>
    /// Is the declared "element type" actually a Revit ENUM? <c>BuiltInCategory</c>,
    /// <c>BuiltInParameter</c>, <c>DisplayUnitType</c> and friends arrive through the same
    /// <c>revitElementType</c> field as <c>Wall</c> and <c>ViewSheet</c>, and the extractor sets
    /// <c>isRevitElement</c> for both (a Revit enum is a Revit type the user picks from a list).
    /// Nothing in the metadata distinguishes them, so the name has to be looked up.
    ///
    /// ⚠ The lookup is the engine's own: the same assembly, the same exact-or-singular match. Doing
    /// it differently here would let the two disagree about what an enum is.
    /// </summary>
    private static bool IsEnumType(string? typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName))
        {
            return false;
        }

        string name = typeName.Trim();

        if (EnumCache.TryGetValue(name, out bool cached))
        {
            return cached;
        }

        bool isEnum;
        try
        {
            string singular = name.EndsWith("ies", StringComparison.OrdinalIgnoreCase)
                ? name[..^3] + "y"
                : name.EndsWith("s", StringComparison.OrdinalIgnoreCase) && !name.EndsWith("ss", StringComparison.OrdinalIgnoreCase)
                    ? name[..^1]
                    : name;

            isEnum = typeof(Autodesk.Revit.DB.Element).Assembly.GetTypes().Any(t =>
                t.IsEnum
                && (t.Name.Equals(name, StringComparison.OrdinalIgnoreCase)
                    || t.Name.Equals(singular, StringComparison.OrdinalIgnoreCase)));
        }
        catch
        {
            // GetTypes() can throw on a partial load; a name we cannot resolve is not an enum.
            isEnum = false;
        }

        EnumCache[name] = isEnum;
        return isEnum;
    }

    private static readonly Dictionary<string, bool> EnumCache = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Keeps only what can be identified and resolved. A pool may contain elements, strings or
    /// anonymous objects; only an <see cref="Element"/> has an id the hydrator can use.
    ///
    /// ⚠ ENUM MEMBERS NEVER COME THROUGH HERE. They have no element and no id — every one of them
    /// would carry <c>Id = 0</c>, and the <c>DistinctBy</c> below would collapse the whole list to
    /// a single row. Enums are built in <see cref="DiscoverAsync"/> instead.
    /// </summary>
    private static List<ElementChoice> ToChoices(IEnumerable<object> pool) => pool
        .OfType<Element>()
        .Where(e => e.IsValidObject)
        .Select(e => new ElementChoice(e.Id.Value, ParameterOptionsComputer.GetElementIdentity(e)))
        .DistinctBy(c => c.Id)
        .OrderBy(c => c.Label, StringComparer.OrdinalIgnoreCase)
        .ToList();
}
