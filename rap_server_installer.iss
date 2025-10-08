; Inno Setup Script for RAP Server

[Setup]
AppId={{F22B529C-22A9-42A0-9243-A335A195A80D-SERVER}}
AppName=Revit Automation Platform Server
AppVersion=1.0.0
AppPublisher=Seyoum Hagos
DefaultDirName={autopf}\RAP
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.\install
OutputBaseFilename=RAP_Server_Installer
SetupIconFile=rap-web\src-tauri\icons\rap-icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
VersionInfoVersion=1.0.0
VersionInfoCompany=Paras Codarch
VersionInfoDescription=Revit Automation Platform Server. Author: Seyoum Hagos
VersionInfoTextVersion=1.0.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "rap-server\dist\rap-server\*"; DestDir: "{app}"

[Icons]
Name: "{autoprograms}\RAP Server"; Filename: "{app}\rap-server.exe"; WorkingDir: "{app}"
Name: "{autoprograms}\Uninstall RAP Server"; Filename: "{uninstallexe}"
Name: "{autoprograms}\Uninstall RAP Server"; Filename: "{uninstallexe}"