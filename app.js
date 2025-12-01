/* app.js — versão integrada e aprimorada (PATCH: Modal Manual Input e CSS/HTML updates) */
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
        // NOVOS ELEMENTOS DO MODAL
        modalBackdrop: document.getElementById('modalBackdrop'),
        manualInput: document.getElementById('manualInput'),
        manualSave: document.getElementById('manualSave'),
        manualCancel: document.getElementById('manualCancel'),
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
            if(window.innerWidth <= 900) dom.mobileMenuBtn.classList.remove('hidden'); // Ajuste para 900px
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
        dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.5; color:var(--content-text-dark)"><h2>Até logo</h2></div>`;
    });

    /* --- Navegação --- */
    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');
    document.getElementById('btnDashboard').addEventListener('click', () => { setActiveMenu('btnDashboard'); renderDashboard(); });
    document.getElementById('btnScanMode').addEventListener('click', () => { setActiveMenu('btnScanMode'); openCameraView(); });
    document.getElementById('btnDeliveries').addEventListener('click', () => { setActiveMenu('btnDeliveries'); renderDeliveries(); });
    document.getElementById('btnMap').addEventListener('click', () => { setActiveMenu('btnMap'); renderMap(); });
    document.getElementById('btnRoutes').addEventListener('click', () => { setActiveMenu('btnRoutes'); renderRoutes(); });
    document.getElementById('btnUsers').addEventListener('click', () => { setActiveMenu('btnUsers'); renderUsers(); });

    // Lógica para o Menu de Exportação
    document.getElementById('btnExport').addEventListener('click', () => {
        if (dom.exportOptions) dom.exportOptions.style.display = dom.exportOptions.style.display === 'flex' ? 'none' : 'flex';
    });
    if (dom.btnGenerateCSV) dom.btnGenerateCSV.addEventListener('click', () => generateCSV(dom.exportPeriod.value, dom.exportUserFilter.value.trim()));

    const btnCloseCamera = document.getElementById('btnCloseCamera');
    if (btnCloseCamera) btnCloseCamera.addEventListener('click', () => { stopScanner(); closeCameraView(); renderDashboard(); });

    const btnTorch = document.getElementById('btnTorch');
    const btnManual = document.getElementById('btnManual'); // Agora abre o modal

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

    // MODIFICAÇÃO: Conectar botão manual ao novo Modal
    if (btnManual) btnManual.addEventListener('click', showManualModal);
    if (dom.manualCancel) dom.manualCancel.addEventListener('click', hideManualModal);
    if (dom.manualSave) dom.manualSave.addEventListener('click', handleManualSave);


    function setActiveMenu(id){
        Array.from(document.querySelectorAll('.menu-item')).forEach(el => el.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
        if(window.innerWidth <= 900) dom.sidebar.classList.remove('active'); // Fechar menu em mobile
    }

    /* --- Modal Manual Input --- */
    function showManualModal(){
        if(dom.modalBackdrop) {
            dom.modalBackdrop.style.display = 'flex';
            dom.modalBackdrop.setAttribute('aria-hidden', 'false');
            if(dom.manualInput) dom.manualInput.value = '';
        }
    }

    function hideManualModal(){
        if(dom.modalBackdrop) {
            dom.modalBackdrop.style.display = 'none';
            dom.modalBackdrop.setAttribute('aria-hidden', 'true');
        }
    }

    function handleManualSave(){
        const code = dom.manualInput ? dom.manualInput.value.trim() : '';
        if (code) { 
            handleScannedTracking(code);
            alert('Rastreio inserido manualmente: ' + code);
            hideManualModal();
        } else {
            alert('Por favor, digite um código de rastreio.');
        }
        // Se estiver na view de Scanner, o feedback já será dado. Se estiver em Lista, recarrega a lista.
        if (dom.contentArea && dom.contentArea.innerHTML.includes('Lista de Entregas')) renderDeliveries();
    }


    /* --- Camera / Scanner --- */
    if (dom.cameraSelect) dom.cameraSelect.addEventListener('change', (e) => { if (isScanning) startScanner(e.target.value); });

    async function enumerateDevices(){
        try {
            // Tenta obter permissão primeiro
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
        } catch(e){ console.warn('enumerateDevices err. Permissão de câmera negada ou indisponível.', e); }
    }

    async function startScanner(deviceId=null){
        if (isScanning && !deviceId) return;
        stopScanner();
        const videoDevices = dom.cameraSelect ? Array.from(dom.cameraSelect.options) : [];
        let targetDeviceId = deviceId;
        if (!targetDeviceId && videoDevices.length>0) {
            // Tenta selecionar a câmera traseira como padrão
            const preferred = videoDevices.find(o => o.text.toLowerCase().includes('back') || o.text.toLowerCase().includes('traseira') || o.text.toLowerCase().includes('environment'));
            targetDeviceId = preferred ? preferred.value : videoDevices[0].value;
        }
        // Tenta usar constraints específicas, se falhar, tenta genéricas
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
            alert('Erro ao acessar câmera: ' + (err && err.message ? err.message : 'Verifique as permissões.'));
            closeCameraView();
            renderDashboard();
        }
    }
    function stopScanner(){
        isScanning = false;
        if (videoStream){ 
            videoStream.getTracks().forEach(t=>{
                if (t.kind === 'video') t.stop();
            }); 
            videoStream = null; 
        }
        if (dom.video) dom.video.srcObject = null;
        videoTrack = null;
    }

    function openCameraView(){
        // Fecha mapa (se houver) antes de abrir câmera
        removeMapIfExists();
        // Esconde o app container e mostra a view de câmera em tela cheia
        if (dom.appContainer) dom.appContainer.classList.add('hidden');
        if (dom.cameraView) dom.cameraView.style.display = 'flex';
        startScanner();
    }
    function closeCameraView(){
        // Esconde a view de câmera e mostra o app container
        if (dom.cameraView) dom.cameraView.style.display = 'none';
        if (dom.appContainer) dom.appContainer.classList.remove('hidden');
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
            
            // Centraliza o corte (área de interesse do scanner)
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
        // Previne múltiplos scans do mesmo código rapidamente
        const now = Date.now();
        if (raw === lastScanCode && (now - lastScanTime) < SCAN_DELAY) {
            return;
        }
        lastScanCode = raw;
        lastScanTime = now;

        // Normaliza (assume que o código é o primeiro token se houver espaço)
        const tracking = raw.split(/\s/)[0];
        // Lookup local e obtém/cria detalhes
        const details = lookupShipment(tracking);
        const isoNow = new Date().toISOString();
        
        const record = {
            id: tracking + '_' + isoNow, // ID único para registro
            tracking,
            date: isoNow,
            user: currentUser ? currentUser.username : 'unknown',
            type: details.carrier || 'Genérico',
            endereco: details.address || '',
            telefone: details.phone || '',
            cliente: details.name || '',
            raw: raw,
            // Lat/Lon fictícios/default para renderização no mapa, se não houver geocodificação real
            lat: CD_LOCATION.lat + (Math.random() - 0.5) * 0.005, 
            lon: CD_LOCATION.lon + (Math.random() - 0.5) * 0.005
        };
        // Adiciona ao topo e salva
        scanRecords.unshift(record);
        saveScans();
        showScanFeedback(record);
    }

    /* --- Shipment lookup / edição local --- */
    function lookupShipment(tracking){
        // se já existe no DB local -> retorna
        if (shipments[tracking]) return shipments[tracking];
        // se não existe, cria placeholder
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
        
        // Atualiza todos os registros de scan que possuem este tracking
        scanRecords = scanRecords.map(r => r.tracking === tracking ? ({ ...r, cliente: s.name, endereco: s.address, telefone: s.phone }) : r);
        saveScans();
        
        renderDeliveries(); // refresh, se estiver nesta tela
        alert('Dados do rastreio atualizados.');
    };

    /* --- Feedback/UI --- */
    function showScanFeedback(record){
        const detail = record.cliente || record.endereco || 'Detalhes desconhecidos';
        dom.feedback.textContent = `✅ LIDO: ${record.tracking} — ${detail}`;
        dom.feedback.style.opacity = '1';
        setTimeout(()=> dom.feedback.style.opacity = '0', 2500);
    }

    /* --- RENDERERS --- */
    function renderDashboard(){
        removeMapIfExists();
        dom.appContainer.classList.remove('hidden');
        if (dom.cameraView) dom.cameraView.style.display = 'none';

        const lastScans = scanRecords.slice(0,8);
        const html = `
            <h2>📦 Dashboard de Entregas</h2>
            <div class="user-form-card">
              <p style="margin:0; font-size:16px;">Total de registros escaneados: <strong>${scanRecords.length}</strong></p>
              <p class="user-info" style="margin-top:4px;">Logado como: <strong>${currentUser ? currentUser.username : '-'}</strong> (${currentUser ? currentUser.role : '-'})</p>
            </div>
            
            <div class="user-form-card">
              <div style="display:flex; gap:10px; align-items:center; margin-bottom:15px">
                <button class="btn-primary" onclick="window.openCameraProgramatic()">▶️ Iniciar Scanner</button>
                <button class="btn-primary" onclick="window.toggleSidebar()">Menu</button>
              </div>

              <h3>Últimas Entregas (${lastScans.length})</h3>
              <div class="deliveries-list">
                ${lastScans.map((r, idx) => `
                  <div class="delivery-item" data-tracking="${r.tracking}">
                    <div class="delivery-data" style="flex-grow:1;">
                      <div class="delivery-id">${r.tracking} <span style="font-size:12px; color:#9ca3af;">(${r.type})</span></div>
                      <div class="delivery-meta">
                        ${r.cliente || 'Sem Nome'} • ${new Date(r.date).toLocaleTimeString('pt-BR')} • ${r.endereco || 'Endereço Desconhecido'}
                      </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px; margin-left:auto;">
                        <button class="btn-secondary" onclick="viewDeliveryDetail('${r.tracking}')">Ver</button>
                    </div>
                  </div>
                `).join('')}
                ${lastScans.length === 0 ? '<p style="color:#6b7280;">Nenhum scan registrado ainda.</p>' : ''}
              </div>
            </div>
        `;
        dom.contentArea.innerHTML = html;
    }

    // Expose quick-start camera
    window.openCameraProgramatic = () => { setActiveMenu('btnScanMode'); openCameraView(); }

    function renderDeliveries(){
        removeMapIfExists();
        if (dom.appContainer) dom.appContainer.classList.remove('hidden');
        if (dom.cameraView) dom.cameraView.style.display = 'none';

        const html = `
            <div class="view-header">
                <h2>📋 Lista de Entregas (${scanRecords.length})</h2>
                <button class="close-btn" onclick="renderDashboard()" title="Fechar">✕</button>
            </div>
            <div class="user-form-card">
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px">
                    <input id="searchDelivery" placeholder="Buscar rastreio, endereço ou cliente" style="padding:10px;border-radius:10px;border:1px solid #ddd;flex:1"/>
                    <button class="btn-primary" id="btnNewManual" style="white-space:nowrap;">+ Novo Manual</button>
                </div>
                <div id="deliveriesList" class="deliveries-list" style="max-height:65vh;">
                    ${scanRecords.map((r, i) => `
                        <div class="delivery-item" data-tracking="${r.tracking}" data-search="${r.tracking} ${r.cliente||''} ${r.endereco||''}">
                            <div style="width:25px;text-align:center;font-weight:700;color:var(--accent);">${i+1}</div>
                            <div class="delivery-data" style="flex-grow:1;">
                                <div class="delivery-id">${r.tracking} <span style="font-size:12px; color:#9ca3af;"> — ${r.cliente || 'Sem Nome'}</span></div>
                                <div class="delivery-meta">Escaneado por ${r.user} em ${new Date(r.date).toLocaleString()}</div>
                                <div class="delivery-meta">${r.endereco || 'Endereço não cadastrado'}</div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:6px; margin-left:auto;">
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
        if (btnNewManual) btnNewManual.addEventListener('click', showManualModal); 

        const searchInput = document.getElementById('searchDelivery');
        if (searchInput) searchInput.addEventListener('input', () => {
            const q = searchInput.value.trim().toLowerCase();
            const nodes = document.querySelectorAll('#deliveriesList .delivery-item');
            nodes.forEach(node => {
                const text = node.dataset.search.toLowerCase();
                node.style.display = text.includes(q) ? 'flex' : 'none';
            });
        });
    }

    window.viewDeliveryDetail = (tracking) => {
        // Encontra o registro mais recente para esse tracking
        const record = scanRecords.find(r => r.tracking === tracking);
        if (!record) return alert('Registro não encontrado.');
        const html = `
          <div class="user-form-card" style="margin-top:12px; position:relative; border-left:4px solid var(--accent-dark);">
            <button class="close-btn" style="position:absolute; top:8px; right:8px;" onclick="document.getElementById('deliveryDetailArea').innerHTML = ''">✕</button>
            <h3>Detalhes: ${record.tracking} <small style="font-size:12px; color:#6b7280;">(${record.type})</small></h3>
            <p style="margin:6px 0;"><strong>Cliente:</strong> ${record.cliente || '—'}</p>
            <p style="margin:6px 0;"><strong>Endereço:</strong> ${record.endereco || '—'}</p>
            <p style="margin:6px 0;"><strong>Telefone:</strong> ${record.telefone || '—'}</p>
            <hr style="border-color:#eee; margin:10px 0;">
            <p style="margin:6px 0; font-size:12px;"><strong>Escaneado por:</strong> ${record.user}</p>
            <p style="margin:6px 0; font-size:12px;"><strong>Data/Hora:</strong> ${new Date(record.date).toLocaleString()}</p>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn-primary" onclick="window.editShipment('${record.tracking}')">Editar Dados</button>
              <button class="btn-primary" onclick="centerMapToRecord('${record.tracking}')">Mostrar no Mapa</button>
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

        // Verifica permissão antes de renderizar
        if (currentUser.role !== 'admin' && currentUser.role !== 'gestor') {
            dom.contentArea.innerHTML = `<div class="user-form-card"><p style="color:var(--danger)">Acesso negado. Apenas administradores e gestores podem gerenciar usuários.</p></div>`;
            return;
        }

        const html = `
            <h2>👥 Gerenciamento de Usuários</h2>
            <div class="user-form-card">
              <button class="btn-primary" onclick="window.editUser(null)" style="margin-bottom:15px;">+ Novo Usuário</button>
              <div id="userList" class="deliveries-list">
                ${users.map(u => {
                    // Gestores só podem editar colaboradores criados por eles (exceto a si mesmos)
                    const canEdit = currentUser.role === 'admin' || u.id === currentUser.id || 
                                    (currentUser.role === 'gestor' && u.role === 'colaborador' && u.creatorId === currentUser.id);
                    // Gestores só podem deletar colaboradores criados por eles
                    const canDelete = currentUser.role === 'admin' || 
                                      (currentUser.role === 'gestor' && u.role === 'colaborador' && u.creatorId === currentUser.id);

                    const actions = canEdit 
                        ? `<button class="btn-secondary" onclick="window.editUser('${u.id}')">Editar</button>`
                        : '';
                    const deleteBtn = (canDelete && u.id !== currentUser.id)
                        ? `<button class="btn-secondary" style="background:var(--danger);color:white;" onclick="window.deleteUser('${u.id}')">Excluir</button>`
                        : '';

                    return `
                        <div class="delivery-item" style="align-items:center; border-left-color:${u.role==='admin' ? '#f59e0b' : u.role==='gestor' ? '#8b5cf6' : 'var(--success)'}">
                          <div style="width:30px;text-align:center;font-size:18px;">${u.username[0].toUpperCase()}</div>
                          <div class="delivery-data" style="flex-grow:1;">
                            <div class="delivery-id">${u.username}</div>
                            <div class="delivery-meta">Papel: ${u.role}</div>
                          </div>
                          <div style="display:flex;gap:8px">
                            ${actions}
                            ${deleteBtn}
                          </div>
                        </div>`;
                }).join('')}
              </div>
            </div>`;
        dom.contentArea.innerHTML = html;
    }

    function renderRoutes(){
        removeMapIfExists();
        if (!dom.contentArea) return;
        dom.contentArea.innerHTML = `<h2>🧭 Otimizar Rotas</h2><div class="user-form-card"><p style="color:#6b7280;">Gerando uma simulação com seus últimos pontos...</p><div id="routeMapObj" class="map-wrapper"></div></div>`;
        
        // Timeout para garantir que o elemento existe antes de inicializar o mapa Leaflet
        setTimeout(() => {
            const pointsWithLocation = scanRecords.filter(r => r.lat && r.lon);
            const deliveryPoints = pointsWithLocation.length > 0 ? pointsWithLocation : scanRecords.map(r => ({lat: CD_LOCATION.lat, lon: CD_LOCATION.lon, id: r.tracking}));
            
            if (deliveryPoints.length < 2) { 
                const el = document.getElementById('routeMapObj'); 
                if (el) el.innerHTML = '<p style="color:#6b7280;padding:15px;">Escaneie ao menos 2 entregas para simular rota.</p>'; 
                return; 
            }
            
            // Simulação de roteamento (apenas sorteia os 10 primeiros)
            const route = deliveryPoints.slice(0,10).sort(()=>Math.random()-0.5); 
            
            removeMapIfExists();
            mapInstance = L.map('routeMapObj').setView([route[0].lat, route[0].lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OpenStreetMap contributors' }).addTo(mapInstance);
            
            // Corrige o z-index do mapa para que ele não sobreponha a sidebar (z-index: 40)
            try { mapInstance.getContainer().style.zIndex = '1'; } catch(e){}
            
            const routePoints = route.map((p,i) => {
                const marker = L.marker([p.lat,p.lon]).addTo(mapInstance).bindPopup(`<b>Ponto ${i+1}</b><br>${p.id}`);
                return [p.lat,p.lon];
            });
            
            if (routePoints.length>1) {
                L.polyline(routePoints,{color:var(--success), weight:5}).addTo(mapInstance);
                mapInstance.fitBounds(L.polyline(routePoints).getBounds(), {padding:[20,20]});
            }
        },120);
    }

    function renderMap(){
        removeMapIfExists();
        if (!dom.contentArea) return;
        dom.contentArea.classList.remove('hidden');
        if (dom.cameraView) dom.cameraView.style.display = 'none';
        if (dom.appContainer) dom.appContainer.classList.remove('hidden');

        dom.contentArea.innerHTML = `
            <div class="view-header">
                <h2>🗺️ Mapa de Entregas (${scanRecords.length})</h2>
                <button class="close-btn" onclick="renderDashboard()">✕</button>
            </div>
            <div class="user-form-card">
                <p style="color:#6b7280; margin-top:0;">Sua localização atual: <span id="currentLoc">Carregando...</span></p>
                <div id="mapObj" class="map-wrapper"></div>
            </div>`;

        setTimeout(() => {
            const initialLat = userLocation ? userLocation.lat : CD_LOCATION.lat;
            const initialLon = userLocation ? userLocation.lon : CD_LOCATION.lon;
            
            mapInstance = L.map('mapObj').setView([initialLat, initialLon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OpenStreetMap contributors' }).addTo(mapInstance);
            
            // Corrige o z-index do mapa para que ele não sobreponha a sidebar
            try { mapInstance.getContainer().style.zIndex = '1'; } catch(e){ console.warn('z-index patch error', e); }

            scanRecords.forEach(r => {
                const lat = r.lat || CD_LOCATION.lat;
                const lon = r.lon || CD_LOCATION.lon;
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
        if (currentLocEl) currentLocEl.textContent = userLocation ? `(${initialLat.toFixed(6)}, ${initialLon.toFixed(6)})` : 'Localização indisponível.';
        
        if (locationMarker) locationMarker.setLatLng([initialLat, initialLon]);
        else if (userLocation) { // Adiciona o marcador apenas se houver localização real
            locationMarker = L.marker([initialLat, initialLon], {
                icon: L.divIcon({ className:'current-location-marker', html:'<div style="background:var(--danger);border:3px solid white;border-radius:50%;width:18px;height:18px"></div>' })
            }).addTo(mapInstance).bindPopup('Sua Localização Atual');
        }
    }

    window.centerMapToRecord = (tracking) => {
        const rec = scanRecords.find(r => r.tracking === tracking);
        if (!rec) return alert('Registro não encontrado');
        
        setActiveMenu('btnMap');
        renderMap();
        
        setTimeout(() => {
            try {
                const lat = rec.lat || CD_LOCATION.lat;
                const lon = rec.lon || CD_LOCATION.lon;
                if (mapInstance) mapInstance.setView([lat, lon], 15);
            } catch(e){ console.warn(e) }
        },300); // Aumentei o timeout para garantir que o mapa inicialize
    };

    /* --- CSV Export (agora usando endereço no lugar de lat/lon) --- */
    function generateCSV(period='all', userFilter=''){
        let filtered = [];
        const today = new Date(); today.setHours(0,0,0,0);
        
        if (period === 'daily') filtered = scanRecords.filter(r => new Date(r.date) >= today);
        else if (period === 'weekly') { const oneWeek = new Date(today); oneWeek.setDate(today.getDate()-7); filtered = scanRecords.filter(r => new Date(r.date) >= oneWeek); }
        else if (period === 'monthly') { const oneMonth = new Date(today); oneMonth.setMonth(today.getMonth()-1); filtered = scanRecords.filter(r => new Date(r.date) >= oneMonth); }
        else filtered = scanRecords.slice();

        if (userFilter) filtered = filtered.filter(r => r.user.toLowerCase() === userFilter.toLowerCase());

        if (!filtered.length) { return alert('Nenhum dado encontrado para o filtro.'); }

        // CSV columns: DATA,HORA,USUARIO,RASTREAMENTO,CLIENTE,ENDERECO,TELEFONE,TYPE,RAW
        let csv = 'DATA,HORA,USUARIO,RASTREAMENTO,CLIENTE,ENDERECO,TELEFONE,TIPO,RAW\n';
        filtered.forEach(r => {
            const d = new Date(r.date);
            const dateStr = d.toLocaleDateString('pt-BR');
            const timeStr = d.toLocaleTimeString('pt-BR');
            // Função simples para sanitizar e envolver em aspas
            const safe = s => `"${(s||'').toString().replace(/"/g,'""')}"`; 
            csv += `${dateStr},${timeStr},${r.user},${r.tracking},${safe(r.cliente)},${safe(r.endereco)},${safe(r.telefone)},${r.type},${safe(r.raw)}\n`;
        });

        const filename = `relatorio_pegazus_${period}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        
        if (dom.exportOptions) dom.exportOptions.style.display = 'none';
        alert(`Relatório CSV gerado com ${filtered.length} registros.`);
    }

    /* --- User CRUD helpers kept in global scope (as in original) --- */
    window.editUser = (userId) => {
        const userToEdit = userId ? users.find(u => u.id === userId) : null;
        
        if (!userToEdit && currentUser.role === 'gestor') {
             // Gestores só podem criar colaboradores
            const username = prompt('Usuário:');
            if (username === null) return;
            const password = prompt('Senha:');
            if (password === null || password.length === 0) return alert('Senha é obrigatória.');
            
            const newUser = { id:'u'+Date.now(), username, password, role: 'colaborador', creatorId: currentUser.id };
            users.push(newUser);
            saveUsers(); renderUsers();
            return;
        }

        // Regra de permissão para edição (Admin pode tudo, Gestor só edita seus colaboradores ou a si mesmo)
        if (userToEdit && userToEdit.id !== currentUser.id && currentUser.role !== 'admin' && 
           (currentUser.role !== 'gestor' || userToEdit.role !== 'colaborador' || userToEdit.creatorId !== currentUser.id)) {
            return alert('Você não tem permissão para editar este usuário.');
        }

        const isAdmin = currentUser.role === 'admin';
        const isSelf = userToEdit && userToEdit.id === currentUser.id;
        
        const username = userToEdit ? userToEdit.username : prompt('Usuário:');
        if (username === null) return;
        
        const password = prompt('Senha (deixe em branco para manter):') || (userToEdit ? userToEdit.password : '');
        if (!userToEdit && password.length === 0) return alert('Senha é obrigatória para novo usuário.');

        let role = userToEdit ? userToEdit.role : 'colaborador';
        if (isAdmin || isSelf) {
             role = prompt('Papel (colaborador/gestor/admin):', role);
        } else if (currentUser.role === 'gestor') {
            // Gestores só podem criar colaboradores
            role = 'colaborador'; 
        }

        if (!userId) {
            const newUser = { id:'u'+Date.now(), username, password, role, creatorId: currentUser.id };
            users.push(newUser);
        } else {
            const idx = users.findIndex(u=>u.id===userId);
            if (idx>=0){ 
                users[idx].password = password || users[idx].password; 
                // Permite que gestor edite o papel se for admin ou se for ele mesmo
                if (isAdmin || isSelf) users[idx].role = role;
            }
        }
        saveUsers(); renderUsers();
    };
    
    window.deleteUser = (userId) => {
        if (userId === currentUser.id) return alert('Você não pode excluir seu próprio perfil enquanto logado.');
        
        const userToDelete = users.find(u => u.id === userId);
        if (!userToDelete) return;
        
        // Regra de permissão para exclusão
        const canDelete = currentUser.role === 'admin' || 
                          (currentUser.role === 'gestor' && userToDelete.role === 'colaborador' && userToDelete.creatorId === currentUser.id);

        if (!canDelete) return alert('Você não tem permissão para excluir este usuário.');

        if (!confirm(`Excluir usuário ${userToDelete.username} (${userToDelete.role})?`)) return;
        
        users = users.filter(u => u.id !== userId); 
        saveUsers(); 
        renderUsers();
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
