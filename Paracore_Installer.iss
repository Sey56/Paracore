; Inno Setup Script for Paracore.Addin

// Use defines passed from the PowerShell build script
#ifndef AppDataFolderName
  #define AppDataFolderName "rap-data"
#endif

[Setup]
AppId={{F22B529C-22A9-42A0-9243-A335A195A80C-ADDIN}}
AppName=Paracore
AppVersion=1.0.0
AppPublisher=Paras Codarch
DefaultDirName={userappdata}\{#AppDataFolderName}
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.\installers
OutputBaseFilename=Paracore_Revit_Installer
SetupIconFile="{#IconPath}"
Compression=lzma
SolidCompression=yes
WizardStyle=modern
VersionInfoVersion=1.0.0
VersionInfoCompany=Paras Codarch
VersionInfoDescription=Paracore Add-in for Revit. Author: Seyoum Hagos
VersionInfoTextVersion=1.0.0
DisableDirPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "Revit2025"; Description: "Install for Revit 2025"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2025')
Name: "Revit2026"; Description: "Install for Revit 2026"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2026')

[InstallDelete]
; For Revit 2025
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2025\Paracore.Addin.addin"; Tasks: Revit2025
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2025\Paracore"; Tasks: Revit2025
; Cleanup Legacy RServer
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2025\RServer.Addin.addin"; Tasks: Revit2025
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2025\RServer"; Tasks: Revit2025

; For Revit 2026
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2026\Paracore.Addin.addin"; Tasks: Revit2026
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2026\Paracore"; Tasks: Revit2026
; Cleanup Legacy RServer
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2026\RServer.Addin.addin"; Tasks: Revit2026
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2026\RServer"; Tasks: Revit2026

[Files]
; Install Add-in for Revit 2025
Source: "Paracore.Addin\bin\Release\net8.0-windows\win-x64\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\Paracore"; Tasks: Revit2025; Flags: recursesubdirs replacesameversion

Source: "Paracore.Addin\bin\Release\net8.0-windows\win-x64\Paracore.Addin.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025"; Tasks: Revit2025; Flags: replacesameversion

; Install Add-in for Revit 2026
Source: "Paracore.Addin\bin\Release\net8.0-windows\win-x64\*"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\Paracore"; Tasks: Revit2026; Flags: recursesubdirs replacesameversion

Source: "Paracore.Addin\bin\Release\net8.0-windows\win-x64\Paracore.Addin.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026"; Tasks: Revit2026; Flags: replacesameversion

[Code]
function IsRevitVersionInstalled(Version: string): Boolean;
var
  RevitKey: string;
begin
  RevitKey := 'SOFTWARE\Autodesk\Revit\Autodesk Revit ' + Version;
  Result := RegKeyExists(HKLM, RevitKey) or RegKeyExists(HKCU, RevitKey);
end;