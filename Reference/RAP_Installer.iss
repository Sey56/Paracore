; Inno Setup Script for RAP

[Setup]
AppId={{F22B529C-22A9-42A0-9243-A335A195A80C}}
AppName=RAP
AppVersion=0.1.0
AppPublisher=RAP Community
DefaultDirName={autopf}\RAP
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.\install
OutputBaseFilename=RAP_Installer
SetupIconFile=rap-web\src-tauri\icons\icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "Revit2025"; Description: "Install for Revit 2025"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2025')
Name: "Revit2026"; Description: "Install for Revit 2026"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2026')

[Files]
; Install the rap-web Tauri application files
Source: "rap-web\src-tauri\target\release\app.exe"; DestDir: "{app}"
Source: "rap-web\src-tauri\target\release\*.*;"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs; Excludes: "app.exe,bundle"

; Install the rap-server executable
Source: "rap-server\dist\rap-server.exe"; DestDir: "{app}\server"

; Install Add-in for Revit 2025
Source: "RServer.Addin\bin\Release\net8.0-windows\win-x64\*"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2025\RServer"; Tasks: Revit2025; Flags: recursesubdirs
Source: "RServer.Addin.addin"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2025"; Tasks: Revit2025

; Install Add-in for Revit 2026
Source: "RServer.Addin\bin\Release\net8.0-windows\win-x64\*"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2026\RServer"; Tasks: Revit2026; Flags: recursesubdirs
Source: "RServer.Addin.addin"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2026"; Tasks: Revit2026

[Icons]
Name: "{autoprograms}\RAP"; Filename: "{app}\app.exe"; WorkingDir: "{app}"
Name: "{autoprograms}\Uninstall RAP"; Filename: "{uninstallexe}"

[Registry]
Root: HKCR; Subkey: "rap"; ValueType: string; ValueName: ""; ValueData: "URL:rap Protocol"; Flags: uninsdeletekey
Root: HKCR; Subkey: "rap"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCR; Subkey: "rap\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\app.exe,1"
Root: HKCR; Subkey: "rap\shell\open\command"; ValueType: string; ValueName: ""; ValueData: "\"{app}\\app.exe\" \"%1\""

[Code]
function IsRevitVersionInstalled(Version: string): Boolean;
var
  RevitKey: string;
begin
  RevitKey := 'SOFTWARE\Autodesk\Revit\Autodesk Revit ' + Version;
  Result := RegKeyExists(HKLM, RevitKey) or RegKeyExists(HKCU, RevitKey);
end;
