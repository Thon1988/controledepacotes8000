// app.js — Mobile-friendly scanner (iOS + Android) with accessibility fixes
// Modified so it works when the "Iniciar" button is removed:
// event listeners are attached only if elements exist.

(() => {
  const video = document.getElementById('videoElement');
  const overlay = document.getElementById('overlay');
  const output = document.getElementById('output');
  const scansList = document.getElementById('scansList');
  const startButton = document.getElementById('startButton'); // may be null (removed)
  const stopButton = document.getElementById('stopButton');
  const torchButton = document.getElementById('torchButton');
  const deviceSelect = document.getElementById('deviceSelect');
  const deviceSelectLabel = document.getElementById('deviceSelectLabel');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const scanPopup = document.getElementById('scanPopup');
  const overlayCtx = overlay.getContext('2d');

  let mediaStream = null;
  let rafId = null;
  let scanning = false;
  let lastScanTime = 0;
  const SCAN_INTERVAL = 700;
  const DUPLICATE_WINDOW = 60 * 1000;
  const STORAGE_KEY = 'scannedPackages_v1_mobile';
  let scannedData = loadScannedData();

  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  let currentVideoTrack = null;
  let torchOn = false;

  function beep(duration = 90, freq = 1400, vol = 0.12) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => { try { o.stop(); ctx.close(); } catch (e) {} }, duration);
    } catch (e) {}
  }

  function showPopup(text, ms = 900) {
    scanPopup.textContent = text; scanPopup.style.display = 'block';
    setTimeout(() => { scanPopup.style.display = 'none'; }, ms);
  }

  function logOutput(msg) { output.textContent = msg; console.info(msg); }

  function saveScannedData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedData)); } catch (e) { console.warn(e); } }
  function loadScannedData() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }

  function addScan(entry) { scannedData.unshift(entry); saveScannedData(); renderScans(); }

  function renderScans() {
    scansList.innerHTML = '';
    if (!scannedData.length) { scansList.innerHTML = '<div style="color:#666">Nenhum registro ainda.</div>'; return; }
    scannedData.forEach((item, idx) => {
      const el = document.createElement('div'); el.className = 'item';
      const idBadge = item.extractedId && item.extractedId.value ? `<div class="badge">${escapeHtml(item.extractedId.type)}: ${escapeHtml(item.extractedId.value)}</div>` : '';
      const qrBadge = item.qrId && item.qrId.value ? `<div class="badge">QR: ${escapeHtml(item.qrId.value)}</div>` : '';
      el.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center">
          <div class="badge">${escapeHtml(item.plataforma)}</div>
          ${qrBadge}
          ${idBadge}
          <div style="margin-left:8px;flex:1">
            <div class="link-text" title="${escapeHtml(item.link)}">${escapeHtml(item.link)}</div>
          </div>
          <div style="margin-left:8px">
            <button data-idx="${idx}" style="background:#00b4d8;color:#fff;padding:6px;border-radius:6px">Abrir</button>
          </div>
        </div>
        <div class="meta">${escapeHtml(item.dataHora)}</div>
      `;
      const btn = el.querySelector('button[data-idx]'); btn.addEventListener('click', () => window.open(item.link, '_blank'));
      scansList.appendChild(el);
    });
  }

  function escapeHtml(s) { return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  async function requestPermissionOnce() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('getUserMedia não suportado');
    const s = await navigator.mediaDevices.getUserMedia({ video: true }).catch(e => { throw e; });
    s.getTracks().forEach(t => t.stop());
    return true;
  }

  async function enumerateVideoDevices() {
    try { const devices = await navigator.mediaDevices.enumerateDevices(); return devices.filter(d => d.kind === 'videoinput'); } catch (e) { return []; }
  }

  function populateDeviceSelect(devices) {
    deviceSelect.innerHTML = '';
    if (!devices || devices.length === 0) { deviceSelect.style.display = 'none'; deviceSelectLabel.style.display = 'none'; return; }
    devices.forEach(d => { const opt = document.createElement('option'); opt.value = d.deviceId; opt.text = d.label || `Câmera ${deviceSelect.length + 1}`; deviceSelect.appendChild(opt); });
    deviceSelect.style.display = devices.length > 1 ? 'inline-block' : 'none';
    deviceSelectLabel.style.display = devices.length > 1 ? 'inline-block' : 'none';
  }

  async function startCamera() {
    if (scanning) return;
    logOutput('Solicitando permissão da câmera...');
    if (startButton) startButton.disabled = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { logOutput('getUserMedia não suportado neste navegador.'); if (startButton) startButton.disabled = false; return; }

    try {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (errFacing) {
        console.warn('facingMode falhou, tentando permissão + deviceId', errFacing);
        await requestPermissionOnce();
        const devices = await enumerateVideoDevices();
        populateDeviceSelect(devices);
        const rear = devices.find(d => /rear|back|traseira|environment|facing back/i.test(d.label));
        const chosen = deviceSelect.value || (rear ? rear.deviceId : (devices[0] && devices[0].deviceId));
        if (chosen) {
          try { mediaStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: chosen } }, audio: false }); } catch (e) { mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
        } else { mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      }

      video.srcObject = mediaStream;
      video.setAttribute('playsinline', '');
      await video.play().catch(() => {});

      currentVideoTrack = mediaStream.getVideoTracks()[0] || null;
      torchOn = false;
      if (currentVideoTrack && typeof currentVideoTrack.getCapabilities === 'function') {
        try { const caps = currentVideoTrack.getCapabilities(); if (caps && caps.torch) torchButton.style.display = 'inline-block'; else torchButton.style.display = 'none'; } catch (e) { torchButton.style.display = 'none'; }
      } else { torchButton.style.display = 'none'; }

      const devicesNow = await enumerateVideoDevices();
      populateDeviceSelect(devicesNow);

      scanning = true; if (startButton) startButton.style.display = 'none'; stopButton.style.display = 'inline-block';
      logOutput('✅ Scanner ativo — aponte para o QR.');
      if (video.readyState >= 1) fitCanvases(); else video.addEventListener('loadedmetadata', fitCanvases, { once: true });
      rafId = requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error('Erro ao abrir câmera:', err);
      if (startButton) startButton.disabled = false;
      let msg = 'Erro ao acessar a câmera. Ver console.';
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) msg = '🛑 Permissão negada. Permita a câmera nas configurações do navegador.';
      else if (err && err.name === 'NotFoundError') msg = 'Câmera não encontrada.';
      else if (err && err.name === 'OverconstrainedError') msg = 'Configurações de câmera não suportadas.';
      else if (err && err.name === 'SecurityError') msg = 'Requer HTTPS (use GitHub Pages) ou localhost.';
      logOutput(msg);
    }
  }

  async function toggleTorch() {
    if (!currentVideoTrack) return;
    try { torchOn = !torchOn; await currentVideoTrack.applyConstraints({ advanced: [{ torch: torchOn }] }); torchButton.textContent = torchOn ? '🔦 On' : '🔦 Flash'; } catch (e) { logOutput('Flash não suportado neste dispositivo.'); }
  }

  function stopCamera() {
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null; currentVideoTrack = null;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null; scanning = false; video.pause(); video.srcObject = null;
    if (startButton) startButton.disabled = false;
    if (startButton) startButton.style.display = 'inline-block';
    stopButton.style.display = 'none'; torchButton.style.display = 'none'; deviceSelect.style.display = 'none'; deviceSelectLabel.style.display = 'none';
    overlayCtx.clearRect(0,0,overlay.width,overlay.height);
    logOutput('Scanner parado.');
  }

  function fitCanvases() {
    const vw = video.videoWidth || video.clientWidth || 640; const vh = video.videoHeight || video.clientHeight || 480;
    const targetW = Math.min(1024, Math.max(320, Math.round(vw * 0.6))); const targetH = Math.round((vh / vw) * targetW) || 480;
    tempCanvas.width = targetW; tempCanvas.height = targetH; overlay.width = vw; overlay.height = vh; drawBoundingBox(null);
  }

  function drawBoundingBox(location) {
    overlayCtx.clearRect(0,0,overlay.width,overlay.height);
    if (!location) { const w = overlay.width, h = overlay.height; const boxW = Math.round(w * 0.62), boxH = Math.round(h * 0.5); const x = Math.round((w - boxW) / 2), y = Math.round((h - boxH) / 2);
      overlayCtx.strokeStyle = 'rgba(255,255,255,0.35)'; overlayCtx.lineWidth = 3; overlayCtx.strokeRect(x, y, boxW, boxH); return;
    }
    overlayCtx.strokeStyle = 'rgba(0,200,83,0.95)'; overlayCtx.lineWidth = Math.max(2, overlay.width / 200);
    overlayCtx.beginPath(); overlayCtx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y); overlayCtx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
    overlayCtx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y); overlayCtx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
    overlayCtx.closePath(); overlayCtx.stroke(); overlayCtx.fillStyle = 'rgba(0,200,83,0.14)'; overlayCtx.fill();
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
          if (code.location) {
            const scaleX = sw / tempCanvas.width; const scaleY = sh / tempCanvas.height;
            const mapCorner = (pt) => ({ x: Math.round(pt.x * scaleX + sx), y: Math.round(pt.y * scaleY + sy) });
            const loc = { topLeftCorner: mapCorner(code.location.topLeftCorner), topRightCorner: mapCorner(code.location.topRightCorner), bottomLeftCorner: mapCorner(code.location.bottomLeftCorner), bottomRightCorner: mapCorner(code.location.bottomRightCorner) };
            drawBoundingBox(loc);
          } else { drawBoundingBox(null); }
          const now = Date.now();
          if (now - lastScanTime >= SCAN_INTERVAL) { lastScanTime = now; const payload = (code.data || '').trim(); handleScanResult(payload); }
        } else { drawBoundingBox(null); }
      } catch (e) { console.error('Erro no processamento do frame', e); }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  function extractIdFromLink(link) {
    if (!link || typeof link !== 'string') return { type: null, value: null };
    const l = link.trim();
    const shopeePattern1 = /-i\.(\d+)\.(\d+)/i; const m1 = l.match(shopeePattern1); if (m1) return { type: 'shopee_item', value: m1[2], shopId: m1[1] };
    const shopeePattern2 = /shopee\.[^\/]+\/(?:product|products|item)\/(\d+)/i; const m2 = l.match(shopeePattern2); if (m2) return { type: 'shopee_item', value: m2[1] };
    const mlPattern1 = /ML[A-Z]*-?(\d+)/i; const m3 = l.match(mlPattern1); if (m3) return { type: 'mercadolivre_item', value: m3[1] };
    const mlPattern2 = /\/(\d{6,})(?:[^\d]|$)/; const m4 = l.match(mlPattern2); if (m4) return { type: 'mercadolivre_item', value: m4[1] };
    const orderPattern = /order[_\-\/]?(\d{6,})/i; const m5 = l.match(orderPattern); if (m5) return { type: 'order', value: m5[1] };
    const fallback = l.match(/(\d{6,})/); if (fallback) return { type: 'number', value: fallback[1] };
    return { type: null, value: null };
  }

  function extractQrId(payload) {
    if (!payload || typeof payload !== 'string') return { type: null, value: null };
    const p = payload.trim(); const kv = [/(?:qr[_\-]?id|qrid|id|codigo|cod|codigo_id|qrCodeId)[:=]\s*([A-Za-z0-9\-_]+)/i, /(?:idPedido|pedido_id|order_id|order)[:=]\s*([A-Za-z0-9\-_]+)/i];
    for (const re of kv) { const m = p.match(re); if (m) return { type: 'qr_field', value: m[1] }; }
    try { const url = new URL(p); const qp = ['id','qrid','qr_id','codigo','code','itemId','orderId','order_id']; for (const k of qp) if (url.searchParams.has(k)) return { type: `qr_param:${k}`, value: url.searchParams.get(k) }; } catch (e) {}
    const num = p.match(/([0-9]{6,})/); if (num) return { type: 'numeric', value: num[1] };
    if (p.length <= 64 && /[A-Za-z0-9\-_]{4,}/.test(p)) return { type: 'text', value: p.split(/\s|;|,|\|/)[0] };
    return { type: null, value: null };
  }

  async function handleScanResult(payload) {
    if (!payload) return;
    if (scannedData.some(item => item.link === payload && (Date.now() - item.timestamp) < DUPLICATE_WINDOW)) { logOutput('Já escaneado recentemente.'); showPopup('Já escaneado'); return; }
    const plataforma = (() => { const l = payload.toLowerCase(); if (l.includes('shopee.')) return 'Shopee'; if (l.includes('mercadolivre.')||l.includes('mercadolibre')) return 'Mercado Livre'; return 'Outra'; })();
    const extractedId = extractIdFromLink(payload); const qrId = extractQrId(payload);
    const entry = { plataforma, link: payload, dataHora: new Date().toLocaleString('pt-BR'), timestamp: Date.now(), extractedId, qrId };
    addScan(entry);
    beep(); try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
    showPopup(`OK • ${qrId.value || extractedId.value || 'salvo'}`);
    try { await navigator.clipboard.writeText(qrId.value || extractedId.value || payload); logOutput('Copiado para área de transferência.'); } catch (e) {}
    logOutput(`Lido: ${plataforma} • ${qrId.value || extractedId.value || ''}`);
  }

  // attach only if elements exist (startButton may be removed)
  function init() {
    renderScans();
    if (startButton) startButton.addEventListener('click', startCamera);
    if (stopButton) stopButton.addEventListener('click', stopCamera);
    if (torchButton) torchButton.addEventListener('click', toggleTorch);
    if (exportBtn) exportBtn.addEventListener('click', exportCSV);
    if (clearBtn) clearBtn.addEventListener('click', clearScans);
    if (deviceSelect) deviceSelect.addEventListener('change', async () => {
      const id = deviceSelect.value; if (!id) return;
      try { stopCamera(); mediaStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id } }, audio: false }); video.srcObject = mediaStream; await video.play(); currentVideoTrack = mediaStream.getVideoTracks()[0] || null; fitCanvases(); scanning = true; rafId = requestAnimationFrame(scanLoop); if (startButton) startButton.style.display = 'none'; if (stopButton) stopButton.style.display = 'inline-block'; logOutput('Usando câmera selecionada.'); } catch (e) { console.warn('Falha ao selecionar deviceId', e); logOutput('Falha ao usar câmera selecionada.'); }
    });
    window.addEventListener('resize', () => { if (video && video.videoWidth) fitCanvases(); });
    drawBoundingBox(null);
    window._scanner = { startCamera, stopCamera, exportCSV, clearScans, getScans: () => scannedData };
  }

  init();
})();



