document.addEventListener('DOMContentLoaded', () => {
    
    /* --- Configurações e Estado (Mantido) --- */
    const STORAGE_KEY_USERS = 'pegazus_users_v4';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
    const DEFAULT_USERS = [
        { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
        { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
        { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
    ]; 
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 };
    
    let currentUser = null;
    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    let users = loadUsers();
    
    let videoStream = null;
    let isScanning = false;
    let videoTrack = null;
    const SCAN_DELAY = 1000;
    let lastScanCode = '';
    let lastScanTime = 0;
    let userLocation = null;
    let mapInstance = null;
    let locationMarker = null;

    /* --- Referências DOM (Mantido) --- */
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
        userFilterSelect: document.getElementById('userFilterSelect'),
    };

    /* --- Inicialização e Storage (Mantido) --- */
    function loadUsers() {
        const raw = localStorage.getItem(STORAGE_KEY_USERS);
        if(!raw) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
            return DEFAULT_USERS;
        }
        const existingUsers = JSON.parse(raw);
        const thonExists = existingUsers.some(u => u.username === 'thon');

        if (!thonExists) {
            existingUsers.push(DEFAULT_USERS.find(u => u.username === 'thon'));
        } else {
            const thonIndex = existingUsers.findIndex(u => u.username === 'thon');
            existingUsers[thonIndex].password = DEFAULT_USERS[0].password;
            existingUsers[thonIndex].role = DEFAULT_USERS[0].role;
        }
        return existingUsers;
    }
    
    function saveUsers() {
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }
    
    function populateUserFilter() {
        const isManager = currentUser.role === 'admin' || currentUser.role === 'gestor';

        if (isManager) {
            let options = '<option value="all">Todos os Usuários</option>';
            users.forEach(u => {
                options += `<option value="${u.username}">${u.username} (${u.role})</option>`;
            });
            dom.userFilterSelect.innerHTML = options;
            dom.userFilterSelect.classList.remove('hidden');
        } else {
            dom.userFilterSelect.classList.add('hidden');
        }
        dom.userFilterSelect.value = 'all'; 
    }

    /* --- Geolocalização (Mantido) --- */
    function startGeolocation() {
        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    if (mapInstance) updateMapLocation();
                },
                (error) => {
                    console.warn('Geolocation error:', error.message);
                    userLocation = null;
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            console.warn("Geolocation não está disponível no navegador.");
        }
    }

    /* --- Sistema de Login --- */
    document.getElementById('btnLogin').addEventListener('click', () => {
        const u = document.getElementById('loginUser').value.trim();
        const p = document.getElementById('loginPass').value.trim();
        const user = users.find(x => x.username === u && x.password === p);
        
        if (user) {
            currentUser = user;
            document.getElementById('displayUser').textContent = user.username + ` (${user.role})`;
            
            dom.loginSection.classList.add('hidden');
            dom.appContainer.classList.remove('hidden'); 
            
            // NOVO: Exibe o botão de menu mobile
            if(window.innerWidth <= 768) dom.mobileMenuBtn.classList.remove('hidden');
            
            if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
                dom.adminMenuOptions.classList.remove('hidden');
            } else {
                dom.adminMenuOptions.classList.add('hidden');
            }

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
        dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.5; color:var(--content-text-dark)"><h2>Até logo</h2></div>`;
    });

    /* --- Navegação e Eventos --- */
    function showContent() {
        // NOVO: Controla a exibição dos containers principais
        dom.cameraView.style.display = 'none';
        dom.appContainer.classList.remove('hidden');
        dom.appContainer.style.display = 'grid'; // Retorna ao layout GRID

        // Garante que o menu esteja fechado no mobile ao mudar de página
        if (window.innerWidth <= 768) { 
            dom.sidebar.classList.remove('active'); 
        }

        // Garante que o menu de exportação esteja fechado ao sair da tela
        if (dom.exportOptions.style.display === 'flex') {
            dom.exportOptions.style.display = 'none'; 
        }
        dom.feedback.style.opacity = '0'; 
    }

    document.getElementById('btnScanMode').addEventListener('click', () => {
        // Oculta o container principal
        dom.appContainer.classList.add('hidden');
        
        // Exibe a câmera (que é fixed e z-index alto)
        dom.cameraView.style.display = 'flex'; 
        
        // Fecha o menu lateral no mobile
        if(window.innerWidth <= 768) {
            dom.sidebar.classList.remove('active');
        }
        startScanner();
    });

    window.renderDashboard = () => {
        showContent();
        renderDashboard();
    }
    
    document.getElementById('btnDashboard').addEventListener('click', window.renderDashboard); 
    document.getElementById('btnUsers').addEventListener('click', renderUsers);
    document.getElementById('btnMap').addEventListener('click', renderMap);
    document.getElementById('btnRoutes').addEventListener('click', renderRoutes);

    document.getElementById('btnExport').addEventListener('click', () => {
        if (dom.exportOptions.style.display !== 'flex') {
            populateUserFilter(); 
        }
        dom.exportOptions.style.display = dom.exportOptions.style.display === 'flex' ? 'none' : 'flex';
    });

    document.getElementById('btnExportDaily').addEventListener('click', () => generateCSV('daily'));
    document.getElementById('btnExportWeekly').addEventListener('click', () => generateCSV('weekly'));
    document.getElementById('btnExportMonthly').addEventListener('click', () => generateCSV('monthly'));
    document.getElementById('btnExportAll').addEventListener('click', () => generateCSV('all'));

    dom.cameraSelect.addEventListener('change', (e) => {
        if(isScanning) startScanner(e.target.value);
    });

    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');

    /* --- Lógica do Scanner (Melhorada para Mobile) --- */
    async function startScanner(deviceId = null) {
        if (isScanning && !deviceId) return;
        stopScanner(); 
        
        const isMobile = window.innerWidth <= 768;
        
        // CORREÇÃO CRUCIAL: Prioriza a câmera traseira ('environment') no mobile
        const constraints = {
            video: deviceId 
                ? { deviceId: { exact: deviceId } } 
                : { 
                    facingMode: isMobile ? 'environment' : 'user', 
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 } 
                }
        };

        try {
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            dom.video.srcObject = videoStream;
            dom.video.setAttribute('playsinline', true);
            await dom.video.play();
            isScanning = true;
            videoTrack = videoStream.getVideoTracks()[0];
            
            // Lógica de seleção de câmera (Mantida)
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            if (videoDevices.length > 1) {
                dom.cameraSelect.innerHTML = '';
                videoDevices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Câmera ${dom.cameraSelect.length + 1}`;
                    // Tenta selecionar o 'environment' como padrão
                    opt.selected = d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment') || d.label.toLowerCase().includes('traseira');
                    dom.cameraSelect.appendChild(opt);
                });
                dom.cameraSelect.classList.remove('hidden');
                if(deviceId) dom.cameraSelect.value = deviceId;
            }

            requestAnimationFrame(tick);
        } catch (err) {
            console.error(err);
            // Mensagem mais clara para o usuário
            alert('Erro ao iniciar câmera. Verifique permissões ou se o dispositivo tem câmera traseira: ' + err.message);
            window.renderDashboard(); 
        }
    }

    function stopScanner() {
        isScanning = false;
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
            videoStream = null;
        }
        dom.video.srcObject = null;
    }

    function tick() {
        // ... (tick e handleScan mantidos) ...
        if (!isScanning) return;
        if (dom.video.readyState === dom.video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const w = dom.video.videoWidth;
            const h = dom.video.videoHeight;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(dom.video, 0, 0, w, w); 
            
            const size = Math.min(w, h) * 0.9; 

            const sx = (w - size) / 2;
            const sy = (h - size) / 2;
            const imageData = ctx.getImageData(sx, sy, size, size);
            
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
            });

            if (code && code.data) {
                handleScan(code.data);
            }
        }
        requestAnimationFrame(tick);
    }

    function handleScan(data) {
        const now = Date.now();
        if (data === lastScanCode && (now - lastScanTime) < SCAN_DELAY) return;
        
        lastScanCode = data;
        lastScanTime = now;

        beep();
        showFeedback(data); 

        const scanLat = userLocation ? userLocation.lat : (CD_LOCATION.lat + (Math.random() - 0.5) * 0.01);
        const scanLon = userLocation ? userLocation.lon : (CD_LOCATION.lon + (Math.random() - 0.5) * 0.01);

        const record = parsePayload(data, scanLat, scanLon);
        scanRecords.unshift(record);
        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
    }
    // ... (parsers, beep, showFeedback, Torch mantidos) ...
    function parsePayload(raw, lat, lon) {
        let id = raw;
        let type = 'Genérico';
        if (raw.includes('shopee')) { type = 'Shopee'; }
        else if (raw.includes('mercadoli')) { type = 'Mercado Livre'; }
        
        const numMatch = raw.match(/(\d{8,})/);
        if (numMatch) id = numMatch[1];

        return {
            id: id,
            raw: raw,
            type: type,
            user: currentUser.username,
            date: new Date().toISOString(),
            lat: lat,
            lon: lon
        };
    }

    function beep() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 1200;
            gain.gain.value = 0.1;
            osc.start();
            setTimeout(() => { osc.stop(); audioCtx.close(); }, 100);
        } catch(e){}
    }

    function showFeedback(text) {
        dom.feedback.textContent = `Leitura Confirmada: ${text.substring(0, 30)}...`;
        dom.feedback.style.opacity = '1';
        setTimeout(() => { dom.feedback.style.opacity = '0'; }, 2000); 
        
        const overlay = document.querySelector('.scan-overlay');
        overlay.style.borderColor = 'var(--success)';
        setTimeout(() => overlay.style.borderColor = 'rgba(255,255,255,0.5)', 300);
    }

    document.getElementById('btnTorch').addEventListener('click', async () => {
        if(videoTrack) {
            try {
                const caps = videoTrack.getCapabilities();
                if(caps.torch) {
                    const settings = videoTrack.getSettings();
                    await videoTrack.applyConstraints({ advanced: [{ torch: !settings.torch }] });
                } else {
                    alert('Flash não suportado neste dispositivo/navegador');
                }
            } catch(e) { console.log(e); }
        }
    });

    /* --- Views (Renderização Mantida) --- */
    function renderDashboard() {
        if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
            dom.adminMenuOptions.classList.remove('hidden');
        } else {
            dom.adminMenuOptions.classList.add('hidden');
        }
        
        const html = `
            <h2>📦 Entregas Realizadas</h2>
            <p style="color:var(--content-text-dark)">Total de registros: ${scanRecords.length}</p>
            <div style="display:grid; gap:10px; margin-top:20px;">
                ${scanRecords.map(r => `
                    <div style="background:var(--content-card-bg); padding:15px; border-radius:10px; border-left:4px solid var(--accent)">
                        <div style="font-weight:bold; font-size:16px">${r.id}</div>
                        <div style="font-size:12px; color:#6b7280;">
                            ${r.type} • ${new Date(r.date).toLocaleString()} • User: ${r.user}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        dom.contentArea.innerHTML = html;
    }

    function renderRoutes() {
        showContent();
        const deliveryPoints = scanRecords.map(r => ({ lat: r.lat, lon: r.lon, id: r.id }));
        
        if (deliveryPoints.length < 2) {
            dom.contentArea.innerHTML = `<h2>🧭 Geração de Rotas</h2><p style="color:var(--content-text-dark)">Escaneie pelo menos 2 entregas para gerar uma rota.</p>`;
            return;
        }

        const simplifiedRoute = deliveryPoints
            .slice(0, 10) 
            .sort(() => Math.random() - 0.5); 

        const routeMapHtml = `
            <h2>🧭 Rota Otimizada (${simplifiedRoute.length} pontos)</h2>
            <p style="color:var(--content-text-dark)">Simulação baseada nas suas últimas entregas escaneadas. </p>
            <div id="routeMapObj" style="height:60vh; border-radius:12px; margin-top:10px"></div>
            <div style="margin-top:10px">
                ${simplifiedRoute.map((p, index) => 
                    `<div style="font-size:14px; margin-bottom:5px; color:var(--content-text-dark);">
                        ${index + 1}. ${p.id} 
                        (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})
                    </div>`
                ).join('')}
            </div>
        `;
        dom.contentArea.innerHTML = routeMapHtml;

        setTimeout(() => {
            const map = L.map('routeMapObj').setView([simplifiedRoute[0].lat, simplifiedRoute[0].lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);

            const routePoints = simplifiedRoute.map((p, index) => {
                const marker = L.marker([p.lat, p.lon]).addTo(map)
                    .bindPopup(`<b>Ponto ${index + 1}</b><br>${p.id}`);
                
                marker.setIcon(L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background:var(--accent); color:#000; border-radius:50%; width:24px; height:24px; text-align:center; font-weight:bold; line-height:24px;">${index + 1}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                }));
                return [p.lat, p.lon];
            });
            
            if (routePoints.length > 1) {
                L.polyline(routePoints, { color: 'var(--success)', weight: 5, opacity: 0.7 }).addTo(map);
                map.fitBounds(L.polyline(routePoints).getBounds());
            }

        }, 100);
    }

    function renderMap() {
        showContent();
        mapInstance = null;
        dom.contentArea.innerHTML = `<h2>🗺️ Mapa de Entregas</h2><p style="color:var(--content-text-dark)">Você está aqui: <span id="currentLoc">Carregando...</span></p><div id="mapObj" style="height:60vh; border-radius:12px; margin-top:10px"></div>`;
        
        setTimeout(() => {
            const initialLat = userLocation ? userLocation.lat : CD_LOCATION.lat;
            const initialLon = userLocation ? userLocation.lon : CD_LOCATION.lon;

            mapInstance = L.map('mapObj').setView([initialLat, initialLon], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM'
            }).addTo(mapInstance);

            scanRecords.forEach(r => {
                L.marker([r.lat, r.lon]).addTo(mapInstance)
                    .bindPopup(`<b>${r.id}</b><br>${r.type}`);
            });

            updateMapLocation();

        }, 100);
    }
    
    function updateMapLocation() {
        if (!mapInstance || !userLocation) return;

        const currentLocEl = document.getElementById('currentLoc');
        if (currentLocEl) {
            currentLocEl.textContent = `(${userLocation.lat.toFixed(6)}, ${userLocation.lon.toFixed(6)}) - ${userLocation ? 'Atual' : 'Simulada'}`;
        }

        if (locationMarker) {
            locationMarker.setLatLng([userLocation.lat, userLocation.lon]);
        } else {
            locationMarker = L.marker([userLocation.lat, userLocation.lon], {
                icon: L.divIcon({
                    className: 'current-location-marker',
                    html: '<div style="background:var(--danger); border:3px solid white; border-radius:50%; width:18px; height:18px;"></div>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                })
            }).addTo(mapInstance)
            .bindPopup("Sua Localização Atual");
        }
    }

    function renderUsers() {
        showContent();
        
        let userListHtml = `
            <h2>👥 Gerenciamento de Usuários</h2>
            <div style="margin-bottom: 20px;">
                <button class="btn-primary" onclick="window.editUser(null)">+ Novo Usuário</button>
            </div>
            <div id="userListContainer">
        `;
        
        const filteredUsers = users.filter(u => {
            if (currentUser.role === 'admin') return true;
            if (currentUser.role === 'gestor') {
                return u.creatorId === currentUser.id || u.id === currentUser.id;
            }
            return u.id === currentUser.id;
        });

        filteredUsers.forEach(u => {
            const canEdit = currentUser.role === 'admin' || currentUser.id === u.id || (currentUser.role === 'gestor' && u.role === 'colaborador' && u.creatorId === currentUser.id);
            const canDelete = currentUser.role === 'admin' && currentUser.id !== u.id;
            
            userListHtml += `
                <div class="user-form-card" style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${u.username}</strong> 
                        <span style="color:var(--accent); font-size:12px">(${u.role})</span>
                    </div>
                    <div>
                        ${canEdit ? `<button onclick="window.editUser('${u.id}')" style="background:rgba(56, 189, 248, 0.2); color:var(--accent); padding:5px 10px; margin-right:5px; font-size:14px; box-shadow:none;">Editar</button>` : ''}
                        ${canDelete ? `<button onclick="window.deleteUser('${u.id}')" style="background:rgba(239, 68, 68, 0.2); color:var(--danger); padding:5px 10px; font-size:14px; box-shadow:none;">Excluir</button>` : ''}
                    </div>
                </div>
            `;
        });
        
        userListHtml += `</div><div id="userFormArea"></div>`;
        dom.contentArea.innerHTML = userListHtml;
    }

    // Deixa funções CRUD no escopo global para serem chamadas pelo HTML
    window.editUser = (userId) => {
        const userToEdit = userId ? users.find(u => u.id === userId) : null;
        
        if (userToEdit && userToEdit.id !== currentUser.id && currentUser.role !== 'admin' && (currentUser.role !== 'gestor' || userToEdit.role !== 'colaborador' || userToEdit.creatorId !== currentUser.id)) {
            alert('Você não tem permissão para editar este usuário.');
            return;
        }

        const isAdmin = currentUser.role === 'admin';
        const isSelf = userToEdit && userToEdit.id === currentUser.id;
        
        let formHtml = `
            <div class="user-form-card" style="border:1px solid var(--accent)">
                <h3>${userId ? 'Editar Usuário: ' + userToEdit.username : 'Novo Usuário'}</h3>
                <input type="text" id="formUsername" placeholder="Usuário" value="${userToEdit ? userToEdit.username : ''}" ${userToEdit ? 'readonly' : ''} style="margin-bottom:8px;">
                <input type="password" id="formPassword" placeholder="Nova Senha (deixe em branco para manter)" value="">
                <select id="formRole" style="margin-bottom:8px;" ${isAdmin ? '' : 'disabled'}>
                    <option value="colaborador" ${userToEdit && userToEdit.role === 'colaborador' ? 'selected' : ''}>Colaborador</option>
                    <option value="gestor" ${userToEdit && userToEdit.role === 'gestor' ? 'selected' : ''} ${!isAdmin ? 'hidden' : ''}>Gestor</option>
                    <option value="admin" ${userToEdit && userToEdit.role === 'admin' ? 'selected' : ''} ${!isAdmin ? 'hidden' : ''}>Administrador</option>
                </select>
                <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="btn-primary" onclick="window.saveUser('${userId || ''}')" style="flex:1">Salvar</button>
                    <button onclick="renderUsers()" style="background:#e5e7eb; color:var(--content-text-dark); box-shadow:none;">Cancelar</button>
                </div>
                ${!isAdmin && !isSelf ? `<p style="color:var(--danger); font-size:12px; margin-top:10px;">Apenas Admins podem alterar o Nível de Acesso.</p>` : ''}
            </div>
        `;
        document.getElementById('userFormArea').innerHTML = formHtml;
        document.getElementById('userFormArea').scrollIntoView({ behavior: 'smooth' });
    };

    window.saveUser = (userId) => {
        const username = document.getElementById('formUsername').value.trim();
        const password = document.getElementById('formPassword').value.trim();
        const role = document.getElementById('formRole').value;
        const isNew = !userId;

        if (!username) { alert('Usuário é obrigatório.'); return; }
        if (isNew && !password) { alert('Senha é obrigatória para novo usuário.'); return; }

        let userIndex = -1;
        if (userId) userIndex = users.findIndex(u => u.id === userId);

        if (isNew && users.some(u => u.username === username)) {
            alert('Nome de usuário já existe.');
            return;
        }
        
        let updatedUser;
        if (isNew) {
            updatedUser = {
                id: 'u' + Date.now(),
                username,
                password,
                role: currentUser.role === 'colaborador' ? 'colaborador' : role, 
                creatorId: currentUser.id
            };
            users.push(updatedUser);
        } else {
            updatedUser = users[userIndex];
            if (password) updatedUser.password = password;
            if (currentUser.role === 'admin') updatedUser.role = role; 
        }

        saveUsers();
        document.getElementById('userFormArea').innerHTML = '';
        renderUsers();
    };

    window.deleteUser = (userId) => {
        if (userId === currentUser.id) {
            alert('Você não pode excluir seu próprio perfil enquanto estiver logado.');
            return;
        }
        if (confirm('Tem certeza que deseja excluir este usuário?')) {
            users = users.filter(u => u.id !== userId);
            saveUsers();
            renderUsers();
        }
    };


    /* --- Exportação CSV (Mantido) --- */
    function generateCSV(filter) {
        let filteredRecords = scanRecords;
        let selectedUser = dom.userFilterSelect.value;
        const isManager = currentUser.role === 'admin' || currentUser.role === 'gestor';
        
        // 1. FILTRO POR USUÁRIO
        if (!isManager) {
            filteredRecords = filteredRecords.filter(r => r.user === currentUser.username);
            selectedUser = currentUser.username;
        } else if (selectedUser && selectedUser !== 'all') {
            filteredRecords = filteredRecords.filter(r => r.user === selectedUser);
        }

        // 2. FILTRO POR TEMPO
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (filter === 'daily') {
            filteredRecords = filteredRecords.filter(r => new Date(r.date) >= today);
        } else if (filter === 'weekly') {
            const oneWeekAgo = new Date(today);
            oneWeekAgo.setDate(today.getDate() - 7);
            filteredRecords = filteredRecords.filter(r => new Date(r.date) >= oneWeekAgo);
        } else if (filter === 'monthly') {
            const oneMonthAgo = new Date(today);
            oneMonthAgo.setMonth(today.getMonth() - 1);
            filteredRecords = filteredRecords.filter(r => new Date(r.date) >= oneMonthAgo);
        } 


        if(!filteredRecords.length) {
             const userDisplay = selectedUser === 'all' ? 'todos os usuários' : selectedUser;
             return alert(`Nenhum dado encontrado para o filtro de tempo "${filter}" e usuário "${userDisplay}".`);
        }
        
        // 3. Geração do CSV
        let csv = 'ID,TIPO,DATA,HORA,USUARIO,LAT,LON,RAW\n';
        filteredRecords.forEach(r => {
            const scanDate = new Date(r.date);
            const dateStr = scanDate.toLocaleDateString('pt-BR');
            const timeStr = scanDate.toLocaleTimeString('pt-BR');
            csv += `${r.id},${r.type},${dateStr},${timeStr},${r.user},${r.lat.toFixed(6)},${r.lon.toFixed(6)},"${r.raw.replace(/"/g, '""')}"\n`;
        });
        
        const usernameTag = selectedUser && selectedUser !== 'all' ? `_${selectedUser}` : '';
        const filename = `relatorio_pegazus_${filter}${usernameTag}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        dom.exportOptions.style.display = 'none';
    }
});
