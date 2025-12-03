/* app.js — versão integrada e aprimorada (PATCH: Esconder Sidebar após clique) */
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
    // CD_LOCATION agora inclui um ponto de latitude/longitude para uso nos registros
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
        
        // NOVO: Modal Câmera/Filtros
        cameraModal: document.getElementById('cameraModal'),
        btnComar: document.getElementById('btnComar'),
        btnCloseCameraModal: document.getElementById('btnCloseCameraModal'),
        btnAbrirCameraParaComprovante: document.getElementById('abrirCameraParaComprovante'),
        btnAptsaischanComprovante: document.getElementById('AptsaischanComprovante'),
        btnAfssranRota: document.getElementById('AfssranRota'),
        btnMesranRota: document.getElementById('MesranRota'),
        btnCararIagas: document.getElementById('CararIagas'),
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
        return users = existingUsers;
    }
    function saveUsers(){ localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users)); }
    function saveScans(){ localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords)); }
    function saveShipments(){ localStorage.setItem(STORAGE_KEY_SHIPMENTS, JSON.stringify(shipments)); }
    
    // Adiciona lat/lon default se estiverem faltando (para que o mapa funcione)
    function ensureShipmentGeoData(tracking){
        if (!shipments[tracking].lat || !shipments[tracking].lon) {
             // Simulação de coordenadas para demonstração
             shipments[tracking].lat = CD_LOCATION.lat + (Math.random() - 0.5) * 0.05;
             shipments[tracking].lon = CD_LOCATION.lon + (Math.random() - 0.5) * 0.05;
             saveShipments();
        }
    }
    
    // Adiciona dados demo se não existirem
    function ensureDemoData(){
        if(scanRecords.length === 0){
            scanRecords = [
                { id:'BR987654321', tracking:'BR987654321', date: new Date().toISOString(), user:'thon', type:'Entrega', cliente:'João da Silva', endereco:'Av. Paulista, 1000', raw:'BR987654321', lat:-23.564, lon:-46.652 },
                { id:'BR112233445', tracking:'BR112233445', date: new Date(Date.now()-86400000).toISOString(), user:'maria', type:'Coleta', cliente:'Ana Paula', endereco:'Rua da Consolação, 500', raw:'BR112233445', lat:-23.555, lon:-46.659 },
                { id:'BR556677889', tracking:'BR556677889', date: new Date(Date.now()-3600000).toISOString(), user:'joao', type:'Entrega', cliente:'Carlos Souza', endereco:'Rua Fictícia, 1', raw:'BR556677889', lat:-23.551, lon:-46.638 }
            ];
            shipments['BR987654321'] = { tracking:'BR987654321', name:'João da Silva', address:'Av. Paulista, 1000', phone:'(11)99999-0000', carrier:'Genérico', lat:-23.564, lon:-46.652 };
            shipments['BR112233445'] = { tracking:'BR112233445', name:'Ana Paula', address:'Rua da Consolação, 500', phone:'(11)98888-1111', carrier:'Genérico', lat:-23.555, lon:-46.659 };
            shipments['BR556677889'] = { tracking:'BR556677889', name:'Carlos Souza', address:'Rua Fictícia, 1', phone:'(11)97777-2222', carrier:'Genérico', lat:-23.551, lon:-46.638 };
            saveScans(); saveShipments();
        }
    }
    ensureDemoData();

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

    // NOVO: Função para fechar a sidebar se estiver aberta (útil no mobile)
    function closeSidebarIfActive() {
        if (dom.sidebar.classList.contains('active')) {
            window.toggleSidebar();
        }
    }
    
    // Listeners do menu principal
    document.getElementById('btnDashboard').addEventListener('click', () => { setActiveMenu('btnDashboard'); renderDashboard(); closeSidebarIfActive(); });
    document.getElementById('btnScanMode').addEventListener('click', () => { setActiveMenu('btnScanMode'); openCameraView(); closeSidebarIfActive(); });
    document.getElementById('btnDeliveries').addEventListener('click', () => { setActiveMenu('btnDeliveries'); renderDeliveries(); closeSidebarIfActive(); });
    document.getElementById('btnMap').addEventListener('click', () => { setActiveMenu('btnMap'); renderMap(); closeSidebarIfActive(); });
    document.getElementById('btnRoutes').addEventListener('click', () => { setActiveMenu('btnRoutes'); renderRoutes(); closeSidebarIfActive(); });
    document.getElementById('btnUsers').addEventListener('click', () => { setActiveMenu('btnUsers'); renderUsers(); closeSidebarIfActive(); });
    
    // Listener do menu fixo (mobile dashboard button)
    document.getElementById('btnDashboardMobile').addEventListener('click', () => { setActiveMenu('btnDashboard'); renderDashboard(); closeSidebarIfActive(); });

    document.getElementById('btnExport').addEventListener('click', () => {
        if (dom.exportOptions) dom.exportOptions.style.display = dom.exportOptions.style.display === 'block' ? 'none' : 'block';
    });
    if (dom.btnGenerateCSV) dom.btnGenerateCSV.addEventListener('click', () => generateCSV(dom.exportPeriod.value, dom.exportUserFilter.value.trim()));

    const btnCloseCamera = document.getElementById('btnCloseCamera');
    if (btnCloseCamera) btnCloseCamera.addEventListener('click', () => { stopScanner(); closeCameraView(); renderDashboard(); });

    const btnTorch = document.getElementById('btnTorch');
    const btnManual = document.getElementById('btnManual');
    if (btnTorch) btnTorch.addEventListener('click', async () => {
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
    if (btnManual) btnManual.addEventListener('click', () => {
        // open simple prompt for manual tracking
        const code = prompt('Digite o número de rastreio (ex: BR123456789):');
        if (code) { handleScannedTracking(code.trim()); alert('Rastreio inserido manualmente.'); }
    });
    
    /* --- NOVO: Lógica da Modal Câmera/Filtros --- */
    
    function openCameraModal() {
        if (!currentUser) return alert('Faça login primeiro.');
        // Fecha a área principal de conteúdo e abre a modal
        if (dom.contentArea) dom.contentArea.style.display = 'none';
        dom.cameraModal.style.display = 'flex';
        // Garante que o scanner e mapa estejam fechados
        stopScanner();
        removeMapIfExists();
    }

    function closeCameraModal() {
        dom.cameraModal.style.display = 'none';
        if (dom.contentArea) dom.contentArea.style.display = 'block';
        renderDashboard(); // Volta para a dashboard ao fechar
    }

    function handleModalAction(action) {
        closeCameraModal();

        switch (action) {
            case 'abrirCameraParaComprovante':
                // Reusa a função do scanner existente
                openCameraView();
                alert('Scanner ativo para Comprovante de ID. (Escaneie o QR Code)');
                break;
            case 'AfssranRota':
                // Simula o cálculo de rota. Procura o primeiro pacote pendente para centrar o mapa
                const firstPending = scanRecords.find(r => !r.status || r.status.toLowerCase() !== 'entregue');
                if (firstPending) {
                    // Garante que o registro tem coordenadas, mesmo que simuladas
                    ensureShipmentGeoData(firstPending.tracking);
                    window.centerMapToRecord(firstPending.tracking);
                    setActiveMenu('btnMap');
                    alert(`Simulando rota para: ${firstPending.tracking}.`);
                } else {
                    alert('Nenhuma entrega pendente encontrada para simular rota. Abrindo mapa geral.');
                    renderMap();
                    setActiveMenu('btnMap');
                }
                break;
            case 'AptsaischanComprovante':
                alert('Ação "Aptsaischan Comprovante (id)" executada. (Simulação de envio de comprovante)');
                break;
            case 'MesranRota':
                alert('Ação "Mesran Rota (007bi ff (Bf 5)" executada.');
                break;
            case 'CararIagas':
                alert('Ação "Carar Iagas (sians)" executada.');
                break;
            default:
                alert(`Ação ${action} confirmada.`);
                break;
        }
    }
    
    if(dom.btnComar) dom.btnComar.addEventListener('click', openCameraModal);
    if(dom.btnCloseCameraModal) dom.btnCloseCameraModal.addEventListener('click', closeCameraModal);
    if(dom.btnAbrirCameraParaComprovante) dom.btnAbrirCameraParaComprovante.addEventListener('click', () => handleModalAction('abrirCameraParaComprovante'));
    if(dom.btnAptsaischanComprovante) dom.btnAptsaischanComprovante.addEventListener('click', () => handleModalAction('AptsaischanComprovante'));
    if(dom.btnAfssranRota) dom.btnAfssranRota.addEventListener('click', () => handleModalAction('AfssranRota'));
    if(dom.btnMesranRota) dom.btnMesranRota.addEventListener('click', () => handleModalAction('MesranRota'));
    if(dom.btnCararIagas) dom.btnCararIagas.addEventListener('click', () => handleModalAction('CararIagas'));


    function setActiveMenu(id){
        Array.from(document.querySelectorAll('.menu-item')).forEach(el => el.classList.remove('active'));
        Array.from(document.querySelectorAll('.left-menu-item')).forEach(el => el.classList.remove('active'));
        
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
        
        // Ativa o item correspondente no menu fixo
        if (id === 'btnDashboard' && document.getElementById('btnDashboardMobile')) {
             document.getElementById('btnDashboardMobile').classList.add('active');
        }
    }

    /* --- Camera / Scanner --- */
    if (dom.cameraSelect) dom.cameraSelect.addEventListener('change', (e) => { if (isScanning) startScanner(e.target.value); });

    async function enumerateDevices(){
        try {
            const initialStream = await navigator.mediaDevices.getUserMedia({ video:true });
            initialStream.getTracks().forEach(t=>t.stop());
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            if (dom.cameraSelect) {
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
            }
        } catch(e){ console.warn('enumerateDevices err', e); }
    }

    async function startScanner(deviceId=null){
        if (isScanning && !deviceId) return;
        stopScanner();
        const videoDevices = dom.cameraSelect ? Array.from(dom.cameraSelect.options) : [];
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
            if (targetDeviceId && dom.cameraSelect) dom.cameraSelect.value = targetDeviceId;
            requestAnimationFrame(tick);
        } catch(err){
            console.error(err);
            alert('Erro ao acessar câmera: ' + (err && err.message ? err.message : err));
            closeCameraView();
            renderDashboard();
        }
    }
    function stopScanner(){
        isScanning = false;
        if (videoStream){ videoStream.getTracks().forEach(t=>t.stop()); videoStream = null; }
        if (dom.video) dom.video.srcObject = null;
        videoTrack = null;
    }

    function openCameraView(){
        // Fecha mapa (se houver) antes de abrir câmera
        removeMapIfExists();
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

    function tick(){
        if (!isScanning) return;
        if (dom.video && dom.video.readyState === dom.video.HAVE_ENOUGH_DATA) {
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
        const now = Date.now();
        if (raw === lastScanCode && (now - lastScanTime) < SCAN_DELAY) return;
        lastScanCode = raw; lastScanTime = now;
        
        // No Formato 4 o raw é algo como BR123456789 (apenas tracking)
        // Normaliza
        const tracking = raw.split(/\s/)[0];
        // Lookup local
        const details = lookupShipment(tracking);
        const nowISO = new Date().toISOString();
        
        // Garante lat/lon simulada para o registro
        ensureShipmentGeoData(tracking);
        
        const record = {
            id: tracking,
            tracking,
            date: nowISO,
            user: currentUser ? currentUser.username : 'unknown',
            type: details.carrier || 'Genérico',
            endereco: details.address || '',
            telefone: details.phone || '',
            cliente: details.name || '',
            lat: shipments[tracking].lat, // Usa a coordenada garantida
            lon: shipments[tracking].lon, // Usa a coordenada garantida
            raw: raw
        };
        // adiciona ao topo e salva
        // Verifica se o registro já existe para evitar duplicatas, mas registra novo scan
        const existingIndex = scanRecords.findIndex(r => r.tracking === tracking);
        if (existingIndex > -1) {
            scanRecords.splice(existingIndex, 1); // Remove o antigo
        }
        scanRecords.unshift(record);
        saveScans();
        showScanFeedback(record);
    }

    /* --- Shipment lookup / edição local --- */
    function lookupShipment(tracking){
        // se já existe no DB local -> retorna
        if (shipments[tracking]) {
            // Garante que o registro tem coordenadas, mesmo que simuladas
            ensureShipmentGeoData(tracking);
            return shipments[tracking];
        }
        // se não existe, cria placeholder (você pode editar depois)
        shipments[tracking] = {
            tracking,
            name: '',
            address: 'Endereço desconhecido', // default; você pode editar
            phone: '',
            carrier: ''
        };
        // Garante que o registro tem coordenadas, mesmo que simuladas
        ensureShipmentGeoData(tracking);
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

    /* --- RENDERERS --- */
    function renderDashboard(){
        // remove mapa se aberto
        removeMapIfExists();
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
        if (btnNewManual) btnNewManual.addEventListener('click', ()=> {
            const code = prompt('Digite rastreio (ex: BR123456789):');
            if (code) { handleScannedTracking(code.trim()); renderDeliveries(); }
        });

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
        if (!dom.contentArea) return;
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
        if (!dom.contentArea) return;
        dom.contentArea.innerHTML = `<h2>🧭 Otimizar Rotas</h2><div class="card"><p class="small-muted">Gerando uma simulação com seus últimos pontos...</p><div id="routeMapObj" class="map-wrapper"></div></div>`;
        setTimeout(() => {
            const deliveryPoints = scanRecords.map(r=>({lat: r.lat||CD_LOCATION.lat, lon: r.lon||CD_LOCATION.lon, id: r.tracking}));
            if (deliveryPoints.length < 2) { const el = document.getElementById('routeMapObj'); if (el) el.innerHTML = '<p class="small-muted">Escaneie ao menos 2 entregas para simular rota.</p>'; return; }
            
            // Simula uma rota com os 10 primeiros pontos com lat/lon
            const route = deliveryPoints.filter(p => p.lat && p.lon).slice(0,10).sort(()=>Math.random()-0.5);
            
            // Adiciona o CD_LOCATION como ponto de partida
            const routePoints = [{lat: CD_LOCATION.lat, lon: CD_LOCATION.lon, id: 'CD'}].concat(route);
            
            // create map
            removeMapIfExists();
            mapInstance = L.map('routeMapObj').setView([routePoints[0].lat, routePoints[0].lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OSM' }).addTo(mapInstance);
            
            try { mapInstance.getContainer().style.zIndex = '1'; } catch(e){}
            const polylinePoints = routePoints.map((p,i) => {
                const markerColor = i === 0 ? '#0ea5e9' : '#22c55e';
                const marker = L.marker([p.lat,p.lon], {
                    icon: L.divIcon({ className: `route-marker-${i}`, html:`<div style="background:${markerColor};border:3px solid white;border-radius:50%;width:18px;height:18px"></div>` })
                }).addTo(mapInstance).bindPopup(`<b>${i === 0 ? 'CD (Início)' : 'Ponto ' + i}</b><br>${p.id}`);
                return [p.lat,p.lon];
            });
            if (polylinePoints.length>1) {
                L.polyline(polylinePoints,{color:'#22c55e', weight:5}).addTo(mapInstance);
                mapInstance.fitBounds(L.polyline(polylinePoints).getBounds());
            }
        },120);
    }

    function renderMap(){
        // When opening map ensure previous map removed to avoid "stuck" map
        removeMapIfExists();
        if (!dom.contentArea) return;
        dom.contentArea.style.display = 'block';
        if (dom.cameraView) dom.cameraView.style.display = 'none';
        if (dom.appContainer) dom.appContainer.style.display = 'grid';

        dom.contentArea.innerHTML = `<div style="position:relative"><button class="close-x" onclick="renderDashboard()">✕</button><h2>🗺️ Mapa de Entregas</h2></div>
            <div class="card"><p class="small-muted">Você está aqui: <span id="currentLoc">Carregando...</span></p><div id="mapObj" class="map-wrapper"></div></div>`;

        setTimeout(() => {
            const initialLat = userLocation ? userLocation.lat : CD_LOCATION.lat;
            const initialLon = userLocation ? userLocation.lon : CD_LOCATION.lon;
            mapInstance = L.map('mapObj').setView([initialLat, initialLon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OSM' }).addTo(mapInstance);
            // Ensure map container z-index stays behind sidebar
            try {
                mapInstance.getContainer().style.zIndex = '1';
                const panes = mapInstance.getPanes && mapInstance.getPanes();
                if (panes && panes.tilePane) panes.tilePane.style.zIndex = '1';
            } catch(e){ console.warn('z-index patch error', e); }

            scanRecords.forEach(r => {
                // Garante que a coordenada existe, mesmo que simulada
                ensureShipmentGeoData(r.tracking);
                const lat = r.lat || shipments[r.tracking].lat;
                const lon = r.lon || shipments[r.tracking].lon;
                L.marker([lat,lon]).addTo(mapInstance).bindPopup(`<b>${r.tracking}</b><br>${r.cliente || ''}<br>${r.endereco || ''}`);
            });

            updateMapLocation();
        },120);
    }

    function removeMapIfExists(){
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
        // opens map and centers on first matching record (if possible)
        const rec = scanRecords.find(r => r.tracking === tracking);
        if (!rec) return alert('Registro não encontrado');
        renderMap();
        setTimeout(() => {
            try {
                // Garante que a coordenada existe, mesmo que simulada
                ensureShipmentGeoData(tracking);
                const lat = rec.lat || shipments[tracking].lat;
                const lon = rec.lon || shipments[tracking].lon;
                if (mapInstance) mapInstance.setView([lat, lon], 15);
            } catch(e){ console.warn(e) }
        },200);
    };

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
        if (dom.exportOptions) dom.exportOptions.style.display = 'none';
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
    window.centerMapToRecord = centerMapToRecord;
});
