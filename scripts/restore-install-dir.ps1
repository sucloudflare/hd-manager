# restore-install-dir.ps1
# Restaura as pastas padrao de instalacao para o SSD original

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

function Log($msg) { Write-Output "[INFO] $msg" }
function Err($msg) { Write-Output "[ERRO] $msg"; exit 1 }

$backupKey = 'HKCU:\SOFTWARE\HDManager_Backup'
$regPath   = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion'

if (-not (Test-Path $backupKey)) {
    Err "Nenhum backup encontrado. O redirecionamento nao foi configurado por este programa."
}

try {
    $backup  = Get-ItemProperty $backupKey
    $origPF  = $backup.OrigPF
    $origPF86= $backup.OrigPF86

    if (-not $origPF) { Err "Backup vazio." }

    Set-ItemProperty -Path $regPath -Name 'ProgramFilesDir'       -Value $origPF
    Set-ItemProperty -Path $regPath -Name 'ProgramFilesDir (x86)' -Value $origPF86

    Remove-Item $backupKey -Force -EA SilentlyContinue

    Log "Restaurado!"
    Log "ProgramFilesDir: $origPF"
    Log "ProgramFilesDir (x86): $origPF86"
    Log "Reinicie o computador para aplicar."
} catch {
    Err "Falha: $_"
}
