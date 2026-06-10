; Inno Setup Script for Paracore.Addin

// Use defines passed from the PowerShell build script
#ifndef AppDataFolderName
  #define AppDataFolderName "rap-data"
#endif

#ifndef MyAppVersion
  #define MyAppVersion "4.5.2"
#endif

#ifndef PublishDir
  #define PublishDir "Paracore.Addin\bin\Release\net8.0-windows\win-x64\publish"
#endif

[Setup]
AppId={{F22B529C-22A9-42A0-9243-A335A195A80C-ADDIN}}
AppName=Paracore Addin
AppVerName=Paracore Addin {#MyAppVersion}
UpdateUninstallLogAppName=yes
AppVersion=4.5.2
AppPublisher=Paras Codarch
DefaultDirName={commonappdata}\Paracore
PrivilegesRequired=admin
UsedUserAreasWarning=no
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.\installers
OutputBaseFilename=Paracore_Addin_v{#MyAppVersion}
SetupIconFile="{#IconPath}"
Compression=lzma
SolidCompression=yes
WizardStyle=modern
VersionInfoVersion=4.5.2
VersionInfoCompany=Paras Codarch
VersionInfoDescription=Paracore Add-in for Revit. Author: Seyoum Hagos
VersionInfoTextVersion=4.5.2
DisableDirPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "Revit2025"; Description: "Install for Revit 2025"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2025')
Name: "Revit2026"; Description: "Install for Revit 2026"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2026')
Name: "InstallMCP"; Description: "Install Paracore MCP"; GroupDescription: "Additional Features:";

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

; Cleanup user-level local deployments (Ghost copies from Debug builds)
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2025\Paracore.Addin.addin"
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2025\Paracore"
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2026\Paracore.Addin.addin"
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2026\Paracore"

[Files]
; Install Add-in for Revit 2025
Source: "{#PublishDir}\*"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore"; Tasks: Revit2025; Flags: recursesubdirs replacesameversion

Source: "{#PublishDir}\Paracore.Addin.addin"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2025"; Tasks: Revit2025; Flags: replacesameversion

; Install Add-in for Revit 2026
Source: "{#PublishDir}\*"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore"; Tasks: Revit2026; Flags: recursesubdirs replacesameversion

Source: "{#PublishDir}\Paracore.Addin.addin"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2026"; Tasks: Revit2026; Flags: replacesameversion

; Install MCP Server
Source: "installers\paracore-mcp.exe"; DestDir: "{commonappdata}\Paracore\MCP"; Tasks: InstallMCP; Flags: ignoreversion

[UninstallDelete]
; Clean up the Add-in folders and manifests
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore"
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore.Addin.addin"
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore"
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore.Addin.addin"

; Clean up the roaming data
Type: filesandordirs; Name: "{userappdata}\Paracore"

; Clean up the MCP Server
Type: filesandordirs; Name: "{commonappdata}\Paracore\MCP"

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

function IsAspNetCore8RuntimeInstalled: Boolean;
var
  VersionNames: TArrayOfString;
  I: Integer;
  FindRec: TFindRec;
begin
  Result := False;
  
  // 1. Registry check (x64)
  if RegGetSubkeyNames(HKLM64, 'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.AspNetCore.App', VersionNames) then
  begin
    for I := 0 to GetArrayLength(VersionNames) - 1 do
    begin
      // STRICT check for 8.x
      if Pos('8.', VersionNames[I]) = 1 then
      begin
        Result := True;
        Exit;
      end;
    end;
  end;

  // 2. Folder check (Fallback)
  if FindFirst(ExpandConstant('{pf64}\dotnet\shared\Microsoft.AspNetCore.App\*'), FindRec) then
  begin
    repeat
      if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0) and (Pos('8.', FindRec.Name) = 1) then
      begin
        Result := True;
        FindClose(FindRec);
        Exit;
      end;
    until not FindNext(FindRec);
    FindClose(FindRec);
  end;
end;

function InitializeSetup: Boolean;
begin
  Result := True;
  if not IsAspNetCore8RuntimeInstalled then
  begin
    if MsgBox('Paracore requires the ASP.NET Core 8 Runtime (x64) to function properly in Revit 2025+.' + #13#10#13#10 +
              'The installer could not verify if the ASP.NET Core 8 Runtime is installed on this system.' + #13#10#13#10 +
              'Would you like to proceed anyway? (Ensure you have the "ASP.NET Core Runtime 8.0" x64 installed)', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
    end;
  end;
end;