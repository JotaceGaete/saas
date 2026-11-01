; Walinka Print Connector — instalador por usuario (sin administrador).
; Compilar con installer\build-installer.ps1 (Inno Setup 6).
; No contiene secretos: el token y la configuración viven en
; %LOCALAPPDATA%\WalinkaPrintConnector, fuera de la carpeta de programa.

#ifndef AppVersion
  #define AppVersion "0.3.0"
#endif

#define AppName "Walinka Print Connector"
#define AppExe "WalinkaPrintConnector.exe"

[Setup]
; GUID propio del producto. No cambiar entre versiones: identifica la actualización.
AppId={{6C1F3E2A-7B4D-4E8A-9F21-3A5D8B0C7E14}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Walinka
AppPublisherURL=https://go.walinka.com
DefaultDirName={localappdata}\Programs\{#AppName}
DisableProgramGroupPage=yes
DefaultGroupName=Walinka
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\installer-output
OutputBaseFilename=WalinkaPrintConnector-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName} {#AppVersion}
SetupLogging=yes

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "autostart"; Description: "Iniciar el conector automáticamente al iniciar sesión en Windows"; GroupDescription: "Opciones:"; Flags: checkedonce

[Files]
Source: "..\publish\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; DestName: "LEEME.md"; Flags: ignoreversion

[Icons]
Name: "{group}\Reiniciar conector"; Filename: "{sys}\conhost.exe"; Parameters: "--headless ""{app}\{#AppExe}"" restart"; Comment: "Reinicia Walinka Print Connector"
Name: "{group}\Detener conector"; Filename: "{app}\{#AppExe}"; Parameters: "stop"; Comment: "Detiene Walinka Print Connector"
Name: "{group}\Estado del conector"; Filename: "{cmd}"; Parameters: "/k ""{app}\{#AppExe}"" status"; Comment: "Muestra el estado del conector"
Name: "{group}\Emparejar con Walinka"; Filename: "{cmd}"; Parameters: "/k ""{app}\{#AppExe}"" pair"; Comment: "Muestra el código de 6 dígitos para conectar Walinka"
Name: "{group}\Desinstalar {#AppName}"; Filename: "{uninstallexe}"

[Registry]
; Inicio de sesión: el vigilante corre sin ventana (conhost --headless, Windows 10 1903 o superior).
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "WalinkaPrintConnector"; ValueData: """{sys}\conhost.exe"" --headless ""{app}\{#AppExe}"" watch"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{sys}\conhost.exe"; Parameters: "--headless ""{app}\{#AppExe}"" watch"; Description: "Iniciar Walinka Print Connector ahora"; Flags: nowait postinstall runhidden skipifsilent

[UninstallRun]
Filename: "{app}\{#AppExe}"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopConnector"

[Code]
// Antes de reemplazar archivos, detiene una instalación previa. Si no hay
// nada corriendo, `stop` responde enseguida.
procedure StopRunningConnector();
var
  ResultCode: Integer;
  ExePath: String;
begin
  ExePath := ExpandConstant('{app}\{#AppExe}');
  if FileExists(ExePath) then
  begin
    Exec(ExePath, 'stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningConnector();
  Result := '';
end;

// La configuración y el emparejamiento son del usuario: al desinstalar se
// conservan salvo que confirme lo contrario.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{localappdata}\WalinkaPrintConnector');
    if DirExists(DataDir) then
    begin
      if MsgBox('¿Eliminar también la configuración y el emparejamiento de este equipo?' + #13#10 +
                '(Si respondes No, al reinstalar seguirá el mismo emparejamiento.)',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      begin
        DelTree(DataDir, True, True, True);
      end;
    end;
  end;
end;
