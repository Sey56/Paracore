import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { exec } from "child_process";
import { promisify } from "util";
import { executeScript, CoreScript as CoreScriptRuntime } from "./grpcClient"; // CoreScriptRuntime is the actual runtime object
import { CoreScript } from "./grpcTypes"; // CoreScript is for type checking

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
    "version": "8.0.411"
  }
}
        `.trim();
        fs.writeFileSync(path.join(rootPath, "global.json"), globalJson);

        // 📦 Create workspaceName.csproj
        const rawPath = `${process.env["ProgramFiles"]}\\Autodesk\\Revit 2025`;
        const revitDir = rawPath.replace(/\\/g, "/");

        const appData = process.env.APPDATA || '';
        const enginePath = path.join(appData, 'Autodesk', 'Revit', 'Addins', '2025', 'RServer', 'CoreScript.Engine.dll').replace(/\\/g, "/");

        const csproj = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="RevitAPI">
      <HintPath>${revitDir}/RevitAPI.dll</HintPath>
      <Private>False</Private>
    </Reference>
    <Reference Include="RevitAPIUI">
      <HintPath>${revitDir}/RevitAPIUI.dll</HintPath>
      <Private>False</Private>
    </Reference>
    <Reference Include="CoreScript.Engine">
      <HintPath>${enginePath}</HintPath>
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
        `.trim();
        fs.writeFileSync(path.join(rootPath, ".editorconfig"), editorConfig);

        // 🌍 Inject Globals.cs to enable IntelliSense for global helpers
        const globalsScript = `
// This file enables IntelliSense for CoreScript.Engine helpers.
// It's included in compilation but contains no runtime logic.

global using static CoreScript.Engine.Globals.DesignTimeGlobals;
`.trim();
        fs.writeFileSync(path.join(scriptsPath, "Globals.cs"), globalsScript);

        // 📝 Main.cs script
        const mainScript = `
using Autodesk.Revit.DB;

Println("Starting spiral sketch...");

Transact("Create Spiral", () =>
{
    var spiral = new SpiralCreator();
    spiral.CreateSpiral(Doc, "Level 1", 100, 10, 20);
});

Println("Spiral sketch finished.");
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
    public void CreateSpiral(Document doc, string levelName, double maxRadiusCm, int numTurns, double angleResolutionDegrees)
    {
        Level level = new FilteredElementCollector(doc)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .FirstOrDefault(l => l.Name == levelName)
            ?? throw new Exception($"Level \\"{levelName}\\" not found.");

        double maxRadiusFt = UnitUtils.ConvertToInternalUnits(maxRadiusCm, UnitTypeId.Centimeters);
        double angleResRad = angleResolutionDegrees * Math.PI / 180;

        var curves = new List<Curve>();
        XYZ origin = XYZ.Zero;

        for (int i = 0; i < numTurns * 360 / angleResolutionDegrees; i++)
        {
            double angle1 = i * angleResRad;
            double angle2 = (i + 1) * angleResRad;

            double radius1 = maxRadiusFt * angle1 / (numTurns * 2 * Math.PI);
            double radius2 = maxRadiusFt * angle2 / (numTurns * 2 * Math.PI);

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
