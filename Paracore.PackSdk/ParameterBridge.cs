using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
using CoreScript.Engine.Models;

namespace Paracore.PackSdk;

/// <summary>
/// Turns the form's collected values into the parameters JSON the engine reads.
///
/// ⚠ This is the seam the desktop app crosses over gRPC, and it must keep the same shape: a flat
/// object of <c>name → value</c>. <c>ParameterService.MapParameters</c> branches on the JSON root —
/// an ARRAY is a rich <c>ScriptParameter</c> list, an OBJECT is a plain map — and a pack only has
/// values, not metadata, so it sends the map.
///
/// ⚠ Nulls are OMITTED, not sent as <c>null</c>. An omitted parameter leaves the hydrator with
/// nothing to resolve, so the script's own guard fires ("Target room not found") instead of it
/// receiving a default that looks like a choice the user made.
/// </summary>
public static class ParameterBridge
{
    public static string ToJson(
        List<ScriptParameter> parameters,
        IReadOnlyDictionary<string, object?> values,
        IReadOnlyDictionary<string, object?>? extra = null)
    {
        var payload = new Dictionary<string, object?>(System.StringComparer.Ordinal);

        foreach (ScriptParameter p in parameters)
        {
            if (!values.TryGetValue(p.Name, out object? value) || value is null)
            {
                continue;
            }

            payload[p.Name] = value;
        }

        if (extra != null)
        {
            foreach (KeyValuePair<string, object?> pair in extra)
            {
                payload[pair.Key] = pair.Value;
            }
        }

        return JsonSerializer.Serialize(payload);
    }

    /// <summary>
    /// The same values, sent as a RICH array (<c>ScriptParameter[]</c> with <c>value</c> filled in).
    ///
    /// ⚠ A precompiled pack MUST send this shape, not <see cref="ToJson"/>. With no source to read,
    /// the engine derives two things from the schema:
    ///   • <c>[Unit]</c> conversion — <c>HardenParameters</c> needs the declared unit;
    ///   • the <c>[Confirm]</c> gate — <c>Pattern</c> is written only by <c>ParameterExtractor</c>.
    /// <c>CodeRunner.ExecutePrecompiled</c> refuses a plain map for exactly this reason.
    ///
    /// ⚠ EVERY parameter is emitted, including ones the user left empty, with <c>value: null</c>.
    /// That matches what the source path does: the engine re-extracts the full schema from the
    /// source, so <c>HardenParameters</c> always sees every parameter and can apply its declared
    /// default. Emitting only the filled ones would quietly change which defaults apply.
    /// </summary>
    public static string ToRichJson(
        IReadOnlyList<ScriptParameter> parameters,
        IReadOnlyDictionary<string, object?> values,
        IReadOnlyDictionary<string, object?>? extra = null)
    {
        var array = new JsonArray();

        foreach (ScriptParameter p in parameters)
        {
            // ⚠ Serialise the metadata WITHOUT its Value property, then write the value in.
            // `ScriptParameter.Value` is a JsonElement, and serialising a DEFAULT one throws
            // ("Operation is not valid due to the current state of the object") — verified, not
            // assumed. Copying the 25 fields by hand instead would silently drop any field the
            // model gains later, so the field list is derived from the type, not typed out.
            JsonObject entry = JsonSerializer.SerializeToNode(p, MetadataOnly)?.AsObject() ?? new JsonObject();
            entry["name"] = p.Name;
            entry["value"] = ToNode(values.TryGetValue(p.Name, out object? value) ? value : null);
            array.Add(entry);
        }

        if (extra != null)
        {
            // Reserved keys (__dry_run__, __script_name__, …) travel the same channel: MapParameters
            // reads them out of the array exactly as it would out of a plain map.
            foreach (KeyValuePair<string, object?> pair in extra)
            {
                array.Add(new JsonObject
                {
                    ["name"] = pair.Key,
                    ["value"] = ToNode(pair.Value),
                });
            }
        }

        return array.ToJsonString();
    }

    /// <summary>
    /// camelCase + every <see cref="ScriptParameter"/> property EXCEPT <c>Value</c>.
    ///
    /// ⚠ Built once and cached: a type-info modifier runs per type, and rebuilding it per call would
    /// be pointless work on Revit's UI thread.
    /// </summary>
    private static readonly JsonSerializerOptions MetadataOnly = CreateMetadataOnly();

    private static JsonSerializerOptions CreateMetadataOnly()
    {
        var resolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver();
        resolver.Modifiers.Add(static typeInfo =>
        {
            if (typeInfo.Type != typeof(ScriptParameter))
            {
                return;
            }

            for (int i = typeInfo.Properties.Count - 1; i >= 0; i--)
            {
                if (string.Equals(typeInfo.Properties[i].Name, "Value", StringComparison.OrdinalIgnoreCase))
                {
                    typeInfo.Properties.RemoveAt(i);
                }
            }
        });

        return new JsonSerializerOptions
        {
            TypeInfoResolver = resolver,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };
    }

    private static JsonNode? ToNode(object? value) =>
        value is null ? null : JsonSerializer.SerializeToNode(value);
}
