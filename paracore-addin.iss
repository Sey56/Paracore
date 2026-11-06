; Inno Setup Script for Paracore.Addin

// Use defines passed from the PowerShell build script
#ifndef AppDataFolderName
  #define AppDataFolderName "rap-data"
#endif

#ifndef MyAppVersion
  #define MyAppVersion "4.8.3"
#endif

#ifndef PublishDir
  #define PublishDir "Paracore.Addin\bin\Release\net8.0-windows\win-x64\publish"
#endif

[Setup]
AppId={{F22B529C-22A9-42A0-9243-A335A195A80C-ADDIN}}
AppName=Paracore Addin
AppVerName=Paracore Addin {#MyAppVersion}
UpdateUninstallLogAppName=yes
AppVersion={#MyAppVersion}
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
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany=Paras Codarch
VersionInfoDescription=Paracore Add-in for Revit. Author: Seyoum Hagos
VersionInfoTextVersion={#MyAppVersion}
DisableDirPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; ⚠ ONE PAYLOAD, THREE TASKS. build-addin.ps1 publishes ONE net8.0-windows bundle
;   compiled against the Revit 2025 API and copies ONE Paracore.Shim.dll into it.
;   The .addin manifest is byte-for-byte identical on 2025 and 2027 (same ClientId,
;   same "Paracore\Paracore.Shim.dll"), and the 2027 shim log shows OnStartup
;   succeeding with that bundle. Nothing here needs a second payload or a second
;   AppId - a second installer would only split the upgrade/uninstall path.
;   ONLY the DESTINATION differs: Revit 2027 reads all-users manifests from
;   Program Files\Autodesk\Revit\Addins\2027, not ProgramData (see [Files]).
[Tasks]
Name: "Revit2025"; Description: "Install for Revit 2025"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2025')
Name: "Revit2026"; Description: "Install for Revit 2026"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2026')
Name: "Revit2027"; Description: "Install for Revit 2027"; GroupDescription: "Revit Versions:"; Check: IsRevitVersionInstalled('2027')
[InstallDelete]
; For Revit 2025
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore.Addin.addin"; Tasks: Revit2025
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore"; Tasks: Revit2025
; Cleanup Legacy RServer
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\RServer.Addin.addin"; Tasks: Revit2025
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\RServer"; Tasks: Revit2025
; Cleanup Paracore Pro (free replaces pro)
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore.Pro.Addin.addin"; Tasks: Revit2025
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\ParacorePro"; Tasks: Revit2025

; For Revit 2026
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore.Addin.addin"; Tasks: Revit2026
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore"; Tasks: Revit2026
; Cleanup Legacy RServer
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\RServer.Addin.addin"; Tasks: Revit2026
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\RServer"; Tasks: Revit2026
; Cleanup Paracore Pro (free replaces pro)
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore.Pro.Addin.addin"; Tasks: Revit2026
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\ParacorePro"; Tasks: Revit2026

; ⚠ REVIT 2027 MOVED THE ALL-USERS MANIFEST FOLDER. Verified 2026-11-06 against
;   Autodesk's own "Add-in Registration" developer guide (help.autodesk.com):
;       2025 / 2026 : ProgramData\Autodesk\Revit\Addins\<year>
;       2027        : Program Files\Autodesk\Revit\Addins\<year>
;   and against the running binary (Revit 2027 journal.0064.txt, line 258):
;       "Add-in manifest file from: ProgramData\...\2027\Paracore.Addin.addin,
;        won't be loaded. All-users Add-in manifest files must be installed to:
;        Program Files\Autodesk\Revit\Addins\2027"
;   {commonpf64} = Program Files on x64 (Revit is 64-bit only). The manifest's
;   <Assembly>Paracore\Paracore.Shim.dll</Assembly> is RELATIVE, so the payload
;   goes in the \Paracore subfolder of that same folder.
;   The two {commonappdata} rows are CLEANUP for the pre-fix build, which wrote 2027 to
;   ProgramData. Revit 2027 ignores that folder, but an upgrade must remove it.
Type: files; Name: "{commonpf64}\Autodesk\Revit\Addins\2027\Paracore.Addin.addin"; Tasks: Revit2027
Type: filesandordirs; Name: "{commonpf64}\Autodesk\Revit\Addins\2027\Paracore"; Tasks: Revit2027
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2027\Paracore.Addin.addin"; Tasks: Revit2027
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2027\Paracore"; Tasks: Revit2027

; Cleanup user-level local deployments (Ghost copies from Debug builds)
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2025\Paracore.Addin.addin"
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2025\Paracore"
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2026\Paracore.Addin.addin"
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2026\Paracore"

; ⚠ 2027 GHOSTS. The 2027 preview was hand-deployed to %APPDATA%, and it left a
;   SECOND .addin manifest INSIDE Paracore\. Two manifests with the SAME ClientId
;   can make Revit load the add-in twice - two ALCs, which is the exact class of
;   bug the shim's engine guard was written to prevent. Remove all three only
;   when Revit2027 is selected: a 2025-only install must NOT silently delete a
;   working 2027 preview.
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2027\Paracore.Addin.addin"; Tasks: Revit2027
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2027\Paracore\Paracore.Addin.addin"; Tasks: Revit2027
Type: filesandordirs; Name: "{userappdata}\Autodesk\Revit\Addins\2027\Paracore"; Tasks: Revit2027

[Files]
; Install Add-in for Revit 2025
Source: "{#PublishDir}\*"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore"; Tasks: Revit2025; Flags: recursesubdirs replacesameversion; Excludes: "*.addin"

Source: "{#PublishDir}\Paracore.Addin.addin"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2025"; Tasks: Revit2025; Flags: replacesameversion

; Install Add-in for Revit 2026
Source: "{#PublishDir}\*"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore"; Tasks: Revit2026; Flags: recursesubdirs replacesameversion; Excludes: "*.addin"

Source: "{#PublishDir}\Paracore.Addin.addin"; DestDir: "{commonappdata}\Autodesk\Revit\Addins\2026"; Tasks: Revit2026; Flags: replacesameversion

; Install Add-in for Revit 2027 - identical payload and manifest, DIFFERENT ROOT.
;   This is the ONLY version whose all-users manifests live under Program Files.
Source: "{#PublishDir}\*"; DestDir: "{commonpf64}\Autodesk\Revit\Addins\2027\Paracore"; Tasks: Revit2027; Flags: recursesubdirs replacesameversion; Excludes: "*.addin"

Source: "{#PublishDir}\Paracore.Addin.addin"; DestDir: "{commonpf64}\Autodesk\Revit\Addins\2027"; Tasks: Revit2027; Flags: replacesameversion

[UninstallDelete]
; Clean up the Add-in folders and manifests
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore"
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2025\Paracore.Addin.addin"
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore"
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2026\Paracore.Addin.addin"
Type: filesandordirs; Name: "{commonpf64}\Autodesk\Revit\Addins\2027\Paracore"
Type: files; Name: "{commonpf64}\Autodesk\Revit\Addins\2027\Paracore.Addin.addin"
; The pre-fix build wrote 2027 to ProgramData before the move was known - clean it up too.
Type: filesandordirs; Name: "{commonappdata}\Autodesk\Revit\Addins\2027\Paracore"
Type: files; Name: "{commonappdata}\Autodesk\Revit\Addins\2027\Paracore.Addin.addin"

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

// Revit 2025/2026 host .NET 8; Revit 2027 hosts .NET 10. The published bundle
// ships its own Microsoft.Extensions assemblies, so any 8.x/9.x/10.x shared
// framework is sufficient. The old strict 8-only check raised a false warning
// on a 2027-only machine.
function IsSupportedAspNetCoreVersion(VersionName: String): Boolean;
begin
  Result := (Pos('8.', VersionName) = 1) or
            (Pos('9.', VersionName) = 1) or
            (Pos('10.', VersionName) = 1);
end;

function IsAspNetCoreRuntimeInstalled: Boolean;
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
      if IsSupportedAspNetCoreVersion(VersionNames[I]) then
      begin
        Result := True;
        Exit;
      end;
    end;
  end;

  // 2. Folder check (Fallback)
  if FindFirst(ExpandConstant('{commonpf64}\dotnet\shared\Microsoft.AspNetCore.App\*'), FindRec) then
  begin
    repeat
      if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0) and IsSupportedAspNetCoreVersion(FindRec.Name) then
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
  if not IsAspNetCoreRuntimeInstalled then
  begin
    if MsgBox('Paracore requires an ASP.NET Core Runtime 8, 9 or 10 (x64).' + #13#10#13#10 +
              'Revit 2025/2026 use .NET 8; Revit 2027 uses .NET 10. The installer could not verify that a supported runtime is installed.' + #13#10#13#10 +
              'Would you like to proceed anyway?', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
    end;
  end;
end;
