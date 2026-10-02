using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using CoreScript.Engine.Context;
using CoreScript.Engine.Core;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Collections.Generic;
using System.Linq;
using CoreScript.Engine.Models;
using CoreScript.Engine.Logging;
using System;
using System.Globalization;
using System.Runtime.Loader;
using System.Reflection;

namespace CoreScript.Engine.Globals
{

    /// <summary>
    /// Custom converter to ensure ElementId serializes as a simple number in Tables/Charts.
    /// This fixes the [object Object] issue in the UI.
    /// </summary>
    public class ElementIdConverter : JsonConverter<ElementId>
    {
        public override ElementId Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            return reader.TokenType == JsonTokenType.Number ? new ElementId(reader.GetInt64()) : ElementId.InvalidElementId;
        }

        public override void Write(Utf8JsonWriter writer, ElementId value, JsonSerializerOptions options)
        {
            writer.WriteNumberValue(value.Value);
        }
    }

    /// <summary>
    /// Prevents "The current document is not workset-enabled" and circular reference errors
    /// by only serializing essential Element properties. Handles all subclasses (Wall, Floor, etc.)
    /// </summary>
    public class RevitElementConverterFactory : JsonConverterFactory
    {
        public override bool CanConvert(Type typeToConvert)
        {
            return typeof(Element).IsAssignableFrom(typeToConvert);
        }

        public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
        {
            return new ElementConverter();
        }

        private class ElementConverter : JsonConverter<Element>
        {
            public override Element Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                throw new NotImplementedException();
            }

            public override void Write(Utf8JsonWriter writer, Element value, JsonSerializerOptions options)
            {
                if (value == null) { writer.WriteNullValue(); return; }
                writer.WriteStartObject();
                writer.WriteNumber("Id", value.Id.Value);
                writer.WriteString("Name", value.Name);

                try
                {
                    if (value.Category != null)
                    {
                        writer.WriteString("Category", value.Category.Name);
                    }
                }
                catch { }

                // Explicitly NOT serializing Document or WorksetId to avoid "workset-enabled" errors

                writer.WriteEndObject();
            }
        }
    }

    /// <summary>
    /// Safely serializes Document references.
    /// </summary>
    public class DocumentConverter : JsonConverter<Document>
    {
        public override Document Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            throw new NotImplementedException();
        }

        public override void Write(Utf8JsonWriter writer, Document value, JsonSerializerOptions options)
        {
            if (value == null) { writer.WriteNullValue(); return; }
            writer.WriteStartObject();
            writer.WriteString("Title", value.Title);
            writer.WriteString("Path", value.PathName);
            writer.WriteEndObject();
        }
    }

    /// <summary>
    /// Ensures XYZ objects are serialized as simple coordinate objects.
    /// </summary>
    public class XYZConverter : JsonConverter<XYZ>
    {
        public override XYZ Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            throw new NotImplementedException();
        }

        public override void Write(Utf8JsonWriter writer, XYZ value, JsonSerializerOptions options)
        {
            if (value == null) { writer.WriteNullValue(); return; }
            writer.WriteStartObject();
            writer.WriteNumber("X", Math.Round(value.X, 6));
            writer.WriteNumber("Y", Math.Round(value.Y, 6));
            writer.WriteNumber("Z", Math.Round(value.Z, 6));
            writer.WriteEndObject();
        }
    }

    /// <summary>
    /// Safely serializes Revit Parameters avoiding circular references to Elements.
    /// </summary>
    public class ParameterConverter : JsonConverter<Parameter>
    {
        public override Parameter Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            throw new NotImplementedException();
        }

        public override void Write(Utf8JsonWriter writer, Parameter value, JsonSerializerOptions options)
        {
            if (value == null) { writer.WriteNullValue(); return; }
            writer.WriteStartObject();
            writer.WriteString("Name", value.Definition.Name);

            // Write formatted value for display
            writer.WriteString("Value", value.AsValueString() ?? "-");

            // Meta
            writer.WriteNumber("Id", (value.Definition as InternalDefinition)?.Id.Value ?? -1);
            writer.WriteBoolean("IsReadOnly", value.IsReadOnly);

            // Enums naturally serialize to strings now thanks to JsonStringEnumConverter
            writer.WritePropertyName("StorageType");
            JsonSerializer.Serialize(writer, value.StorageType, options);

            writer.WriteEndObject();
        }
    }
}
