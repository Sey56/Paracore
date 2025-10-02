import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  console.log("RScript extension is now active!");

  const initializeWorkspace = vscode.commands.registerCommand(
    "rscript.initializeWorkspace",
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage(
          "Please open a workspace folder before initializing RScript."
        );
        return;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;
      const workspaceName = path.basename(rootPath);
      const scriptsPath = path.join(rootPath, "Scripts");
      const toolsPath = path.join(rootPath, "Tools");

      try {
        [scriptsPath, toolsPath].forEach((folder) => {
          if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
          }
        });

        // 🔗 Copy bridge + engine DLLs
        const extensionPath = context.extensionPath;
        const binPath = path.join(extensionPath, "bin");
        const dlls = fs.readdirSync(binPath).filter(f => f.endsWith(".dll") || f.endsWith(".exe") || f.endsWith(".json"));
        for (const file of dlls) {
          const source = path.join(binPath, file);
          const dest = path.join(toolsPath, file);
          fs.copyFileSync(source, dest);
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
    <Reference Include="RScript.Engine">
      <HintPath>Tools/RScript.Engine.dll</HintPath>
      <Private>False</Private>
    </Reference>
  </ItemGroup>
</Project>
`.trim();

        fs.writeFileSync(path.join(rootPath, `${workspaceName}.csproj`), csproj);
        // 🧠 IntelliSense stubs
        
        const editorConfig = `
[*.{cs,vb}]
dotnet_diagnostic.CA1050.severity = none
        `.trim();
        fs.writeFileSync(path.join(rootPath, ".editorconfig"), editorConfig);

// 🌍 Inject Globals.cs to enable IntelliSense for global helpers
const globalsScript = `
// This file enables IntelliSense for RScript.Engine helpers.
// It's included in compilation but contains no runtime logic.

global using static RScript.Engine.Globals.DesignTimeGlobals;
`.trim();
fs.writeFileSync(path.join(scriptsPath, "Globals.cs"), globalsScript);

        // 📝 Main.cs script
        const mainScript = `
using Autodesk.Revit.DB;

Print("Starting spiral sketch...");

Transact("Create Spiral", doc =>
{
    var spiral = new SpiralCreator();
    spiral.CreateSpiral(Doc, "Level 1", 100, 10, 20);
});

Print("Spiral sketch finished.");
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
        fs.writeFileSync(path.join(scriptsPath, "SpiralCreator.cs"), spiralScript);

        // ⚙️ .vscode tasks
        const vscodeDir = path.join(rootPath, ".vscode");
        if (!fs.existsSync(vscodeDir)) {
          fs.mkdirSync(vscodeDir);
        }

        const tasksJson = `
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Send to Revit",
      "type": "shell",
      "command": "\${workspaceFolder}/Tools/rscript-bridge.exe \${file}",
      "problemMatcher": [],
      "group": {
        "kind": "build",
        "isDefault": true
      }
    }
  ]
}
        `.trim();
        fs.writeFileSync(path.join(vscodeDir, "tasks.json"), tasksJson);

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
    "rscript.runScript",
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
      const bridgeExe = path.join(rootPath, "Tools", "rscript-bridge.exe");

      if (!fs.existsSync(bridgeExe)) {
        vscode.window.showErrorMessage(
          "rscript-bridge.exe missing — initialize the workspace first."
        );
        return;
      }

      const outputChannel = vscode.window.createOutputChannel("RScript");
      outputChannel.clear();
      outputChannel.show(true);
      vscode.window.setStatusBarMessage(
        "$(rocket) Sending script to Revit...",
        3000
      );

      try {
        const { stdout, stderr } = await execPromise(
          `"${bridgeExe}" "${scriptsPath}"`
        );

        if (stderr?.trim()) {
          outputChannel.appendLine(`[ERROR] Bridge stderr:\n${stderr.trim()}`);
        }

        if (stdout?.trim()) {
          outputChannel.appendLine(stdout.trim());
        } else {
          outputChannel.appendLine("[INFO] Script sent. Awaiting response...");
        }
      } catch (err: any) {
        const msg = err.message || "";
        const exitCodeMatch = msg.match(/exit code (\d+)/);
        const exitCodeFromMessage = exitCodeMatch
          ? parseInt(exitCodeMatch[1], 10)
          : undefined;
        const actualExitCode = exitCodeFromMessage ?? err.code;

        let userFriendly = `[ERROR] Script execution failed:\n${msg}`;
        if (actualExitCode === 2 || msg.includes("RScriptServer not running")) {
          userFriendly = `[ERROR] RScriptServer not running — start it from the Revit Add-ins tab before sending scripts.`;
        }

        outputChannel.appendLine(userFriendly);
        vscode.window.showErrorMessage(userFriendly);
      }
    }
  );

  context.subscriptions.push(initializeWorkspace);
  context.subscriptions.push(runScript);
}

export function deactivate() {}
