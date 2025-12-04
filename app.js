/* app.js — Versão Atualizada com Mapa Tela Cheia e Pesquisa Manual (Modal) */
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
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 };

    let currentUser = null;
    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    let shipments = JSON.parse(localStorage.getItem(STORAGE_KEY_SHIPMENTS) || '{}'); // mapa tracking -> details
    let users = loadUsers();

    let videoStream = null, isScanning = false, videoTrack = null;
    const SCAN_DELAY = 1000;
    let lastScanCode = '', lastScanTime = 0;
    let userLocation = null;
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
        exportUserFilter: document.getElementById('exportUserFilter'),
        btnGenerateCSV: document.getElementById('btnGenerateCSV'),
        // NOVO DOM PARA O MODAL MANUAL
        modalBackdrop: document.getElementById('modalBackdrop'),
        manualInput: document.getElementById('manualInput'),
        manualCancel: document.getElementById('manualCancel'),
        manualSave: document.getElementById('manualSave'),
        btnManualSearch: document.getElementById('btnManualSearch'), // NOVO BOTÃO DA SIDEBAR
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
            if(window.innerWidth <= 900) dom.mobileMenuBtn.classList.remove('hidden'); // Alterado para 900px
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

    /* --- NOVO HELPER PARA FECHAR SIDEBAR EM MODO MOBILE --- */
    function closeSidebarIfOpen() {
        // Verifica se a largura é <= 900px (modo mobile) E se a sidebar está aberta
        if (dom.sidebar && window.innerWidth <= 900 && dom.sidebar.classList.contains('active')) {
            dom.sidebar.classList.remove('active');
        }
    }
    
    /* --- LÓGICA DO MODAL MANUAL --- */
    function openManualModal() {
        if (dom.modalBackdrop) {
            // Garante que o input manual esteja limpo e o modal visível
            dom.manualInput.value = '';
            dom.modalBackdrop.style.display = 'flex';
            dom.manualInput.focus();
        }
    }
    function closeManualModal() {
        if (dom.modalBackdrop) dom.modalBackdrop.style.display = 'none';
    }

    if (dom.manualCancel) dom.manualCancel.addEventListener('click', closeManualModal);
    if (dom.manualSave) dom.manualSave.addEventListener('click', () => {
        const code = dom.manualInput.value.trim();
        if (code) {
            handleScannedTracking(code);
            closeManualModal();
            renderDeliveries(); // Atualiza a lista após a inserção
            alert(`Rastreio "${code}" inserido manualmente.`);
        } else {
            alert('Por favor, insira o código de rastreio.');
        }
    });

    /* --- HELPER DE TELA CHEIA DO MAPA --- */
    function addMapFullscreenClass() {
        if (dom.appContainer) dom.appContainer.classList.add('fullscreen-map-active');
    }
    function removeMapFullscreenClass() {
        if (dom.appContainer) dom.appContainer.classList.remove('fullscreen-map-active');
    }

    /* --- Navegação --- */
    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');
    
    // Adicionando removeMapFullscreenClass() a todas as navegações, exceto Mapa, para garantir o retorno ao layout normal.
    document.getElementById('btnDashboard').addEventListener('click', () => { setActiveMenu('btnDashboard'); renderDashboard(); closeSidebarIfOpen(); removeMapFullscreenClass(); });
    document.getElementById('btnScanMode').addEventListener('click', () => { setActiveMenu('btnScanMode'); openCameraView(); closeSidebarIfOpen(); removeMapFullscreenClass(); });
    document.getElementById('btnDeliveries').addEventListener('click', () => { setActiveMenu('btnDeliveries'); renderDeliveries(); closeSidebarIfOpen(); removeMapFullscreenClass(); });
    document.getElementById('btnMap').addEventListener('click', () => { setActiveMenu('btnMap'); renderMap(); closeSidebarIfOpen(); }); // A função renderMap cuidará da tela cheia
    document.getElementById('btnRoutes').addEventListener('click', () => { setActiveMenu('btnRoutes'); renderRoutes(); closeSidebarIfOpen(); removeMapFullscreenClass(); });
    document.getElementById('btnUsers').addEventListener('click', () => { setActiveMenu('btnUsers'); renderUsers(); closeSidebarIfOpen(); removeMapFullscreenClass(); });
    // NOVO: Ação para o botão de Pesquisa Manual
    if (dom.btnManualSearch) dom.btnManualSearch.addEventListener('click', () => { setActiveMenu('btnManualSearch'); openManualModal(); closeSidebarIfOpen(); removeMapFullscreenClass(); });

    document.getElementById('btnExport').addEventListener('click', () => {
        if (dom.exportOptions) dom.exportOptions.style.display = dom.exportOptions.style.display === 'block' ? 'none' : 'block';
    });
    if (dom.btnGenerateCSV) dom.btnGenerateCSV.addEventListener('click', () => generateCSV(dom.exportPeriod.value, dom.exportUserFilter.value.trim()));

    const btnCloseCamera = document.getElementById('btnCloseCamera');
    // A lógica de fechar scanner e voltar ao dashboard já existe e usa o 'X' vermelho (CSS .close-x)
    if (btnCloseCamera) btnCloseCamera.addEventListener('click', () => { stopScanner(); closeCameraView(); renderDashboard(); });

    const btnTorch = document.getElementById('btnTorch');
    const btnManual = document.getElementById('btnManual');
    if (btnTorch) { /* ... (torch logic) ... */ }
    // O botão manual da tela da câmera agora também abre o modal:
    if (btnManual) btnManual.addEventListener('click', () => { openManualModal(); });

    function setActiveMenu(id){
        Array.from(document.querySelectorAll('.menu-item')).forEach(el => el.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    /* --- Camera / Scanner --- */
    // ... (enumerateDevices, startScanner, stopScanner, tick - unchanged) ...

    function openCameraView(){
        // Fecha mapa (se houver) antes de abrir câmera
        removeMapIfExists();
        removeMapFullscreenClass();
        if (dom.contentArea) dom.contentArea.style.display = 'none';
        if (dom.cameraView) dom.cameraView.style.display = 'flex';
        if (dom.appContainer) dom.appContainer.style.display = 'none';
        startScanner();
    }
    function closeCameraView(){
        if (dom.cameraView) dom.cameraView.style.display = 'none';
        if (dom.appContainer) dom.appContainer.style.display = 'grid';
        if (dom.contentArea) dom.contentArea.style.display = 'block';
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
            raw: raw
        };
        // adiciona ao topo e salva
        scanRecords.unshift(record);
        saveScans();
        showScanFeedback(record);
    }

    /* --- Shipment lookup / edição local --- */
    function lookupShipment(tracking){
        // ... (unchanged) ...
        if (shipments[tracking]) return shipments[tracking];
        shipments[tracking] = { tracking, name: '', address: 'Endereço desconhecido', phone: '', carrier: '' };
        saveShipments();
        return shipments[tracking];
    }
    window.editShipment = (tracking) => {
        // ... (unchanged) ...
        const s = lookupShipment(tracking);
        const name = prompt('Nome do cliente:', s.name || '');
        if (name === null) return;
        const address = prompt('Endereço completo:', s.address || '');
        if (address === null) return;
        const phone = prompt('Telefone:', s.phone || '');
        if (phone === null) return;
        s.name = name; s.address = address; s.phone = phone;
        shipments[tracking] = s; saveShipments();
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

    /* --- RENDERERS --- */
    function renderDashboard(){
        removeMapIfExists();
        removeMapFullscreenClass(); // Garante o layout normal
        if (dom.appContainer) dom.appContainer.style.display = 'grid';
        if (dom.cameraView) dom.cameraView.style.display = 'none';
        if (dom.contentArea) dom.contentArea.style.display = 'block';
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
        `;
        dom.contentArea.innerHTML = html;
    }

    window.openCameraProgramatic = () => { setActiveMenu('btnScanMode'); openCameraView(); closeSidebarIfOpen(); }

    function renderDeliveries(){
        removeMapIfExists();
        removeMapFullscreenClass(); // Garante o layout normal
        if (dom.appContainer) dom.appContainer.style.display = 'grid';
        if (dom.cameraView) dom.cameraView.style.display = 'none';
        if (dom.contentArea) dom.contentArea.style.display = 'block';

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

        const btnNewManual = document.getElementById('btnNewManual');
        if (btnNewManual) btnNewManual.addEventListener('click', ()=> { openManualModal(); }); // Abre o modal

        const searchInput = document.getElementById('searchDelivery');
        if (searchInput) searchInput.addEventListener('input', () => {
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
        // ... (unchanged) ...
    };

    function renderUsers(){
        removeMapIfExists();
        removeMapFullscreenClass();
        if (!dom.contentArea) return;
        // ... (rest of renderUsers - unchanged) ...
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
        removeMapFullscreenClass();
        if (!dom.contentArea) return;
        // ... (rest of renderRoutes - unchanged) ...
        dom.contentArea.innerHTML = `<div style="position:relative"><button class="close-x" onclick="renderDashboard()">✕</button><h2>🧭 Otimizar Rotas</h2></div>
          <div class="card"><p class="small-muted">Gerando uma simulação com seus últimos pontos...</p><div id="routeMapObj" class="map-wrapper"></div></div>`;
        setTimeout(() => {
            const deliveryPoints = scanRecords.map(r=>({lat: r.lat||CD_LOCATION.lat, lon: r.lon||CD_LOCATION.lon, id: r.tracking}));
            if (deliveryPoints.length < 2) { const el = document.getElementById('routeMapObj'); if (el) el.innerHTML = '<p class="small-muted">Escaneie ao menos 2 entregas para simular rota.</p>'; return; }
            const route = deliveryPoints.slice(0,10).sort(()=>Math.random()-0.5);
            removeMapIfExists();
            mapInstance = L.map('routeMapObj').setView([route[0].lat, route[0].lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OSM' }).addTo(mapInstance);
            try { mapInstance.getContainer().style.zIndex = '1'; } catch(e){}
            const routePoints = route.map((p,i) => {
                const marker = L.marker([p.lat,p.lon]).addTo(mapInstance).bindPopup(`<b>Ponto ${i+1}</b><br>${p.id}`);
                return [p.lat,p.lon];
            });
            if (routePoints.length>1) {
                L.polyline(routePoints,{color:'#22c55e', weight:5}).addTo(mapInstance);
                mapInstance.fitBounds(L.polyline(routePoints).getBounds());
            }
        },120);
    }

    function renderMap(){
        // When opening map ensure previous map removed to avoid "stuck" map
        removeMapIfExists();
        // A classe de tela cheia é adicionada aqui
        addMapFullscreenClass(); 

        if (!dom.contentArea) return;
        dom.contentArea.style.display = 'block';
        if (dom.cameraView) dom.cameraView.style.display = 'none';
        if (dom.appContainer) dom.appContainer.style.display = 'grid';

        // Ajuste no HTML para permitir que o mapa ocupe toda a área do .main (que agora é full screen)
        dom.contentArea.innerHTML = `<div style="position:relative;height:100%;"><button class="close-x" onclick="renderDashboard()" title="Fechar">✕</button><h2>🗺️ Mapa de Entregas</h2>
            <div class="card" style="height:calc(100vh - 60px); padding:0;"><p class="small-muted" style="padding:10px 15px; margin-bottom:0;">Você está aqui: <span id="currentLoc">Carregando...</span></p>
                <div id="mapObj" class="map-wrapper" style="height:calc(100% - 35px);"></div>
            </div>
        </div>`;

        setTimeout(() => {
            const initialLat = userLocation ? userLocation.lat : CD_LOCATION.lat;
            const initialLon = userLocation ? userLocation.lon : CD_LOCATION.lon;
            mapInstance = L.map('mapObj').setView([initialLat, initialLon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OSM' }).addTo(mapInstance);
            
            // Força a atualização do tamanho do mapa após o layout mudar (essencial para Leaflet)
            mapInstance.invalidateSize();

            try {
                mapInstance.getContainer().style.zIndex = '1';
                const panes = mapInstance.getPanes && mapInstance.getPanes();
                if (panes && panes.tilePane) panes.tilePane.style.zIndex = '1';
            } catch(e){ console.warn('z-index patch error', e); }

            scanRecords.forEach(r => {
                const lat = r.lat || CD_LOCATION.lat;
                const lon = r.lon || CD_LOCATION.lon;
                L.marker([lat,lon]).addTo(mapInstance).bindPopup(`<b>${r.tracking}</b><br>${r.cliente || ''}<br>${r.endereco || ''}`);
            });

            updateMapLocation();
        },120);
    }

    function removeMapIfExists(){
        removeMapFullscreenClass(); // Remove a classe de tela cheia ao fechar
        if (mapInstance) {
            try { mapInstance.remove(); } catch(e){ console.warn(e); }
            mapInstance = null;
            locationMarker = null;
            const el = document.getElementById('mapObj');
            if (el) el.innerHTML = '';
            const rEl = document.getElementById('routeMapObj');
            if (rEl) rEl.innerHTML = '';
        }
    }

    function updateMapLocation(){
        // ... (unchanged) ...
        if (!mapInstance) return;
        const initialLat = userLocation ? userLocation.lat : CD_LOCATION.lat;
        const initialLon = userLocation ? userLocation.lon : CD_LOCATION.lon;
        const currentLocEl = document.getElementById('currentLoc');
        if (currentLocEl) currentLocEl.textContent = `(${initialLat.toFixed(6)}, ${initialLon.toFixed(6)})`;
        if (locationMarker) locationMarker.setLatLng([initialLat, initialLon]);
        else {
            locationMarker = L.marker([initialLat, initialLon], {
                icon: L.divIcon({ className:'current-location-marker', html:'<div style="background:#ef4444;border:3px solid white;border-radius:50%;width:18px;height:18px"></div>' })
            }).addTo(mapInstance).bindPopup('Sua Localização Atual');
        }
    }

    window.centerMapToRecord = (tracking) => {
        // ... (unchanged) ...
    };

    /* --- CSV Export (agora usando endereço no lugar de lat/lon) --- */
    function generateCSV(period='all', userFilter=''){
        // ... (unchanged) ...
    }

    /* --- User CRUD helpers kept in global scope (as in original) --- */
    window.editUser = (userId) => {
        // ... (unchanged) ...
    };
    window.deleteUser = (userId) => {
        // ... (unchanged) ...
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
    window.openManualModal = openManualModal; // Exporta para uso em outros botões se necessário
});
