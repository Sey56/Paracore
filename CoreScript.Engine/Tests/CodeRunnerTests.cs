using Autodesk.Revit.DB;
using CoreScript.Engine.Context;
using CoreScript.Engine.Core;
using CoreScript.Engine.Models;
using System.Text.Json;
using System.Collections.Generic;

namespace CoreScript.Engine.Tests
{
    public class CodeRunnerTests
    {
        private readonly ICodeRunner _runner;
        private readonly ICoreScriptContext _context;

        public CodeRunnerTests(ICoreScriptContext context)
        {
            _context = context;
            _runner = new CodeRunner();
        }

        public void RunReadOnlyTest()
        {
            string content = @"
Print(""Fetching levels..."");

var doc = Doc;

var levels = new FilteredElementCollector(doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .ToList();

foreach (var lvl in levels)
{
    Print($""Level: {lvl.Name} (Id: {lvl.Id})"");
}

Print(""Read-only test complete."");
";

            var scriptFile = new ScriptFile
            {
                FileName = "LevelLister.cs",
                Content = content
            };

            string payload = JsonSerializer.Serialize(new List<ScriptFile> { scriptFile });

            var result = _runner.Execute(payload, "", _context);
            _context.Print("[Read Test Result]:");
            _context.Print(result.ResultMessage);
        }

        public void RunWallCreationTest()
        {
            string content = @"
Print(""Beginning wall creation..."");

var doc = Doc;

var start = new XYZ(0, 0, 0);
var end = new XYZ(10, 0, 0);
var line = Line.CreateBound(start, end);

var level = new FilteredElementCollector(doc)
    .OfClass(typeof(Level))
    .Cast<Level>()
    .FirstOrDefault(l => l.Name == ""Level 1"");

if (level == null)
{
    Print(""Level 'Level 1' not found."");
    return;
}

var wallType = new FilteredElementCollector(doc)
    .OfClass(typeof(WallType))
    .Cast<WallType>()
    .FirstOrDefault();

if (wallType == null)
{
    Print(""WallType not found."");
    return;
}

Tx.TransactWithDoc(doc, ""Create Wall"", d =>
{
    Wall.Create(d, line, wallType.Id, level.Id, 10.0, 0.0, false, false);
});

Print(""Wall created successfully!"");
";

            var scriptFile = new ScriptFile
            {
                FileName = "CreateWall.cs",
                Content = content
            };

            string payload = JsonSerializer.Serialize(new List<ScriptFile> { scriptFile });

            var result = _runner.Execute(payload, "", _context);
            _context.Print("[Wall Test Result]:");
            _context.Print(result.ResultMessage);
        }

        public void RunCustomScript(string scriptContent, string label = "Custom Script")
        {
            var scriptFile = new ScriptFile
            {
                FileName = $"{label}.cs",
                Content = scriptContent
            };

            string payload = JsonSerializer.Serialize(new List<ScriptFile> { scriptFile });

            _context.Print($"🔹 Executing {label}...");
            _context.Print(scriptContent);

            var result = _runner.Execute(payload, "", _context);
            _context.Print($"[{label} Result]:");
            _context.Print(result.ResultMessage);
        }
    }
}
