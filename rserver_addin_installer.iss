; Inno Setup Script for RServer.Addin

[Setup]
AppId={{F22B529C-22A9-42A0-9243-A335A195A80C-ADDIN}}
AppName=RServer.Addin
AppVersion=0.1.0
AppPublisher=RAP Community
DefaultDirName={userappdata}\Autodesk\Revit\Addins\2025\RServer
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.\install
OutputBaseFilename=RServer_Addin_Installer
SetupIconFile=rap-web\src-tauri\icons\rap-icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "Revit2025"; Description: "Install for Revit 2025"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2025')
Name: "Revit2026"; Description: "Install for Revit 2026"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2026')

[Files]
; Install Add-in for Revit 2025
Source: "RServer.Addin\bin\Release\net8.0-windows\win-x64\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\RServer"; Tasks: Revit2025; Flags: recursesubdirs
Source: "RServer.Addin\bin\Release\net8.0-windows\win-x64\RServer.Addin.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025"; Tasks: Revit2025

; Install Add-in for Revit 2026
Source: "RServer.Addin\bin\Release\net8.0-windows\win-x64\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\RServer"; Tasks: Revit2026; Flags: recursesubdirs
Source: "RServer.Addin\bin\Release\net8.0-windows\win-x64\RServer.Addin.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026"; Tasks: Revit2026

[Code]
function IsRevitVersionInstalled(Version: string): Boolean;
var
  RevitKey: string;
begin
  RevitKey := 'SOFTWARE\Autodesk\Revit\Autodesk Revit ' + Version;
  Result := RegKeyExists(HKLM, RevitKey) or RegKeyExists(HKCU, RevitKey);
end;