import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { exec } from "child_process";
import { promisify } from "util";
import { executeScript, CoreScript as CoreScriptRuntime } from "./grpcClient"; // CoreScriptRuntime is the actual runtime object
import { CoreScript } from "./grpcTypes"; // CoreScript is for type checking
import { COPILOT_INSTRUCTIONS } from "./aiInstructions";

const execPromise = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  console.log("CoreScript extension is now active!");

  const outputChannel = vscode.window.createOutputChannel("CoreScript");

  const initializeWorkspace = vscode.commands.registerCommand(
    "corescript.initializeWorkspace",
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage(
          "Please open a workspace folder before initializing CoreScript."
        );
        return;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;
      const workspaceName = path.basename(rootPath);
      const scriptsPath = path.join(rootPath, "Scripts");

      try {
        if (!fs.existsSync(scriptsPath)) {
          fs.mkdirSync(scriptsPath);
        }



        // 🧱 Create global.json
        const globalJson = `
{
  "sdk": {
    "rollForward": "latestFeature"
  }
}
        `.trim();
        fs.writeFileSync(path.join(rootPath, "global.json"), globalJson);

        // 🤖 Create AI Instructions
        const githubFolder = path.join(rootPath, ".github");
        if (!fs.existsSync(githubFolder)) {
          fs.mkdirSync(githubFolder);
        }
        const contextHeader = "# Current Script Type: MULTI-FILE FOLDER (You can modularize across files)\n\n";
        fs.writeFileSync(path.join(githubFolder, "copilot-instructions.md"), contextHeader + COPILOT_INSTRUCTIONS);

        // 📦 Create workspaceName.csproj
        const appData = process.env.APPDATA || '';
        const programData = process.env.ProgramData || 'C:\\ProgramData';
        
        // Define search paths in priority order (ProgramData preferred over AppData, newer Revit preferred over older)
        // We look for the folder that contains CoreScript.Engine.dll
        const searchPaths = [
          path.join(programData, 'Autodesk', 'Revit', 'Addins', '2026', 'Paracore'),
          path.join(programData, 'Autodesk', 'Revit', 'Addins', '2025', 'Paracore'),
          path.join(appData, 'Autodesk', 'Revit', 'Addins', '2026', 'Paracore'),
          path.join(appData, 'Autodesk', 'Revit', 'Addins', '2025', 'Paracore')
        ];

        let enginePath = '';
        let revitPath = '';

        for (const basePath of searchPaths) {
          const potentialEnginePath = path.join(basePath, 'CoreScript.Engine.dll');
          if (fs.existsSync(potentialEnginePath)) {
            enginePath = potentialEnginePath;
            // Infer Revit version from path to find RevitAPI.dll
            if (basePath.includes('2026')) {
              revitPath = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Autodesk', 'Revit 2026');
            } else {
              revitPath = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Autodesk', 'Revit 2025');
            }
            break;
          }
        }

        // Fallback if not found (default to 2025 ProgramData logic but warn)
        if (!enginePath) {
           vscode.window.showWarningMessage("Could not locate CoreScript.Engine.dll in standard locations. IntelliSense might fail.");
           enginePath = path.join(programData, 'Autodesk', 'Revit', 'Addins', '2025', 'Paracore', 'CoreScript.Engine.dll');
           revitPath = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Autodesk', 'Revit 2025');
        }

        const revitPathFormatted = revitPath.replace(/\\/g, "/");
        const enginePathFormatted = enginePath.replace(/\\/g, "/");

        const csproj = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <LangVersion>latest</LangVersion>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <OutputType>Library</OutputType>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="RevitAPI">
      <HintPath>${revitPathFormatted}/RevitAPI.dll</HintPath>
      <Private>False</Private>
    </Reference>
    <Reference Include="RevitAPIUI">
      <HintPath>${revitPathFormatted}/RevitAPIUI.dll</HintPath>
      <Private>False</Private>
    </Reference>
    <Reference Include="CoreScript.Engine">
      <HintPath>${enginePathFormatted}</HintPath>
      <Private>False</Private>
    </Reference>
  </ItemGroup>
</Project>
`.trim();

        fs.writeFileSync(
          path.join(rootPath, `${workspaceName}.csproj`),
          csproj
        );
        // 🧠 IntelliSense stubs

        const editorConfig = `
[*.{cs,vb}]
dotnet_diagnostic.CA1050.severity = none
dotnet_diagnostic.CS8019.severity = warning
        `.trim();
        fs.writeFileSync(path.join(rootPath, ".editorconfig"), editorConfig);

        // 🌍 Inject Globals.cs to enable IntelliSense for global helpers
        const globalsScript = `
// This file enables IntelliSense for CoreScript.Engine helpers.
// It's included in compilation but contains no runtime logic.

global using CoreScript.Engine.Globals;
global using static CoreScript.Engine.Globals.DesignTimeGlobals;
`.trim();
        fs.writeFileSync(path.join(rootPath, "Globals.cs"), globalsScript);

        // 📝 Main.cs script
        const mainScript = `
using Autodesk.Revit.DB;
using System.Linq;

// 1. Setup Parameters
var p = new Params();

Println($"Starting execution for: {p.ProjectName}...");

// 2. Execution Logic
Transact("Create Spiral", () =>
{
    var spiral = new SpiralCreator();
    spiral.CreateSpiral(Doc, p.LevelName, p.Radius, p.Turns, p.Resolution);
});

Println("Execution finished successfully! ✅");

// 3. Parameter Definition (Compatible with Paracore UI)
public class Params
{
    #region Project Settings

    /// <summary>
    /// The name of the project.
    /// </summary>
    public string ProjectName { get; set; } = "My Spiral Project";

    /// <summary>
    /// The level to create the spiral on.
    /// </summary>
    [RevitElements(Category = "Levels"), Required]
    public string LevelName { get; set; } = "Level 1";

    #endregion

    #region Geometry

    /// <summary>
    /// The radius of the spiral in centimeters.
    /// </summary>
    [Unit("cm")]
    public double Radius { get; set; } = 2400.0;

    public int Turns { get; set; } = 5;

    public double Resolution { get; set; } = 20.0;

    #endregion
}
        `.trim();
        fs.writeFileSync(path.join(scriptsPath, "Main.cs"), mainScript);

        // 🧪 SpiralCreator.cs
        const spiralScript = `
using Autodesk.Revit.DB;
using System;
using System.Collections.Generic;
using System.Linq;

public class SpiralCreator
{
    public void CreateSpiral(Document doc, string levelName, double maxRadiusFeet, int numTurns, double angleResolutionDegrees)
    {
        Level level = new FilteredElementCollector(doc)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .FirstOrDefault(l => l.Name == levelName)
            ?? throw new Exception($"Level \\"{levelName}\\" not found.");

        // Radius is already in Feet because the Engine handles [Unit] conversion automatically.
        double angleResRad = angleResolutionDegrees * Math.PI / 180;

        var curves = new List<Curve>();
        XYZ origin = XYZ.Zero;

        for (int i = 0; i < numTurns * 360 / angleResolutionDegrees; i++)
        {
            double angle1 = i * angleResRad;
            double angle2 = (i + 1) * angleResRad;

            double radius1 = maxRadiusFeet * angle1 / (numTurns * 2 * Math.PI);
            double radius2 = maxRadiusFeet * angle2 / (numTurns * 2 * Math.PI);

            XYZ pt1 = new(radius1 * Math.Cos(angle1), radius1 * Math.Sin(angle1), level.Elevation);
            XYZ pt2 = new(radius2 * Math.Cos(angle2), radius2 * Math.Sin(angle2), level.Elevation);

            Line line = Line.CreateBound(pt1, pt2);
            if (line.Length > 0.0026)
                curves.Add(line);
        }

        var sketch = SketchPlane.Create(doc, Plane.CreateByNormalAndOrigin(XYZ.BasisZ, origin));
        foreach (var curve in curves)
        {
            doc.Create.NewModelCurve(curve, sketch);
        }
    }
}
        `.trim();
        fs.writeFileSync(
          path.join(scriptsPath, "SpiralCreator.cs"),
          spiralScript
        );



        // 🌐 Restore prompt
        const restore = await vscode.window.showInformationMessage(
          "Workspace initialized! You can run dotnet restore to enable IntelliSense.",
          "Restore"
        );
        if (restore === "Restore") {
          try {
            await vscode.commands.executeCommand("dotnet.restore");
            vscode.window.showInformationMessage(
              "✅ Project restored and ready for scripting."
            );
          } catch {
            vscode.window.showInformationMessage(
              "✅ Workspace is ready. Restore skipped or already complete."
            );
          }
        }

        // 🪟 Open Main.cs
        const mainUri = vscode.Uri.file(path.join(scriptsPath, "Main.cs"));
        const doc = await vscode.workspace.openTextDocument(mainUri);
        await vscode.window.showTextDocument(doc);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Initialization failed: ${err.message}`);
      }
    }
  );

  const runScript = vscode.commands.registerCommand(
    "corescript.runScript",
    async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders) {
        vscode.window.showErrorMessage(
          "Open a workspace folder to run the script."
        );
        return;
      }

      const rootPath = folders[0].uri.fsPath;
      const scriptsPath = path.join(rootPath, "Scripts");
      outputChannel.clear();
      outputChannel.show(true);
      vscode.window.setStatusBarMessage(
        "$(rocket) Running script in Revit...",
        3000
      );

      try {
        // 1. Collect all .cs files in Scripts folder, excluding Globals.cs
        const scriptFiles = fs
          .readdirSync(scriptsPath)
          .filter(
            (file) =>
              file.endsWith(".cs") && file.toLowerCase() !== "globals.cs"
          )
          .map((file) => {
            const filePath = path.join(scriptsPath, file);
            const content = fs.readFileSync(filePath, "utf-8");
            return { fileName: file, content };
          });

        if (scriptFiles.length === 0) {
          vscode.window.showErrorMessage(
            "No C# scripts found in the 'Scripts' folder."
          );
          return;
        }

        // 2. Extract parameters from Main.cs
        const mainScript = scriptFiles.find(
          (f) => f.fileName.toLowerCase() === "main.cs"
        );
        let parameters: { name: string; type: string; value: any }[] = [];
        if (mainScript) {
          parameters = extractScriptParameters(mainScript.content);
        }

        // 3. Prepare payload
        const scriptContentString = JSON.stringify(scriptFiles);
        const parametersJsonString =
          parameters.length > 0 ? JSON.stringify(parameters) : "[]";

        // Convert strings to Uint8Array
        const script_content = scriptContentString;
        const parameters_json = new TextEncoder().encode(parametersJsonString);

        // Debug logs
        // outputChannel.appendLine("DEBUG: scriptContent=" + scriptContentString);
        // outputChannel.appendLine("DEBUG: parametersJson=" + parametersJsonString);

        // 4. Send to Revit addin server via gRPC
        let response;
        try {
          const request = {
            script_content,
            parameters_json,
            source: "VSCode"
          } as CoreScript.ExecuteScriptRequest; // Assert the type

          response = await executeScript(request);
        } catch (err: any) {
          outputChannel.appendLine(`[ERROR] gRPC call failed: ${err.message}`);
          vscode.window.showErrorMessage(`gRPC call failed: ${err.message}`);
          return;
        }

        // 5. Show output/errors
        if (response && response.is_success) {
          if (response.output) {
            outputChannel.appendLine(response.output);
          }
        } else if (response) {
          if (response.error_message) {
            outputChannel.appendLine(response.error_message);
          }
          if (response.error_details && response.error_details.length > 0) {
            outputChannel.appendLine(response.error_details.join("\n"));
          }
          vscode.window.showErrorMessage(
            "CoreScript execution failed. Check output for details."
          );
        } else {
          outputChannel.appendLine(
            "❌ No response received from CoreScript server."
          );
          vscode.window.showErrorMessage(
            "No response received from CoreScript server."
          );
        }
      } catch (err: any) {
        outputChannel.appendLine(`[ERROR] Unexpected error: ${err.message}`);
        vscode.window.showErrorMessage(`Unexpected error: ${err.message}`);
      }
    }
  );
  // Helper: Extract top-level primitive parameters from Main.cs
  function extractScriptParameters(
    mainContent: string
  ): { name: string; type: string; value: any }[] {
    // Only match lines after all using statements, before any block, that look like:
    // string foo = "bar";
    // double x = 1.2;
    // int y = 5;
    // bool flag = true;
    // No expressions, only literals.
    const lines = mainContent.split(/\r?\n/);
    const params: { name: string; type: string; value: any }[] = [];
    let inParamSection = false;
    for (let i = 0; i < lines.length; ++i) {
      const line = lines[i].trim();
      if (!inParamSection) {
        if (line.startsWith("using ")) {
          continue;
        }
        if (line === "" || line.startsWith("//")) {
          continue;
        }
        // First non-using, non-empty, non-comment line: start param section
        inParamSection = true;
      }
      // Only match top-level, not inside any block
      if (line.startsWith("{") || line.startsWith("}")) {
        break;
      }
      // Match primitive declarations with default values
      const match = line.match(
        /^(string|double|int|bool)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+);$/
      );
      if (match) {
        const [, type, name, rawValue] = match;
        let value: any = rawValue;
        if (type === "string") {
          const strMatch = rawValue.match(/^"(.*)"$/);
          value = strMatch ? strMatch[1] : rawValue;
        } else if (type === "double" || type === "int") {
          value = Number(rawValue);
        } else if (type === "bool") {
          value = rawValue === "true";
        }
        params.push({ name, type, value });
      } else if (line !== "" && !line.startsWith("//")) {
        // Stop at first non-param, non-empty, non-comment line
        break;
      }
    }
    return params;
  }

  context.subscriptions.push(initializeWorkspace);
  context.subscriptions.push(runScript);
}

export function deactivate() { }
