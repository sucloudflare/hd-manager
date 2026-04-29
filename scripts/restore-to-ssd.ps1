# restore-to-ssd.ps1
# Uso: restore-to-ssd.ps1 "C:\Program Files\Game" "E:\Programas_HD\Game"
# Desfaz o processo: remove junction, copia de volta para o SSD

param(
    [Parameter(Mandatory)][string]$SrcPath,
    [Parameter(Mandatory)][string]$HdPath
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

function Log($msg) { Write-Output "[INFO] $msg" }
function Err($msg) { Write-Output "[ERRO] $msg"; exit 1 }

# ── Validações ───────────────────────────────────────────────
if (-not (Test-Path $HdPath)) {
    Err "Pasta no HD nao encontrada: $HdPath"
}

# ── Verifica espaco livre no SSD ─────────────────────────────
$srcDrive = Split-Path $SrcPath -Qualifier
$freeGB   = (Get-PSDrive -Name $srcDrive.TrimEnd(':') -PSProvider FileSystem).Free / 1GB
$hdSizeMB = (Get-ChildItem $HdPath -Recurse -Force -EA SilentlyContinue |
             Measure-Object -Property Length -Sum).Sum / 1MB

Log "Restaurando: $HdPath"
Log "Destino (SSD): $SrcPath"
Log "Tamanho: $([math]::Round($hdSizeMB, 1)) MB"
Log "Espaco livre no SSD: $([math]::Round($freeGB, 2)) GB"

if ($hdSizeMB / 1024 -gt $freeGB - 0.2) {
    Err "Espaco insuficiente no SSD. Necessario: $([math]::Round($hdSizeMB/1024,2)) GB | Disponivel: $([math]::Round($freeGB,2)) GB"
}

# ── Remove junction se existir ───────────────────────────────
if (Test-Path $SrcPath) {
    $item = Get-Item -Path $SrcPath -Force
    if ($item.LinkType) {
        Log "Removendo Junction existente..."
        & cmd /c "rmdir" "$SrcPath" 2>&1 | Out-Null
        if (Test-Path $SrcPath) { Remove-Item $SrcPath -Force -EA SilentlyContinue }
        Log "Junction removido."
    } else {
        Err "O caminho $SrcPath ja existe e nao e um Junction. Remova manualmente antes de restaurar."
    }
}

# ── Copia de volta para o SSD ────────────────────────────────
Log "Copiando de volta para o SSD..."
try {
    Copy-Item -Path $HdPath -Destination $SrcPath -Recurse -Force -ErrorAction Stop
    Log "Copia concluida."
} catch {
    Err "Falha ao copiar: $_"
}

# ── Verifica integridade ──────────────────────────────────────
$hdCount  = (Get-ChildItem $HdPath  -Recurse -Force -EA SilentlyContinue).Count
$ssdCount = (Get-ChildItem $SrcPath -Recurse -Force -EA SilentlyContinue).Count
$tolerance = [math]::Max(2, [math]::Floor($hdCount * 0.02))
if ($ssdCount -lt ($hdCount - $tolerance)) {
    Err "Verificacao falhou: HD=$hdCount arquivos, SSD=$ssdCount arquivos."
}

# ── Remove pasta do HD (opcional — pergunta via output especial) ─
Log ""
Log "=========================================="
Log "SUCESSO! Programa restaurado para o SSD."
Log "Destino: $SrcPath"
Log ""
Log "AVISO: A pasta no HD ainda existe em:"
Log "$HdPath"
Log "Voce pode apaga-la manualmente se nao precisar mais."
Log "=========================================="
