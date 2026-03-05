using CoreScript.Engine.Logging;
using Paracore.Addin.App;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;

namespace Paracore.Addin.Helpers
{
    public static class WorkspaceManager
    {
        /// <summary>
        /// V3 Architecture: Scaffolds a C# project in-place and opens VS Code.
        /// No more watchers or temporary copies.
        /// </summary>
        public static string ScaffoldAndOpenProject(string projectPath)
        {
            // V4: Scaffolding is now primarily handled by the Python rap-server.
            // The Addin only performs a non-blocking background "Safety Scaffolding" 
            // to ensure its own internal state is happy.
            try
            {
                if (!Directory.Exists(projectPath)) return projectPath;

                string projectName = new DirectoryInfo(projectPath).Name;
                
                // Fire-and-forget background task
                System.Threading.Tasks.Task.Run(() => {
                    try {
                        // Minimal safety check
                        if (!Directory.Exists(Path.Combine(projectPath, "Scripts")))
                        {
                            Directory.CreateDirectory(Path.Combine(projectPath, "Scripts"));
                        }

                        // Write Scaffolding Files (Safety Net)
                        WriteCsproj(projectPath, projectName);
                        WriteGlobalJson(projectPath);
                        WriteGlobalsCs(projectPath);
                        WriteEditorConfig(projectPath);
                        WriteCopilotInstructions(projectPath);
                    } catch { /* Silent fail - Python is the master now */ }
                });

                return projectPath;
            }
            catch
            {
                return projectPath;
            }
        }

        public static void Cleanup()
        {
            // V3: No-op. We no longer manage temporary watchers.
        }

        // --- SCAFFOLDING WRITERS (Self-Healing) ---

        private static void SafeWriteAllText(string path, string content)
        {
            try
            {
                // Only write if file is missing or content has changed
                if (File.Exists(path))
                {
                    string existing = File.ReadAllText(path);
                    if (existing == content) return;
                }
                File.WriteAllText(path, content);
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Failed to write scaffolding file {path}: {ex.Message}");
            }
        }

        private static void WriteCsproj(string folderPath, string projectName)
        {
            string revitPath = ParacoreApp.RevitInstallPath;
            string addinDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string enginePath = Path.Combine(addinDirectory, "CoreScript.Engine.dll");

            var roslynDlls = Directory.GetFiles(addinDirectory, "Microsoft.CodeAnalysis*.dll");
            var roslynReferences = string.Join("\n", roslynDlls.Select(path => 
                $"    <Reference Include=\"{Path.GetFileNameWithoutExtension(path)}\">\n" +
                $"      <HintPath>{path}</HintPath>\n" +
                $"      <Private>false</Private>\n" +
                $"    </Reference>"));

            string csprojContent =
                $$"""
                <Project Sdk="Microsoft.NET.Sdk">
                  <PropertyGroup>
                    <TargetFramework>net8.0-windows</TargetFramework>
                    <LangVersion>latest</LangVersion>
                    <ImplicitUsings>enable</ImplicitUsings>
                    <Nullable>enable</Nullable>
                    <OutputType>Library</OutputType>
                    <RunAnalyzersDuringBuild>true</RunAnalyzersDuringBuild>
                    <RunAnalyzers>true</RunAnalyzers>
                  </PropertyGroup>
                  <ItemGroup>
                    <Reference Include="RevitAPI">
                      <HintPath>{{revitPath}}\RevitAPI.dll</HintPath>
                      <Private>false</Private>
                    </Reference>
                    <Reference Include="RevitAPIUI">
                      <HintPath>{{revitPath}}\RevitAPIUI.dll</HintPath>
                      <Private>false</Private>
                    </Reference>
                    <Reference Include="CoreScript.Engine">
                      <HintPath>{{enginePath}}</HintPath>
                      <Private>false</Private>
                    </Reference>
                    {{roslynReferences.Replace("\n", "\n                    ")}}
                  </ItemGroup>
                  <ItemGroup>
                    <PackageReference Include="SixLabors.ImageSharp" Version="3.1.5" />
                    <PackageReference Include="RestSharp" Version="113.1.0" />
                    <PackageReference Include="MiniExcel" Version="1.31.2" />
                    <PackageReference Include="MathNet.Numerics" Version="5.0.0" />
                  </ItemGroup>
                </Project>
                """;

            SafeWriteAllText(Path.Combine(folderPath, $"{projectName}.csproj"), csprojContent);
        }

        private static void WriteGlobalJson(string folderPath)
        {
            SafeWriteAllText(Path.Combine(folderPath, "global.json"),
                "{\n" +
                "    \"sdk\": {\n" +
                "        \"rollForward\": \"latestFeature\"\n" +
                "    }\n" +
                "}");
        }

        private static void WriteGlobalsCs(string folderPath)
        {
            SafeWriteAllText(Path.Combine(folderPath, "Globals.cs"),
                "// This file enables IntelliSense for custom globals and implicit imports.\n" +
                "global using System;\n" +
                "global using System.Collections.Generic;\n" +
                "global using System.Linq;\n" +
                "global using System.Text.Json;\n" +
                "global using Microsoft.CSharp;\n" +
                "global using Autodesk.Revit.DB;\n" +
                "global using Autodesk.Revit.DB.Architecture;\n" +
                "global using Autodesk.Revit.DB.Structure;\n" +
                "global using Autodesk.Revit.DB.Mechanical;\n" +
                "global using Autodesk.Revit.DB.Plumbing;\n" +
                "global using Autodesk.Revit.DB.Electrical;\n" +
                "global using Autodesk.Revit.UI;\n" +
                "global using CoreScript.Engine.Globals;\n" +
                "global using static CoreScript.Engine.Globals.ScriptApi;\n" +
                "global using static CoreScript.Engine.Globals.WatchdogRegistry;\n" +
                "global using SixLabors.ImageSharp;\n" +
                "global using SixLabors.ImageSharp.Processing;\n" +
                "global using SixLabors.ImageSharp.PixelFormats;\n" +
                "global using RestSharp;\n" +
                "global using MiniExcelLibs;\n" +
                "global using MathNet.Numerics;\n" +
                "global using MathNet.Numerics.LinearAlgebra;\n" +
                "global using MathNet.Numerics.Statistics;");
        }

        private static void WriteEditorConfig(string folderPath)
        {
            SafeWriteAllText(Path.Combine(folderPath, ".editorconfig"),
                "[*.{cs,vb}]\n" +
                "dotnet_diagnostic.CA1050.severity = none\n" +
                "dotnet_diagnostic.CS8019.severity = warning");
        }

        private static void WriteCopilotInstructions(string folderPath)
        {
            try
            {
                string githubFolder = Path.Combine(folderPath, ".github");
                if (!Directory.Exists(githubFolder))
                {
                    Directory.CreateDirectory(githubFolder);
                }
                
                string filePath = Path.Combine(githubFolder, "copilot-instructions.md");
                string contextHeader = "# Current Script Context: FOLDER PROJECT\n# All logic goes into the Scripts/ folder.\n# Use #region GroupName directives to organize parameters.\n\n";
                
                SafeWriteAllText(filePath, contextHeader + AiInstructions.CopilotInstructions);
            }
            catch (Exception ex)
            {
                FileLogger.LogError($"Failed to generate Copilot instructions: {ex.Message}");
            }
        }
    }
}
