// renderer.js — HD Manager
const { ipcRenderer } = require('electron')

// ── Estado global ─────────────────────────────────────────────
const state = {
  drives         : [],
  programs       : [],
  filteredPrograms: [],
  selectedPrograms: new Set(),
  selectedHdMove : null,
  selectedHdMoved: null,
  selectedHdInstall: null,
}

// ── Navegação ─────────────────────────────────────────────────
function navigate(page, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  el.classList.add('active')
  document.getElementById('page-' + page).classList.add('active')

  if (page === 'move'    && state.programs.length === 0) loadPrograms()
  if (page === 'moved')   loadMoved()
  if (page === 'install') renderHdSelector('hd-selector-install', 'install')
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 4000) {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  const icons = { success: '✅', error: '❌', info: 'ℹ️' }
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`
  document.getElementById('toast-container').appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'
    setTimeout(() => el.remove(), 300) }, duration)
}

// ── Progress modal ────────────────────────────────────────────
function showProgress(title, sub) {
  document.getElementById('prog-title').textContent = title
  document.getElementById('prog-sub').textContent   = sub
  document.getElementById('prog-log').innerHTML     = ''
  document.getElementById('prog-bar').style.width   = '5%'
  document.getElementById('btn-prog-close').style.display = 'none'
  document.getElementById('progress-overlay').classList.add('show')
}
function logProgress(msg, type = 'info') {
  const log = document.getElementById('prog-log')
  const div = document.createElement('div')
  div.className = type
  div.textContent = msg
  log.appendChild(div)
  log.scrollTop = log.scrollHeight
}
function setProgressBar(pct) {
  document.getElementById('prog-bar').style.width = pct + '%'
}
function finishProgress(ok) {
  setProgressBar(100)
  document.getElementById('prog-sub').textContent = ok
    ? '✅ Concluído com sucesso!' : '❌ Ocorreu um erro.'
  document.getElementById('btn-prog-close').style.display = 'inline-flex'
}
function closeProgress() {
  document.getElementById('progress-overlay').classList.remove('show')
}

// ── Formatar bytes ────────────────────────────────────────────
function fmtGB(bytes) {
  if (!bytes) return '--'
  const gb = bytes / (1024 ** 3)
  return gb >= 1 ? gb.toFixed(1) + ' GB' : (bytes / (1024 ** 2)).toFixed(0) + ' MB'
}
function fmtMB(mb) {
  if (!mb) return '--'
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB'
}

// ── Carregar discos ───────────────────────────────────────────
async function refreshDrives() {
  const drives = await ipcRenderer.invoke('get-drives')
  state.drives = Array.isArray(drives) ? drives : [drives].filter(Boolean)
  renderDrivesSidebar()
  renderHdSelector('hd-selector-move',    'move')
  renderHdSelector('hd-selector-moved',   'moved')
  renderHdSelector('hd-selector-install', 'install')
  updateStats()
}

function renderDrivesSidebar() {
  const el = document.getElementById('drives-list')
  el.innerHTML = ''
  state.drives.forEach(d => {
    if (!d || !d.Name) return
    const total = (d.Total || 0)
    const used  = (d.Used  || 0)
    const free  = (d.Free  || 0)
    const pct   = total > 0 ? Math.round(used / total * 100) : 0
    const barCls = pct > 90 ? 'full' : pct > 70 ? 'warn' : ''
    const label  = d.Label || ''
    el.innerHTML += `
      <div class="drive-pill">
        <div class="drive-letter">${d.Name}</div>
        <div class="drive-info">
          <div class="drive-name">${label || d.Name + ':'}</div>
          <div class="drive-bar-wrap">
            <div class="drive-bar ${barCls}" style="width:${pct}%"></div>
          </div>
          <div class="drive-free">${fmtGB(free)} livre</div>
        </div>
      </div>`
  })
}

function renderHdSelector(containerId, mode) {
  const el = document.getElementById(containerId)
  if (!el) return
  const exclude = ['C'] // nunca mostrar o SSD principal como destino
  const drives = state.drives.filter(d => d && d.Name && !exclude.includes(d.Name))
  if (drives.length === 0) {
    el.innerHTML = '<div style="font-size:.82rem;color:var(--text3)">Nenhum HD externo detectado. Conecte o HD e clique em "Atualizar discos".</div>'
    return
  }
  el.innerHTML = drives.map(d => {
    const sel = (mode === 'move'    && state.selectedHdMove    === d.Name) ||
                (mode === 'moved'   && state.selectedHdMoved   === d.Name) ||
                (mode === 'install' && state.selectedHdInstall === d.Name)
    return `
      <div class="hd-option ${sel ? 'selected' : ''}" onclick="selectHd('${d.Name}','${mode}')">
        <span class="hd-drive">💾 ${d.Name}:</span>
        <div>
          <div style="font-size:.78rem;font-weight:600">${d.Label || 'HD Externo'}</div>
          <div class="hd-free">${fmtGB(d.Free)} livre</div>
        </div>
      </div>`
  }).join('')
}

function selectHd(drive, mode) {
  if (mode === 'move')    { state.selectedHdMove    = drive }
  if (mode === 'moved')   { state.selectedHdMoved   = drive; loadMoved() }
  if (mode === 'install') { state.selectedHdInstall = drive }
  renderHdSelector('hd-selector-' + mode, mode)
}

// ── Stats do home ─────────────────────────────────────────────
async function updateStats() {
  const ssd = state.drives.find(d => d && d.Name === 'C')
  if (ssd) document.getElementById('stat-ssd-free').textContent = fmtGB(ssd.Free)

  // HD principal: pega o primeiro não-C
  const hd = state.drives.find(d => d && d.Name !== 'C')
  if (hd) {
    document.getElementById('stat-hd-free').textContent = fmtGB(hd.Free)
    state.selectedHdMove    = state.selectedHdMove    || hd.Name
    state.selectedHdMoved   = state.selectedHdMoved   || hd.Name
    state.selectedHdInstall = state.selectedHdInstall || hd.Name
    renderHdSelector('hd-selector-move',    'move')
    renderHdSelector('hd-selector-moved',   'moved')
    renderHdSelector('hd-selector-install', 'install')
  }
}

// ── Carregar programas instalados ────────────────────────────
async function loadPrograms() {
  const wrap = document.getElementById('programs-table-wrap')
  wrap.innerHTML = '<div class="loading-msg" style="padding:24px"><div class="spinner"></div> Carregando programas instalados...</div>'
  const progs = await ipcRenderer.invoke('get-programs')
  state.programs = progs || []
  state.filteredPrograms = [...state.programs]
  renderProgramsTable()
}

function filterPrograms() {
  const q = document.getElementById('search-programs').value.toLowerCase()
  state.filteredPrograms = q
    ? state.programs.filter(p => p.name.toLowerCase().includes(q) || (p.location||'').toLowerCase().includes(q))
    : [...state.programs]
  renderProgramsTable()
}

function renderProgramsTable() {
  const wrap = document.getElementById('programs-table-wrap')
  if (state.filteredPrograms.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">Nenhum programa encontrado</div></div>'
    return
  }
  let html = `
    <table class="prog-table">
      <thead><tr>
        <th style="width:36px"><input type="checkbox" class="prog-checkbox" id="chk-all" onchange="toggleAll(this)"/></th>
        <th>Programa</th>
        <th>Local</th>
        <th>Tamanho</th>
        <th>Status</th>
        <th style="width:90px">Ação</th>
      </tr></thead>
      <tbody>`

  state.filteredPrograms.forEach((p, i) => {
    const chk  = state.selectedPrograms.has(i) ? 'checked' : ''
    const loc  = p.location || ''
    const isC  = loc.toUpperCase().startsWith('C:')
    const badge = isC
      ? '<span class="badge badge-ssd">💿 SSD</span>'
      : '<span class="badge badge-hd">🖥️ HD</span>'
    html += `
      <tr>
        <td><input type="checkbox" class="prog-checkbox" ${chk} onchange="toggleSelect(${i},this)" ${!isC?'disabled':''}></td>
        <td>
          <div class="prog-name" title="${p.name}">${p.name}</div>
          <div class="prog-version">${p.version || ''}</div>
        </td>
        <td><div class="prog-path" title="${loc}">${loc}</div></td>
        <td><div class="prog-size">${fmtMB(p.sizeMB)}</div></td>
        <td>${badge}</td>
        <td>
          ${isC ? `<button class="btn btn-success btn-sm" onclick="moveSingle(${i})">📦 Mover</button>` : '<span style="font-size:.72rem;color:var(--text3)">Já no HD</span>'}
        </td>
      </tr>`
  })
  html += '</tbody></table>'
  wrap.innerHTML = html
}

// ── Seleção ───────────────────────────────────────────────────
function toggleSelect(idx, el) {
  const p = state.filteredPrograms[idx]
  if (!p) return
  const realIdx = state.programs.indexOf(p)
  if (el.checked) state.selectedPrograms.add(realIdx)
  else state.selectedPrograms.delete(realIdx)
  updateSelectionBar()
}

function toggleAll(el) {
  state.filteredPrograms.forEach((p, i) => {
    const loc = p.location || ''
    if (!loc.toUpperCase().startsWith('C:')) return
    const ri = state.programs.indexOf(p)
    if (el.checked) state.selectedPrograms.add(ri)
    else state.selectedPrograms.delete(ri)
  })
  renderProgramsTable()
  updateSelectionBar()
}

function clearSelection() {
  state.selectedPrograms.clear()
  renderProgramsTable()
  updateSelectionBar()
}

function updateSelectionBar() {
  const bar   = document.getElementById('selection-bar')
  const count = state.selectedPrograms.size
  if (count === 0) { bar.classList.remove('show'); return }
  bar.classList.add('show')
  document.getElementById('sel-count').textContent = `${count} selecionado${count>1?'s':''}`
  const totalMB = [...state.selectedPrograms].reduce((acc, i) => acc + (state.programs[i]?.sizeMB || 0), 0)
  document.getElementById('sel-size').textContent = totalMB > 0 ? '· ' + fmtMB(totalMB) : ''
}

// ── Mover: individual ─────────────────────────────────────────
async function moveSingle(filteredIdx) {
  const p = state.filteredPrograms[filteredIdx]
  if (!p) return
  await doMove([p])
}

// ── Mover: selecionados ───────────────────────────────────────
async function moveSelected() {
  const progs = [...state.selectedPrograms].map(i => state.programs[i]).filter(Boolean)
  if (progs.length === 0) { toast('Selecione pelo menos um programa', 'error'); return }
  await doMove(progs)
}

// ── Processo principal de mover ───────────────────────────────
async function doMove(programs) {
  const hd = state.selectedHdMove
  if (!hd) { toast('Selecione um HD de destino primeiro!', 'error'); return }

  const freeGB = await ipcRenderer.invoke('get-free-space', hd)
  const totalMB = programs.reduce((a, p) => a + (p.sizeMB || 0), 0)
  if (totalMB / 1024 > freeGB - 1) {
    toast(`Espaço insuficiente! Precisa ~${(totalMB/1024).toFixed(1)} GB, tem ${freeGB.toFixed(1)} GB livre`, 'error', 6000)
    return
  }

  showProgress(
    `Movendo ${programs.length} programa${programs.length > 1 ? 's' : ''}...`,
    'Copiando para o HD e criando atalhos. Não desconecte o HD.'
  )

  let ok = 0
  let fail = 0
  for (let i = 0; i < programs.length; i++) {
    const p = programs[i]
    setProgressBar(Math.round((i / programs.length) * 90))
    logProgress(`▶ Movendo: ${p.name}`, 'info')

    const result = await ipcRenderer.invoke('move-to-hd', {
      srcPath    : p.location,
      hdDrive    : hd,
      programName: p.name,
    })

    const lines = (result.msg || '').split('\n').filter(Boolean)
    lines.forEach(line => {
      const type = line.includes('[ERRO]') ? 'err' : 'ok'
      logProgress(line.replace('[INFO] ','').replace('[ERRO] ',''), type)
    })

    if (result.ok && !result.msg.includes('[ERRO]')) {
      ok++
      logProgress(`✅ ${p.name} movido com sucesso!`, 'ok')
    } else {
      fail++
      logProgress(`❌ Falha ao mover ${p.name}`, 'err')
    }
  }

  setProgressBar(100)
  finishProgress(fail === 0)

  if (ok > 0) {
    toast(`${ok} programa${ok>1?'s':''} movido${ok>1?'s':''} com sucesso!`, 'success')
    clearSelection()
    await loadPrograms()
    await refreshDrives()
  }
  if (fail > 0) {
    toast(`${fail} programa${fail>1?'s':''} falharam. Veja o log.`, 'error', 6000)
  }
}

// ── Carregar stats da home (sem mudar o wrap da aba "Já no HD") ──
async function loadMovedStats(hdDrive) {
  if (!hdDrive) return
  const moved = await ipcRenderer.invoke('get-moved-programs', hdDrive)
  if (!moved || moved.length === 0) return
  document.getElementById('stat-moved').textContent = moved.length
  const totalMB = moved.reduce((a, p) => a + (p.SizeMB || 0), 0)
  document.getElementById('stat-saved').textContent = fmtMB(totalMB)
}

// ── Carregar programas já no HD ───────────────────────────────
async function loadMoved() {
  const hd   = state.selectedHdMoved
  const wrap = document.getElementById('moved-table-wrap')
  if (!hd) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-text">Selecione um HD acima</div></div>'
    return
  }
  wrap.innerHTML = '<div class="loading-msg" style="padding:24px"><div class="spinner"></div> Lendo HD...</div>'
  const moved = await ipcRenderer.invoke('get-moved-programs', hd)

  if (!moved || moved.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-text">Nenhum programa encontrado em ' + hd + ':\\Programas_HD</div></div>'
    return
  }

  let html = `
    <table class="prog-table">
      <thead><tr>
        <th>Programa</th>
        <th>Caminho no HD</th>
        <th>Tamanho</th>
        <th style="width:110px">Ações</th>
      </tr></thead><tbody>`
  moved.forEach(p => {
    html += `
      <tr>
        <td><div class="prog-name">${p.Name}</div><span class="badge badge-hd">🖥️ HD</span></td>
        <td><div class="prog-path" title="${p.FullPath}">${p.FullPath}</div></td>
        <td><div class="prog-size">${fmtMB(p.SizeMB)}</div></td>
        <td style="display:flex;gap:4px;align-items:center">
          <button class="btn btn-outline btn-sm" onclick='openFolder("${p.FullPath.replace(/\\/g,'\\\\')}")'>📁</button>
          <button class="btn btn-danger btn-sm" title="Restaurar para o SSD" onclick='restoreFromHd(${JSON.stringify(JSON.stringify(p))})'>↩️</button>
        </td>
      </tr>`
  })
  html += '</tbody></table>'
  wrap.innerHTML = html

  // Update stat
  document.getElementById('stat-moved').textContent = moved.length
  const totalMB = moved.reduce((a, p) => a + (p.SizeMB || 0), 0)
  document.getElementById('stat-saved').textContent = fmtMB(totalMB)
}

// ── Abrir pasta ───────────────────────────────────────────────
async function openFolder(p) {
  await ipcRenderer.invoke('open-folder', p)
}

// ── Restaurar programa do HD → SSD ───────────────────────────
async function restoreFromHd(pJson) {
  let p
  try { p = JSON.parse(pJson) } catch { toast('Erro ao ler dados do programa.', 'error'); return }
  const hd = state.selectedHdMoved
  if (!hd) { toast('Selecione um HD primeiro!', 'error'); return }

  // O junction no SSD tem o mesmo nome da pasta no HD, dentro de C:\Program Files ou similar
  // O srcPath (junction) é reconstruído a partir do nome — o script restore-to-ssd.ps1
  // recebe o destino SSD e o caminho HD; devemos usar o nome do programa para tentar
  // descobrir o junction. O script PS detecta e remove o junction automaticamente.
  const junctionPath = `C:\\Program Files\\${p.Name}`

  showProgress(`Restaurando ${p.Name}...`, 'Copiando de volta para o SSD.')
  logProgress(`Restaurando: ${p.Name}`, 'info')

  const result = await ipcRenderer.invoke('restore-to-ssd', {
    srcPath    : junctionPath,
    hdDrive    : hd,
    programName: p.Name,
  })

  const lines = (result.msg || '').split('\n').filter(Boolean)
  lines.forEach(line => {
    logProgress(line.replace('[INFO] ','').replace('[ERRO] ',''),
      line.includes('[ERRO]') ? 'err' : 'ok')
  })
  finishProgress(result.ok)
  if (result.ok) {
    toast(`${p.Name} restaurado para o SSD!`, 'success')
    await loadMoved()
    await refreshDrives()
  } else {
    toast('Falha ao restaurar. Veja o log.', 'error', 6000)
  }
}

// ── Redirecionar instalações para HD ─────────────────────────
async function setInstallDir() {
  const hd = state.selectedHdInstall
  if (!hd) { toast('Selecione um HD primeiro!', 'error'); return }
  showProgress('Redirecionando instalações...', 'Alterando registro do Windows.')
  logProgress('Configurando pastas padrão...', 'info')
  const result = await ipcRenderer.invoke('set-install-dir', { hdDrive: hd })
  const lines = (result.msg || '').split('\n').filter(Boolean)
  lines.forEach(line => {
    logProgress(line.replace('[INFO] ','').replace('[ERRO] ',''),
      line.includes('[ERRO]') ? 'err' : 'ok')
  })
  finishProgress(result.ok)
  if (result.ok) toast('Instalações redirecionadas para ' + hd + ':', 'success')
  else toast('Erro ao redirecionar. Execute como Administrador.', 'error')
}

async function restoreInstallDir() {
  showProgress('Restaurando pastas padrão...', 'Revertendo registro do Windows.')
  logProgress('Lendo backup do registro...', 'info')
  const result = await ipcRenderer.invoke('restore-install-dir')
  const lines = (result.msg || '').split('\n').filter(Boolean)
  lines.forEach(line => {
    logProgress(line.replace('[INFO] ','').replace('[ERRO] ',''),
      line.includes('[ERRO]') ? 'err' : 'ok')
  })
  finishProgress(result.ok)
  if (result.ok) toast('Pastas padrão restauradas para o SSD!', 'success')
  else toast('Erro ao restaurar. Execute como Administrador.', 'error')
}

// ── INIT ──────────────────────────────────────────────────────
;(async () => {
  await refreshDrives()
  // Auto-seleciona primeiro HD externo encontrado
  const firstHD = state.drives.find(d => d && d.Name !== 'C')
  if (firstHD) {
    state.selectedHdMove    = firstHD.Name
    state.selectedHdMoved   = firstHD.Name
    state.selectedHdInstall = firstHD.Name
    renderHdSelector('hd-selector-move',    'move')
    renderHdSelector('hd-selector-moved',   'moved')
    renderHdSelector('hd-selector-install', 'install')
    // Carrega stats da home (programas movidos e espaço liberado)
    loadMovedStats(firstHD.Name)
  }
})()
