const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { exec } = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

// ── Janela principal ──────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })
  win.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

// ── Helper: escreve script PS em arquivo temp e executa ───────
// Isso evita problemas de escaping de aspas no exec() inline
function runPS(script) {
  return new Promise((resolve) => {
    const tmp = path.join(os.tmpdir(), `hdmgr_${Date.now()}.ps1`)
    fs.writeFileSync(tmp, '\ufeff' + script, 'utf8') // BOM para garantir UTF-8 no PS
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`
    exec(cmd, { maxBuffer: 20 * 1024 * 1024, timeout: 60000 }, (err, stdout, stderr) => {
      try { fs.unlinkSync(tmp) } catch {}
      resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || '').trim() })
    })
  })
}

// ── Helper: executa arquivo .ps1 do projeto ──────────────────
function runPSFile(file, argsArr = []) {
  return new Promise((resolve) => {
    const filePath = path.join(__dirname, 'scripts', file)
    const argsStr  = argsArr.map(a => `"${a.replace(/"/g, '""')}"`).join(' ')
    const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${filePath}" ${argsStr}`
    exec(cmd, { maxBuffer: 50 * 1024 * 1024, timeout: 300000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || '').trim() })
    })
  })
}

// ── Controles da janela ───────────────────────────────────────
ipcMain.on('win-close',    () => BrowserWindow.getFocusedWindow()?.close())
ipcMain.on('win-minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('win-maximize', () => {
  const w = BrowserWindow.getFocusedWindow()
  w?.isMaximized() ? w.unmaximize() : w?.maximize()
})

// ── Listar discos disponíveis ─────────────────────────────────
ipcMain.handle('get-drives', async () => {
  const r = await runPS(`
$drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null }
$result = $drives | ForEach-Object {
  $letter = $_.Name
  $vol    = Get-Volume -DriveLetter $letter -ErrorAction SilentlyContinue
  $part   = Get-Partition -DriveLetter $letter -ErrorAction SilentlyContinue
  $disk   = if ($part) { Get-Disk -Number $part.DiskNumber -ErrorAction SilentlyContinue } else { $null }
  [PSCustomObject]@{
    Name  = $letter
    Label = if ($vol) { $vol.FileSystemLabel } else { '' }
    Total = $_.Used + $_.Free
    Free  = $_.Free
    Used  = $_.Used
    Type  = if ($disk) { $disk.BusType } else { '' }
  }
}
$result | ConvertTo-Json -Depth 2
`)
  try {
    const raw = JSON.parse(r.out)
    return Array.isArray(raw) ? raw : [raw]
  } catch { return [] }
})

// ── Listar programas instalados (registro Windows) ────────────
ipcMain.handle('get-programs', async () => {
  const r = await runPS(`
$keys = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$progs = $keys | ForEach-Object {
  Get-ItemProperty $_ -ErrorAction SilentlyContinue
} | Where-Object {
  $_.DisplayName -and
  $_.InstallLocation -and
  $_.InstallLocation.Trim() -ne '' -and
  $_.SystemComponent -ne 1 -and
  ($_.ReleaseType -notmatch 'Update|Hotfix' -or -not $_.ReleaseType)
} | Select-Object DisplayName, InstallLocation, DisplayVersion, EstimatedSize, Publisher |
Sort-Object DisplayName
$progs | ConvertTo-Json -Depth 2
`)
  try {
    const raw = JSON.parse(r.out)
    const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
    return arr.map(p => ({
      name     : p.DisplayName     || '',
      location : (p.InstallLocation || '').replace(/\\+$/, '').trim(),
      version  : p.DisplayVersion  || '',
      sizeMB   : p.EstimatedSize   ? Math.round(p.EstimatedSize / 1024) : null,
      publisher: p.Publisher       || '',
    })).filter(p => p.name && p.location)
  } catch { return [] }
})

// ── Calcular tamanho real de uma pasta ────────────────────────
ipcMain.handle('get-folder-size', async (_, folderPath) => {
  const r = await runPS(`
$s = (Get-ChildItem -Path '${folderPath.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
if ($s) { [math]::Round($s / 1MB, 1) } else { 0 }
`)
  return parseFloat(r.out) || 0
})

// ── Verificar se pasta já é symlink ──────────────────────────
ipcMain.handle('is-symlink', async (_, folderPath) => {
  const r = await runPS(`
$item = Get-Item -Path '${folderPath.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue
if ($item -and $item.LinkType) { 'true' } else { 'false' }
`)
  return r.out.trim() === 'true'
})

// ── MOVER programa do SSD → HD (symlink junction) ─────────────
ipcMain.handle('move-to-hd', async (_, { srcPath, hdDrive, programName }) => {
  const safeName = programName.replace(/[<>:"/\\|?*]/g, '_').trim()
  const destPath = `${hdDrive}:\\Programas_HD\\${safeName}`
  const r = await runPSFile('move-to-hd.ps1', [srcPath, destPath])
  return { ok: r.ok, msg: r.out || r.err }
})

// ── INSTALAR novo programa direto no HD ──────────────────────
ipcMain.handle('set-install-dir', async (_, { hdDrive }) => {
  const r = await runPSFile('set-install-dir.ps1', [hdDrive])
  return { ok: r.ok, msg: r.out || r.err }
})

// ── RESTAURAR pasta padrão de instalação ─────────────────────
ipcMain.handle('restore-install-dir', async () => {
  const r = await runPSFile('restore-install-dir.ps1', [])
  return { ok: r.ok, msg: r.out || r.err }
})

// ── RESTAURAR programa do HD → SSD (desfazer) ────────────────
ipcMain.handle('restore-to-ssd', async (_, { srcPath, hdDrive, programName }) => {
  const safeName = programName.replace(/[<>:"/\\|?*]/g, '_').trim()
  const hdPath   = `${hdDrive}:\\Programas_HD\\${safeName}`
  const r = await runPSFile('restore-to-ssd.ps1', [srcPath, hdPath])
  return { ok: r.ok, msg: r.out || r.err }
})

// ── Abrir pasta no Explorer ───────────────────────────────────
ipcMain.handle('open-folder', async (_, folderPath) => {
  shell.openPath(folderPath)
  return true
})

// ── Verificar espaço livre no HD ─────────────────────────────
ipcMain.handle('get-free-space', async (_, driveLetter) => {
  const r = await runPS(`
$d = Get-PSDrive -Name '${driveLetter}' -PSProvider FileSystem -ErrorAction SilentlyContinue
if ($d) { [math]::Round($d.Free / 1GB, 2) } else { 0 }
`)
  return parseFloat(r.out) || 0
})

// ── Listar programas já movidos (no HD) ──────────────────────
ipcMain.handle('get-moved-programs', async (_, hdDrive) => {
  const r = await runPS(`
$base = '${hdDrive}:\\Programas_HD'
if (-not (Test-Path $base)) { '[]'; exit }
$dirs = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue
if (-not $dirs) { '[]'; exit }
$result = $dirs | ForEach-Object {
  $size = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue |
           Measure-Object -Property Length -Sum).Sum
  [PSCustomObject]@{
    Name     = $_.Name
    FullPath = $_.FullName
    SizeMB   = [math]::Round($size / 1MB, 1)
  }
}
$result | ConvertTo-Json -Depth 2
`)
  try {
    const raw = JSON.parse(r.out)
    return Array.isArray(raw) ? raw : (raw ? [raw] : [])
  } catch { return [] }
})
