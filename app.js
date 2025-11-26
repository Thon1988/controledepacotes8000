// app.js - PegazusLog Scanner (Opção A) - Versão refinada
// Requisitos: jsQR (index.html) e Leaflet (index.html)

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Storage keys & defaults ---------- */
  const STORAGE_USERS_KEY = 'pegazus_users_v3';
  const STORAGE_SCANS_KEY = 'pegazus_scans_v3';
  const DEFAULT_USERS = [{ id: 'u1', username: 'thon', password: '882010', role: 'admin' }];

  function loadUsersFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_USERS_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS));
        return JSON.parse(JSON.stringify(DEFAULT_USERS));
      }
      const parsed = JSON.parse(raw);
      if (!parsed.some(u => u.username === 'thon')) {
        parsed.unshift(DEFAULT_USERS[0]);
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return JSON.parse(JSON.stringify(DEFAULT_USERS));
    }
  }

  let users = loadUsersFromStorage();
  function saveUsers() { localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users)); }

  let scanRecords = JSON.parse(localStorage.getItem(STORAGE_SCANS_KEY) || '[]');
  function saveRecords() { localStorage.setItem(STORAGE_SCANS_KEY, JSON.stringify(scanRecords)); }

  let currentUser = null;
  const CD_LOCATION = { lat: -23.5505, lon: -46.6333 };

  /* ---------- DOM refs ---------- */
  const sidebar = document.getElementById('sidebar');
  const userInfoDiv = document.getElementById('userInfo');
  const loginContainer = document.getElementById('loginContainer');
  const loginUser = document.getElementById('loginUser');
  const loginPass = document.getElementById('loginPass');
  const feedbackMessage = document.getElementById('feedbackMessage');
  const btnLogin = document.getElementById('loginBtn');
  const btnSair = document.getElementById('btnSair');
  const btnCamera = document.getElementById('btnCamera');
  const btnEntregas = document.getElementById('btnEntregas');
  const btnMapa = document.getElementById('btnMapa');
  const btnGerarRota = document.getElementById('btnGerarRota');
  const btnUsers = document.getElementById('btnUsers');
  const btnGenerateCSV = document.getElementById('btnGenerateCSV');
  const btnTestImage = document.getElementById('btnTestImage');
  const btnBack = document.getElementById('btnBack');
  const contentArea = document.getElementById('contentArea');

  const video = document.getElementById('videoElement');
  const overlay = document.getElementById('overlay');
  const overlayCtx = overlay ? overlay.getContext('2d') : null;
  const cameraContainer = document.getElementById('cameraContainer');
  const qrFeedback = document.getElementById('qrFeedback');
  const scansList = document.getElementById('scansList');
  const stopButton = document.getElementById('stopButton');
  const torchButton = document.getElementById('torchButton');
  const deviceSelect = document.getElementById('deviceSelect');
  const topDeviceSelect = document.getElementById('topDeviceSelect');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const openScansList = document.getElementById('openScansList');
  const scannerControls = document.getElementById('scannerControls');
  const topTorch = document.getElementById('topTorch');
  const topStop = document.getElementById('topStop');

  const syncIndicator = document.getElementById('syncIndicator');
  const syncDot = document.getElementById('syncDot');
  const syncText = document.getElementById('syncText');

  /* ---------- scanner internals ---------- */
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  let mediaStream = null, currentVideoTrack = null;
  let scanning = false, rafId = null;
  const SCAN_INTERVAL = 700;
  let lastScanTime = 0;
  const DUPLICATE_WINDOW = 60 * 1000;

  function escapeHtml(s) {
    return ('' + (s || '')).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function showFeedback(text, ok = true, ms = 1500) {
    if (!qrFeedback) return;
    qrFeedback.textContent = text;
    qrFeedback.style.background = ok ? 'rgba(0,128,0,0.85)' : 'rgba(255,0,0,0.85)';
    qrFeedback.style.display = 'block';
    setTimeout(() => { qrFeedback.style.display = 'none'; }, ms);
  }

  function beep(duration = 90, freq = 1400, vol = 0.12) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(ctx.destination); o.start();
      setTimeout(() => { try { o.stop(); ctx.close(); } catch (e) { } }, duration);
    } catch (e) { }
  }

  /* ---------- parse helpers ---------- */
  function extractIdFromLink(link) {
    if (!link) return { type: null, value: null };
    const shopeePattern1 = /-i\.(\d+)\.(\d+)/i; const m1 = link.match(shopeePattern1); if (m1) return { type: 'shopee_item', value: m1[2], shopId: m1[1] };
    const shopeePattern2 = /shopee\.[^\/]+\/(?:product|products|item)\/(\d+)/i; const m2 = link.match(shopeePattern2); if (m2) return { type: 'shopee_item', value: m2[1] };
    const mlPattern1 = /ML[A-Z]*-?(\d+)/i; const m3 = link.match(mlPattern1); if (m3) return { type: 'mercadolivre_item', value: m3[1] };
    const mlPattern2 = /\/(\d{6,})(?:[^\d]|$)/; const m4 = link.match(mlPattern2); if (m4) return { type: 'mercadolivre_item', value: m4[1] };
    const fallback = link.match(/(\d{6,})/); if (fallback) return { type: 'number', value: fallback[1] };
    return { type: null, value: null };
  }

  function extractQrId(payload) {
    if (!payload) return { type: null, value: null };
    const p = payload.trim();
    const kv = [/(?:qr[_\-]?id|qrid|id|codigo|cod|codigo_id|qrCodeId)[:=]\s*([A-Za-z0-9\-_]+)/i, /(?:idPedido|pedido_id|order_id|order)[:=]\s*([A-Za-z0-9\-_]+)/i];
    for (const re of kv) { const m = p.match(re); if (m) return { type: 'qr_field', value: m[1] }; }
    try {
      const url = new URL(p);
      const qp = ['id', 'qrid', 'qr_id', 'codigo', 'code', 'itemId', 'orderId', 'order_id'];
      for (const k of qp) if (url.searchParams.has(k)) return { type: `qr_param:${k}`, value: url.searchParams.get(k) };
    } catch (e) { }
    const num = p.match(/([0-9]{6,})/); if (num) return { type: 'numeric', value: num[1] };
    if (p.length <= 64 && /[A-Za-z0-9\-_]{4,}/.test(p)) return { type: 'text', value: p.split(/\s|;|,|\|/)[0] };
    return { type: null, value: null };
  }

  /* ---------- render scans ---------- */
  function renderScans() {
    if (!scansList) return;
    scansList.innerHTML = '';
    if (!scanRecords.length) { scansList.innerHTML = '<div style="color:#666">Nenhum registro ainda.</div>'; return; }
    scanRecords.forEach((r, i) => {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex:1">
        <div style="flex:1">
          <div style="font-size:13px" title="${escapeHtml(r.raw_qr)}">${escapeHtml(r.idEntrega || r.raw_qr)}</div>
          <div class="small" style="color:var(--muted);font-size:12px">${escapeHtml(r.nomeCliente || '—')} — ${escapeHtml(r.endereco || '—')}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button data-i="${i}" class="edit-btn" style="padding:6px;border-radius:6px;background:#00b4d8;color:#012">Editar</button>
          <button data-i="${i}" class="del-btn" style="padding:6px;border-radius:6px;background:#6c757d;color:#fff">Excluir</button>
        </div>
      </div>`;
      const editBtn = div.querySelector('.edit-btn');
      const delBtn = div.querySelector('.del-btn');
      editBtn.addEventListener('click', () => editRecord(i));
      delBtn.addEventListener('click', () => {
        if (!confirm('Excluir registro?')) return;
        scanRecords.splice(i, 1); saveRecords(); renderScans();
      });
      scansList.appendChild(div);
    });
  }

  function editRecord(idx) {
    const r = scanRecords[idx];
    const form = document.createElement('div');
    form.className = 'item';
    form.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;width:100%">
        <label>Nome cliente <input id="edit_name" value="${escapeHtml(r.nomeCliente || '')}" /></label>
        <label>Endereço <input id="edit_addr" value="${escapeHtml(r.endereco || '')}" /></label>
        <label>ID entrega <input id="edit_id" value="${escapeHtml(r.idEntrega || '')}" /></label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button id="saveRec" style="background:var(--success);padding:6px;border-radius:6px;color:#fff">Salvar</button>
          <button id="cancelRec" style="background:#6c757d;padding:6px;border-radius:6px;color:#fff">Cancelar</button>
        </div>
      </div>`;
    scansList.innerHTML = ''; scansList.appendChild(form);
    document.getElementById('cancelRec').addEventListener('click', renderScans);
    document.getElementById('saveRec').addEventListener('click', () => {
      r.nomeCliente = document.getElementById('edit_name').value.trim();
      r.endereco = document.getElementById('edit_addr').value.trim();
      r.idEntrega = document.getElementById('edit_id').value.trim();
      scanRecords[idx] = r; saveRecords(); renderScans();
    });
  }

  /* ---------- camera helpers ---------- */
  async function enumerateVideoDevices() {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      return devs.filter(d => d.kind === 'videoinput');
    } catch (e) { return []; }
  }

  function fitCanvases() {
    try {
      const vw = video.videoWidth || video.clientWidth || 640;
      const vh = video.videoHeight || video.clientHeight || 480;
      const targetW = Math.min(1280, Math.max(320, Math.round(vw * 0.6)));
      const targetH = Math.round((vh / vw) * targetW) || 480;
      tempCanvas.width = targetW; tempCanvas.height = targetH;
      if (overlay) { overlay.width = vw; overlay.height = vh; }
    } catch (e) { }
  }

  function drawBoundingBox(loc) {
    if (!overlayCtx || !overlay) return;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    // draw subtle background shadow at center to emphasize scan square
    // (visual only)
    overlayCtx.fillStyle = 'rgba(0,0,0,0.12)';
    const w = overlay.width, h = overlay.height;
    const boxW = Math.round(Math.min(w, h) * 0.40), boxH = boxW;
    const x = Math.round((w - boxW) / 2), y = Math.round((h - boxH) / 2);
    overlayCtx.fillRect(0, 0, w, y - 6);
    overlayCtx.fillRect(0, y + boxH + 6, w, h - (y + boxH + 6));
    overlayCtx.fillStyle = 'rgba(255,255,255,0.12)';
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.16)';
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(x, y, boxW, boxH);
    if (!loc) return;
    overlayCtx.strokeStyle = 'rgba(0,200,83,0.95)'; overlayCtx.lineWidth = Math.max(2, overlay.width / 200);
    overlayCtx.beginPath();
    overlayCtx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
    overlayCtx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
    overlayCtx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
    overlayCtx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
    overlayCtx.closePath(); overlayCtx.stroke();
  }

  async function startScanner(deviceId) {
    if (scanning) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert('Câmera não suportada'); return; }
    try {
      let constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
      if (deviceId) constraints.video = { deviceId: { exact: deviceId } };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      mediaStream = stream; video.srcObject = mediaStream; await video.play();
      currentVideoTrack = mediaStream.getVideoTracks()[0] || null;
      try { const caps = currentVideoTrack.getCapabilities(); if (topTorch) topTorch.style.display = (caps && caps.torch) ? 'inline-block' : 'none'; } catch(e){ if(topTorch) topTorch.style.display='none'; }
      populateDeviceSelect(await enumerateVideoDevices());
      scanning = true;
      if (stopButton) stopButton.style.display = 'inline-block';
      if (cameraContainer) cameraContainer.style.display = 'flex';
      if (scannerControls) scannerControls.style.display = 'flex';
      if (btnBack) btnBack.style.display = 'block';
      fitCanvases();
      rafId = requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error('Erro ao abrir câmera', err);
      showFeedback('Erro ao acessar câmera — ver console', false, 4000);
    }
  }

  function populateDeviceSelect(devices) {
    if (deviceSelect) {
      deviceSelect.innerHTML = '';
      if (!devices || devices.length === 0) { deviceSelect.style.display = 'none'; } else {
        devices.forEach((d, idx) => {
          const opt = document.createElement('option'); opt.value = d.deviceId; opt.text = d.label || ('Câmera ' + (idx + 1));
          deviceSelect.appendChild(opt);
        });
        deviceSelect.style.display = devices.length > 1 ? 'block' : 'none';
      }
    }
    if (topDeviceSelect) {
      topDeviceSelect.innerHTML = '';
      if (!devices || devices.length === 0) { topDeviceSelect.style.display = 'none'; } else {
        devices.forEach((d, idx) => {
          const opt = document.createElement('option'); opt.value = d.deviceId; opt.text = d.label || ('Câmera ' + (idx + 1));
          topDeviceSelect.appendChild(opt);
        });
        topDeviceSelect.style.display = devices.length > 1 ? 'inline-block' : 'none';
      }
    }
  }

  function stopScanner() {
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null; currentVideoTrack = null; if (rafId) cancelAnimationFrame(rafId); rafId = null; scanning = false;
    try { video.pause(); video.srcObject = null; } catch (e) { }
    if (stopButton) stopButton.style.display = 'none';
    if (topStop) topStop.style.display = 'none';
    if (topTorch) topTorch.style.display = 'none';
    if (scannerControls) scannerControls.style.display = 'none';
    if (cameraContainer) cameraContainer.style.display = 'none';
    try { btnBack && (btnBack.style.display = 'none'); } catch (e) {}
    if (overlayCtx && overlay) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  }

  async function toggleTorch() {
    if (!currentVideoTrack) return;
    try {
      const caps = currentVideoTrack.getCapabilities();
      if (!caps.torch) return;
      // flip torch state using applyConstraints: browser-dependent
      await currentVideoTrack.applyConstraints({ advanced: [{ torch: !currentVideoTrack.torchOn }] });
      // note: some browsers don't expose "torchOn" property; this is best-effort
    } catch (e) { console.warn('torch not supported', e); }
  }

  function scanLoop() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      try {
        const vw = video.videoWidth || video.clientWidth; const vh = video.videoHeight || video.clientHeight;
        if (!vw || !vh) { rafId = requestAnimationFrame(scanLoop); return; }
        const cropFactor = 0.6; const sw = Math.floor(vw * cropFactor); const sh = Math.floor(vh * cropFactor);
        const sx = Math.floor((vw - sw) / 2); const sy = Math.floor((vh - sh) / 2);
        tempCtx.drawImage(video, sx, sy, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height);
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          let loc = null;
          if (code.location) {
            const scaleX = sw / tempCanvas.width; const scaleY = sh / tempCanvas.height;
            const mapCorner = (pt) => ({ x: Math.round(pt.x * scaleX + sx), y: Math.round(pt.y * scaleY + sy) });
            loc = {
              topLeftCorner: mapCorner(code.location.topLeftCorner),
              topRightCorner: mapCorner(code.location.topRightCorner),
              bottomLeftCorner: mapCorner(code.location.bottomLeftCorner),
              bottomRightCorner: mapCorner(code.location.bottomRightCorner)
            };
            drawBoundingBox(loc);
          } else drawBoundingBox(null);
          const now = Date.now();
          if (now - lastScanTime >= SCAN_INTERVAL) { lastScanTime = now; handleScanResult((code.data || '').trim()); }
        } else drawBoundingBox(null);
      } catch (e) { console.error('frame error', e); }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  /* ---------- scan result handling ---------- */
  async function handleScanResult(payload) {
    if (!payload) return;
    if (scanRecords.some(it => it.raw_qr === payload && (Date.now() - (it.timestamp || 0)) < DUPLICATE_WINDOW)) {
      showFeedback('Já escaneado recentemente', false);
      beep(70, 600, 0.06);
      try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { }
      return;
    }

    const plataforma = (() => { const l = payload.toLowerCase(); if (l.includes('shopee.')) return 'Shopee'; if (l.includes('mercadolivre') || l.includes('mercadolibre')) return 'Mercado Livre'; return 'Outra'; })();
    const extractedId = extractIdFromLink(payload); const qrId = extractQrId(payload);

    // Try to parse complex payload lines (tab-separated or key-value) - for your CSV needs
    // If payload contains tabs or key names, we'll try to extract fields
    let parsed = {};
    if (payload.includes('\t') || payload.includes('\n')) {
      const lines = payload.split(/\r?\n/).filter(Boolean);
      // first line could be headers; try to map header->value
      if (lines.length >= 2 && lines[0].includes('\t')) {
        const headers = lines[0].split('\t').map(h => h.trim());
        const values = lines[1].split('\t').map(v => v.trim());
        headers.forEach((h, idx) => parsed[h] = values[idx] || '');
      } else {
        // fallback: take first meaningful token as id
        parsed['RAW'] = payload;
      }
    } else {
      parsed['RAW'] = payload;
    }

    // Build record fields according to your sample columns (best-effort)
    const record = {
      idEntrega: extractedId.value || qrId.value || (parsed['RASTREAMENTO'] || parsed['Rastreamento'] || payload.substring(0, 12)),
      nomeCliente: parsed['DESTINATARIO'] || parsed['Destinatario'] || parsed['NOME'] || '',
      endereco: parsed['ENDERECO'] || parsed['Endereço'] || parsed['Endereco'] || '',
      cep: parsed['CEP'] || parsed['Cep'] || parsed['cep'] || '',
      bairro: parsed['BAIRRO'] || parsed['Bairro'] || '',
      plataforma, extractedId, qrId,
      raw_qr: payload,
      usuario: currentUser ? currentUser.username : 'anon',
      email: parsed['EMAIL'] || '',
      empresa: parsed['NOME_DA_EMPRESA'] || parsed['EMPRESA'] || '',
      data: parsed['DATA'] || '',
      hora: parsed['HORA'] || '',
      tipo: parsed['TIPO'] || '',
      courier: parsed['COURRIER'] || parsed['COURIER'] || parsed['COURRIER'] || '',
      datetime: new Date().toISOString(),
      timestamp: Date.now(),
      // approximate random coords near CD if not provided
      lat: (parsed.lat && parseFloat(parsed.lat)) || CD_LOCATION.lat + (Math.random() - 0.5) * 0.05,
      lon: (parsed.lon && parseFloat(parsed.lon)) || CD_LOCATION.lon + (Math.random() - 0.5) * 0.05
    };

    scanRecords.unshift(record);
    saveRecords();
    renderScans();
    beep();
    try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) { }
    showFeedback('Leitura OK: ' + (record.idEntrega || '---'));
    try { await navigator.clipboard.writeText(record.idEntrega || record.raw_qr); } catch (e) { }
  }

  /* ---------- CSV / relatórios ---------- */
  function generateCSVMenu() {
    if (!currentUser) { alert('Faça login para gerar relatórios'); return; }
    contentArea.innerHTML = `
      <h2>📄 Gerar Relatório CSV</h2>
      <p>Escolha o período:</p>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="csvDiario" class="nav-btn">Diário</button>
        <button id="csvQuinze" class="nav-btn">Quinzenal</button>
        <button id="csvMensal" class="nav-btn">Mensal</button>
        <button id="csvCancelar" style="background:#6c757d;color:#fff;border:none;border-radius:6px;padding:8px">Cancelar</button>
      </div>
      <p style="margin-top:12px;color:#666">Total registros: ${scanRecords.length}</p>
    `;
    document.getElementById('csvDiario').addEventListener('click', () => generateCSVPeriod('diário'));
    document.getElementById('csvQuinze').addEventListener('click', () => generateCSVPeriod('quinzenal'));
    document.getElementById('csvMensal').addEventListener('click', () => generateCSVPeriod('mensal'));
    document.getElementById('csvCancelar').addEventListener('click', () => showDeliveries());
  }

  function generateCSVPeriod(period) {
    if (!currentUser) return;
    const now = new Date();
    let filtered = [];
    if (period === 'diário') filtered = scanRecords.filter(r => new Date(r.datetime).toDateString() === now.toDateString());
    else if (period === 'quinzenal') filtered = scanRecords.filter(r => (now - new Date(r.datetime)) / (1000 * 60 * 60 * 24) <= 15);
    else if (period === 'mensal') filtered = scanRecords.filter(r => (now - new Date(r.datetime)) / (1000 * 60 * 60 * 24) <= 30);
    if (filtered.length === 0) { alert('Nenhum registro para este período'); return; }

    // Build CSV header using fields from your sample
    let csv = 'EMPRESA,EMAIL,GERENCIA,DATA,HORA,DESTINATARIO,ENDERECO,CEP,BAIRRO,TIPO,RASTREAMENTO,COURRIER,ID_ENTREGA,USUARIO,DATA_HORA,LAT,LON,RAW\n';
    filtered.forEach(r => {
      const empresa = (r.empresa || '').replace(/"/g, '""');
      const email = (r.email || '').replace(/"/g, '""');
      const gerencia = ''; // not present by default
      const data = r.data || (new Date(r.datetime)).toLocaleDateString();
      const hora = r.hora || (new Date(r.datetime)).toLocaleTimeString();
      const dest = (r.nomeCliente || '').replace(/"/g, '""');
      const end = (r.endereco || '').replace(/"/g, '""');
      const cep = r.cep || '';
      const bairro = (r.bairro || '').replace(/"/g, '""');
      const tipo = r.tipo || '';
      const rast = r.idEntrega || '';
      const courier = r.courier || '';
      const idEnt = r.idEntrega || '';
      const usuario = r.usuario || '';
      const dt = r.datetime || '';
      const lat = r.lat || '';
      const lon = r.lon || '';
      const raw = (r.raw_qr || '').replace(/"/g, '""');

      csv += `"${empresa}","${email}","${gerencia}","${data}","${hora}","${dest}","${end}","${cep}","${bairro}","${tipo}","${rast}","${courier}","${idEnt}","${usuario}","${dt}",${lat},${lon},"${raw}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `relatorio_${period}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => showDeliveries(), 600);
  }

  /* ---------- views ---------- */
  function showDeliveries() {
    if (!currentUser) return;
    if (cameraContainer) cameraContainer.style.display = 'none';
    contentArea.style.display = 'block'; btnBack.style.display = 'none';
    if (!scanRecords.length) contentArea.innerHTML = '<h2>📦 Entregas Pendentes</h2><p>Nenhuma entrega registrada. Use o Scanner.</p>';
    else {
      let html = `<h2>📦 Entregas Registradas</h2><p>Total: ${scanRecords.length}</p><ul>`;
      scanRecords.forEach(r => {
        html += `<li style="margin-bottom:8px"><strong>${escapeHtml(r.nomeCliente || r.idEntrega)}</strong> — ${escapeHtml(r.endereco || r.raw_qr)}<br><small>${escapeHtml(r.datetime)}</small></li>`;
      });
      html += '</ul>'; contentArea.innerHTML = html;
    }
    if (btnBack) btnBack.style.display = 'block';
  }

  function showMap() {
    if (!currentUser) return;
    if (cameraContainer) cameraContainer.style.display = 'none';
    contentArea.style.display = 'block'; btnBack.style.display = 'none';
    contentArea.innerHTML = `<h2>📍 Mapa</h2><div id="fleetMap" style="height:60vh;border-radius:8px;margin-top:12px"></div>`;
    setTimeout(() => {
      try {
        const map = L.map('fleetMap').setView([CD_LOCATION.lat, CD_LOCATION.lon], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.marker([CD_LOCATION.lat, CD_LOCATION.lon]).addTo(map).bindPopup('Centro de Distribuição').openPopup();
        scanRecords.forEach(r => { if (r.lat && r.lon) L.marker([r.lat, r.lon]).addTo(map).bindPopup(`${r.idEntrega} • ${r.nomeCliente || '—'}`); });
        map.locate({ setView: false, maxZoom: 16 }).on('locationfound', e => {
          const blueIcon = L.divIcon({ className: 'custom-user-icon', html: '<div style="background:#007bff;width:12px;height:12px;border-radius:50%;border:3px solid white;"></div>', iconSize: [18, 18] });
          L.marker(e.latlng, { icon: blueIcon }).addTo(map).bindPopup('Você está aqui').openPopup();
        });
      } catch (e) { console.error('map error', e); contentArea.innerHTML += '<p>Erro ao carregar mapa</p>'; }
    }, 60);
    if (btnBack) btnBack.style.display = 'block';
  }

  function showUsers() {
    if (!currentUser) return;
    if (cameraContainer) cameraContainer.style.display = 'none';
    contentArea.style.display = 'block'; btnBack.style.display = 'none';
    if (currentUser.role === 'colaborador') { contentArea.innerHTML = '<h2>Acesso negado</h2>'; return; }
    let html = `<h2>👥 Gestão de Usuários</h2><ul>`;
    users.forEach(u => html += `<li style="margin-bottom:6px"><strong>${escapeHtml(u.username)}</strong> (${u.role}) ${u.id === currentUser.id ? '(você)' : ''} ${(currentUser.role !== 'colaborador' && u.id !== currentUser.id) ? `<button data-id="${u.id}" class="editUserBtn">Editar</button>` : '' }</li>`);
    html += `</ul>
      <h3>Criar Usuário</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input id="newU" placeholder="username"><input id="newP" placeholder="senha">
        <select id="newR"><option value="colaborador">Colaborador</option>${currentUser.role === 'admin' ? '<option value="gestor">Gestor</option>' : ''}</select>
        <button id="createU">Criar</button>
      </div>`;
    contentArea.innerHTML = html;

    document.querySelectorAll('.editUserBtn').forEach(btn => btn.addEventListener('click', (e) => { const id = e.target.dataset.id; editUserById(id); }));
    document.getElementById('createU').addEventListener('click', () => {
      const nn = document.getElementById('newU').value.trim();
      const np = document.getElementById('newP').value;
      const nr = document.getElementById('newR').value;
      if (!nn || !np) { alert('Preencha'); return; }
      if (users.some(u => u.username === nn)) { alert('Usuário já existe'); return; }
      const nu = { id: 'u' + (Date.now()), username: nn, password: np, role: nr };
      users.push(nu); saveUsers(); showUsers();
    });

    if (btnBack) btnBack.style.display = 'block';
  }

  function editUserById(id) {
    const u = users.find(x => x.id === id); if (!u) return;
    const form = document.createElement('div');
    form.innerHTML = `
      <h3>Editar usuário</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <label>Usuário (login)<input id="eu" value="${escapeHtml(u.username)}"></label>
        <label>Nova senha (deixe vazio para manter)<input id="ep" placeholder="nova senha"></label>
        <label>Perfil
          <select id="er">
            <option value="colaborador" ${u.role === 'colaborador' ? 'selected' : ''}>Colaborador</option>
            <option value="gestor" ${u.role === 'gestor' ? 'selected' : ''}>Gestor</option>
            ${currentUser.role === 'admin' ? `<option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>` : ''}
          </select>
        </label>
        <div style="display:flex;gap:8px">
          <button id="saveU" style="background:var(--success);color:#fff;padding:8px;border-radius:6px">Salvar</button>
          <button id="cancelU" style="background:#6c757d;color:#fff;padding:8px;border-radius:6px">Cancelar</button>
        </div>
      </div>
    `;
    contentArea.innerHTML = ''; contentArea.appendChild(form);
    document.getElementById('cancelU').addEventListener('click', showUsers);
    document.getElementById('saveU').addEventListener('click', () => {
      const newUsername = document.getElementById('eu').value.trim();
      const newPass = document.getElementById('ep').value.trim();
      const newRole = document.getElementById('er').value;
      if (!newUsername) { alert('Nome de usuário não pode ficar vazio'); return; }
      if (users.some(x => x.username === newUsername && x.id !== u.id)) { alert('Nome de usuário já existe'); return; }
      u.username = newUsername;
      if (newPass) u.password = newPass;
      if (currentUser.role === 'admin') u.role = newRole;
      saveUsers();
      if (u.id === currentUser.id) currentUser = u;
      showUsers();
    });
    if (btnBack) btnBack.style.display = 'block';
  }

  /* ---------- login events ---------- */
  function doLogin(username, password) {
    const matched = users.find(x => x.username === username && x.password === password);
    if (!matched) { feedbackMessage.textContent = 'Usuário ou senha inválidos'; return false; }
    currentUser = matched;
    feedbackMessage.textContent = '';
    sidebar.style.display = 'block';
    loginContainer.style.display = 'none';
    userInfoDiv.innerHTML = `Usuário: <strong>${escapeHtml(currentUser.username)}</strong><br>Nível: <strong>${escapeHtml(currentUser.role)}</strong>`;
    // show welcome content on right
    contentArea.innerHTML = `<h2>Bem-vindo ao PegazusLog</h2><p>Bem-vindo, selecione uma opção</p>`;
    btnBack.style.display = 'none';
    // render scans list
    renderScans();
    return true;
  }

  btnLogin.addEventListener('click', () => {
    const u = (loginUser && loginUser.value || '').trim();
    const p = (loginPass && loginPass.value) || '';
    doLogin(u, p);
  });

  [loginUser, loginPass].forEach(el => {
    if (!el) return;
    el.addEventListener('keyup', (e) => { if (e.key === 'Enter') btnLogin.click(); });
  });

  btnSair.addEventListener('click', () => {
    currentUser = null;
    sidebar.style.display = 'none';
    loginContainer.style.display = 'block';
    contentArea.style.display = 'block';
    if (loginPass) loginPass.value = '';
    stopScanner();
  });

  /* ---------- UI events ---------- */
  btnCamera.addEventListener('click', () => {
    if (!currentUser) return;
    contentArea.style.display = 'none';
    if (cameraContainer) cameraContainer.style.display = 'flex';
    if (scannerControls) scannerControls.style.display = 'flex';
    // ensure device list populated
    enumerateVideoDevices().then(devs => populateDeviceSelect(devs));
    // also set topDeviceSelect selection and populate
    enumerateVideoDevices().then(devs => populateDeviceSelect(devs));
    startScanner(); // default camera
    if (btnBack) btnBack.style.display = 'block';
  });

  if (stopButton) stopButton.addEventListener('click', () => stopScanner());
  if (topStop) topStop.addEventListener('click', () => stopScanner());
  if (torchButton) torchButton.addEventListener('click', () => toggleTorch());
  if (topTorch) topTorch.addEventListener('click', () => toggleTorch());

  if (deviceSelect) deviceSelect.addEventListener('change', async () => {
    const id = deviceSelect.value; if (!id) return;
    stopScanner();
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id } }, audio: false });
      video.srcObject = mediaStream; await video.play();
      currentVideoTrack = mediaStream.getVideoTracks()[0] || null;
      fitCanvases(); scanning = true; rafId = requestAnimationFrame(scanLoop); if (stopButton) stopButton.style.display = 'inline-block';
    } catch (e) { console.warn('device select failed', e); showFeedback('Falha ao selecionar câmera', false); }
  });

  if (topDeviceSelect) topDeviceSelect.addEventListener('change', async () => {
    const id = topDeviceSelect.value; if (!id) return;
    stopScanner();
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id } }, audio: false });
      video.srcObject = mediaStream; await video.play();
      currentVideoTrack = mediaStream.getVideoTracks()[0] || null;
      fitCanvases(); scanning = true; rafId = requestAnimationFrame(scanLoop);
    } catch (e) { console.warn('device select failed', e); showFeedback('Falha ao selecionar câmera', false); }
  });

  if (exportBtn) exportBtn.addEventListener('click', () => { if (!currentUser) { alert('Faça login'); return; } generateCSVMenu(); });
  if (clearBtn) clearBtn.addEventListener('click', () => { if (confirm('Limpar registros?')) { scanRecords = []; saveRecords(); renderScans(); } });
  if (openScansList) openScansList.addEventListener('click', () => { renderScans(); if (cameraContainer) cameraContainer.scrollIntoView({ behavior: 'smooth' }); });

  btnEntregas.addEventListener('click', () => showDeliveries());
  btnMapa.addEventListener('click', () => showMap());
  btnGenerateCSV.addEventListener('click', () => generateCSVMenu());
  btnGerarRota.addEventListener('click', () => generateRouteAndShow());
  btnUsers.addEventListener('click', () => showUsers());
  btnBack.addEventListener('click', () => {
    stopScanner();
    if (cameraContainer) cameraContainer.style.display = 'none';
    if (scannerControls) scannerControls.style.display = 'none';
    btnBack.style.display = 'none';
    // return to welcome
    contentArea.innerHTML = `<h2>Bem-vindo ao PegazusLog</h2><p>Bem-vindo, selecione uma opção</p>`;
  });

  if (btnTestImage) btnTestImage.addEventListener('click', () => { try { window.open('/mnt/data/ex qrcode.jpg', '_blank'); } catch (e) { alert('Imagem de teste não encontrada'); } });

  window.addEventListener('resize', () => { try { if (scanning) fitCanvases(); } catch (e) { } });

  /* ---------- TSP (nearest neighbor) & route display ---------- */
  function generateRouteAndShow() {
    if (!currentUser) return;
    if (!scanRecords.length) { alert('Nenhuma entrega para gerar rota'); return; }
    // nearest neighbor from CD_LOCATION
    let points = scanRecords.filter(r => r.lat && r.lon).map(r => ({ id: r.idEntrega, lat: parseFloat(r.lat), lon: parseFloat(r.lon), name: r.nomeCliente }));
    if (!points.length) { alert('Nenhum ponto com coordenadas'); return; }
    let route = [];
    let remaining = points.slice();
    let cur = { lat: CD_LOCATION.lat, lon: CD_LOCATION.lon };
    while (remaining.length) {
      let bestIdx = 0; let bestDist = Infinity;
      remaining.forEach((p, idx) => {
        const d = Math.hypot(p.lat - cur.lat, p.lon - cur.lon);
        if (d < bestDist) { bestDist = d; bestIdx = idx; }
      });
      const next = remaining.splice(bestIdx, 1)[0];
      route.push(next);
      cur = { lat: next.lat, lon: next.lon };
    }
    // show map and draw polyline
    contentArea.innerHTML = `<h2>🗺️ Rota Gerada</h2><div id="routeMap" style="height:60vh;border-radius:8px;margin-top:12px"></div>`;
    setTimeout(() => {
      try {
        const map = L.map('routeMap').setView([CD_LOCATION.lat, CD_LOCATION.lon], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        const coords = [[CD_LOCATION.lat, CD_LOCATION.lon]];
        L.marker([CD_LOCATION.lat, CD_LOCATION.lon]).addTo(map).bindPopup('Centro de Distribuição').openPopup();
        route.forEach(p => {
          coords.push([p.lat, p.lon]);
          L.marker([p.lat, p.lon]).addTo(map).bindPopup(`${p.id} • ${p.name || '—'}`);
        });
        L.polyline(coords, { color: 'orange' }).addTo(map);
        map.fitBounds(coords);
      } catch (e) { console.error('route map error', e); contentArea.innerHTML += '<p>Erro ao desenhar rota</p>'; }
    }, 60);
    if (btnBack) btnBack.style.display = 'block';
  }

  /* ---------- mock sync (REST) ---------- */
  let syncing = false;
  async function syncToServer() {
    if (syncing) return;
    syncing = true; updateSyncIndicator();
    try {
      // Mock: post the latest 10 records to a fake endpoint (jsonplaceholder)
      const payload = { records: scanRecords.slice(0, 10) };
      await new Promise(r => setTimeout(r, 800)); // small artificial delay
      // assume success; (if you want to actually test, replace with fetch to real endpoint)
      // const res = await fetch('https://jsonplaceholder.typicode.com/posts', { method: 'POST', body: JSON.stringify(payload) });
      // await res.json();
      showFeedback('Sincronização concluída', true, 1500);
    } catch (e) {
      showFeedback('Falha na sincronização', false, 1600);
    } finally { syncing = false; updateSyncIndicator(); }
  }
  function updateSyncIndicator() {
    if (!syncDot || !syncText) return;
    if (syncing) { syncDot.classList.add('syncing'); syncText.textContent = 'sincronizando'; }
    else { syncDot.classList.remove('syncing'); syncText.textContent = 'offline'; }
  }
  // wire a periodic sync (mock)
  setInterval(() => { if (currentUser) syncToServer(); }, 1000 * 60 * 3); // every 3 min

  /* ---------- initial render & helpers ---------- */
  function renderInitialWelcome() {
    // show sidebar hidden until login
    sidebar.style.display = 'none';
    contentArea.innerHTML = `<h2>Bem-vindo ao PegazusLog</h2><p>Bem-vindo, selecione uma opção</p>`;
    btnBack.style.display = 'none';
  }

  renderScans();
  renderInitialWelcome();
  if (feedbackMessage) feedbackMessage.textContent = '';
  updateSyncIndicator();

  // expose debug & functions
  window._pegazus = {
    startScanner, stopScanner, getScans: () => scanRecords.slice(), getUsers: () => users.slice(), doLogin, syncToServer
  };

});
