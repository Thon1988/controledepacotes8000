/* app.js — Versão final integrada (cole em app.js) */
document.addEventListener('DOMContentLoaded', () => {
  /* -------------------- Constantes / Estado -------------------- */
  const STORAGE_KEY_USERS = 'pegazus_users_v4';
  const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
  const STORAGE_KEY_SHIPMENTS = 'pegazus_shipments_v1';
  const DEFAULT_USERS = [
    { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
    { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
    { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
  ];
  const CD_LOCATION = { lat: -23.5505, lon: -46.6333 };

  let currentUser = null;
  let users = loadUsers();
  let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
  let shipments = JSON.parse(localStorage.getItem(STORAGE_KEY_SHIPMENTS) || '{}');

  let videoStream = null, videoTrack = null, isScanning = false;
  let mapInstance = null, locationMarker = null;
  let userLocation = null;
  const SCAN_DELAY = 1000;
  let lastScanCode = '', lastScanTime = 0;

  /* -------------------- DOM refs -------------------- */
  const dom = {
    loginSection: document.getElementById('loginSection'),
    appContainer: document.querySelector('.app'),
    contentArea: document.getElementById('contentArea'),
    cameraView: document.getElementById('cameraView'),
    video: document.getElementById('videoElement'),
    sidebar: document.getElementById('sidebar'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    feedback: document.getElementById('feedbackMsg'),
    cameraSelect: document.getElementById('cameraSelect'),
    adminMenuOptions: document.getElementById('adminMenuOptions'),
    btnGenerateCSV: document.getElementById('btnGenerateCSV'),
    exportUserFilter: document.getElementById('exportUserFilter'),
    exportPeriod: document.getElementById('exportPeriod'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    manualInput: document.getElementById('manualInput'),
    manualCancel: document.getElementById('manualCancel'),
    manualSave: document.getElementById('manualSave'),
    btnCloseCamera: document.getElementById('btnCloseCamera'),
    btnTorch: document.getElementById('btnTorch'),
    btnManual: document.getElementById('btnManual'),
    btnGenerateCSV_raw: document.getElementById('btnGenerateCSV') // alias
  };

  /* -------------------- Storage helpers -------------------- */
  function loadUsers() {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS.slice();
    }
    const existing = JSON.parse(raw);
    // ensure default admin exists and credentials match the default password/role
    const hasThon = existing.some(u => u.username === 'thon');
    if (!hasThon) existing.push(DEFAULT_USERS[0]);
    else {
      const i = existing.findIndex(u => u.username === 'thon');
      existing[i].password = DEFAULT_USERS[0].password;
      existing[i].role = DEFAULT_USERS[0].role;
    }
    return existing;
  }
  function saveUsers(){ localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users)); }
  function saveScans(){ localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords)); }
  function saveShipments(){ localStorage.setItem(STORAGE_KEY_SHIPMENTS, JSON.stringify(shipments)); }

  /* -------------------- Geolocation -------------------- */
  function startGeolocation(){
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.watchPosition(pos => {
      userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (mapInstance) updateMapLocation();
    }, err => {
      console.warn('Geolocation error', err.message);
      userLocation = null;
    }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 });
  }

  /* -------------------- Login / Logout -------------------- */
  document.getElementById('btnLogin').addEventListener('click', () => {
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value.trim();
    const found = users.find(x => x.username === u && x.password === p);
    if (found) {
      currentUser = found;
      document.getElementById('displayUser').textContent = `${found.username} (${found.role})`;
      dom.loginSection.classList.add('hidden');
      dom.appContainer.classList.remove('hidden');
      if (window.innerWidth <= 768) dom.mobileMenuBtn.classList.remove('hidden');
      if (currentUser.role === 'admin' || currentUser.role === 'gestor') dom.adminMenuOptions.classList.remove('hidden');
      else dom.adminMenuOptions.classList.add('hidden');
      renderDashboard();
      document.getElementById('loginError').textContent = '';
      startGeolocation();
    } else {
      document.getElementById('loginError').textContent = 'Credenciais inválidas';
    }
  });

  document.getElementById('btnLogout').addEventListener('click', () => {
    currentUser = null;
    stopScanner();
    dom.appContainer.classList.add('hidden');
    dom.loginSection.classList.remove('hidden');
    dom.mobileMenuBtn.classList.add('hidden');
    dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.6"><h2>Até logo</h2></div>`;
  });

  /* -------------------- Navigation helpers -------------------- */
  window.toggleSidebar = () => dom.sidebar.classList.toggle('active');
  document.getElementById('btnDashboard').addEventListener('click', () => { setActiveMenu('btnDashboard'); renderDashboard(); });
  document.getElementById('btnScanMode').addEventListener('click', () => { setActiveMenu('btnScanMode'); openCameraView(); });
  document.getElementById('btnDeliveries').addEventListener('click', () => { setActiveMenu('btnDeliveries'); renderDeliveries(); });
  document.getElementById('btnMap').addEventListener('click', () => { setActiveMenu('btnMap'); renderMap(); });
  document.getElementById('btnRoutes').addEventListener('click', () => { setActiveMenu('btnRoutes'); renderRoutes(); });
  document.getElementById('btnUsers').addEventListener('click', () => { setActiveMenu('btnUsers'); renderUsers(); });

  function setActiveMenu(id) {
    Array.from(document.querySelectorAll('.menu-item')).forEach(el => el.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  /* -------------------- Camera / Scanner -------------------- */
  dom.cameraSelect.addEventListener('change', (e) => { if (isScanning) startScanner(e.target.value); });

  async function enumerateDevices() {
    try {
      const initial = await navigator.mediaDevices.getUserMedia({ video: true });
      initial.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      dom.cameraSelect.innerHTML = '';
      if (videoDevices.length) {
        videoDevices.forEach((d, i) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.text = d.label || `Câmera ${i+1}`;
          dom.cameraSelect.appendChild(opt);
        });
        dom.cameraSelect.classList.remove('hidden');
      } else {
        dom.cameraSelect.classList.add('hidden');
      }
    } catch (err) {
      console.warn('enumerateDevices failed', err);
      dom.cameraSelect.classList.add('hidden');
    }
  }

  async function startScanner(deviceId = null) {
    if (isScanning && !deviceId) return;
    stopScanner();
    const options = Array.from(dom.cameraSelect.options);
    let target = deviceId;
    if (!target && options.length > 0) {
      const pref = options.find(o => /back|traseira|environment/i.test(o.text));
      target = pref ? pref.value : options[0].value;
    }

    const constraints = target
      ? { video: { deviceId: { exact: target } } }
      : { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } };

    try {
      videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      dom.video.srcObject = videoStream;
      dom.video.setAttribute('playsinline', true);
      await dom.video.play();
      isScanning = true;
      videoTrack = videoStream.getVideoTracks()[0];
      if (target) dom.cameraSelect.value = target;
      requestAnimationFrame(tick);
    } catch (err) {
      console.error('startScanner err', err);
      alert('Erro ao acessar câmera: ' + (err.message || err));
      closeCameraView();
      renderDashboard();
    }
  }

  function stopScanner() {
    isScanning = false;
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
    if (dom.video) dom.video.srcObject = null;
    videoTrack = null;
  }

  function openCameraView() {
    removeMapIfExists();
    dom.contentArea.style.display = 'none';
    dom.cameraView.style.display = 'flex';
    dom.appContainer.style.display = 'none';
    // small UI animation
    dom.cameraView.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    startScanner();
  }
  function closeCameraView() {
    dom.cameraView.style.display = 'none';
    dom.appContainer.style.display = 'grid';
    dom.contentArea.style.display = 'block';
  }

  function tick() {
    if (!isScanning) return;
    if (dom.video.readyState === dom.video.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const w = dom.video.videoWidth;
      const h = dom.video.videoHeight;
      if (!w || !h) { requestAnimationFrame(tick); return; }
      canvas.width = w; canvas.height = h;
      ctx.drawImage(dom.video, 0, 0, w, h);
      const size = Math.min(w, h) * 0.9;
      const sx = (w - size) / 2, sy = (h - size) / 2;
      try {
        const imageData = ctx.getImageData(sx, sy, size, size);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) handleScannedTracking(code.data.trim());
      } catch (err) {
        // some browsers may throw if cross origin or zero sized
      }
    }
    requestAnimationFrame(tick);
  }

  /* Torch toggle */
  dom.btnTorch && dom.btnTorch.addEventListener('click', async () => {
    if (!videoTrack) return alert('Câmera não iniciada.');
    try {
      const caps = videoTrack.getCapabilities();
      if (!caps.torch) return alert('Flash não suportado neste dispositivo.');
      const settings = videoTrack.getSettings();
      const current = settings.torch || false;
      await videoTrack.applyConstraints({ advanced: [{ torch: !current }] });
    } catch (e) { console.warn('torch err', e); alert('Não foi possível alternar o flash.'); }
  });

  /* -------------------- Manual modal -------------------- */
  dom.btnManual && dom.btnManual.addEventListener('click', () => {
    dom.modalBackdrop.style.display = 'flex';
    dom.modalBackdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    dom.manualInput.value = '';
    dom.manualInput.focus();
    dom.modalBackdrop.setAttribute('aria-hidden', 'false');
  });
  dom.manualCancel && dom.manualCancel.addEventListener('click', () => closeManualModal());
  dom.manualSave && dom.manualSave.addEventListener('click', () => {
    const v = (dom.manualInput.value || '').trim();
    if (!v) return alert('Insira um código de rastreio.');
    handleScannedTracking(v);
    closeManualModal();
    // se estiver em tela de entregas, atualiza
    if (document.getElementById('btnDeliveries').classList.contains('active')) renderDeliveries();
  });
  function closeManualModal() {
    dom.modalBackdrop.style.display = 'none';
    dom.modalBackdrop.setAttribute('aria-hidden', 'true');
  }

  /* quick close camera button */
  dom.btnCloseCamera && dom.btnCloseCamera.addEventListener('click', () => {
    stopScanner();
    closeCameraView();
    renderDashboard();
  });

  /* -------------------- Scan handling -------------------- */
  function handleScannedTracking(raw) {
    const now = Date.now();
    if (raw === lastScanCode && (now - lastScanTime) < SCAN_DELAY) return;
    lastScanCode = raw; lastScanTime = now;

    const tracking = raw.split(/\s/)[0].toUpperCase(); // BR1234...
    const details = lookupShipment(tracking);
    const record = {
      id: tracking,
      tracking,
      date: new Date().toISOString(),
      user: currentUser ? currentUser.username : 'unknown',
      type: details.carrier || 'Genérico',
      endereco: details.address || 'Endereço desconhecido',
      telefone: details.phone || '',
      cliente: details.name || '',
      raw
    };
    scanRecords.unshift(record);
    saveScans();
    beep();
    showScanFeedback(record);
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 1000;
      g.gain.value = 0.06;
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 110);
    } catch (e) { /* ignore */ }
  }

  function showScanFeedback(record) {
    dom.feedback.textContent = `Leitura: ${record.tracking} — ${record.cliente || record.endereco || ''}`;
    dom.feedback.style.opacity = '1';
    // overlay pulse
    const overlay = document.querySelector('.scan-overlay');
    if (overlay) {
      overlay.style.borderColor = 'var(--success)';
      setTimeout(() => overlay.style.borderColor = 'rgba(255,255,255,0.5)', 350);
    }
    setTimeout(() => dom.feedback.style.opacity = '0', 2000);
  }

  /* -------------------- Shipments DB (local) -------------------- */
  function lookupShipment(tracking) {
    if (shipments[tracking]) return shipments[tracking];
    shipments[tracking] = {
      tracking,
      name: '',
      address: 'Endereço desconhecido',
      phone: '',
      carrier: ''
    };
    saveShipments();
    return shipments[tracking];
  }
  window.lookupShipment = lookupShipment;

  window.editShipment = (tracking) => {
    const s = lookupShipment(tracking);
    const name = prompt('Nome do cliente:', s.name || '');
    if (name === null) return;
    const addr = prompt('Endereço completo:', s.address || '');
    if (addr === null) return;
    const phone = prompt('Telefone:', s.phone || '');
    if (phone === null) return;
    s.name = name; s.address = addr; s.phone = phone;
    shipments[tracking] = s;
    saveShipments();
    // update past scan records
    scanRecords = scanRecords.map(r => r.tracking === tracking ? ({ ...r, cliente: s.name, endereco: s.address, telefone: s.phone }) : r);
    saveScans();
    renderDeliveries();
    alert('Dados do rastreio atualizados.');
  };

  /* -------------------- Renderers -------------------- */
  function renderDashboard() {
    removeMapIfExists();
    dom.appContainer.style.display = 'grid';
    dom.cameraView.style.display = 'none';
    dom.contentArea.style.display = 'block';

    const html = `
      <div class="view-header">
        <h2>📦 Entregas Realizadas</h2>
        <button class="close-btn" title="Atualizar" onclick="window.renderDashboard()">🔄</button>
      </div>
      <p class="small-muted">Total de registros: ${scanRecords.length}</p>
      <div class="card" style="margin-top:12px; padding:12px; transition:all .18s ease">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          <button class="btn-primary" onclick="window.openCameraProgramatic()">Iniciar Scanner</button>
          <button class="btn-secondary" onclick="renderDeliveries()">Ver Lista</button>
          <div style="margin-left:auto" class="small-muted">Usuário: ${currentUser ? currentUser.username : '-'}</div>
        </div>
        <div class="deliveries-list">
          ${scanRecords.slice(0, 10).map((r, idx) => `
            <div class="delivery-item" style="align-items:flex-start; animation: fadeIn .18s;">
              <div style="width:48px;text-align:center">
                <div style="width:36px;height:36px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;color:#000">${idx+1}</div>
              </div>
              <div style="flex:1">
                <div style="font-weight:700">${r.tracking} <span style="color:#6b7280;font-weight:500"> — ${r.cliente || 'Sem nome'}</span></div>
                <div class="delivery-meta">${r.type} • ${new Date(r.date).toLocaleString()}</div>
                <div style="color:#6b7280;font-size:13px;margin-top:6px">${r.endereco || ''}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <button class="btn-secondary" onclick="viewDeliveryDetail('${r.tracking}')">Ver</button>
                <button class="btn-secondary" onclick="window.editShipment('${r.tracking}')">Editar</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    dom.contentArea.innerHTML = html;
  }

  window.openCameraProgramatic = () => { setActiveMenu('btnScanMode'); openCameraView(); }

  function renderDeliveries() {
    removeMapIfExists();
    dom.appContainer.style.display = 'grid';
    dom.cameraView.style.display = 'none';
    dom.contentArea.style.display = 'block';

    const html = `
      <div style="position:relative">
        <div class="view-header">
          <h2>📋 Lista de Entregas</h2>
          <button class="close-btn" title="Fechar" onclick="renderDashboard()">✕</button>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <input id="searchDelivery" placeholder="Buscar por rastreio, cliente ou endereço" style="padding:8px;border-radius:8px;border:1px solid #ddd;flex:1"/>
          <button class="btn-primary" id="btnNewManual">+ Novo (Manual)</button>
        </div>
        <div id="deliveriesList" class="deliveries-list">
          ${scanRecords.map((r, i) => `
            <div class="delivery-item" data-tracking="${r.tracking}">
              <div style="width:48px;text-align:center">
                <div style="width:36px;height:36px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-weight:700;color:#111">${i+1}</div>
              </div>
              <div style="flex:1">
                <div style="font-weight:700">${r.tracking} <span style="color:#6b7280;font-weight:500"> — ${r.cliente || 'Sem Nome'}</span></div>
                <div class="delivery-meta">${r.type} • ${new Date(r.date).toLocaleString()}</div>
                <div style="color:#6b7280;font-size:13px;margin-top:6px">${r.endereco || ''}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <button class="btn-secondary" onclick="viewDeliveryDetail('${r.tracking}')">Ver</button>
                <button class="btn-secondary" onclick="window.editShipment('${r.tracking}')">Editar</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div id="deliveryDetailArea"></div>
    `;
    dom.contentArea.innerHTML = html;

    // attach events
    document.getElementById('btnNewManual').addEventListener('click', () => {
      dom.modalBackdrop.style.display = 'flex';
      dom.modalBackdrop.setAttribute('aria-hidden', 'false');
      dom.manualInput.value = '';
      dom.manualInput.focus();
    });

    const searchInput = document.getElementById('searchDelivery');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const nodes = document.querySelectorAll('#deliveriesList .delivery-item');
      nodes.forEach(node => {
        const t = node.dataset.tracking.toLowerCase();
        const rec = scanRecords.find(r => r.tracking === node.dataset.tracking);
        const text = `${t} ${rec.endereco || ''} ${rec.cliente || ''}`.toLowerCase();
        node.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });
  }

  window.viewDeliveryDetail = (tracking) => {
    const rec = scanRecords.find(r => r.tracking === tracking);
    if (!rec) return alert('Registro não encontrado.');
    const html = `
      <div class="card" style="margin-top:12px; position:relative">
        <button class="close-btn" onclick="document.getElementById('deliveryDetailArea').innerHTML = ''">✕</button>
        <h3>${rec.tracking} <small style="color:#6b7280">(${rec.type})</small></h3>
        <p><strong>Cliente:</strong> ${rec.cliente || '—'}</p>
        <p><strong>Endereço:</strong> ${rec.endereco || '—'}</p>
        <p><strong>Telefone:</strong> ${rec.telefone || '—'}</p>
        <p><strong>Usuário:</strong> ${rec.user}</p>
        <p><strong>Data:</strong> ${new Date(rec.date).toLocaleString()}</p>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn-primary" onclick="window.editShipment('${rec.tracking}')">Editar Dados</button>
          <button class="btn-secondary" onclick="centerMapToRecord('${rec.tracking}')">Mostrar no Mapa</button>
        </div>
      </div>
    `;
    const area = document.getElementById('deliveryDetailArea');
    area.innerHTML = html;
    area.scrollIntoView({ behavior: 'smooth' });
  };

  function renderUsers() {
    removeMapIfExists();
    dom.contentArea.innerHTML = `
      <div class="view-header">
        <h2>👥 Gerenciamento de Usuários</h2>
        <button class="close-btn" onclick="renderDashboard()">✕</button>
      </div>
      <div class="card" style="padding:12px">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <input id="userSearch" placeholder="Buscar por usuário/role" style="padding:8px;border-radius:8px;border:1px solid #ddd;flex:1" />
          <button class="btn-primary" id="btnNewUser">+ Novo Usuário</button>
        </div>
        <div id="userList" style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto">
          ${users.map(u => `
            <div class="delivery-item" style="align-items:center">
              <div style="width:48px;text-align:center">
                <div style="width:36px;height:36px;border-radius:999px;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-weight:700;color:#0f172a">${u.username[0].toUpperCase()}</div>
              </div>
              <div style="flex:1">
                <div style="font-weight:700">${u.username}</div>
                <div style="color:#6b7280;font-size:13px">${u.role} ${u.creatorId ? '• criado por ' + u.creatorId : ''}</div>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn-secondary" onclick="window.editUser('${u.id}')">Editar</button>
                ${u.id !== currentUser.id ? `<button class="btn-secondary" onclick="window.deleteUser('${u.id}')">Excluir</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('btnNewUser').addEventListener('click', () => window.editUser(null));
    document.getElementById('userSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const nodes = document.querySelectorAll('#userList .delivery-item');
      nodes.forEach(n => {
        const text = n.innerText.toLowerCase();
        n.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });
  }

  function renderRoutes() {
    removeMapIfExists();
    dom.contentArea.innerHTML = `
      <div class="view-header"><h2>🧭 Otimizar Rotas</h2><button class="close-btn" onclick="renderDashboard()">✕</button></div>
      <div class="card"><p style="color:#6b7280">Gerando uma simulação com os últimos pontos...</p><div id="routeMapObj" style="height:60vh;border-radius:8px;overflow:hidden"></div></div>
    `;
    setTimeout(() => {
      const points = scanRecords.map(r => ({ lat: r.lat || CD_LOCATION.lat, lon: r.lon || CD_LOCATION.lon, id: r.tracking }));
      if (points.length < 2) {
        document.getElementById('routeMapObj').innerHTML = '<p style="color:#6b7280;padding:12px">Escaneie ao menos 2 entregas para simular rota.</p>';
        return;
      }
      const route = points.slice(0, 10).sort(() => Math.random() - 0.5);
      removeMapIfExists();
      mapInstance = L.map('routeMapObj').setView([route[0].lat, route[0].lon], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(mapInstance);
      const routePts = route.map((p, i) => {
        L.marker([p.lat, p.lon]).addTo(mapInstance).bindPopup(`<b>Ponto ${i+1}</b><br>${p.id}`);
        return [p.lat, p.lon];
      });
      if (routePts.length > 1) {
        const pl = L.polyline(routePts, { color: '#22c55e', weight: 5 }).addTo(mapInstance);
        mapInstance.fitBounds(pl.getBounds());
      }
    }, 120);
  }

  function renderMap() {
    removeMapIfExists();
    dom.contentArea.style.display = 'block';
    dom.cameraView.style.display = 'none';
    dom.appContainer.style.display = 'grid';

    dom.contentArea.innerHTML = `
      <div style="position:relative">
        <div class="view-header">
          <h2>🗺️ Mapa de Entregas</h2>
          <button class="close-btn" onclick="renderDashboard()">✕</button>
        </div>
      </div>
      <div class="card">
        <p style="color:#6b7280">Você está aqui: <span id="currentLoc">Carregando...</span></p>
        <div id="mapObj" style="height:60vh;border-radius:8px;overflow:hidden"></div>
      </div>
    `;

    setTimeout(() => {
      const lat = userLocation ? userLocation.lat : CD_LOCATION.lat;
      const lon = userLocation ? userLocation.lon : CD_LOCATION.lon;
      mapInstance = L.map('mapObj').setView([lat, lon], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(mapInstance);

      scanRecords.forEach(r => {
        const markerLat = r.lat || CD_LOCATION.lat;
        const markerLon = r.lon || CD_LOCATION.lon;
        L.marker([markerLat, markerLon]).addTo(mapInstance).bindPopup(`<b>${r.tracking}</b><br>${r.cliente || ''}<br>${r.endereco || ''}`);
      });

      updateMapLocation();
    }, 120);
  }

  function removeMapIfExists() {
    if (mapInstance) {
      try { mapInstance.remove(); } catch (e) { console.warn(e); }
    }
    mapInstance = null;
    locationMarker = null;
    const mapEl = document.getElementById('mapObj');
    if (mapEl) mapEl.innerHTML = '';
    const rEl = document.getElementById('routeMapObj');
    if (rEl) rEl.innerHTML = '';
  }

  function updateMapLocation() {
    if (!mapInstance) return;
    const lat = userLocation ? userLocation.lat : CD_LOCATION.lat;
    const lon = userLocation ? userLocation.lon : CD_LOCATION.lon;
    const curEl = document.getElementById('currentLoc');
    if (curEl) curEl.textContent = `(${lat.toFixed(6)}, ${lon.toFixed(6)})`;
    if (locationMarker) locationMarker.setLatLng([lat, lon]);
    else {
      locationMarker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'current-location-marker',
          html: '<div style="background:#ef4444;border:3px solid white;border-radius:50%;width:18px;height:18px"></div>'
        })
      }).addTo(mapInstance).bindPopup('Sua Localização Atual');
    }
  }

  window.centerMapToRecord = (tracking) => {
    const rec = scanRecords.find(r => r.tracking === tracking);
    if (!rec) return alert('Registro não encontrado');
    renderMap();
    setTimeout(() => {
      try {
        const lat = rec.lat || CD_LOCATION.lat;
        const lon = rec.lon || CD_LOCATION.lon;
        mapInstance.setView([lat, lon], 15);
      } catch (e) { console.warn(e); }
    }, 300);
  };

  /* -------------------- CSV export (endereço em vez de lat/lon) -------------------- */
  dom.btnGenerateCSV && dom.btnGenerateCSV.addEventListener('click', () => {
    const period = dom.exportPeriod ? dom.exportPeriod.value : 'all';
    const userFilter = dom.exportUserFilter ? dom.exportUserFilter.value.trim() : '';
    generateCSV(period, userFilter);
  });

  function generateCSV(period = 'all', userFilter = '') {
    let filtered = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (period === 'daily') filtered = scanRecords.filter(r => new Date(r.date) >= today);
    else if (period === 'weekly') { const oneWeek = new Date(today); oneWeek.setDate(today.getDate() - 7); filtered = scanRecords.filter(r => new Date(r.date) >= oneWeek); }
    else if (period === 'monthly') { const oneMonth = new Date(today); oneMonth.setMonth(today.getMonth() - 1); filtered = scanRecords.filter(r => new Date(r.date) >= oneMonth); }
    else filtered = scanRecords.slice();

    if (userFilter) filtered = filtered.filter(r => r.user === userFilter);
    if (!filtered.length) return alert('Nenhum dado encontrado para o filtro.');

    let csv = 'DATA,HORA,USUARIO,RASTREAMENTO,CLIENTE,ENDERECO,TELEFONE,TIPO,RAW\n';
    filtered.forEach(r => {
      const d = new Date(r.date);
      const dateStr = d.toLocaleDateString('pt-BR');
      const timeStr = d.toLocaleTimeString('pt-BR');
      const safe = s => `"${(s || '').toString().replace(/"/g, '""')}"`;
      csv += `${dateStr},${timeStr},${r.user},${r.tracking},${safe(r.cliente)},${safe(r.endereco)},${safe(r.telefone)},${r.type},${safe(r.raw)}\n`;
    });

    const filename = `relatorio_pegazus_${period}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    // close export panel if present
    const exportOptions = document.getElementById('exportOptions');
    if (exportOptions) exportOptions.style.display = 'none';
  }

  /* -------------------- User CRUD (global functions) -------------------- */
  window.editUser = (userId) => {
    const userToEdit = userId ? users.find(u => u.id === userId) : null;
    // permission checks
    if (userToEdit && userToEdit.id !== currentUser.id && currentUser.role !== 'admin' &&
      !(currentUser.role === 'gestor' && userToEdit.creatorId === currentUser.id && userToEdit.role === 'colaborador')) {
      return alert('Você não tem permissão para editar este usuário.');
    }

    // Simple prompt-based form (keeps inline with earlier approach)
    const isNew = !userId;
    let username = userToEdit ? userToEdit.username : prompt('Usuário:');
    if (username === null) return;
    username = username.trim();
    if (!username) return alert('Usuário obrigatório.');

    // If creating, ensure unique
    if (isNew && users.some(u => u.username === username)) return alert('Nome de usuário já existe.');

    const password = prompt('Senha (deixe em branco para manter):') || (userToEdit ? userToEdit.password : '');
    const rolePrompt = currentUser.role === 'admin' || (userToEdit && userToEdit.id === currentUser.id)
      ? prompt('Papel (colaborador/gestor/admin):', userToEdit ? userToEdit.role : 'colaborador')
      : (userToEdit ? userToEdit.role : 'colaborador');

    if (isNew) {
      const newUser = {
        id: 'u' + Date.now(),
        username,
        password,
        role: (currentUser.role === 'gestor' && rolePrompt !== 'colaborador') ? 'colaborador' : rolePrompt,
        creatorId: currentUser.id
      };
      users.push(newUser);
    } else {
      const idx = users.findIndex(u => u.id === userId);
      if (idx >= 0) {
        users[idx].password = password || users[idx].password;
        if (currentUser.role === 'admin' || users[idx].id === currentUser.id) users[idx].role = rolePrompt;
      }
    }
    saveUsers();
    renderUsers();
  };

  window.deleteUser = (userId) => {
    if (userId === currentUser.id) return alert('Você não pode excluir seu próprio perfil enquanto logado.');
    if (!confirm('Excluir usuário?')) return;
    users = users.filter(u => u.id !== userId);
    saveUsers();
    renderUsers();
  };

  /* -------------------- Misc helpers -------------------- */
  function beepShort() { beep(); }

  /* expose some functions globally for buttons in HTML */
  window.renderDashboard = renderDashboard;
  window.renderDeliveries = renderDeliveries;
  window.renderMap = renderMap;
  window.renderRoutes = renderRoutes;
  window.renderUsers = renderUsers;
  window.generateCSV = generateCSV;
  window.lookupShipment = lookupShipment;

  /* -------------------- Initialization -------------------- */
  enumerateDevices();
  // show empty dashboard only if user already logged in (rare at fresh load)
  if (currentUser) renderDashboard();

  // small bindings that may have been missed in HTML
  // generateCSV called by button above
  // manual modal close on backdrop click
  dom.modalBackdrop && dom.modalBackdrop.addEventListener('click', (e) => {
    if (e.target === dom.modalBackdrop) closeManualModal();
  });

  // allow Enter key to submit manual modal
  dom.manualInput && dom.manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.manualSave && dom.manualSave.click();
  });

  // expose stop scanner for debug
  window.stopScanner = stopScanner;

  /* -------------------- End of file -------------------- */
});
