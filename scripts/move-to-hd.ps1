# move-to-hd.ps1
param(
    [Parameter(Mandatory)][string]$SrcPath,
    [Parameter(Mandatory)][string]$DestPath
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

function Log($msg) { Write-Output "[INFO] $msg" }
function Err($msg) { Write-Output "[ERRO] $msg"; exit 1 }

# ── Validacoes iniciais ──────────────────────────────────────
if (-not (Test-Path $SrcPath)) {
    Err "Pasta de origem nao encontrada: $SrcPath"
}

$srcItem = Get-Item -Path $SrcPath -Force
if ($srcItem.LinkType) {
    Err "Esta pasta ja e um symlink/junction. Ja foi movida anteriormente."
}

# ── Verifica espaco livre no destino ────────────────────────
$destDrive = Split-Path $DestPath -Qualifier
$freeGB = (Get-PSDrive -Name $destDrive.TrimEnd(':') -PSProvider FileSystem).Free / 1GB
$srcSizeMB = (Get-ChildItem $SrcPath -Recurse -Force -EA SilentlyContinue |
              Measure-Object -Property Length -Sum).Sum / 1MB

Log "Origem: $SrcPath"
Log "Destino: $DestPath"
Log "Tamanho: $([math]::Round($srcSizeMB, 1)) MB"
Log "Espaco livre no HD: $([math]::Round($freeGB, 2)) GB"

if ($srcSizeMB / 1024 -gt $freeGB - 0.5) {
    Err "Espaco insuficiente no HD."
}

# ── Encerra processos usando a pasta ────────────────────────
Log "Encerrando processos que usam a pasta..."
$exes = Get-ChildItem -Path $SrcPath -Filter "*.exe" -Recurse -EA SilentlyContinue |
        Select-Object -ExpandProperty Name | ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_) }

foreach ($exeName in $exes) {
    Get-Process -Name $exeName -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
}

# Aguarda processos encerrarem
Start-Sleep -Seconds 2

# ── Cria pasta raiz no HD se nao existir ────────────────────
$destRoot = Split-Path $DestPath -Parent
if (-not (Test-Path $destRoot)) {
    New-Item -ItemType Directory -Path $destRoot -Force | Out-Null
    Log "Pasta criada: $destRoot"
}

# ── Copia para o HD via robocopy ────────────────────────────
Log "Copiando para o HD... (pode demorar dependendo do tamanho)"
$roboArgs = @($SrcPath, $DestPath, '/E', '/COPYALL', '/R:2', '/W:3', '/NP', '/NFL', '/NDL')
$roboResult = & robocopy @roboArgs
$roboExit = $LASTEXITCODE

# Robocopy: codigos 0-7 sao sucesso (8+ sao erros)
if ($roboExit -ge 8) {
    if (Test-Path $DestPath) { Remove-Item $DestPath -Recurse -Force -EA SilentlyContinue }
    Err "Falha ao copiar (robocopy codigo $roboExit). Verifique permissoes."
}
Log "Copia concluida com sucesso."

# ── Verifica integridade ─────────────────────────────────────
$srcCount  = (Get-ChildItem $SrcPath  -Recurse -Force -EA SilentlyContinue).Count
$destCount = (Get-ChildItem $DestPath -Recurse -Force -EA SilentlyContinue).Count
$tolerance = [math]::Max(2, [math]::Floor($srcCount * 0.02))
if ($destCount -lt ($srcCount - $tolerance)) {
    Err "Verificacao falhou: origem=$srcCount arquivos, destino=$destCount arquivos. Abortando."
}
Log "Verificacao OK: $destCount arquivos copiados (origem: $srcCount)."

# ── Remove pasta original via robocopy (tecnica vazia) ──────
Log "Removendo pasta original do SSD..."
try {
    # Cria pasta vazia temporaria e usa robocopy /MIR para esvaziar o destino
    $emptyDir = Join-Path $env:TEMP "hdmgr_empty_$([System.Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
    
    & robocopy $emptyDir $SrcPath /MIR /R:1 /W:1 /NP /NFL /NDL | Out-Null
    Remove-Item $emptyDir -Force -EA SilentlyContinue
    Remove-Item -Path $SrcPath -Force -EA SilentlyContinue
    
    if (Test-Path $SrcPath) {
        # Fallback: cmd rd /s /q
        & cmd /c "rd /s /q `"$SrcPath`"" 2>&1 | Out-Null
    }
    
    if (Test-Path $SrcPath) {
        Err "Nao foi possivel remover a pasta original. Feche todos os programas da pasta e tente novamente."
    }
    Log "Pasta original removida."
} catch {
    Err "Erro ao remover pasta original: $_"
}

# ── Cria Junction ────────────────────────────────────────────
Log "Criando atalho inteligente (Junction)..."
$created = $false
try {
    New-Item -ItemType Junction -Path $SrcPath -Target $DestPath -Force -EA Stop | Out-Null
    $created = $true
} catch {}

if (-not $created) {
    & cmd /c "mklink /J `"$SrcPath`" `"$DestPath`"" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $created = $true }
}

if (-not $created) {
    Err "Nao foi possivel criar Junction. Execute como Administrador."
}

Log "Junction criado: $SrcPath --> $DestPath"
Log ""
Log "=========================================="
Log "SUCESSO! Programa movido para o HD."
Log "O programa continua funcionando normalmente."
Log "Origem (junction): $SrcPath"
Log "Real no HD:        $DestPath"
Log "=========================================="
