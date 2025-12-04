/* app.js - Versão completa integrada
    Coloque este arquivo lado a lado com o index.html fornecido anteriormente.
*/

document.addEventListener('DOMContentLoaded', () => {
  /* -------------------------
      Constantes & Estado
      ------------------------- */
  const STORAGE_KEY_USERS = 'pegazus_users_v4';
  const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
  const STORAGE_KEY_SHIPMENTS = 'pegazus_shipments_v1';
  const DEFAULT_USERS = [
    { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
    { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
    { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
  ];
  const CD_LOCATION = { lat: -23.5505, lon: -46.6333 }; // Depósito / fallback
  const SCAN_DELAY = 1200; // ms (debounce)

  let currentUser = null;
  let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
  let shipments = JSON.parse(localStorage.getItem(STORAGE_KEY_SHIPMENTS) || '{}');
  let users = loadUsers();

  // camera / scanning
  let videoStream = null;
  let videoTrack = null;
  let isScanning = false;
  let lastScanCode = '';
  let lastScanTime = 0;

  // map
  let mapInstance = null;
  let clusterGroup = null;
  let heatLayer = null;
  let routeLayer = null;
  let locationMarker = null;

  // DOM
  const dom = {
    loginSection: document.getElementById('loginSection'),
    loginUser: document.getElementById('loginUser'),
    loginPass: document.getElementById('loginPass'),
    btnLogin: document.getElementById('btnLogin'),
    loginError: document.getElementById('loginError'),

    app: document.getElementById('app'),
    sidebar: document.getElementById('sidebar'),
    displayUser: document.getElementById('displayUser'),
    btnLogout: document.getElementById('btnLogout'),

    btnDashboard: document.getElementById('btnDashboard'),
    btnScanMode: document.getElementById('btnScanMode'),
    btnDeliveries: document.getElementById('btnDeliveries'),
    btnMap: document.getElementById('btnMap'),
    btnRoutes: document.getElementById('btnRoutes'),
    btnManualSearch: document.getElementById('btnManualSearch'),
    btnUsers: document.getElementById('btnUsers'),
    btnExport: document.getElementById('btnExport'),

    contentArea: document.getElementById('contentArea'),

    cameraView: document.getElementById('cameraView'),
    video: document.getElementById('videoElement'),
    cameraSelect: document.getElementById('cameraSelect'),
    btnCloseCamera: document.getElementById('btnCloseCamera'),
    btnTorch: document.getElementById('btnTorch'),
    btnManual: document.getElementById('btnManual'),
    feedback: document.getElementById('feedbackMsg'),

    modalBackdrop: document.getElementById('modalBackdrop'),
    manualInput: document.getElementById('manualInput'),
    qrcodeContainer: document.getElementById('qrcodeContainer'),
    manualCancel: document.getElementById('manualCancel'),
    manualSave: document.getElementById('manualSave'),
  };

  /* -------------------------
      Helpers de storage & init
      ------------------------- */
  function loadUsers() {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS.slice();
    }
    try {
      const existing = JSON.parse(raw);
      // ensure 'thon' exists with default password
      const thon = existing.find(u => u.username === 'thon');
      if (!thon) existing.push(DEFAULT_USERS[0]);
      return existing;
    } catch (e) {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS.slice();
    }
  }
  function saveUsers() { localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users)); }
  function saveScans() { localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords)); }
  function saveShipments() { localStorage.setItem(STORAGE_KEY_SHIPMENTS, JSON.stringify(shipments)); }

  /* -------------------------
      Audio feedback (beep)
      ------------------------- */
  function playBeep(success = true) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = success ? 1000 : 300;
      g.gain.value = 0.02;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 120);
    } catch (e) { /* ignore */ }
  }

  /* -------------------------
      Login / Logout
      ------------------------- */
  dom.btnLogin && dom.btnLogin.addEventListener('click', () => {
    const u = dom.loginUser.value.trim();
    const p = dom.loginPass.value.trim();
    const found = users.find(x => x.username === u && x.password === p);
    if (found) {
      currentUser = found;
      dom.displayUser.textContent = `${found.username} (${found.role})`;
      dom.loginSection.classList.add('hidden');
      dom.app.classList.remove('hidden');
      setActiveMenu('btnDashboard');
      renderDashboard();
      startGeolocation();
    } else {
      dom.loginError.textContent = 'Credenciais inválidas';
      setTimeout(() => dom.loginError.textContent = '', 3000);
    }
  });

  dom.btnLogout && dom.btnLogout.addEventListener('click', () => {
    stopScanner();
    currentUser = null;
    dom.app.classList.add('hidden');
    dom.loginSection.classList.remove('hidden');
    dom.contentArea.innerHTML = '';
  });

  function setActiveMenu(id) {
    Array.from(document.querySelectorAll('.menu-item')).forEach(el => el.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  /* -------------------------
      Camera / Scanner
      ------------------------- */
  async function enumerateDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      dom.cameraSelect.innerHTML = '';
      if (videoDevices.length === 0) {
        dom.cameraSelect.classList.add('hidden');
        return;
      }
      videoDevices.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.innerText = d.label || `Camera ${i + 1}`;
        dom.cameraSelect.appendChild(opt);
      });
      if (videoDevices.length > 1) dom.cameraSelect.classList.remove('hidden');
    } catch (e) {
      console.warn('enumerateDevices failed', e);
    }
  }

  function startScanner(deviceId) {
    stopScanner();
    const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: { facingMode: 'environment' } };
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
      videoStream = stream;
      videoTrack = stream.getVideoTracks()[0];
      dom.video.srcObject = stream;
      dom.video.play().catch(() => { /* autoplay restrictions */ });
      isScanning = true;
      requestAnimationFrame(scanLoop);
      // select active option
      try {
        const device = videoTrack.getSettings().deviceId;
        Array.from(dom.cameraSelect.options).forEach(o => o.selected = (o.value === device));
      } catch (e) { /* ignore */ }
    }).catch(err => {
      console.error('getUserMedia failed', err);
      dom.feedback.textContent = 'Erro ao acessar câmera';
      dom.feedback.style.opacity = '1';
      setTimeout(() => dom.feedback.style.opacity = '0', 3000);
    });
  }

  function stopScanner() {
    isScanning = false;
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
      videoTrack = null;
    }
    if (dom.video) { dom.video.srcObject = null; }
  }

  async function scanLoop() {
    if (!isScanning || !dom.video) return;
    if (dom.video.readyState === dom.video.HAVE_ENOUGH_DATA) {
      const w = dom.video.videoWidth;
      const h = dom.video.videoHeight;
      if (w > 0 && h > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(dom.video, 0, 0, w, h);
        try {
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
          if (code && code.data) {
            const now = Date.now();
            if (code.data !== lastScanCode || now > lastScanTime + SCAN_DELAY) {
              lastScanCode = code.data;
              lastScanTime = now;
              handleScannedTracking(code.data.trim());
            }
          }
        } catch (e) {
          // Cross-origin or other canvas error (silently ignore)
          // console.warn('scanLoop getImageData error', e);
        }
      }
    }
    requestAnimationFrame(scanLoop);
  }

  // camera controls
  dom.cameraSelect && dom.cameraSelect.addEventListener('change', () => {
    if (dom.cameraSelect.value) startScanner(dom.cameraSelect.value);
  });
  dom.btnCloseCamera && dom.btnCloseCamera.addEventListener('click', () => {
    stopScanner();
    dom.cameraView.style.display = 'none';
    dom.app.style.display = 'grid';
    renderDashboard();
  });
  dom.btnTorch && dom.btnTorch.addEventListener('click', async () => {
    if (!videoTrack) return alert('Câmera não ativa');
    const caps = videoTrack.getCapabilities && videoTrack.getCapabilities();
    if (!caps || !caps.torch) return alert('Lanterna não suportada');
    try {
      const settings = videoTrack.getSettings();
      await videoTrack.applyConstraints({ advanced: [{ torch: !settings.torch }] });
    } catch (e) { console.warn('torch toggle failed', e); }
  });
  dom.btnManual && dom.btnManual.addEventListener('click', () => openManualModal());

  /* -------------------------
      Manual modal & QR generation
      ------------------------- */
  function openManualModal() {
    dom.manualInput.value = '';
    dom.qrcodeContainer.innerHTML = '';
    dom.modalBackdrop.style.display = 'flex';
    dom.manualInput.focus();
  }
  function closeManualModal() {
    dom.modalBackdrop.style.display = 'none';
    dom.qrcodeContainer.innerHTML = '';
  }
  dom.manualCancel && dom.manualCancel.addEventListener('click', closeManualModal);

  dom.manualSave && dom.manualSave.addEventListener('click', () => {
    const id = (dom.manualInput.value || '').trim();
    if (!id) return alert('Insira um ID de rastreio válido');
    // If exists in scans, show popup that it was already scanned
    const existing = scanRecords.find(r => r.tracking === id);
    if (existing) {
      Swal.fire({
        title: `Já foi escaneado`,
        html: `<b>${id}</b><br>${existing.cliente || ''}<br><small>Registrado por ${existing.user} em ${new Date(existing.date).toLocaleString()}</small>`,
        icon: 'info'
      });
    }
    // generate QR
    dom.qrcodeContainer.innerHTML = '';
    const qrDiv = document.createElement('div');
    dom.qrcodeContainer.appendChild(qrDiv);
    try {
      // ESTA CHAMA PRECISA QUE A BIBLIOTECA qrcode.min.js ESTEJA NO HTML
      new QRCode(qrDiv, {
        text: id,
        width: 160,
        height: 160,
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (e) {
      console.error('QRCode generation error', e);
      dom.qrcodeContainer.innerText = 'Erro ao gerar QR';
    }
    // register scan as "generated" event optionally (do not auto-scan)
  });

  /* -------------------------
      Scanned tracking handling
      ------------------------- */
  function handleScannedTracking(raw) {
    const tracking = raw.split(/\s/)[0];
    const details = lookupShipment(tracking);
    const now = new Date().toISOString();
    const record = {
      id: tracking,
      tracking,
      date: now,
      user: currentUser ? currentUser.username : 'unknown',
      type: details.carrier || 'Genérico',
      endereco: details.address || '',
      telefone: details.phone || '',
      cliente: details.name || '',
      raw: raw,
      lat: userLocation ? userLocation.lat : undefined,
      lon: userLocation ? userLocation.lon : undefined
    };

    // add to head
    scanRecords.unshift(record);
    saveScans();

    // feedback
    dom.feedback.textContent = `Leu: ${record.tracking} — ${record.cliente || record.endereco || '—'}`;
    dom.feedback.style.opacity = '1';
    setTimeout(() => dom.feedback.style.opacity = '0', 2000);
    playBeep(true);

    // update map if open
    if (mapInstance) {
      addMarkerForRecord(record);
      refreshHeatAndClusters();
    }

    // when manual modal is open, show QR (already handled in manual)
  }

  /* -------------------------
      Shipments lookup / edit
      ------------------------- */
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
  window.editShipment = (tracking) => {
    const s = lookupShipment(tracking);
    const name = prompt('Nome do cliente:', s.name || '');
    if (name === null) return;
    const address = prompt('Endereço completo:', s.address || '');
    if (address === null) return;
    const phone = prompt('Telefone:', s.phone || '');
    if (phone === null) return;
    s.name = name; s.address = address; s.phone = phone;
    shipments[tracking] = s; saveShipments();
    // update existing records
    scanRecords = scanRecords.map(r => r.tracking === tracking ? ({ ...r, cliente: s.name, endereco: s.address, telefone: s.phone }) : r);
    saveScans();
    renderDeliveries();
    alert('Dados do rastreio atualizados.');
  };

  /* -------------------------
      Geolocation
      ------------------------- */
  let userLocation = null;
  function startGeolocation() {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.watchPosition(pos => {
      userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (mapInstance) updateMapLocation();
    }, err => {
      console.warn('geolocation error', err && err.message);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 7000 });
  }

  /* -------------------------
      Map & helpers (Leaflet + clustering + heat)
      ------------------------- */
  function initMap(containerId = 'mapObj') {
    // destroy previous
    if (mapInstance) {
      try { mapInstance.remove(); } catch (e) { console.warn(e); }
      mapInstance = null;
    }

    const el = document.getElementById(containerId);
    if (!el) return null;
    mapInstance = L.map(containerId).setView([CD_LOCATION.lat, CD_LOCATION.lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(mapInstance);

    // marker cluster
    clusterGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 60 });
    clusterGroup.addTo(mapInstance);

    // heat
    heatLayer = L.heatLayer([], { radius: 25, blur: 15, maxZoom: 17 }).addTo(mapInstance);

    // route layer group
    routeLayer = L.layerGroup().addTo(mapInstance);

    // add current location mark if available
    if (userLocation) {
      if (locationMarker) locationMarker.setLatLng([userLocation.lat, userLocation.lon]);
      else {
        locationMarker = L.circleMarker([userLocation.lat, userLocation.lon], { radius: 7, color: '#ef4444', weight: 2, fillColor: '#ef4444' })
          .addTo(mapInstance).bindPopup('Você está aqui');
      }
    }

    // return mapInstance
    return mapInstance;
  }

  function addMarkerForRecord(r) {
    if (!mapInstance || !clusterGroup) return;
    const lat = r.lat || CD_LOCATION.lat;
    const lon = r.lon || CD_LOCATION.lon;
    const icon = iconForStatus(r.type); // we use type as status in this local version
    const marker = L.marker([lat, lon], { icon });
    marker.bindPopup(`<b>${r.tracking}</b><br>${r.cliente || ''}<br>${r.endereco || ''}<br>
      <button onclick="(function(){ window.viewDeliveryDetail && window.viewDeliveryDetail('${r.tracking}'); })()">Detalhes</button>
      <button onclick="(function(){ window.desenharRota && window.desenharRota(${lat}, ${lon}); })()">Rota</button>
    `);
    clusterGroup.addLayer(marker);
  }

  function refreshHeatAndClusters() {
    if (!clusterGroup || !heatLayer) return;
    clusterGroup.clearLayers();
    const heatPoints = [];
    scanRecords.forEach(r => {
      const lat = r.lat || CD_LOCATION.lat;
      const lon = r.lon || CD_LOCATION.lon;
      const icon = iconForStatus(r.type);
      const marker = L.marker([lat, lon], { icon }).bindPopup(`<b>${r.tracking}</b><br>${r.cliente || ''}`);
      clusterGroup.addLayer(marker);
      heatPoints.push([lat, lon, 0.6]);
    });
    heatLayer.setLatLngs(heatPoints);
  }

  function iconForStatus(status) {
    // simple colored markers using leaflet-color-markers (external URL)
    // fallback to default icon
    const base = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-';
    const color = {
      'Entregue': 'green',
      'Em Rota': 'blue',
      'Pendente': 'red',
      'Genérico': 'orange',
    }[status] || 'orange';
    return L.icon({
      iconUrl: `${base}${color}.png`,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      shadowSize: [41, 41]
    });
  }

  /* -------------------------
      Routing (OSRM) - fetch route and draw polyline
      ------------------------- */
  async function desenharRota(lat, lng) {
    if (!mapInstance) return;
    if (routeLayer) routeLayer.clearLayers();
    const start = `${CD_LOCATION.lon},${CD_LOCATION.lat}`;
    const end = `${lng},${lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=false`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('OSRM failure');
      const data = await res.json();
      if (!data.routes || data.routes.length === 0) throw new Error('No route found');
      const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      const poly = L.polyline(coords, { color: '#007bff', weight: 5, opacity: 0.9 }).addTo(routeLayer);
      mapInstance.fitBounds(poly.getBounds(), { padding: [40, 40] });
    } catch (e) {
      console.warn('desenharRota error', e);
      Swal.fire('Erro', 'Não foi possível traçar a rota (OSRM).', 'error');
    }
  }
  window.desenharRota = desenharRota; // expose for popup buttons

  /* -------------------------
      Renderers: Dashboard / Deliveries / Map / Routes / Users
      ------------------------- */
  function renderDashboard() {
    // exit fullscreen map class
    document.querySelector('.app') && document.querySelector('.app').classList.remove('fullscreen-map-active');
    dom.contentArea.innerHTML = `
      <h2>📦 Dashboard do Entregador</h2>
      <div class="card" style="display:flex;gap:12px;">
        <div style="flex:1">
          <h3>Entregas Pendentes</h3>
          <p style="font-size:28px; margin:6px 0">${scanRecords.filter(r => !r.delivered).length}</p>
        </div>
        <div style="flex:1">
          <h3>Coletas de Hoje</h3>
          <p style="font-size:28px; margin:6px 0">${scanRecords.filter(r => (new Date(r.date)).toDateString() === (new Date()).toDateString()).length}</p>
        </div>
        <div style="flex:1">
          <h3>Total Concluído</h3>
          <p style="font-size:28px; margin:6px 0">${scanRecords.filter(r => r.delivered).length}</p>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <h4>Próximas Entregas (amostra)</h4>
        <div id="nextSamples"></div>
      </div>
    `;

    const nextEl = document.getElementById('nextSamples');
    const next = scanRecords.filter(r => !r.delivered).slice(0, 5);
    if (!next.length) nextEl.innerHTML = '<p class="small-muted">Sem entregas pendentes.</p>';
    else {
      nextEl.innerHTML = next.map(r => `<div style="padding:8px;border-bottom:1px solid #eee"><b>${r.tracking}</b> — ${r.endereco || '—'}<div style="font-size:12px;color:#666">${r.cliente || ''}</div></div>`).join('');
    }
  }

  window.openCameraProgramatic = () => {
    setActiveMenu('btnScanMode');
    // Implementação real da abertura da câmera (omitia no código fornecido)
    dom.cameraView.style.display = 'flex';
    dom.app.style.display = 'none';
    enumerateDevices();
    startScanner(dom.cameraSelect.value);
  };

  function renderDeliveries() {
    document.querySelector('.app') && document.querySelector('.app').classList.remove('fullscreen-map-active');
    let html = `<div style="position:relative"><button class="close-x" onclick="renderDashboard()" title="Fechar">✕</button><h2>📋 Lista de Entregas</h2></div>
    <div class="card"><div style="display:flex;gap:8px;margin-bottom:12px"><input id="searchDelivery" placeholder="Buscar..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #ddd" /><button id="btnNewManual" class="btn-primary">+ Novo (Manual)</button></div>
    <div id="deliveriesList" class="list-deliveries">
    ${scanRecords.map((r, i) => `
      <div class="delivery-item" data-tracking="${r.tracking}" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #eee;">
        <div style="width:40px;text-align:center"><div class="badge">${i + 1}</div></div>
        <div class="grow" style="flex-grow:1; margin-right: 10px;">
          <div class="title"><b>${r.tracking}</b> <span style="font-weight:400;color:#6b7280">— ${r.cliente || 'Sem nome'}</span></div>
          <div class="meta" style="font-size:12px;color:#666">${r.type} • ${new Date(r.date).toLocaleString()}</div>
          <div class="small-muted" style="font-size:12px;color:#999">${r.endereco || ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn-secondary" onclick="viewDeliveryDetail('${r.tracking}')">Ver</button>
          <button class="btn-secondary" onclick="window.editShipment('${r.tracking}')">Editar</button>
        </div>
      </div>
    `).join('')}
    </div></div><div id="deliveryDetailArea"></div>`;
    dom.contentArea.innerHTML = html;

    document.getElementById('btnNewManual').addEventListener('click', openManualModal);
    const si = document.getElementById('searchDelivery');
    si && si.addEventListener('input', () => {
      const q = si.value.trim().toLowerCase();
      document.querySelectorAll('#deliveriesList .delivery-item').forEach(node => {
        const t = node.dataset.tracking.toLowerCase();
        const rec = scanRecords.find(r => r.tracking === node.dataset.tracking);
        const text = `${t} ${rec.endereco || ''} ${rec.cliente || ''}`.toLowerCase();
        node.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });
  }

  window.viewDeliveryDetail = (tracking) => {
    const rec = scanRecords.find(r => r.tracking === tracking);
    const area = document.getElementById('deliveryDetailArea');
    if (!rec || !area) return alert('Registro não encontrado');
    area.innerHTML = `<div class="card" style="margin-top:12px"><button class="close-x" onclick="document.getElementById('deliveryDetailArea').innerHTML='';">✕</button>
      <h3>${rec.tracking}</h3>
      <p><strong>Cliente:</strong> ${rec.cliente || '—'}</p>
      <p><strong>Endereço:</strong> ${rec.endereco || '—'}</p>
      <p><strong>Telefone:</strong> ${rec.telefone || '—'}</p>
      <p><strong>Usuário:</strong> ${rec.user}</p>
      <p><strong>Data:</strong> ${new Date(rec.date).toLocaleString()}</p>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-primary" onclick="window.editShipment('${rec.tracking}')">Editar Dados</button>
        <button class="btn-secondary" onclick="centerMapToRecord('${rec.tracking}')">Mostrar no Mapa</button>
      </div>
    </div>`;
    area.scrollIntoView({ behavior: 'smooth' });
  };

  function renderMap() {
    // full screen map behavior
    document.querySelector('.app') && document.querySelector('.app').classList.add('fullscreen-map-active');

    dom.contentArea.innerHTML = `<div style="position:relative;height:100%"><button class="close-x" onclick="closeMapView()" title="Fechar">✕</button><h2>🗺️ Mapa de Entregas</h2>
      <div class="card" style="height:calc(100vh - 90px);padding:0">
        <p style="padding:8px;margin:0">Você está aqui: <span id="currentLoc">Carregando...</span></p>
        <div id="mapObj" class="map-wrapper" style="height:calc(100% - 40px)"></div>
      </div>
    </div>`;

    setTimeout(() => {
      initMap('mapObj');
      refreshHeatAndClusters();
      updateMapLocation();
      // ensure map tiles render correctly
      try { mapInstance.invalidateSize(); } catch (e) { /* ignore */ }
    }, 80);
  }

  function closeMapView() {
    // destroy map and restore UI
    if (mapInstance) {
      try { mapInstance.remove(); } catch (e) { /* ignore */ }
      mapInstance = null;
      clusterGroup = null;
      heatLayer = null;
    }
    document.querySelector('.app') && document.querySelector('.app').classList.remove('fullscreen-map-active');
    renderDashboard();
  }
  window.closeMapView = closeMapView;

  function renderRoutes() {
    document.querySelector('.app') && document.querySelector('.app').classList.remove('fullscreen-map-active');
    dom.contentArea.innerHTML = `<div style="position:relative"><button class="close-x" onclick="renderDashboard()" title="Fechar">✕</button><h2>🧭 Rotas</h2></div>
      <div class="card"><p class="small-muted">Gerando rota simulada (heurística nearest neighbor)...</p>
      <div id="routeMapObj" style="height:420px"></div></div>`;
    setTimeout(() => {
      const pts = scanRecords.filter(r => r.lat && r.lon).slice(0, 20).map(r => ({ lat: r.lat, lon: r.lon, id: r.tracking }));
      if (pts.length < 2) {
        document.getElementById('routeMapObj').innerHTML = '<p class="small-muted">Escaneie ao menos 2 entregas com posição para simular rota.</p>';
        return;
      }
      initMap('routeMapObj');
      // simple nearest neighbor
      let remaining = pts.slice();
      const route = [];
      let current = { lat: CD_LOCATION.lat, lon: CD_LOCATION.lon };
      while (remaining.length) {
        let nearestIndex = 0;
        let bestDist = Infinity;
        remaining.forEach((p, i) => {
          const d = Math.hypot(current.lat - p.lat, current.lon - p.lon);
          if (d < bestDist) { bestDist = d; nearestIndex = i; }
        });
        route.push(remaining.splice(nearestIndex, 1)[0]);
        current = route[route.length - 1];
      }
      const coords = route.map(p => [p.lat, p.lon]);
      const poly = L.polyline([[CD_LOCATION.lat, CD_LOCATION.lon], ...coords], { color: '#22c55e', weight: 4 }).addTo(mapInstance);
      mapInstance.fitBounds(poly.getBounds(), { padding: [40, 40] });
      // numbered markers
      route.forEach((p, i) => {
        L.marker([p.lat, p.lon], { icon: iconForStatus('Em Rota') }).addTo(mapInstance).bindPopup(`<b>Ponto ${i + 1}</b><br>${p.id}`);
      });
    }, 80);
  }

  function renderUsers() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'gestor')) {
      dom.contentArea.innerHTML = `<h2>Acesso negado</h2><p>Somente admin/gestor.</p>`;
      return;
    }
    dom.contentArea.innerHTML = `<h2>👥 Usuários</h2><div class="card"><button id="btnNewUser" class="btn-primary">+ Novo Usuário</button>
      <div id="userList" style="margin-top:12px">${users.map(u => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee">
          <div><strong>${u.username}</strong><div style="font-size:12px;color:#666">${u.role}</div></div>
          <div>
            <button class="btn-secondary" onclick="editUser('${u.id}')">Editar</button>
            ${u.id !== currentUser.id ? `<button class="btn-secondary" onclick="deleteUser('${u.id}')">Excluir</button>` : ''}
          </div>
        </div>`).join('')}</div></div>`;
    document.getElementById('btnNewUser').addEventListener('click', () => editUser(null));
  }

  /* -------------------------
      Map helpers
      ------------------------- */
  function updateMapLocation() {
    if (!mapInstance) return;
    const lat = userLocation ? userLocation.lat : CD_LOCATION.lat;
    const lon = userLocation ? userLocation.lon : CD_LOCATION.lon;
    const el = document.getElementById('currentLoc');
    if (el) el.textContent = `(${lat.toFixed(6)}, ${lon.toFixed(6)})`;
    if (locationMarker && mapInstance) locationMarker.setLatLng([lat, lon]);
    else if (mapInstance) {
      locationMarker = L.circleMarker([lat, lon], { radius: 6, fillColor: '#ef4444', color: '#fff', weight: 2 }).addTo(mapInstance).bindPopup('Você');
    }
  }
  window.centerMapToRecord = (tracking) => {
    const rec = scanRecords.find(r => r.tracking === tracking);
    if (!rec) return alert('Registro não encontrado');
    renderMap();
    setTimeout(() => {
      if (mapInstance) mapInstance.setView([rec.lat || CD_LOCATION.lat, rec.lon || CD_LOCATION.lon], 15, { animate: true });
    }, 200);
  };

  /* -------------------------
      Generate CSV
      ------------------------- */
  function generateCSV(period = 'all', userFilter = '') {
    const now = new Date();
    let filtered = scanRecords.slice();
    if (period !== 'all') {
      const days = { daily: 1, weekly: 7, monthly: 30 }[period] || 0;
      if (days > 0) {
        const cutoff = new Date(now);
        cutoff.setDate(now.getDate() - days);
        filtered = filtered.filter(r => new Date(r.date) >= cutoff);
      }
    }
    if (userFilter) filtered = filtered.filter(r => r.user && r.user.toLowerCase().includes(userFilter.toLowerCase()));
    if (!filtered.length) return alert('Nenhum dado encontrado para o filtro.');
    const headers = ['DATA', 'HORA', 'USUARIO', 'RASTREAMENTO', 'CLIENTE', 'ENDERECO', 'TELEFONE', 'TIPO', 'RAW'];
    let csv = headers.join(',') + '\n';
    filtered.forEach(r => {
      const d = new Date(r.date);
      const row = [
        d.toLocaleDateString('pt-BR'),
        d.toLocaleTimeString('pt-BR'),
        r.user || '',
        r.tracking || '',
        (r.cliente || '').replace(/"/g, '""'),
        (r.endereco || '').replace(/"/g, '""'),
        (r.telefone || '').replace(/"/g, '""'),
        r.type || '',
        (r.raw || '').replace(/"/g, '""')
      ].map(v => `"${v}"`).join(',');
      csv += row + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pegazus_export_${(new Date()).toISOString().slice(0, 10)}.csv`;
    a.click();
  }
  window.generateCSV = generateCSV;

  /* -------------------------
      User CRUD (global access)
      ------------------------- */
  window.editUser = (userId) => {
    const userToEdit = userId ? users.find(u => u.id === userId) : null;
    const username = prompt('Usuário:', userToEdit ? userToEdit.username : '');
    if (!username) return;
    const password = prompt('Senha (deixe em branco para manter):', userToEdit ? userToEdit.password : '');
    const role = prompt('Papel (admin/gestor/colaborador):', userToEdit ? userToEdit.role : 'colaborador') || 'colaborador';
    if (!userId) {
      users.push({ id: 'u' + Date.now(), username, password, role, creatorId: currentUser.id });
    } else {
      const idx = users.findIndex(u => u.id === userId);
      if (idx >= 0) {
        users[idx].username = username;
        if (password) users[idx].password = password;
        users[idx].role = role;
      }
    }
    saveUsers();
    renderUsers();
  };
  window.deleteUser = (userId) => {
    if (!confirm('Excluir usuário?')) return;
    users = users.filter(u => u.id !== userId);
    saveUsers();
    renderUsers();
  };

  /* -------------------------
      Utility: add marker for all records (used in map init)
      ------------------------- */
  function populateMapFromRecords() {
    // ... (função inacabada no código fornecido, mas não afeta o QR code)
  }
  
  // inicialização
  enumerateDevices();
  // Se houver um usuário logado (por exemplo, na sessão anterior)
  // if (currentUser) { renderDashboard(); startGeolocation(); }
  
  // Menu listeners (Assumindo que foram omitidos anteriormente, mas são necessários)
  dom.btnDashboard && dom.btnDashboard.addEventListener('click', () => { setActiveMenu('btnDashboard'); renderDashboard(); });
  dom.btnScanMode && dom.btnScanMode.addEventListener('click', () => { setActiveMenu('btnScanMode'); dom.cameraView.style.display = 'flex'; dom.app.style.display = 'none'; enumerateDevices(); startScanner(dom.cameraSelect.value); });
  dom.btnDeliveries && dom.btnDeliveries.addEventListener('click', () => { setActiveMenu('btnDeliveries'); renderDeliveries(); });
  dom.btnMap && dom.btnMap.addEventListener('click', () => { setActiveMenu('btnMap'); renderMap(); });
  dom.btnRoutes && dom.btnRoutes.addEventListener('click', () => { setActiveMenu('btnRoutes'); renderRoutes(); });
  dom.btnUsers && dom.btnUsers.addEventListener('click', () => { setActiveMenu('btnUsers'); renderUsers(); });
  dom.btnExport && dom.btnExport.addEventListener('click', () => { generateCSV(); });
});
