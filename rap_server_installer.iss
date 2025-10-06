; Inno Setup Script for RAP Server

[Setup]
AppId={{F22B529C-22A9-42A0-9243-A335A195A80D-SERVER}}
AppName=RAP Server
AppVersion=0.1.0
AppPublisher=RAP Community
DefaultDirName={autopf}\RAP
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=.\install
OutputBaseFilename=RAP_Server_Installer
SetupIconFile=rap-web\src-tauri\icons\icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "rap-server\dist\rap-server.exe"; DestDir: "{app}\server"

[Icons]
Name: "{autoprograms}\RAP Server"; Filename: "{app}\server\rap-server.exe"; WorkingDir: "{autopf}\RAP"
Name: "{autoprograms}\Uninstall RAP Server"; Filename: "{uninstallexe}"
Name: "{autoprograms}\Uninstall RAP Server"; Filename: "{uninstallexe}"
