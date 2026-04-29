# set-install-dir.ps1
# Redireciona as pastas padrao de instalacao para o HD externo
# Uso: set-install-dir.ps1 "E"

param(
    [Parameter(Mandatory)][string]$HdDrive
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

function Log($msg) { Write-Output "[INFO] $msg" }
function Err($msg) { Write-Output "[ERRO] $msg"; exit 1 }

$drive = $HdDrive.TrimEnd(':').TrimEnd('\')
$base  = "${drive}:\Programas_HD"

# ── Cria pasta base no HD ─────────────────────────────────────
if (-not (Test-Path $base)) {
    New-Item -ItemType Directory -Path $base -Force | Out-Null
    Log "Pasta criada: $base"
}

# ── Subpastas padrao ──────────────────────────────────────────
$pgFiles   = "$base\Program Files"
$pgFiles86 = "$base\Program Files (x86)"

foreach ($p in @($pgFiles, $pgFiles86)) {
    if (-not (Test-Path $p)) {
        New-Item -ItemType Directory -Path $p -Force | Out-Null
    }
}

# ── Altera registro: ProgramFilesDir ─────────────────────────
$regPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion'
try {
    $oldPF   = (Get-ItemProperty $regPath 'ProgramFilesDir').ProgramFilesDir
    $oldPF86 = (Get-ItemProperty $regPath 'ProgramFilesDir (x86)').'ProgramFilesDir (x86)'

    # Salva backup dos valores originais
    $backupKey = 'HKCU:\SOFTWARE\HDManager_Backup'
    if (-not (Test-Path $backupKey)) {
        New-Item -Path $backupKey -Force | Out-Null
    }
    # Só salva se ainda nao foi salvo
    $existing = Get-ItemProperty $backupKey -EA SilentlyContinue
    if (-not $existing.OrigPF) {
        Set-ItemProperty -Path $backupKey -Name 'OrigPF'   -Value $oldPF
        Set-ItemProperty -Path $backupKey -Name 'OrigPF86' -Value $oldPF86
        Log "Backup salvo: $oldPF"
    }

    Set-ItemProperty -Path $regPath -Name 'ProgramFilesDir'        -Value $pgFiles
    Set-ItemProperty -Path $regPath -Name 'ProgramFilesDir (x86)'  -Value $pgFiles86
    Log "ProgramFilesDir alterado para: $pgFiles"
    Log "ProgramFilesDir (x86) alterado para: $pgFiles86"
} catch {
    Err "Falha ao alterar registro (precisa de Administrador): $_"
}

# ── Steam: cria biblioteca no HD ─────────────────────────────
$steamPaths = @(
    "$env:ProgramFiles\Steam",
    "${env:ProgramFiles(x86)}\Steam",
    "$env:LOCALAPPDATA\Steam"
)
$steamFound = $steamPaths | Where-Object { Test-Path "$_\steam.exe" } | Select-Object -First 1

if ($steamFound) {
    $steamLibPath = "$base\SteamLibrary"
    if (-not (Test-Path $steamLibPath)) {
        New-Item -ItemType Directory -Path $steamLibPath -Force | Out-Null
    }
    Log ""
    Log "Steam detectado em: $steamFound"
    Log "Para adicionar biblioteca Steam no HD:"
    Log "  Steam > Configuracoes > Downloads > Pastas da Biblioteca Steam"
    Log "  Adicione: $steamLibPath"
}

# ── Epic Games: redireciona pasta padrao ─────────────────────
$epicManifest = "$env:ProgramData\Epic\EpicGamesLauncher\Data\Manifests"
if (Test-Path $epicManifest) {
    Log ""
    Log "Epic Games detectado!"
    Log "Para instalar jogos no HD pelo Epic:"
    Log "  Configuracoes > Gerenciar jogos > Alterar local de instalacao"
    Log "  Use: $base"
}

Log ""
Log "================================================="
Log "CONFIGURADO! Novos programas instalados via"
Log ".exe padrao irao para: $base"
Log ""
Log "IMPORTANTE: Reinicie o computador para que"
Log "o Windows reconheca a mudanca."
Log "================================================="
