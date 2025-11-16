// app.js — Scanner com extração de ID do QR, beep, vibração e export CSV compatível Excel
// Requisitos: colocar app.js ao lado do index.html

(() => {
  const video = document.getElementById('videoElement');
  const overlay = document.getElementById('overlay');
  const output = document.getElementById('output');
  const scansList = document.getElementById('scansList');
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const overlayCtx = overlay.getContext('2d');

  let mediaStream = null;
  let rafId = null;
  let scanning = false;
  let lastScanTime = 0;
  const SCAN_INTERVAL = 1000; // ms entre leituras
  const DUPLICATE_WINDOW = 60 * 1000; // 1 minuto para duplicatas
  const STORAGE_KEY = 'scannedPackages_v1';
  let scannedData = loadScannedData();

  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  // beep simples via WebAudio
  function beep(duration = 120, frequency = 1200, volume = 0.12) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = frequency;
      g.gain.value = volume;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        try { ctx.close(); } catch (e) {}
      }, duration);
    } catch (e) { console.warn('Beep não disponível:', e); }
  }

  function logOutput(msg) { output.textContent = msg; }

  function saveScannedData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedData)); }
    catch (e) { console.warn('Falha ao salvar localStorage', e); }
  }

  function loadScannedData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) { console.warn('Falha ao carregar localStorage', e); return []; }
  }

  function addScan(entry) {
    scannedData.unshift(entry);
    saveScannedData();
    renderScans();
  }

  function isLinkFromPlatform(link) {
    if (!link) return 'Outra';
    const l = link.toLowerCase();
    if (l.includes('shopee.')) return 'Shopee';
    if (l.includes('mercadolivre.') || l.includes('mercadolibre')) return 'Mercado Livre';
    return 'Outra';
  }

  function isDuplicate(link) {
    const now = Date.now();
    return scannedData.some(item => item.link === link && (now - item.timestamp) < DUPLICATE_WINDOW);
  }

  function renderScans() {
    scansList.innerHTML = '';
    if (scannedData.length === 0) {
      scansList.innerHTML = '<div style="color:var(--muted)">Nenhum registro ainda.</div>';
      return;
    }
    scannedData.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'item';
      const idBadge = item.extractedId && item.extractedId.value ? `<div class="badge">${escapeHtml(item.extractedId.type)}: ${escapeHtml(item.extractedId.value)}</div>` : '';
      const qrBadge = item.qrId && item.qrId.value ? `<div class="badge" title="ID extraído do conteúdo do QR">QR: ${escapeHtml(item.qrId.value)}</div>` : '';
      el.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center">
          <div class="badge">${item.plataforma}</div>
          ${qrBadge}
          ${idBadge}
          <div style="font-size:14px;word-break:break-all">${escapeHtml(item.link)}</div>
          <div class="actions" style="margin-left:auto">
            <button data-idx="${idx}" style="background:#007bff;padding:6px 8px;border-radius:6px;font-size:13px">Abrir</button>
          </div>
        </div>
        <div class="meta">${item.dataHora}</div>
      `;
      const btn = el.querySelector('button[data-idx]');
      btn.addEventListener('click', () => window.open(item.link, '_blank'));
      scansList.appendChild(el);
    });
  }

  function escapeHtml(s) {
    return (s + '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  async function startCamera() {
    if (scanning) return;
    logOutput('Solicitando permissão da câmera...');
    startButton.disabled = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      logOutput('Seu navegador não suporta getUserMedia.');
      startButton.disabled = false;
      return;
    }

    const constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = mediaStream;
      await video.play();
      scanning = true;
      startButton.style.display = 'none';
      stopButton.style.display = 'inline-block';
      logOutput('✅ Scanner ativo. Aponte a câmera para um QR code.');
      fitCanvases();
      rafId = requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error('Erro ao abrir câmera', err);
      startButton.disabled = false;
      let msg = 'Erro desconhecido ao acessar a câmera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') msg = '🛑 Permissão negada. Permita o uso da câmera.';
      else if (err.name === 'NotFoundError') msg = 'Câmera não encontrada.';
      else if (err.name === 'SecurityError') msg = 'Requer HTTPS ou localhost.';
      logOutput(msg);
    }
  }

  function stopCamera() {
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    scanning = false;
    video.pause();
    video.srcObject = null;
    startButton.disabled = false;
    startButton.style.display = 'inline-block';
    stopButton.style.display = 'none';
    overlayCtx.clearRect(0,0,overlay.width,overlay.height);
    logOutput('Scanner parado.');
  }

  function fitCanvases() {
    const vw = video.videoWidth || video.clientWidth || 640;
    const vh = video.videoHeight || video.clientHeight || 480;
    tempCanvas.width = vw;
    tempCanvas.height = vh;
    overlay.width = vw;
    overlay.height = vh;
  }

  function drawBoundingBox(location) {
    overlayCtx.clearRect(0,0,overlay.width,overlay.height);
    if (!location) return;
    overlayCtx.strokeStyle = 'rgba(0,200,83,0.9)';
    overlayCtx.lineWidth = Math.max(2, overlay.width / 200);
    overlayCtx.beginPath();
    overlayCtx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
    overlayCtx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
    overlayCtx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
    overlayCtx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
    overlayCtx.closePath();
    overlayCtx.stroke();
    overlayCtx.fillStyle = 'rgba(0,200,83,0.12)';
    overlayCtx.fill();
  }

  function scanLoop() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      try {
        if (tempCanvas.width !== video.videoWidth || tempCanvas.height !== video.videoHeight) fitCanvases();
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });

        if (code && code.data) {
          if (code.location) drawBoundingBox(code.location);
          const now = Date.now();
          if (now - lastScanTime >= SCAN_INTERVAL) {
            lastScanTime = now;
            const payload = (code.data || '').trim();
            handleScanResult(payload, code.location);
          }
        } else {
          overlayCtx.clearRect(0,0,overlay.width,overlay.height);
        }
      } catch (e) {
        console.error('Erro no processamento do frame', e);
      }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  // extrai ids de links (Shopee / Mercado Livre e fallback)
  function extractIdFromLink(link) {
    if (!link || typeof link !== 'string') return { type: null, value: null };
    const l = link.trim();
    const shopeePattern1 = /-i\.(\d+)\.(\d+)/i;
    const match1 = l.match(shopeePattern1);
    if (match1) return { type: 'shopee_item', value: match1[2], shopId: match1[1] };
    const shopeePattern2 = /shopee\.[^\/]+\/(?:product|products|item)\/(\d+)/i;
    const match2 = l.match(shopeePattern2);
    if (match2) return { type: 'shopee_item', value: match2[1] };
    const shopeePattern3 = /i\.(\d+)\.(\d+)/i;
    const match3 = l.match(shopeePattern3);
    if (match3) return { type: 'shopee_item', value: match3[2], shopId: match3[1] };
    const mlPattern1 = /ML[A-Z]*-?(\d+)/i;
    const matchMl1 = l.match(mlPattern1);
    if (matchMl1) return { type: 'mercadolivre_item', value: matchMl1[1] };
    const mlPattern2 = /\/(\d{6,})(?:[^\d]|$)/;
    const matchMl2 = l.match(mlPattern2);
    if (matchMl2) return { type: 'mercadolivre_item', value: matchMl2[1] };
    const orderPattern = /order[_\-\/]?(\d{6,})/i;
    const matchOrder = l.match(orderPattern);
    if (matchOrder) return { type: 'order', value: matchOrder[1] };
    const fallback = l.match(/(\d{6,})/);
    if (fallback) return { type: 'number', value: fallback[1] };
    return { type: null, value: null };
  }

  // extrai ID direto do payload do QR (parametros, id:, numeros longos, etc.)
  function extractQrId(payload) {
    if (!payload || typeof payload !== 'string') return { type: null, value: null };
    const p = payload.trim();
    const kvPatterns = [
      /(?:qr[_\-]?id|qrid|id|codigo|cod|codigo_id|qrCodeId)[:=]\s*([A-Za-z0-9\-_]+)/i,
      /(?:idPedido|pedido_id|order_id|order)[:=]\s*([A-Za-z0-9\-_]+)/i
    ];
    for (const re of kvPatterns) {
      const m = p.match(re);
      if (m) return { type: 'qr_field', value: m[1] };
    }
    try {
      const url = new URL(p);
      const qp = ['id','qrid','qr_id','codigo','code','itemId','orderId','order_id'];
      for (const k of qp) {
        if (url.searchParams.has(k)) {
          const v = url.searchParams.get(k);
          if (v) return { type: `qr_param:${k}`, value: v };
        }
      }
    } catch (e) {}
    const numMatch = p.match(/([0-9]{6,})/);
    if (numMatch) return { type: 'numeric', value: numMatch[1] };
    if (p.length <= 64 && /[A-Za-z0-9\-_]{4,}/.test(p)) {
      const simple = p.split(/\s|;|,|\|/)[0];
      return { type: 'text', value: simple };
    }
    return { type: null, value: null };
  }

  function handleScanResult(payload, location) {
    if (!payload) { logOutput('QR detectado, mas vazio; ignorando.'); return; }
    if (isDuplicate(payload)) { logOutput('Código já escaneado recentemente.'); flashOutput('Já escaneado'); return; }

    const plataforma = isLinkFromPlatform(payload);
    const extractedId = extractIdFromLink(payload);
    const qrId = extractQrId(payload);

    const entry = {
      plataforma,
      link: payload,
      dataHora: new Date().toLocaleString('pt-BR'),
      timestamp: Date.now(),
      extractedId,
      qrId
    };

    addScan(entry);
    beep(120, 1200, 0.12);
    try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
    logOutput(`✅ Lido: ${plataforma} — QR_ID: ${qrId.value || 'N/A'} — salvo (${scannedData.length})`);
    flashOutput('Lido e salvo');
  }

  function flashOutput(text, ms = 900) {
    const prev = output.textContent;
    output.textContent = text;
    setTimeout(() => { output.textContent = prev; }, ms);
  }

  // CSV pronto para Excel: BOM + ponto-e-vírgula
  function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    const headers = ['Plataforma','Link_Completo','QR_ID_Tipo','QR_ID_Valor','ID_Tipo','ID_Valor','Data_Hora_Scan'];
    const rows = [headers.join(';')];
    data.forEach(item => {
      const safe = v => `"${String(v == null ? '' : v).replace(/"/g,'""')}"`;
      const qrType = item.qrId && item.qrId.type ? item.qrId.type : '';
      const qrValue = item.qrId && item.qrId.value ? item.qrId.value : '';
      const idType = item.extractedId && item.extractedId.type ? item.extractedId.type : '';
      const idValue = item.extractedId && item.extractedId.value ? item.extractedId.value : '';
      rows.push([safe(item.plataforma), safe(item.link), safe(qrType), safe(qrValue), safe(idType), safe(idValue), safe(item.dataHora)].join(';'));
    });
    return rows.join('\r\n');
  }

  function exportCSV() {
    if (!scannedData || scannedData.length === 0) { alert('Nenhum dado para exportar.'); return; }
    const data = scannedData.map(({plataforma,link,dataHora,extractedId,qrId}) => ({plataforma,link,dataHora,extractedId,qrId}));
    const csv = convertToCSV(data);
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    a.download = `scans_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function clearScans() {
    if (!confirm('Deseja apagar todos os registros salvos?')) return;
    scannedData = [];
    saveScannedData();
    renderScans();
    logOutput('Registros limpos.');
  }

  function init() {
    renderScans();
    if (startButton) startButton.addEventListener('click', startCamera);
    if (stopButton) stopButton.addEventListener('click', stopCamera);
    if (exportBtn) exportBtn.addEventListener('click', exportCSV);
    if (clearBtn) clearBtn.addEventListener('click', clearScans);
    window.addEventListener('resize', () => { if (video && video.videoWidth) fitCanvases(); });
    window._scanner = { startCamera, stopCamera, exportCSV, clearScans, getScans: () => scannedData };
  }

  init();
})();

