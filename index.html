/* app.js — versão integrada e aprimorada (com patch do mapa) */
document.addEventListener('DOMContentLoaded', () => {

    /* --- KEYS e Estado --- */
    const STORAGE_KEY_USERS = 'pegazus_users_v4';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
    const STORAGE_KEY_SHIPMENTS = 'pegazus_shipments_v1'; // DB local de rastreios -> cliente/endereço/telefone
    const DEFAULT_USERS = [
        { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
        { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
        { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
    ];
    // Coordenadas do depósito (CD) já usadas no app
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 };

    let currentUser = null;
    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    let shipments = JSON.parse(localStorage.getItem(STORAGE_KEY_SHIPMENTS) || '{}'); // mapa tracking -> details
    let users = loadUsers();

    let videoStream = null, isScanning = false, videoTrack = null;
    const SCAN_DELAY = 1000;
    let lastScanCode = '', lastScanTime = 0;
    let userLocation = null;
    // mapInstance é a instância do Leaflet usada no app (substitui 'map' local)
    let mapInstance = null;
    let locationMarker = null;

    /* --- DOM --- */
    const dom = {
        loginSection: document.getElementById('loginSection'),
        menuSection: document.getElementById('menuSection'),
        appContainer: document.querySelector('.app'),
        contentArea: document.getElementById('contentArea'),
        cameraView: document.getElementById('cameraView'),
        video: document.getElementById('videoElement'),
        sidebar: document.getElementById('sidebar'),
        mobileMenuBtn: document.getElementById('mobileMenuBtn'),
        feedback: document.getElementById('feedbackMsg'),
        cameraSelect: document.getElementById('cameraSelect'),
        exportOptions: document.getElementById('exportOptions'),
        adminMenuOptions: document.getElementById('adminMenuOptions'),
        exportPeriod: document.getElementById('exportPeriod'),
        exportUserSearch: document.getElementById('exportUserSearch'),
        btnExportRun: document.getElementById('btnExportRun')
    };

    /* --- Inicialização --- */
    function loadUsers() {
        const raw = localStorage.getItem(STORAGE_KEY_USERS);
        if(!raw) { localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS)); return DEFAULT_USERS; }
        const existingUsers = JSON.parse(raw);
        const thonExists = existingUsers.some(u => u.username === 'thon');
        if (!thonExists) existingUsers.push(DEFAULT_USERS[0]);
        else {
            const thonIndex = existingUsers.findIndex(u => u.username === 'thon');
            existingUsers[thonIndex].password = DEFAULT_USERS[0].password;
            existingUsers[thonIndex].role = DEFAULT_USERS[0].role;
        }
        return existingUsers;
    }
    function saveUsers(){ localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users)); }
    function saveScans(){ localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords)); }
    function saveShipments(){ localStorage.setItem(STORAGE_KEY_SHIPMENTS, JSON.stringify(shipments)); }

    /* --- Geolocation (opcional) --- */
    function startGeolocation(){
        if ("geolocation" in navigator){
            navigator.geolocation.watchPosition(pos => {
                userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                if (mapInstance) updateMapLocation();
            }, err => { console.warn('Geolocation error', err.message); userLocation = null; }, { enableHighAccuracy:true, timeout:5000, maximumAge:0 });
        }
    }

    /* --- Login / Logout --- */
    document.getElementById('btnLogin').addEventListener('click', () => {
        const u = document.getElementById('loginUser').value.trim();
        const p = document.getElementById('loginPass').value.trim();
        const user = users.find(x => x.username === u && x.password === p);
        if (user) {
            currentUser = user;
            document.getElementById('displayUser').textContent = user.username + ` (${user.role})`;
            dom.loginSection.classList.add('hidden');
            dom.appContainer.classList.remove('hidden');
            if(window.innerWidth <= 768) dom.mobileMenuBtn.classList.remove('hidden');
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
        currentUser = null; stopScanner();
        dom.appContainer.classList.add('hidden'); dom.loginSection.classList.remove('hidden');
        dom.mobileMenuBtn.classList.add('hidden');
        dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.5"><h2>Até logo</h2></div>`;
    });

    /* --- Navegação --- */
    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');
    document.getElementById('btnDashboard').addEventListener('click', () => { setActiveMenu('btnDashboard'); renderDashboard(); });
    document.getElementById('btnScanMode').addEventListener('click', () => { setActiveMenu('btnScanMode'); openCameraView(); });
    document.getElementById('btnDeliveries').addEventListener('click', () => { setActiveMenu('btnDeliveries'); renderDeliveries(); });
    document.getElementById('btnMap').addEventListener('click', () => { setActiveMenu('btnMap'); renderMap(); });
    document.getElementById('btnRoutes').addEventListener('click', () => { setActiveMenu('btnRoutes'); renderRoutes(); });
    document.getElementById('btnUsers').addEventListener('click', () => { setActiveMenu('btnUsers'); renderUsers(); });

    document.getElementById('btnExport')?.addEventListener('click', () => {
        dom.exportOptions.style.display = dom.exportOptions.style.display === 'block' ? 'none' : 'block';
    });
    document.getElementById('btnGenerateCSV')?.addEventListener('click', () => {
        // pega valores dos inputs do HTML
        const period = document.getElementById('exportPeriod') ? document.getElementById('exportPeriod').value : 'all';
        const userFilter = document.getElementById('exportUserFilter') ? document.getElementById('exportUserFilter').value.trim() : '';
        generateCSV(period, userFilter);
    });

    // Botões câmera/manual (existem no HTML)
    document.getElementById('btnCloseCamera')?.addEventListener('click', () => { stopScanner(); closeCameraView(); renderDashboard(); });
    document.getElementById('btnTorch')?.addEventListener('click', async () => {
        if (videoTrack) {
            try {
                const caps = videoTrack.getCapabilities();
                if (caps.torch) {
                    const settings = videoTrack.getSettings();
                    await videoTrack.applyConstraints({ advanced: [{ torch: !settings.torch }] });
                } else alert('Flash não suportado neste dispositivo');
            } catch(e){ console.warn(e) }
        }
    });

    document.getElementById('btnManual')?.addEventListener('click', ()=> {
        // abre modal básico (HTML já possui modal backdrop)
        const modal = document.getElementById('modalBackdrop');
        const input = document.getElementById('manualInput');
        modal.style.display = 'flex';
        input.value = '';
        input.focus();
    });
    document.getElementById('manualCancel')?.addEventListener('click', ()=> {
        document.getElementById('modalBackdrop').style.display = 'none';
    });
    document.getElementById('manualSave')?.addEventListener('click', ()=> {
        const code = document.getElementById('manualInput').value.trim();
        document.getElementById('modalBackdrop').style.display = 'none';
        if (code) {
            handleScannedTracking(code);
            renderDeliveries();
        }
    });

    function setActiveMenu(id){
        Array.from(document.querySelectorAll('.menu-item')).forEach(el => el.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    /* --- Camera / Scanner --- */
    dom.cameraSelect?.addEventListener('change', (e) => { if (isScanning) startScanner(e.target.value); });

    async function enumerateDevices(){
        try {
            const initialStream = await navigator.mediaDevices.getUserMedia({ video:true });
            initialStream.getTracks().forEach(t=>t.stop());
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            dom.cameraSelect.innerHTML = '';
            if (videoDevices.length){
                videoDevices.forEach((d, i) => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Câmera ${i+1}`;
                    dom.cameraSelect.appendChild(opt);
                });
                dom.cameraSelect.classList.remove('hidden');
            } else dom.cameraSelect.classList.add('hidden');
        } catch(e){ console.warn('enumerateDevices err', e); }
    }

    async function startScanner(deviceId=null){
        if (isScanning && !deviceId) return;
        stopScanner();
        const videoDevices = Array.from(dom.cameraSelect.options || []);
        let targetDeviceId = deviceId;
        if (!targetDeviceId && videoDevices.length>0) {
            const preferred = videoDevices.find(o => o.text.toLowerCase().includes('back') || o.text.toLowerCase().includes('traseira') || o.text.toLowerCase().includes('environment'));
            targetDeviceId = preferred ? preferred.value : videoDevices[0].value;
        }
        const constraints = targetDeviceId ? { video:{ deviceId:{ exact: targetDeviceId }}} : { video:{ facingMode:'environment', width:{ideal:1280}, height:{ideal:720} } };
        try {
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            dom.video.srcObject = videoStream;
            dom.video.setAttribute('playsinline', true);
            await dom.video.play();
            isScanning = true;
            videoTrack = videoStream.getVideoTracks()[0];
            if (targetDeviceId) dom.cameraSelect.value = targetDeviceId;
            requestAnimationFrame(tick);
        } catch(err){
            console.error(err);
            alert('Erro ao acessar câmera: ' + err.message);
            closeCameraView();
            renderDashboard();
        }
    }
    function stopScanner(){
        isScanning = false;
        if (videoStream){ videoStream.getTracks().forEach(t=>t.stop()); videoStream = null; }
        dom.video.srcObject = null;
        videoTrack = null;
    }

    function openCameraView(){
        // Fecha mapa (se houver) antes de abrir câmera
        removeMapIfExists();
        dom.contentArea.style.display = 'none';
        dom.cameraView.style.display = 'flex';
        dom.appContainer.style.display = 'none';
        startScanner();
    }
    function closeCameraView(){
        dom.cameraView.style.display = 'none';
        dom.appContainer.style.display = 'grid';
        dom.contentArea.style.display = 'block';
    }

    function tick(){
        if (!isScanning) return;
        if (dom.video.readyState === dom.video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const w = dom.video.videoWidth;
            const h = dom.video.videoHeight;
            if (w === 0 || h === 0) { requestAnimationFrame(tick); return; }
            canvas.width = w; canvas.height = h;
            ctx.drawImage(dom.video, 0, 0, w, h);
            const size = Math.min(w,h) * 0.9;
            const sx = (w - size)/2, sy = (h - size)/2;
            const imageData = ctx.getImageData(sx, sy, size, size);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts:'attemptBoth' });
            if (code && code.data) handleScannedTracking(code.data.trim());
        }
        requestAnimationFrame(tick);
    }

    /* --- Quando um rastreio é detectado (manual ou scanner) --- */
    function handleScannedTracking(raw){
        // No Formato 4 o raw é algo como BR123456789 (apenas tracking)
        // Normaliza
        const tracking = raw.split(/\s/)[0];
        // Lookup local
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
            lat: details.lat || null, // opcional
            lon: details.lon || null
        };
        // adiciona ao topo e salva
        scanRecords.unshift(record);
        saveScans();
        showScanFeedback(record);
    }

    /* --- Shipment lookup / edição local --- */
    function lookupShipment(tracking){
        // se já existe no DB local -> retorna
        if (shipments[tracking]) return shipments[tracking];
        // se não existe, cria placeholder (você pode editar depois)
        shipments[tracking] = {
            tracking,
            name: '',
            address: 'Endereço desconhecido', // default; você pode editar
            phone: '',
            carrier: ''
        };
        saveShipments();
        return shipments[tracking];
    }
    // Função para editar dados de um rastreio (usada na UI)
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
        // atualiza quaisquer registros existentes com mesmo tracking
        scanRecords = scanRecords.map(r => r.tracking === tracking ? ({ ...r, cliente: s.name, endereco: s.address, telefone: s.phone }) : r);
        saveScans();
        renderDeliveries(); // refresh
        alert('Dados do rastreio atualizados.');
    };

    /* --- Feedback/UI --- */
    function showScanFeedback(record){
        dom.feedback.textContent = `Leitura: ${record.tracking} — ${record.cliente || record.endereco || ''}`;
        dom.feedback.style.opacity = '1';
        setTimeout(()=> dom.feedback.style.opacity = '0', 2200);
    }

    /* --- RENDERERS (Dashboard, Deliveries, Users, etc.) --- */
    function renderDashboard(){
        // remove mapa se aberto
        removeMapIfExists();
        dom.appContainer.style.display = 'grid';
        dom.cameraView.style.display = 'none';
        dom.contentArea.style.display = 'block';
        const html = `
            <h2>📦 Entregas Realizadas</h2>
            <p class="small-muted">Total de registros: ${scanRecords.length}</p>
            <div style="margin-top:12px" class="card">
              <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px">
                <button class="btn-primary" onclick="window.openCameraProgramatic()">Iniciar Scanner</button>
                <button class="btn-secondary" onclick="renderDeliveries()">Ver Lista</button>
                <div style="margin-left:auto" class="small-muted">Usuário: ${currentUser ? currentUser.username : '-'}</div>
              </div>
              <div class="list-deliveries">
                ${scanRecords.slice(0,8).map((r, idx) => `
                  <div class="delivery-item">
                    <div style="width:40px;text-align:center"><div class="badge">${idx+1}</div></div>
                    <div class="grow">
                      <div class="title">${r.tracking}</div>
                      <div class="meta">${r.cliente || '—'} • ${r.type} • ${new Date(r.date).toLocaleString()}</div>
                      <div class="small-muted">${r.endereco || ''}</div>
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

    // Expose quick-start camera
    window.openCameraProgramatic = () => { setActiveMenu('btnScanMode'); openCameraView(); }

    function renderDeliveries(){
        removeMapIfExists();
        dom.appContainer.style.display = 'grid';
        dom.cameraView.style.display = 'none';
        dom.contentArea.style.display = 'block';

        const html = `<div style="position:relative"><button class="close-x" onclick="renderDashboard()" title="Fechar">✕</button><h2>📋 Lista de Entregas</h2></div>
            <div class="card">
              <div style="display:flex; gap:8px; align-items:center; margin-bottom:12px">
                <input id="searchDelivery" placeholder="Buscar por rastreio/endereço/cliente" style="padding:8px;border-radius:8px;border:1px solid #ddd;flex:1"/>
                <button class="btn-primary" id="btnNewManual">+ Novo (Manual)</button>
              </div>
              <div id="deliveriesList" class="list-deliveries">
                ${scanRecords.map((r, i) => `
                  <div class="delivery-item" data-tracking="${r.tracking}">
                    <div style="width:40px;text-align:center"><div class="badge">${i+1}</div></div>
                    <div class="grow">
                      <div class="title">${r.tracking} <span class="small-muted"> — ${r.cliente || 'Sem Nome'}</span></div>
                      <div class="meta">${r.type} • ${new Date(r.date).toLocaleString()}</div>
                      <div class="small-muted">${r.endereco || ''}</div>
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

        document.getElementById('btnNewManual').addEventListener('click', ()=> {
            const code = prompt('Digite rastreio (ex: BR123456789):');
            if (code) { handleScannedTracking(code.trim()); renderDeliveries(); }
        });

        const searchInput = document.getElementById('searchDelivery');
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.trim().toLowerCase();
            const nodes = document.querySelectorAll('#deliveriesList .delivery-item');
            nodes.forEach(node => {
                const t = node.dataset.tracking.toLowerCase();
                const idx = scanRecords.find(r=>r.tracking===node.dataset.tracking);
                const text = `${t} ${idx.endereco || ''} ${idx.cliente || ''}`.toLowerCase();
                node.style.display = text.includes(q) ? 'flex' : 'none';
            });
        });
    }

    window.viewDeliveryDetail = (tracking) => {
        const record = scanRecords.find(r => r.tracking === tracking);
        if (!record) return alert('Registro não encontrado.');
        const html = `
          <div class="card" style="margin-top:12px; position:relative">
            <button class="close-x" onclick="document.getElementById('deliveryDetailArea').innerHTML = ''">✕</button>
            <h3>${record.tracking} <small class="small-muted">(${record.type})</small></h3>
            <p><strong>Cliente:</strong> ${record.cliente || '—'}</p>
            <p><strong>Endereço:</strong> ${record.endereco || '—'}</p>
            <p><strong>Telefone:</strong> ${record.telefone || '—'}</p>
            <p><strong>Usuário:</strong> ${record.user}</p>
            <p><strong>Data:</strong> ${new Date(record.date).toLocaleString()}</p>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn-primary" onclick="window.editShipment('${record.tracking}')">Editar Dados</button>
              <button class="btn-secondary" onclick="centerMapToRecord('${record.tracking}')">Mostrar no Mapa</button>
            </div>
          </div>
        `;
        const area = document.getElementById('deliveryDetailArea');
        area.innerHTML = html;
        area.scrollIntoView({ behavior:'smooth' });
    };

    function renderUsers(){
        removeMapIfExists();
        dom.contentArea.innerHTML = `<h2>👥 Gerenciamento de Usuários</h2>
          <div class="card">
            <button class="btn-primary" onclick="window.editUser(null)">+ Novo Usuário</button>
            <div id="userList" style="margin-top:12px">${users.map(u => `
              <div class="delivery-item" style="align-items:center">
                <div style="width:40px;text-align:center">${u.username[0].toUpperCase()}</div>
                <div class="grow"><div style="font-weight:700">${u.username}</div><div class="small-muted">${u.role}</div></div>
                <div style="display:flex;gap:8px">
                  <button class="btn-secondary" onclick="window.editUser('${u.id}')">Editar</button>
                  ${u.id !== currentUser.id ? `<button class="btn-secondary" onclick="window.deleteUser('${u.id}')">Excluir</button>` : ''}
                </div>
              </div>`).join('')}</div>
          </div>`;
    }

    function renderRoutes(){
        removeMapIfExists();
        dom.contentArea.innerHTML = `<h2>🧭 Otimizar Rotas</h2><div class="card"><p class="small-muted">Gerando uma simulação com seus últimos pontos...</p><div id="routeMapObj" style="height:60vh;"></div></div>`;
        setTimeout(() => {
            const deliveryPoints = scanRecords.map(r=>({lat: r.lat||CD_LOCATION.lat, lon: r.lon||CD_LOCATION.lon, id: r.tracking}));
            if (deliveryPoints.length < 2) { document.getElementById('routeMapObj').innerHTML = '<p class="small-muted">Escaneie ao menos 2 entregas para simular rota.</p>'; return; }
            const route = deliveryPoints.slice(0,10).sort(()=>Math.random()-0.5);
            // create map for route
            // remove previous map if any at that container
            try { if (mapInstance && document.getElementById('routeMapObj')) { mapInstance.remove(); mapInstance = null; } } catch(e){ console.warn(e); }
            mapInstance = L.map('routeMapObj').setView([route[0].lat, route[0].lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OSM' }).addTo(mapInstance);
            const routePoints = route.map((p,i) => {
                L.marker([p.lat,p.lon]).addTo(mapInstance).bindPopup(`<b>Ponto ${i+1}</b><br>${p.id}`);
                return [p.lat,p.lon];
            });
            if (routePoints.length>1) {
                L.polyline(routePoints,{color:'#22c55e', weight:5}).addTo(mapInstance);
                mapInstance.fitBounds(L.polyline(routePoints).getBounds());
            }
        },120);
    }

    /* --- MAPA (PATCH aplicado) ---
       - centraliza todas as operações do Leaflet em mapInstance
       - cria o mapa em #mapObj (fallback #mapid)
       - z-index e position controlados via CSS no HTML
    */

    // agrupamento de marcadores das entregas
    let layerGroupEntregas = L.layerGroup();

    // ícones (reaproveitei seus ícones do snippet enviado)
    const IconeEntrega = {
        'Pendente': L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
        'Em Rota': L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
        'Entregue': L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
        'Cancelada': L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
    };
    const IconeEntregador = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png',
        iconSize: [25,41], iconAnchor: [12,41], popupAnchor:[1,-34]
    });

    const DEPOSITO_LAT_LNG = L.latLng(CD_LOCATION.lat, CD_LOCATION.lon);
    var marcadoresEntregadores = {}; // motoristas em mapa

    // inicializa o mapa no container correto; garante remoção antes
    function inicializarMapa() {
        // escolha do container: prefer #mapObj (HTML que enviei) — fallback para #mapid
        const containerId = document.getElementById('mapObj') ? 'mapObj' : (document.getElementById('mapid') ? 'mapid' : null);
        if (!containerId) {
            console.warn("Nenhum container de mapa (#mapObj ou #mapid) encontrado no DOM.");
            return false;
        }

        // remove instância anterior, se existir (evita mapa "sobrepondo")
        if (mapInstance) {
            try { mapInstance.remove(); } catch (e) { console.warn('Erro removendo mapInstance anterior', e); }
            mapInstance = null;
            locationMarker = null;
        }

        // cria e configura o mapa no container selecionado
        try {
            mapInstance = L.map(containerId).setView([CD_LOCATION.lat, CD_LOCATION.lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(mapInstance);

            // garante que o layerGroup esteja definido e adicionado
            layerGroupEntregas = L.layerGroup().addTo(mapInstance);

            // force redraw para corrigir problema comum quando o mapa é renderizado dentro de um container invisível
            setTimeout(() => {
                try { mapInstance.invalidateSize(); } catch(e) { /* ignore */ }
            }, 200);

            return true;
        } catch(e) {
            console.error("Erro ao inicializar o Leaflet:", e);
            return false;
        }
    }

    // renderiza marcadores no layerGroupEntregas
    function renderizarMarcadores(entregasFiltradas) {
        // garante mapa inicializado
        if (!mapInstance) {
            const ok = inicializarMapa();
            if (!ok) return;
        }

        layerGroupEntregas.clearLayers();

        entregasFiltradas.forEach(entrega => {
            const lat = entrega.latitude || entrega.lat || CD_LOCATION.lat;
            const lon = entrega.longitude || entrega.lon || CD_LOCATION.lon;
            const status = entrega.status || 'Pendente';
            if (lat && lon) {
                const ico = IconeEntrega[status] || IconeEntrega['Pendente'];
                const marker = L.marker([lat, lon], { icon: ico });
                marker.bindPopup(criarPopupContent(entrega));
                layerGroupEntregas.addLayer(marker);
            }
        });

        // ajusta bounds se houver marcadores
        const layers = layerGroupEntregas.getLayers();
        if (layers.length > 0) {
            const bounds = layerGroupEntregas.getBounds();
            if (bounds.isValid()) {
                mapInstance.fitBounds(bounds, { padding: [50,50] });
            }
        } else {
            // se não houver marcadores, centraliza no depósito
            mapInstance.setView([CD_LOCATION.lat, CD_LOCATION.lon], 13);
        }
    }

    // aplica filtros (usa dadosEntregasOriginais se disponível)
    function aplicarFiltros() {
        const statusSelecionado = document.getElementById('filtroStatus')?.value || 'Todos';
        const motoristaSelecionado = document.getElementById('filtroMotorista')?.value || 'Todos';
        const dataMinima = document.getElementById('filtroData')?.value;

        let entregasFiltradas = dadosEntregasOriginais || [];

        if (statusSelecionado !== 'Todos') {
            entregasFiltradas = entregasFiltradas.filter(e => e.status === statusSelecionado);
        }

        if (motoristaSelecionado !== 'Todos') {
            entregasFiltradas = entregasFiltradas.filter(e => String(e.motorista_id) === motoristaSelecionado);
        }
        
        if (dataMinima) {
            const dataFiltro = new Date(dataMinima);
            entregasFiltradas = entregasFiltradas.filter(e => {
                if (e.previsao_entrega) {
                    const dataEntrega = new Date(e.previsao_entrega.substring(0, 10)); 
                    return dataEntrega >= dataFiltro;
                }
                return false;
            });
        }
        
        renderizarMarcadores(entregasFiltradas);
    }

    async function atualizarPosicoesEntregadores() {
        const ENDPOINT_POSICOES = '/api/entregadores/posicoes';
        try {
            const response = await fetch(ENDPOINT_POSICOES);
            if (!response.ok) return;
            const posicoes = await response.json();

            posicoes.forEach(entregador => {
                const { motorista_id, latitude, longitude, nome, ultima_atualizacao } = entregador;
                if (!latitude || !longitude) return;
                const posicao = L.latLng(latitude, longitude);
                
                if (marcadoresEntregadores[motorista_id]) {
                    marcadoresEntregadores[motorista_id].setLatLng(posicao);
                    const popupContent = `<b>${nome}</b><br>Posição: ${new Date(ultima_atualizacao).toLocaleTimeString()}`;
                    marcadoresEntregadores[motorista_id].setPopupContent(popupContent);

                } else {
                    const popupContent = `<b>${nome}</b><br>Posição: ${new Date(ultima_atualizacao).toLocaleTimeString()}`;
                    const novoMarker = L.marker(posicao, { icon: IconeEntregador })
                                        .bindPopup(popupContent)
                                        .addTo(mapInstance);
                    marcadoresEntregadores[motorista_id] = novoMarker;
                }
            });
            
        } catch (error) {
            console.error("Erro ao rastrear entregadores:", error);
        }
    }

    function desenharRota(lat, lng) {
        // Se usar L.Routing, certifique-se de incluir o plugin no HTML
        if (!mapInstance) inicializarMapa();
        if (!mapInstance) return;

        // remove qualquer routingControl previamente adicionado (se existir)
        if (window._routingControlInstance) {
            try { window._routingControlInstance.remove(); } catch(e){/*ignore*/}
            window._routingControlInstance = null;
        }

        if (typeof L.Routing === 'undefined') {
            alert('Plugin de roteamento não disponível. Inclua leaflet-routing-machine se quiser usar rotas.');
            return;
        }

        const destino = L.latLng(lat, lng);
        const ctrl = L.Routing.control({
            waypoints: [DEPOSITO_LAT_LNG, destino],
            routeWhileDragging: false,
            show: true,
            language: 'pt',
            autoRoute: true,
            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
            lineOptions: {
                styles: [
                    {color: 'black', opacity: 0.15, weight: 9},
                    {color: 'white', opacity: 0.8, weight: 6},
                    {color: '#007bff', opacity: 1, weight: 3}
                ]
            }
        }).addTo(mapInstance);

        window._routingControlInstance = ctrl;

        ctrl.on('routesfound', function(e) {
            const routes = e.routes;
            if (routes.length > 0) {
                const bounds = routes[0].coordinates.reduce((a, b) => a.extend(b), L.latLngBounds());
                mapInstance.fitBounds(bounds, { padding: [50, 50] });
            }
        });
    }

    // cria conteúdo de popup (reaproveitado)
    function criarPopupContent(entrega) {
        const { id, status, endereco, nome_cliente, latitude, longitude } = entrega;
        return `
            <div style="min-width: 180px;">
                <center><b>Entrega #${id} - ${status}</b></center>
                <hr style="margin: 5px 0;">
                <b>Cliente:</b> ${nome_cliente||''}<br>
                <b>Endereço:</b> ${endereco||''}<br>
                
                <hr style="margin: 5px 0;">
                <button onclick="abrirDetalhesEntrega(${id})" 
                        style="width: 100%; margin-bottom: 5px; padding: 5px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Atualizar Status
                </button>
                <button onclick="abrirComprovativoCamera(${id})" 
                        style="width: 100%; margin-bottom: 5px; padding: 5px; background-color: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">
                    Comprovativo / QR Code
                </button>
                <button onclick="desenharRota(${latitude || CD_LOCATION.lat}, ${longitude || CD_LOCATION.lon})" 
                        style="width: 100%; padding: 5px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Mostrar Rota
                </button>
            </div>
        `;
    }

    function abrirComprovativoCamera(entregaId) {
        // Se for usar html5-qrcode, inclua a lib no HTML e adapte aqui.
        const cameraHtml = `<div id="reader" style="width:100%; height: 300px;"></div>`;
        
        if (typeof Swal === 'undefined') {
            alert('Abra o modal de comprovativo (Swal não encontrado).');
            return;
        }

        Swal.fire({
            title: `Comprovativo Entrega #${entregaId}`,
            html: cameraHtml,
            showCancelButton: true,
            showConfirmButton: false,
            didOpen: () => {
                if (typeof Html5Qrcode !== 'undefined') {
                    iniciarQrCodeScanner(entregaId); 
                } else {
                    console.warn('Html5Qrcode não encontrado — inclua a biblioteca para usar scanner neste modal.');
                }
            },
            willClose: () => {
                if (window.qrCodeScanner) {
                    try { window.qrCodeScanner.clear(); } catch(err){ console.warn(err); }
                }
            }
        });
    }

    function iniciarQrCodeScanner(entregaId) {
        if (typeof Html5Qrcode === 'undefined') {
            Swal.showValidationMessage('Html5Qrcode não está carregado.');
            return;
        }

        const html5QrCode = new Html5Qrcode("reader");
        window.qrCodeScanner = html5QrCode;
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        html5QrCode.start({ facingMode: "environment" }, config,
            (decodedText, decodedResult) => {
                html5QrCode.stop().then(() => {
                    Swal.fire({
                        title: 'QR Code Lido!',
                        text: `Código: ${decodedText}. Deseja anexar como comprovativo?`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Anexar'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            enviarComprovativoAPI(entregaId, decodedText, 'QR_CODE');
                        }
                    });
                });
            },
            (errorMessage) => { /* Ignorar erros de varredura contínua */ }
        ).catch((err) => {
            Swal.showValidationMessage(`Erro ao iniciar câmera: ${err}`);
        });
    }

    async function enviarComprovativoAPI(id, dado, tipo) {
        console.log(`Enviando ${tipo} para a Entrega #${id}: ${dado}`);

        try {
            const response = await fetch(`/api/entregas/${id}/comprovante`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo_comprovante: tipo, dado: dado })
            });
            
            if (!response.ok) throw new Error('Falha ao enviar comprovante');

            if (typeof Swal !== 'undefined') Swal.fire('Sucesso!', 'Comprovativo enviado e anexado à entrega.', 'success');
            else alert('Sucesso! Comprovativo enviado.');

        } catch (error) {
            console.error("Erro no envio de comprovativo:", error);
            if (typeof Swal !== 'undefined') Swal.fire('Erro!', 'Não foi possível enviar o comprovativo.', 'error');
            else alert('Erro ao enviar comprovativo.');
        }
    }

    // função para centralizar mapa em um registro
    window.centerMapToRecord = (tracking) => {
        const rec = scanRecords.find(r => r.tracking === tracking);
        if (!rec) return alert('Registro não encontrado');
        renderMap(); // abre o mapa
        setTimeout(() => {
            try {
                const lat = rec.lat || rec.latitude || CD_LOCATION.lat;
                const lon = rec.lon || rec.longitude || CD_LOCATION.lon;
                if (mapInstance) mapInstance.setView([lat, lon], 15);
            } catch(e){ console.warn(e) }
        }, 300);
    };

    // renderMap: cria container #mapObj (está no HTML) e inicializa o mapa
    function renderMap(){
        // remove qualquer mapa anterior para evitar sobreposição
        removeMapIfExists();

        dom.appContainer.style.display = 'grid';
        dom.cameraView.style.display = 'none';
        dom.contentArea.style.display = 'block';

        dom.contentArea.innerHTML = `<div style="position:relative"><button class="close-x" onclick="renderDashboard()">✕</button><h2>🗺️ Mapa de Entregas</h2></div>
            <div class="card"><p class="small-muted">Você está aqui: <span id="currentLoc">Carregando...</span></p><div id="mapObj"></div></div>`;

        // Inicializa mapa com delay pequeno para garantir que o container esteja visível
        setTimeout(() => {
            const ok = inicializarMapa();
            if (!ok) {
                // falha ao inicializar leaflet
                dom.contentArea.querySelector('#mapObj').innerHTML = '<p class="small-muted">Falha ao inicializar o mapa.</p>';
                return;
            }

            // adiciona marcadores das entregas (usando scanRecords)
            // se você quiser usar dadosEntregasOriginais, pode trocar aqui
            const entregasParaMostrar = scanRecords.map(r => ({
                id: r.tracking,
                latitude: r.lat || CD_LOCATION.lat,
                longitude: r.lon || CD_LOCATION.lon,
                status: r.type || 'Pendente',
                nome_cliente: r.cliente || '',
                endereco: r.endereco || ''
            }));
            renderizarMarcadores(entregasParaMostrar);

            // atualiza posição do usuário no mapa (se disponível)
            updateMapLocation();

        }, 120);
    }

    function removeMapIfExists(){
        if (mapInstance) {
            try { mapInstance.remove(); } catch(e){ console.warn(e); }
            mapInstance = null;
            locationMarker = null;
            layerGroupEntregas = L.layerGroup();
        }
        const elMap = document.getElementById('mapObj');
        if (elMap) elMap.innerHTML = '';
        const elRoute = document.getElementById('routeMapObj');
        if (elRoute) elRoute.innerHTML = '';
    }

    function updateMapLocation(){
        if (!mapInstance) return;
        const lat = userLocation ? userLocation.lat : CD_LOCATION.lat;
        const lon = userLocation ? userLocation.lon : CD_LOCATION.lon;
        const currentLocEl = document.getElementById('currentLoc');
        if (currentLocEl) currentLocEl.textContent = `(${lat.toFixed(6)}, ${lon.toFixed(6)})`;
        if (locationMarker) {
            locationMarker.setLatLng([lat, lon]);
        } else {
            locationMarker = L.marker([lat, lon], {
                icon: L.divIcon({ className:'current-location-marker', html:'<div style="background:#ef4444;border:3px solid white;border-radius:50%;width:18px;height:18px"></div>' })
            }).addTo(mapInstance).bindPopup('Sua Localização Atual');
        }
    }

    /* --- CSV Export (agora usando endereço no lugar de lat/lon) --- */
    function generateCSV(period='all', userFilter=''){
        let filtered = [];
        const today = new Date(); today.setHours(0,0,0,0);
        if (period === 'daily') filtered = scanRecords.filter(r => new Date(r.date) >= today);
        else if (period === 'weekly') { const oneWeek = new Date(today); oneWeek.setDate(today.getDate()-7); filtered = scanRecords.filter(r => new Date(r.date) >= oneWeek); }
        else if (period === 'monthly') { const oneMonth = new Date(today); oneMonth.setMonth(today.getMonth()-1); filtered = scanRecords.filter(r => new Date(r.date) >= oneMonth); }
        else filtered = scanRecords.slice();

        if (userFilter) filtered = filtered.filter(r => r.user === userFilter);

        if (!filtered.length) { return alert('Nenhum dado encontrado para o filtro.'); }

        // CSV columns: DATA,HORA,USUARIO,RASTREAMENTO,CLIENTE,ENDERECO,TELEFONE,TYPE,RAW
        let csv = 'DATA,HORA,USUARIO,RASTREAMENTO,CLIENTE,ENDERECO,TELEFONE,TIPO,RAW\n';
        filtered.forEach(r => {
            const d = new Date(r.date);
            const dateStr = d.toLocaleDateString('pt-BR');
            const timeStr = d.toLocaleTimeString('pt-BR');
            const safe = s => `"${(s||'').toString().replace(/"/g,'""')}"`;
            csv += `${dateStr},${timeStr},${r.user},${r.tracking},${safe(r.cliente)},${safe(r.endereco)},${safe(r.telefone)},${r.type},${safe(r.raw)}\n`;
        });

        const filename = `relatorio_pegazus_${period}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        dom.exportOptions.style.display = 'none';
    }

    /* --- User CRUD helpers kept in global scope (as in original) --- */
    window.editUser = (userId) => {
        const userToEdit = userId ? users.find(u => u.id === userId) : null;
        if (userToEdit && userToEdit.id !== currentUser.id && currentUser.role !== 'admin' && (currentUser.role !== 'gestor' || userToEdit.role !== 'colaborador' || userToEdit.creatorId !== currentUser.id)) {
            return alert('Você não tem permissão para editar este usuário.');
        }
        const isAdmin = currentUser.role === 'admin';
        const isSelf = userToEdit && userToEdit.id === currentUser.id;
        const username = userToEdit ? userToEdit.username : prompt('Usuário:');
        if (username === null) return;
        const password = prompt('Senha (deixe em branco para manter):') || (userToEdit ? userToEdit.password : '');
        const role = isAdmin || isSelf ? prompt('Papel (colaborador/gestor/admin):', (userToEdit?userToEdit.role:'colaborador')) : (userToEdit?userToEdit.role:'colaborador');
        if (!userId) {
            const newUser = { id:'u'+Date.now(), username, password, role: (currentUser.role==='gestor' && role!=='colaborador') ? 'colaborador' : role, creatorId: currentUser.id };
            users.push(newUser);
        } else {
            const idx = users.findIndex(u=>u.id===userId);
            if (idx>=0){ users[idx].password = password || users[idx].password; if (isAdmin || isSelf) users[idx].role = role; }
        }
        saveUsers(); renderUsers();
    };
    window.deleteUser = (userId) => {
        if (userId === currentUser.id) return alert('Você não pode excluir seu próprio perfil enquanto logado.');
        if (!confirm('Excluir usuário?')) return;
        users = users.filter(u => u.id !== userId); saveUsers(); renderUsers();
    };

    /* --- Inicialização final --- */
    enumerateDevices();
    // show empty dashboard by default (if logged in)
    if (currentUser) renderDashboard();

    // Exports for some helper functions to global scope for buttons from HTML
    window.renderDashboard = renderDashboard;
    window.renderDeliveries = renderDeliveries;
    window.renderMap = renderMap;
    window.renderRoutes = renderRoutes;
    window.renderUsers = renderUsers;
    window.generateCSV = generateCSV;
    window.lookupShipment = lookupShipment;
});
