; Inno Setup Script for Paracore.Addin

// Use defines passed from the PowerShell build script
#ifndef AppDataFolderName
  #define AppDataFolderName "rap-data"
#endif

#ifndef MyAppVersion
  #define MyAppVersion "2.0.0"
#endif

#ifndef PublishDir
  #define PublishDir "Paracore.Addin\bin\Release\net8.0-windows\win-x64\publish"
#endif

[Setup]
AppId={{F22B529C-22A9-42A0-9243-A335A195A80C-ADDIN}}
AppName=Paracore
AppVersion=2.0.0
AppPublisher=Paras Codarch
DefaultDirName={commonappdata}\{#AppDataFolderName}
PrivilegesRequired=admin
UsedUserAreasWarning=no
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.\installers
OutputBaseFilename=Paracore_Addin_v{#MyAppVersion}
SetupIconFile="{#IconPath}"
Compression=lzma
SolidCompression=yes
WizardStyle=modern
VersionInfoVersion=2.0.0
VersionInfoCompany=Paras Codarch
VersionInfoDescription=Paracore Add-in for Revit. Author: Seyoum Hagos
VersionInfoTextVersion=2.0.0
DisableDirPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "Revit2025"; Description: "Install for Revit 2025"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2025')
Name: "Revit2026"; Description: "Install for Revit 2026"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2026')

[InstallDelete]
; For Revit 2025
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore.Addin.addin"; Tasks: Revit2025
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore"; Tasks: Revit2025
; Cleanup Legacy RServer
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\RServer.Addin.addin"; Tasks: Revit2025
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\RServer"; Tasks: Revit2025

; For Revit 2026
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore.Addin.addin"; Tasks: Revit2026
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore"; Tasks: Revit2026
; Cleanup Legacy RServer
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\RServer.Addin.addin"; Tasks: Revit2026
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\RServer"; Tasks: Revit2026

[Files]
; Install Add-in for Revit 2025
Source: "{#PublishDir}\*"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore"; Tasks: Revit2025; Flags: recursesubdirs replacesameversion

Source: "{#PublishDir}\Paracore.Addin.addin"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2025"; Tasks: Revit2025; Flags: replacesameversion

; Install Add-in for Revit 2026
Source: "{#PublishDir}\*"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore"; Tasks: Revit2026; Flags: recursesubdirs replacesameversion

Source: "{#PublishDir}\Paracore.Addin.addin"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2026"; Tasks: Revit2026; Flags: replacesameversion

[UninstallDelete]
; Clean up the Add-in folders and manifests
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore"
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore.Addin.addin"
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore"
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore.Addin.addin"

; Clean up the roaming data
Type: filesandordirs; Name: "{userappdata}\Paracore"

; Clean up the debug files in Documents
Type: files; Name: "{userdocs}\CodeRunnerDebug.txt"
Type: files; Name: "{userdocs}\PrintCallbackDebug.txt"

[Code]
procedure Sleep(ms: Cardinal);
  external 'Sleep@kernel32.dll stdcall';

function InitializeUninstall(): Boolean;
var
  ErrorCode: Integer;
begin
  // Kill processes to release file locks on binaries
  // Use /t to kill child processes (like the sidecar server)
  ShellExec('open', 'taskkill.exe', '/f /im rap-server.exe /t', '', SW_HIDE, ewWaitUntilTerminated, ErrorCode);
  ShellExec('open', 'taskkill.exe', '/f /im Paracore.exe /t', '', SW_HIDE, ewWaitUntilTerminated, ErrorCode);
  
  Result := True;
end;

function IsRevitVersionInstalled(Version: string): Boolean;
var
  RevitKey: string;
begin
  RevitKey := 'SOFTWARE\Autodesk\Revit\Autodesk Revit ' + Version;
  Result := RegKeyExists(HKLM, RevitKey) or RegKeyExists(HKCU, RevitKey);
end;