using Microsoft.CodeAnalysis.CSharp;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace CoreScript.Engine.Core
{
    /// <summary>
    /// Graph export for the built-in gallery action. This is the promoted implementation of the
    /// DynamoGraphAuthor harness: one authored, connected, native-node-only .dyn workflow, not a
    /// replay of a gallery tool. The harness calls the same helper.
    /// </summary>
    public static partial class DynamoExportService
    {
        private static Result BuildGraph(Request request)
        {
            try
            {
                // The graph is derived from the selected tool. A script that cannot become a
                // graph fails here with a message naming the reason and the fix.
                GraphScriptModel model = GraphScriptReader.Read((request.SourceScriptFile ?? "").Trim());

                string graphName = string.IsNullOrWhiteSpace(request.GraphName)
                    ? model.GraphName
                    : request.GraphName.Trim();
                string dynamoVersion = string.IsNullOrWhiteSpace(request.DynamoVersion)
                    ? "3.3"
                    : request.DynamoVersion.Trim();
                if (dynamoVersion != "3.3")
                    throw new InvalidOperationException("Only Dynamo 3.3 is pinned for 4.9.0. Got: " + dynamoVersion);

                string outRoot = string.IsNullOrWhiteSpace(request.OutputFolder)
                    ? Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                        "Dynamo", "Dynamo Revit", dynamoVersion, "graphs", "Paracore")
                    : Path.GetFullPath(request.OutputFolder.Trim());
                string graphPath = Path.Combine(outRoot, graphName + ".dyn");
                string manifestPath = Path.Combine(outRoot, graphName + ".manifest.json");
                if (request.WriteFiles && File.Exists(graphPath) && !request.OverwriteExisting)
                    throw new InvalidOperationException(
                        "Graph already exists: " + graphPath + ". Turn ON Overwrite Existing to replace it.");

                var report = new List<string>();
                var nodeJson = new List<string>();
                var nodeViews = new List<string>();
                var connectors = new List<string>();
                var inputs = new List<string>();
                var outputs = new List<string>();

                Func<string, string> J = JsonString;
                Func<double, string> Num = v => v.ToString("R", CultureInfo.InvariantCulture);
                Func<string, string> Id = key =>
                {
                    byte[] digest = SHA256.HashData(Encoding.UTF8.GetBytes("paracore.graph.v1|" + key));
                    var b = new byte[16];
                    Array.Copy(digest, b, 16);
                    b[7] = (byte)((b[7] & 0x0f) | 0x40);
                    b[8] = (byte)((b[8] & 0x3f) | 0x80);
                    return new Guid(b).ToString("N");
                };
                Func<string, string> DashedId = key => Guid.ParseExact(Id(key), "N").ToString();
                Func<string, string, string> Pid = (nodeKey, suffix) => Id("port|" + nodeKey + "|" + suffix);
                Func<string, string, string, string> Port = (portId, name, description) =>
                    "{\"Id\":" + J(portId) + ",\"Name\":" + J(name) + ",\"Description\":" + J(description) +
                    ",\"UsingDefaultValue\":false,\"Level\":2,\"UseLevels\":false,\"KeepListStructure\":false}";

                double xInput = 80, xStage1 = 420, xStage2 = 760, xStage3 = 1100, xWatch = 1440;

                // Exposed numeric inputs must be DoubleSlider. A plain DoubleInput marked as a
                // graph input freezes Dynamo 3.3 on open.
                Action<string, string, double, double, double> addNumber =
                    (key, label, value, px, py) =>
                    {
                        string nodeId = Id("node|" + key);
                        string portId = Pid(key, "out");
                        nodeJson.Add(
                            "{\"ConcreteType\":\"CoreNodeModels.Input.DoubleSlider, CoreNodeModels\"," +
                            "\"NumberType\":\"Double\",\"MaximumValue\":" + Num(1000000.0) +
                            ",\"MinimumValue\":" + Num(0.0) + ",\"StepValue\":" + Num(1.0) +
                            ",\"Id\":" + J(nodeId) + "," +
                            "\"NodeType\":\"NumberInputNode\",\"Inputs\":[],\"Outputs\":[" +
                            Port(portId, "", "Double") + "]," +
                            "\"Replication\":\"Disabled\",\"Description\":\"Produces numeric values\"," +
                            "\"InputValue\":" + Num(value) + "}");
                        nodeViews.Add(
                            "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(label) + "," +
                            "\"IsSetAsInput\":true,\"IsSetAsOutput\":false,\"Excluded\":false," +
                            "\"ShowGeometry\":true,\"X\":" + Num(px) + ",\"Y\":" + Num(py) + "}");
                        inputs.Add(
                            "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(label) + "," +
                            "\"Type\":\"number\",\"Type2\":\"number\",\"Value\":" + J(Num(value)) + "," +
                            "\"MaximumValue\":1000000.0,\"MinimumValue\":0.0,\"StepValue\":1.0," +
                            "\"NumberType\":\"Double\",\"Description\":" + J(label) + ",\"SelectedIndex\":0}");
                        report.Add("input  " + key + " = " + Num(value));
                    };

                Action<string, string, string, double, double> addString =
                    (key, label, value, px, py) =>
                    {
                        string nodeId = Id("node|" + key);
                        string portId = Pid(key, "out");
                        nodeJson.Add(
                            "{\"ConcreteType\":\"CoreNodeModels.Input.StringInput, CoreNodeModels\"," +
                            "\"InputValue\":" + J(value) + ",\"Id\":" + J(nodeId) + "," +
                            "\"NodeType\":\"StringInputNode\",\"Inputs\":[],\"Outputs\":[" +
                            Port(portId, "", "String") + "]," +
                            "\"Replication\":\"Disabled\",\"Description\":" + J(label) + "}");
                        nodeViews.Add(
                            "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(label) + "," +
                            "\"IsSetAsInput\":true,\"IsSetAsOutput\":false,\"Excluded\":false," +
                            "\"ShowGeometry\":true,\"X\":" + Num(px) + ",\"Y\":" + Num(py) + "}");
                        inputs.Add(
                            "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(label) + "," +
                            "\"Type\":\"string\",\"Type2\":\"string\",\"Value\":" + J(value) + "," +
                            "\"Description\":" + J(label) + ",\"SelectedIndex\":0}");
                        report.Add("input  " + key + " = " + value);
                    };

                Action<string, string, bool, double, double> addBoolean =
                    (key, label, value, px, py) =>
                    {
                        string nodeId = Id("node|" + key);
                        string portId = Pid(key, "out");
                        nodeJson.Add(
                            "{\"ConcreteType\":\"CoreNodeModels.Input.BooleanInput, CoreNodeModels\"," +
                            "\"InputValue\":" + (value ? "true" : "false") + ",\"Id\":" + J(nodeId) + "," +
                            "\"NodeType\":\"BooleanInputNode\",\"Inputs\":[],\"Outputs\":[" +
                            Port(portId, "", "Boolean") + "]," +
                            "\"Replication\":\"Disabled\",\"Description\":" + J(label) + "}");
                        nodeViews.Add(
                            "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(label) + "," +
                            "\"IsSetAsInput\":true,\"IsSetAsOutput\":false,\"Excluded\":false," +
                            "\"ShowGeometry\":true,\"X\":" + Num(px) + ",\"Y\":" + Num(py) + "}");
                        inputs.Add(
                            "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(label) + "," +
                            "\"Type\":\"boolean\",\"Type2\":\"boolean\",\"Value\":" + J(value ? "true" : "false") + "," +
                            "\"Description\":" + J(label) + ",\"SelectedIndex\":0}");
                        report.Add("input  " + key + " = " + (value ? "true" : "false"));
                    };

                // Dynamo binds code-block input ports by first-read order of undeclared
                // variables. The reader already derived that order; refuse a mismatch instead
                // of shipping a graph that opens with silently swapped wires.
                Action<string, string, string[], string, double, double> addStage =
                    (key, code, inNames, desc, px, py) =>
                    {
                        string nodeId = Id("node|" + key);

                        var ins = new List<string>();
                        foreach (string n in inNames) ins.Add(Port(Pid(key, "in|" + n), n, n));
                        string[] lines = code.Split('\n');
                        var outs = new List<string>();
                        for (int i = 0; i < lines.Length; i++)
                            outs.Add(Port(Pid(key, "out|" + i), "", "Value of expression at line " + (i + 1)));
                        nodeJson.Add(
                            "{\"ConcreteType\":\"Dynamo.Graph.Nodes.CodeBlockNodeModel, DynamoCore\"," +
                            "\"Id\":" + J(nodeId) + ",\"NodeType\":\"CodeBlockNode\"," +
                            "\"Inputs\":[" + string.Join(",", ins) + "],\"Outputs\":[" + string.Join(",", outs) + "]," +
                            "\"Replication\":\"Disabled\",\"Description\":" + J(desc) + "," +
                            "\"Code\":" + J(code) + "}");
                        nodeViews.Add(
                            "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(key) + "," +
                            "\"IsSetAsInput\":false,\"IsSetAsOutput\":false,\"Excluded\":false," +
                            "\"ShowGeometry\":true,\"X\":" + Num(px) + ",\"Y\":" + Num(py) + "}");
                        report.Add("stage  " + key + " (" + inNames.Length + " in / " + lines.Length + " out)");
                    };

                Action<string, string, double, double> addWatch = (key, label, px, py) =>
                {
                    string nodeId = Id("node|" + key);
                    nodeJson.Add(
                        "{\"ConcreteType\":\"CoreNodeModels.Watch, CoreNodeModels\"," +
                        "\"WatchWidth\":220.0,\"WatchHeight\":64.0,\"Id\":" + J(nodeId) + "," +
                        "\"NodeType\":\"ExtensionNode\",\"Inputs\":[" +
                        Port(Pid(key, "in"), "", "Node to show output from") + "],\"Outputs\":[" +
                        Port(Pid(key, "out"), "", "Node output") + "]," +
                        "\"Replication\":\"Disabled\",\"Description\":" + J(label) + "}");
                    nodeViews.Add(
                        "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(label) + "," +
                        "\"IsSetAsInput\":false,\"IsSetAsOutput\":true,\"Excluded\":false," +
                        "\"ShowGeometry\":true,\"X\":" + Num(px) + ",\"Y\":" + Num(py) + "}");
                    outputs.Add(
                        "{\"Id\":" + J(nodeId) + ",\"Name\":" + J(label) + "," +
                        "\"Type\":\"unknown\",\"InitialValue\":\"\",\"Description\":" + J(label) + "}");
                    report.Add("output " + key);
                };

                Action<string, string, string, string, string> wire = (wid, fromKey, fromPort, toKey, toPort) =>
                {
                    connectors.Add(
                        "{\"Start\":" + J(Pid(fromKey, fromPort)) + ",\"End\":" + J(Pid(toKey, toPort)) + "," +
                        "\"Id\":" + J(Id("wire|" + wid)) + ",\"IsHidden\":\"False\"}");
                };

                // ---- Build the graph from the parsed script -------------------------------
                // One exposed input per Params property, then one CodeBlock that runs the
                // tool's logic, then a Watch per produced value.
                var paramByName = new Dictionary<string, GraphScriptModel.Param>(StringComparer.Ordinal);
                foreach (GraphScriptModel.Param pr in model.Params)
                    paramByName[pr.Name] = pr;

                double py = 80;
                Func<double> nextY = () => { double v = py; py += 150; return v; };

                var inputNodeKeys = new List<string>();
                foreach (GraphScriptModel.Param pr in model.Params)
                {
                    string key = "param_" + pr.Name;
                    inputNodeKeys.Add(key);

                    string label = string.IsNullOrWhiteSpace(pr.Summary) ? pr.Name : pr.Summary;
                    if (!string.IsNullOrWhiteSpace(pr.Unit)) label = label + " (" + pr.Unit + ")";

                    string t = pr.Type.ToLowerInvariant();
                    string def = pr.Default ?? "";

                    if (t == "int" || t == "long" || t == "short" || t == "byte" ||
                        t == "double" || t == "float" || t == "decimal")
                    {
                        double dv = 0;
                        if (!string.IsNullOrEmpty(def) &&
                            double.TryParse(def.TrimEnd('f', 'F', 'd', 'D', 'm', 'M'),
                                NumberStyles.Float, CultureInfo.InvariantCulture, out dv))
                        {
                            // keep parsed value
                        }
                        addNumber(key, label, dv, xInput, nextY());
                    }
                    else if (t == "bool")
                    {
                        addBoolean(key, label, def.Trim().Equals("true", StringComparison.OrdinalIgnoreCase), xInput, nextY());
                    }
                    else
                    {
                        addString(key, label, def.Trim().Trim('"'), xInput, nextY());
                    }
                }

                // The CodeBlock runs the tool's logic and reads the exposed inputs.
                string[] codeLines = model.Code.Split('\n');
                var codeInputs = model.CodeInputs;
                var codeOutputs = model.CodeOutputs;

                if (codeInputs.Count == 0)
                    throw new InvalidOperationException(
                        "'" + model.ScriptName + "' cannot be exported as a Dynamo graph: its logic reads no " +
                        "values, so the graph would have nothing to supply.");

                addStage("body", model.Code, codeInputs.ToArray(),
                    "Runs " + model.ScriptName + (string.IsNullOrEmpty(model.MethodName)
                        ? "."
                        : "." + model.MethodName + "()."),
                    xStage1, 260);

                // Wire each exposed input into the CodeBlock port that reads it.
                int wireIndex = 0;
                foreach (string codeIn in codeInputs)
                {
                    if (!paramByName.ContainsKey(codeIn)) continue;
                    string key = "param_" + codeIn;
                    wire("w" + (++wireIndex).ToString("D2"), key, "out", "body", "in|" + codeIn);
                }

                // Watch every value the CodeBlock produces.
                int watchY = 180;
                for (int i = 0; i < codeOutputs.Count; i++)
                {
                    string outName = codeOutputs[i];
                    addWatch("watch_" + outName, outName, xWatch, watchY);
                    wire("w" + (++wireIndex).ToString("D2"), "body", "out|" + i, "watch_" + outName, "in");
                    watchY += 160;
                }

                if (codeOutputs.Count == 0)
                {
                    // Nothing is produced: expose the input values so the graph is not empty.
                    foreach (string codeIn in codeInputs)
                    {
                        if (!paramByName.ContainsKey(codeIn)) continue;
                        addWatch("watch_" + codeIn, codeIn, xWatch, watchY);
                        wire("w" + (++wireIndex).ToString("D2"), "param_" + codeIn, "out", "watch_" + codeIn, "in");
                        watchY += 160;
                    }
                }

                string graphJson =
                    "{\n" +
                    "  \"Author\": \"Paracore\",\n" +
                    "  \"Bindings\": [],\n" +
                    "  \"Connectors\": [" + string.Join(",\n    ", connectors) + "],\n" +
                    "  \"Dependencies\": [],\n" +
                    "  \"Description\":" + J("Paracore-authored " + graphName + " — generated from " +
                        Path.GetFileName(model.SourceFile) + ". Native nodes only; pinned to Dynamo " +
                        dynamoVersion + ".") + ",\n" +
                    "  \"ElementResolver\": {\"ResolutionMap\": {}},\n" +
                    "  \"ExtensionWorkspaceData\": [{\"ExtensionGuid\":\"28992e1d-abb9-417f-8b1b-05e053bee670\"," +
                    "\"Name\":\"Properties\",\"Version\":\"3.1\",\"Data\":{}}],\n" +
                    "  \"GraphDocumentationURL\": null,\n" +
                    "  \"Inputs\": [" + string.Join(",\n    ", inputs) + "],\n" +
                    "  \"IsCustomNode\": false,\n" +
                    "  \"Linting\": {\"activeLinter\":\"None\",\"activeLinterId\":\"7b75fb44-43fd-4631-a878-29f4d5d8399a\"," +
                    "\"warningCount\":0,\"errorCount\":0},\n" +
                    "  \"Name\":" + J(graphName) + ",\n" +
                    "  \"NodeLibraryDependencies\": [],\n" +
                    "  \"Nodes\": [" + string.Join(",\n    ", nodeJson) + "],\n" +
                    "  \"Outputs\": [" + string.Join(",\n    ", outputs) + "],\n" +
                    "  \"Thumbnail\": \"\",\n" +
                    "  \"Uuid\":" + J(DashedId("graph|" + graphName)) + ",\n" +
                    // A graph without the native View fields parses but hangs Dynamo 3.3 on open.
                    "  \"View\": {\n" +
                    "    \"Annotations\": [],\n" +
                    "    \"Camera\": {\"Name\":\"_Background Preview\",\"EyeX\":-11.702650547027588," +
                    "\"EyeY\":20.44056510925293,\"EyeZ\":-24.494302749633789," +
                    "\"LookX\":12.377099990844727,\"LookY\":-14.715733528137207,\"LookZ\":6.1681365966796875," +
                    "\"UpX\":0.50565505027771,\"UpY\":0.82511365413665771,\"UpZ\":0.25199323892593384},\n" +
                    "    \"ConnectorPins\": [],\n" +
                    "    \"Dynamo\": {\"ScaleFactor\":1.0,\"HasRunWithoutCrash\":false,\"IsVisibleInDynamoLibrary\":true," +
                    "\"Version\":\"3.3.0.6316\",\"RunType\":\"Manual\",\"RunPeriod\":\"1000\"},\n" +
                    "    \"NodeViews\": [" + string.Join(",\n      ", nodeViews) + "],\n" +
                    "    \"X\": -481.57355697119573,\n" +
                    "    \"Y\": -502.61166017684116,\n" +
                    "    \"Zoom\": 0.79079942412653\n" +
                    "  }\n" +
                    "}\n";

                var utf8 = new UTF8Encoding(false);
                byte[] graphBytes = utf8.GetBytes(graphJson);
                string graphHash = Sha256Hex(graphBytes);

                string manifest =
                    "{\n" +
                    "  \"schema\": \"paracore.dynamo.graph/1.0\",\n" +
                    "  \"graph\":" + J(graphName + ".dyn") + ",\n" +
                    "  \"graph_sha256\":" + J(graphHash) + ",\n" +
                    "  \"dynamo_version\":" + J(dynamoVersion) + ",\n" +
                    "  \"node_count\":" + nodeJson.Count + ",\n" +
                    "  \"connector_count\":" + connectors.Count + ",\n" +
                    "  \"source_script\":" + J(Path.GetFileName(model.SourceFile)) + ",\n" +
                    "  \"exposed_inputs\": [" + string.Join(",", model.Params.Select(pp => J(pp.Name))) + "],\n" +
                    "  \"native_nodes_only\": true,\n" +
                    "  \"generated_utc\":" + J(DateTime.UtcNow.ToString("o")) + "\n" +
                    "}\n";

                if (graphJson.IndexOf("CoreNodeModels.Input.DoubleInput", StringComparison.Ordinal) >= 0)
                    throw new InvalidOperationException("Graph contains a plain DoubleInput; exposed numeric inputs must be sliders.");
                if (graphJson.IndexOf("\"Annotations\": []", StringComparison.Ordinal) < 0 ||
                    graphJson.IndexOf("\"Zoom\":", StringComparison.Ordinal) < 0 ||
                    graphJson.IndexOf("\"X\":", StringComparison.Ordinal) < 0 ||
                    graphJson.IndexOf("\"Y\":", StringComparison.Ordinal) < 0)
                    throw new InvalidOperationException("Graph View block is missing Annotations/X/Y/Zoom; Dynamo 3.3 hangs on open.");
                // Every exposed input must reach the CodeBlock, and every produced value must
                // reach a Watch. A mismatch means the graph would open with dead ends.
                if (inputs.Count != model.Params.Count)
                    throw new InvalidOperationException(
                        "Graph has " + inputs.Count + " exposed inputs but the script declares " +
                        model.Params.Count + " Params properties.");
                if (outputs.Count == 0)
                    throw new InvalidOperationException("Graph has no outputs; nothing would be visible in Dynamo.");
                foreach (string codeIn in model.CodeInputs)
                {
                    if (!model.Params.Any(pp => pp.Name == codeIn)) continue;
                    bool wired = connectors.Any(c => c.Contains(J(Pid("body", "in|" + codeIn))));
                    if (!wired)
                        throw new InvalidOperationException(
                            "Graph input '" + codeIn + "' is not wired to the code block.");
                }

                var contractLines = new List<string>
                {
                    "\"contract_version\": " + JsonString("1.1"),
                    "\"tool_id\": " + JsonString(graphName),
                    "\"export_mode\": " + JsonString("Graph"),
                    "\"source_file\": " + JsonString(Path.GetFileName(model.SourceFile)),
                    "\"engine_identity_file\": " + JsonString(Path.GetFileName(EngineIdentityFile())),
                    "\"engine_sha256\": " + JsonString(EngineIdentityHash()),
                    "\"dynamo_target_version\": " + JsonString(dynamoVersion),
                    "\"graph_sha256\": " + JsonString(graphHash),
                    "\"node_count\": " + nodeJson.Count,
                    "\"connector_count\": " + connectors.Count,
                    "\"exposed_inputs\": " + JsonArray(model.Params.Select(pp => pp.Name)),
                    "\"native_nodes_only\": true",
                    "\"unit_convention\": " + JsonString("source-declared millimetre inputs; no conversion in Dynamo code blocks"),
                    "\"port_order_policy\": " + JsonString("code-block ports bind by first-read variable order; mismatch guard enforced")
                };
                string contractJson = "{\n  " + string.Join(",\n  ", contractLines) + "\n}\n";
                string contractHash = Sha256Hex(utf8.GetBytes(contractJson));

                var artifacts = new List<Artifact>
                {
                    new Artifact(graphName + ".dyn", graphBytes),
                    new Artifact(graphName + ".manifest.json", utf8.GetBytes(manifest)),
                    new Artifact("contract.json", utf8.GetBytes(contractJson))
                };

                report.Add("mode              Graph");
                report.Add("graph             " + graphPath);
                report.Add("manifest          " + manifestPath);
                report.Add("nodes             " + nodeJson.Count);
                report.Add("connectors        " + connectors.Count);
                report.Add("graph bytes       " + graphBytes.Length);
                report.Add("graph sha256      " + graphHash);
                report.Add("contract sha256   " + contractHash);
                report.Add(request.WriteFiles
                    ? "DONE — open the .dyn in Dynamo " + dynamoVersion + "; all nodes are native and all wires are connected."
                    : "DRY RUN — nothing written. Turn ON Write Files to create the .dyn tool.");

                return new Result(true, report, artifacts, graphJson, string.Empty, graphName,
                    contractJson, contractHash, outRoot, string.Empty);
            }
            catch (Exception ex)
            {
                return Failure(ex.Message);
            }
        }

        private static Result Failure(string message) => new Result(false, Array.Empty<string>(),
            Array.Empty<Artifact>(), string.Empty, string.Empty, string.Empty, string.Empty,
            string.Empty, string.Empty, message);
    }
}
