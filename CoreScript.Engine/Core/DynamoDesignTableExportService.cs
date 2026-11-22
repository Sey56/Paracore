using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Design-table export for the built-in gallery action. This is the promoted implementation of
    /// the DynamoDesignTable harness: a self-contained ZeroTouch validator plus a sample table and
    /// schema. Dynamo authors the table; the generated node applies the Paracore contract.
    /// </summary>
    public static partial class DynamoExportService
    {
        private const string DesignTableTemplate = """
            [
              {"id":"P001","faceRef":"Face-12","family":"Panel_600x1200","material":"Aluminium","pattern":"PAT-A","unit":"mm","revision":"rev-001","vertices":[[0,0,0],[600,0,0],[600,1200,0],[0,1200,0]]},
              {"id":"P002","faceRef":"Face-12","family":"Panel_600x1200","material":"Glass","pattern":"PAT-B","unit":"mm","revision":"rev-001","vertices":[[600,0,0],[1200,0,0],[1200,1200,0],[600,1200,0]]}
            ]
            """;

        private static Result BuildDesignTables(Request request)
        {
            try
            {
                string dynamoVersion = string.IsNullOrWhiteSpace(request.DynamoVersion)
                    ? "3.3"
                    : request.DynamoVersion.Trim();
                string assemblyName = string.IsNullOrWhiteSpace(request.AssemblyName)
                    ? "ParacoreDesignTables"
                    : request.AssemblyName.Trim();
                string packageName = string.IsNullOrWhiteSpace(request.PackageName)
                    ? "Paracore_DesignTables"
                    : request.PackageName.Trim();
                string className = "ParacoreDesignTables";

                string outRoot = string.IsNullOrWhiteSpace(request.OutputFolder)
                    ? Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                        "Dynamo", "Dynamo Revit", dynamoVersion, "packages")
                    : Path.GetFullPath(request.OutputFolder.Trim());
                string packageDir = Path.Combine(outRoot, packageName);
                string dllPath = Path.Combine(packageDir, "bin", assemblyName + ".dll");
                if (request.WriteFiles && File.Exists(dllPath) && !request.OverwriteExisting)
                    throw new InvalidOperationException(
                        "Package already exists: " + packageDir + "\nTurn ON Overwrite Existing to replace it.");

                string generatedSource = DesignTableNodeSource;
                var built = DynamoLibraryCompiler.Build(generatedSource, assemblyName);
                if (!built.Success)
                    throw new InvalidOperationException("Dynamo library compilation failed:\n" + built.Errors);

                var utf8 = new UTF8Encoding(false);
                byte[] templateBytes = utf8.GetBytes(DesignTableTemplate + "\n");
                string schemaJson =
                    "{\n" +
                    "  \"schema\": \"paracore.dynamo.design-table/1.0\",\n" +
                    "  \"required_columns\": [\"id\", \"faceRef\", \"family\", \"material\", \"pattern\", \"unit\", \"revision\", \"vertices\"],\n" +
                    "  \"vertices\": \"array of [x,y,z] triplets, at least three, non-degenerate\",\n" +
                    "  \"area_formula\": \"absolute shoelace area / 1,000,000 for millimetres\",\n" +
                    "  \"unit_policy\": \"every row unit must equal the declared unit; values are never converted\",\n" +
                    "  \"revision_filter\": \"empty includes every row; otherwise case-insensitive equality\"\n" +
                    "}\n";
                byte[] schemaBytes = utf8.GetBytes(schemaJson);

                var contractLines = new List<string>
                {
                    "\"contract_version\": " + JsonString("1.1"),
                    "\"tool_id\": " + JsonString(packageName),
                    "\"export_mode\": " + JsonString("DesignTables"),
                    "\"source_file\": " + JsonString("DynamoDesignTable"),
                    "\"engine_identity_file\": " + JsonString(Path.GetFileName(EngineIdentityFile())),
                    "\"engine_sha256\": " + JsonString(EngineIdentityHash()),
                    "\"dynamo_target_version\": " + JsonString(dynamoVersion),
                    "\"assembly_name\": " + JsonString(assemblyName),
                    "\"package_name\": " + JsonString(packageName),
                    "\"node_count\": 3",
                    "\"schema_name\": " + JsonString("paracore.dynamo.design-table/1.0"),
                    "\"required_columns\": " + JsonArray(new[] {
                        "id", "faceRef", "family", "material", "pattern", "unit", "revision", "vertices" }),
                    "\"area_formula\": " + JsonString("absolute shoelace / 1e6; declared units are not converted"),
                    "\"unit_convention\": " + JsonString("source-declared; validator requires every row to match the declared unit"),
                    "\"template_sha256\": " + JsonString(Sha256Hex(templateBytes)),
                    "\"schema_sha256\": " + JsonString(Sha256Hex(schemaBytes))
                };
                string contractJson = "{\n  " + string.Join(",\n  ", contractLines) + "\n}\n";
                string contractHash = Sha256Hex(utf8.GetBytes(contractJson));

                var manifestLines = new List<string>
                {
                    "  \"license\": " + JsonString("Paracore"),
                    "  \"name\": " + JsonString(packageName),
                    "  \"version\": " + JsonString("1.0.0"),
                    "  \"description\": " + JsonString("Paracore design-table validator and schema template."),
                    "  \"group\": " + JsonString("Paracore"),
                    "  \"keywords\": " + JsonArray(new List<string> { "paracore", "dynamo", "design-table" }),
                    "  \"dependencies\": []",
                    "  \"contents\": " + JsonString("Dynamo node validates an authored panel table against the Paracore contract."),
                    "  \"engine_version\": " + JsonString(dynamoVersion),
                    "  \"engine\": " + JsonString("dynamo"),
                    "  \"engine_metadata\": " + JsonString(""),
                    "  \"site_url\": " + JsonString(""),
                    "  \"repository_url\": " + JsonString(""),
                    "  \"contains_binaries\": true",
                    "  \"node_libraries\": " + JsonArray(new List<string> {
                        assemblyName + ", Version=1.0.0.0, Culture=neutral, PublicKeyToken=null" })
                };
                string contractBlock = "  \"paracore_contract\": {\n    " +
                    string.Join(",\n    ", contractLines) + "\n  }";
                string manifest = "{\n" + string.Join(",\n", manifestLines) + ",\n" + contractBlock +
                    ",\n  \"generated_utc\": " + JsonString(DateTime.UtcNow.ToString("o")) +
                    ",\n  \"contract_sha256\": " + JsonString(contractHash) + "\n}\n";

                var artifacts = new List<Artifact>
                {
                    new Artifact(Path.Combine("bin", assemblyName + ".dll"), built.Assembly),
                    new Artifact(Path.Combine("bin", assemblyName + ".xml"), built.Documentation),
                    new Artifact(Path.Combine("bin", assemblyName + ".generated.cs"), utf8.GetBytes(generatedSource)),
                    new Artifact(Path.Combine("Template", "DesignTableTemplate.json"), templateBytes),
                    new Artifact(Path.Combine("Schema", "DesignTableSchema.json"), schemaBytes),
                    new Artifact("pkg.json", utf8.GetBytes(manifest)),
                    new Artifact("contract.json", utf8.GetBytes(contractJson))
                };

                var report = new List<string>
                {
                    "mode              DesignTables",
                    "class             " + className,
                    "nodes: Validate, PolygonAreaM2, Template",
                    "schema            paracore.dynamo.design-table/1.0",
                    "template rows     2",
                    "assembly          " + assemblyName + " (" + built.Assembly.Length + " bytes)",
                    "xml docs          " + built.Documentation.Length + " bytes",
                    "package           " + packageDir,
                    "contract sha256   " + contractHash,
                    request.WriteFiles
                        ? "DONE — restart Dynamo and search for " + className + "."
                        : "DRY RUN — nothing written. Turn ON Write Files to create the package."
                };

                return new Result(true, report, artifacts, generatedSource, assemblyName, packageName,
                    contractJson, contractHash, packageDir, string.Empty);
            }
            catch (Exception ex)
            {
                return Failure(ex.Message);
            }
        }

        /// <summary>
        /// Self-contained ZeroTouch source. The embedded JSON reader avoids a runtime dependency
        /// on the engine or the gallery host, so the package loads in a plain Dynamo session.
        /// </summary>
        private const string DesignTableNodeSource = """
            using System;
            using System.Collections.Generic;
            using System.Globalization;
            using System.Reflection;
            using System.Text;

            [assembly: AssemblyVersion("1.0.0.0")]
            [assembly: AssemblyFileVersion("1.0.0.0")]

            namespace ParacoreDynamoBridge
            {
                /// <summary>
                /// Validates a Dynamo-authored panel design table against the Paracore contract.
                /// Dynamo authors geometry and intent; this node checks identity, units, revisions
                /// and polygon areas before any downstream production step.
                /// </summary>
                public static class ParacoreDesignTables
                {
                    /// <summary>
                    /// Validate a JSON array of panel rows. Returns a JSON summary with status,
                    /// row counts, total area in square metres, declared unit and all errors.
                    /// </summary>
                    /// <param name="tableJson">JSON array of panel rows.</param>
                    /// <param name="unit">Declared unit. Empty means mm.</param>
                    /// <param name="revisionFilter">Optional case-insensitive revision filter. Empty includes all rows.</param>
                    /// <returns name="summary">JSON validation summary.</returns>
                    /// <search>paracore, design table, validate</search>
                    public static string Validate(string tableJson, string unit, string revisionFilter)
                    {
                        string expectedUnit = string.IsNullOrWhiteSpace(unit) ? "mm" : unit.Trim();
                        string filter = revisionFilter ?? "";
                        var errors = new List<string>();
                        object parsed;
                        try { parsed = MiniJson.Parse(tableJson ?? ""); }
                        catch (Exception ex) { throw new ArgumentException("Table Json is not valid JSON: " + ex.Message); }
                        if (!(parsed is List<object> root))
                            throw new ArgumentException("Table Json must be a JSON array of panel rows.");

                        var rows = new List<TableRow>();
                        var seenIds = new HashSet<string>();
                        int index = 0;
                        foreach (object item in root)
                        {
                            index++;
                            if (!(item is Dictionary<string, object> row))
                            {
                                errors.Add("row " + index + ": not an object");
                                continue;
                            }

                            string id = GetStr(row, "id");
                            string faceRef = GetStr(row, "faceRef");
                            string family = GetStr(row, "family");
                            string material = GetStr(row, "material");
                            string pattern = GetStr(row, "pattern");
                            string rowUnit = GetStr(row, "unit");
                            string revision = GetStr(row, "revision");

                            if (string.IsNullOrWhiteSpace(id)) errors.Add("row " + index + ": missing id");
                            else if (!seenIds.Add(id)) errors.Add("row " + index + ": duplicate id " + id);
                            if (string.IsNullOrWhiteSpace(faceRef)) errors.Add("row " + index + ": missing faceRef");
                            if (string.IsNullOrWhiteSpace(family)) errors.Add("row " + index + ": missing family");
                            if (string.IsNullOrWhiteSpace(material)) errors.Add("row " + index + ": missing material");
                            if (!string.Equals(rowUnit, expectedUnit, StringComparison.OrdinalIgnoreCase))
                                errors.Add("row " + index + ": unit '" + rowUnit + "' != declared '" + expectedUnit + "'");
                            if (string.IsNullOrWhiteSpace(revision)) errors.Add("row " + index + ": missing revision");

                            double area = 0;
                            int vertexCount = 0;
                            object vObj;
                            if (!row.TryGetValue("vertices", out vObj) || !(vObj is List<object> verts))
                            {
                                errors.Add("row " + index + ": missing vertices array");
                            }
                            else
                            {
                                var pts = new List<double[]>();
                                foreach (object v in verts)
                                {
                                    if (!(v is List<object> triplet) || triplet.Count < 3)
                                    {
                                        errors.Add("row " + index + ": vertex must be [x,y,z]");
                                        continue;
                                    }
                                    pts.Add(new[] { AsDouble(triplet[0]), AsDouble(triplet[1]), AsDouble(triplet[2]) });
                                }
                                vertexCount = pts.Count;
                                if (pts.Count < 3) errors.Add("row " + index + ": polygon needs at least 3 vertices");
                                else area = Area(pts);
                                if (area <= 0) errors.Add("row " + index + ": degenerate or zero polygon area");
                            }

                            bool included = string.IsNullOrEmpty(filter) ||
                                            string.Equals(revision, filter, StringComparison.OrdinalIgnoreCase);
                            rows.Add(new TableRow
                            {
                                Id = id, FaceRef = faceRef, Family = family, Material = material,
                                Pattern = pattern, Unit = rowUnit, Revision = revision,
                                Vertices = vertexCount, AreaM2 = area, Included = included
                            });
                        }

                        if (rows.Count == 0) errors.Add("table has no rows");

                        var includedRows = rows.FindAll(r => r.Included);
                        double total = 0;
                        foreach (TableRow r in includedRows) total += r.AreaM2;
                        var byMaterial = new Dictionary<string, int>();
                        var byRevision = new Dictionary<string, int>();
                        foreach (TableRow r in includedRows)
                        {
                            if (!byMaterial.ContainsKey(r.Material)) byMaterial[r.Material] = 0;
                            byMaterial[r.Material]++;
                            if (!byRevision.ContainsKey(r.Revision)) byRevision[r.Revision] = 0;
                            byRevision[r.Revision]++;
                        }

                        var sb = new StringBuilder();
                        sb.Append("{\n");
                        sb.Append("  \"schema\": \"paracore.dynamo.design-table/1.0\",\n");
                        sb.Append("  \"status\": ").Append(errors.Count == 0 ? "\"VALID\"" : "\"INVALID\"").Append(",\n");
                        sb.Append("  \"rows_total\": ").Append(rows.Count).Append(",\n");
                        sb.Append("  \"rows_included\": ").Append(includedRows.Count).Append(",\n");
                        sb.Append("  \"total_area_m2\": ").Append(total.ToString("R", CultureInfo.InvariantCulture)).Append(",\n");
                        sb.Append("  \"unit\": ").Append(J(expectedUnit)).Append(",\n");
                        sb.Append("  \"revision_filter\": ").Append(J(filter)).Append(",\n");
                        sb.Append("  \"error_count\": ").Append(errors.Count).Append(",\n");
                        sb.Append("  \"errors\": [").Append(string.Join(", ", errors.ConvertAll(J))).Append("],\n");
                        sb.Append("  \"by_material\": {").Append(Pairs(byMaterial)).Append("},\n");
                        sb.Append("  \"by_revision\": {").Append(Pairs(byRevision)).Append("}\n");
                        sb.Append("}\n");
                        return sb.ToString();
                    }

                    /// <summary>
                    /// Compute the shoelace area of a vertices array in square metres.
                    /// Millimetre coordinates are divided by 1,000,000; values are not otherwise converted.
                    /// </summary>
                    /// <param name="verticesJson">JSON array of [x,y,z] triplets.</param>
                    /// <returns name="area">Absolute polygon area in square input units.</returns>
                    /// <search>paracore, design table, area</search>
                    public static double PolygonAreaM2(string verticesJson)
                    {
                        object parsed;
                        try { parsed = MiniJson.Parse(verticesJson ?? ""); }
                        catch (Exception ex) { throw new ArgumentException("Vertices are not valid JSON: " + ex.Message); }
                        if (!(parsed is List<object> arr)) throw new ArgumentException("Vertices must be a JSON array.");
                        var pts = new List<double[]>();
                        foreach (object v in arr)
                        {
                            if (!(v is List<object> triplet) || triplet.Count < 3)
                                throw new ArgumentException("Each vertex must be [x,y,z].");
                            pts.Add(new[] { AsDouble(triplet[0]), AsDouble(triplet[1]), AsDouble(triplet[2]) });
                        }
                        if (pts.Count < 3) throw new ArgumentException("A polygon needs at least three vertices.");
                        return Area(pts);
                    }

                    /// <summary>
                    /// Return a valid two-row sample table that satisfies every validator rule.
                    /// </summary>
                    /// <returns name="tableJson">Sample table JSON array.</returns>
                    /// <search>paracore, design table, template</search>
                    public static string Template()
                    {
                        return "[\n" +
                            "  {\"id\":\"P001\",\"faceRef\":\"Face-12\",\"family\":\"Panel_600x1200\",\"material\":\"Aluminium\",\"pattern\":\"PAT-A\",\"unit\":\"mm\",\"revision\":\"rev-001\",\"vertices\":[[0,0,0],[600,0,0],[600,1200,0],[0,1200,0]]},\n" +
                            "  {\"id\":\"P002\",\"faceRef\":\"Face-12\",\"family\":\"Panel_600x1200\",\"material\":\"Glass\",\"pattern\":\"PAT-B\",\"unit\":\"mm\",\"revision\":\"rev-001\",\"vertices\":[[600,0,0],[1200,0,0],[1200,1200,0],[600,1200,0]]}\n" +
                            "]\n";
                    }

                    private sealed class TableRow
                    {
                        public string Id = "";
                        public string FaceRef = "";
                        public string Family = "";
                        public string Material = "";
                        public string Pattern = "";
                        public string Unit = "";
                        public string Revision = "";
                        public int Vertices;
                        public double AreaM2;
                        public bool Included;
                    }

                    private static string GetStr(Dictionary<string, object> row, string name)
                    {
                        object v;
                        if (!row.TryGetValue(name, out v) || v == null) return "";
                        return v is string s ? s : Convert.ToString(v);
                    }

                    private static double AsDouble(object v)
                    {
                        if (v is double d) return d;
                        if (v is int i) return (double)i;
                        if (v is long l) return (double)l;
                        return 0;
                    }

                    private static double Area(List<double[]> pts)
                    {
                        double sum = 0;
                        for (int i = 0; i < pts.Count; i++)
                        {
                            double[] a = pts[i];
                            double[] b = pts[(i + 1) % pts.Count];
                            sum += (a[0] * b[1]) - (b[0] * a[1]);
                        }
                        return Math.Abs(sum) / 2.0 / 1000000.0;
                    }

                    private static string J(string v)
                    {
                        var sb = new StringBuilder("\"");
                        foreach (char ch in v ?? "")
                        {
                            if (ch == '"') sb.Append("\\\"");
                            else if (ch == '\\') sb.Append("\\\\");
                            else if (ch == '\n') sb.Append("\\n");
                            else if (ch == '\r') sb.Append("\\r");
                            else if (ch == '\t') sb.Append("\\t");
                            else if (ch < ' ') sb.Append("\\u").Append(((int)ch).ToString("x4"));
                            else sb.Append(ch);
                        }
                        return sb.Append('"').ToString();
                    }

                    private static string Pairs(Dictionary<string, int> map)
                    {
                        var keys = new List<string>(map.Keys);
                        keys.Sort(StringComparer.Ordinal);
                        var parts = new List<string>();
                        foreach (string key in keys) parts.Add(J(key) + ":" + map[key]);
                        return string.Join(", ", parts);
                    }
                }

                /// <summary>Minimal JSON reader for the design-table schema.</summary>
                internal static class MiniJson
                {
                    public static object Parse(string text)
                    {
                        var p = new Reader(text);
                        object value = p.Value();
                        p.SkipWs();
                        if (!p.AtEnd) throw new Exception("unexpected trailing content at " + p.Position);
                        return value;
                    }

                    private sealed class Reader
                    {
                        private readonly string _s;
                        private int _i;
                        public Reader(string s) { _s = s; _i = 0; }
                        public bool AtEnd { get { SkipWs(); return _i >= _s.Length; } }
                        public int Position { get { return _i; } }

                        public void SkipWs()
                        {
                            while (_i < _s.Length && char.IsWhiteSpace(_s[_i])) _i++;
                        }

                        public object Value()
                        {
                            SkipWs();
                            if (_i >= _s.Length) throw new Exception("unexpected end of input");
                            char c = _s[_i];
                            if (c == '{') return ObjectValue();
                            if (c == '[') return ArrayValue();
                            if (c == '"') return StringValue();
                            if (c == 't') { Literal("true"); return true; }
                            if (c == 'f') { Literal("false"); return false; }
                            if (c == 'n') { Literal("null"); return null; }
                            return NumberValue();
                        }

                        private void Literal(string word)
                        {
                            if (_i + word.Length > _s.Length || _s.Substring(_i, word.Length) != word)
                                throw new Exception("invalid literal at " + _i);
                            _i += word.Length;
                        }

                        private Dictionary<string, object> ObjectValue()
                        {
                            var result = new Dictionary<string, object>();
                            _i++;
                            SkipWs();
                            if (_i < _s.Length && _s[_i] == '}') { _i++; return result; }
                            while (true)
                            {
                                SkipWs();
                                if (_i >= _s.Length || _s[_i] != '"') throw new Exception("expected key at " + _i);
                                string key = StringValue();
                                SkipWs();
                                if (_i >= _s.Length || _s[_i] != ':') throw new Exception("expected ':' at " + _i);
                                _i++;
                                result[key] = Value();
                                SkipWs();
                                if (_i >= _s.Length) throw new Exception("unterminated object");
                                if (_s[_i] == '}') { _i++; return result; }
                                if (_s[_i] != ',') throw new Exception("expected ',' at " + _i);
                                _i++;
                            }
                        }

                        private List<object> ArrayValue()
                        {
                            var result = new List<object>();
                            _i++;
                            SkipWs();
                            if (_i < _s.Length && _s[_i] == ']') { _i++; return result; }
                            while (true)
                            {
                                result.Add(Value());
                                SkipWs();
                                if (_i >= _s.Length) throw new Exception("unterminated array");
                                if (_s[_i] == ']') { _i++; return result; }
                                if (_s[_i] != ',') throw new Exception("expected ',' at " + _i);
                                _i++;
                            }
                        }

                        private string StringValue()
                        {
                            _i++;
                            var sb = new StringBuilder();
                            while (_i < _s.Length)
                            {
                                char c = _s[_i++];
                                if (c == '"') return sb.ToString();
                                if (c != '\\') { sb.Append(c); continue; }
                                if (_i >= _s.Length) throw new Exception("unterminated escape");
                                char e = _s[_i++];
                                if (e == '"') sb.Append('"');
                                else if (e == '\\') sb.Append('\\');
                                else if (e == '/') sb.Append('/');
                                else if (e == 'n') sb.Append('\n');
                                else if (e == 'r') sb.Append('\r');
                                else if (e == 't') sb.Append('\t');
                                else if (e == 'b') sb.Append('\b');
                                else if (e == 'f') sb.Append('\f');
                                else throw new Exception("unsupported escape \\" + e);
                            }
                            throw new Exception("unterminated string");
                        }

                        private double NumberValue()
                        {
                            int start = _i;
                            while (_i < _s.Length)
                            {
                                char c = _s[_i];
                                if (char.IsDigit(c) || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') _i++;
                                else break;
                            }
                            string token = _s.Substring(start, _i - start);
                            double d;
                            if (!double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out d))
                                throw new Exception("invalid number '" + token + "' at " + start);
                            return d;
                        }
                    }
                }
            }
            """;
    }
}
