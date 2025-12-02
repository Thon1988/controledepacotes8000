document.addEventListener('DOMContentLoaded', () => {
    
    /* --- Configurações e Estado --- */
    const STORAGE_KEY_USERS = 'pegazus_users_v4';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
    const DEFAULT_USERS = [
        { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
        { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
        { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
    ]; 
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 }; // Exemplo: Centro de Distribuição
    
    let currentUser = null;
    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    let users = loadUsers();
    
    let videoStream = null;
    let isScanning = false;
    let videoTrack = null;
    const SCAN_DELAY = 1000;
    let lastScanCode = '';
    let lastScanTime = 0;
    
    // --- VARIÁVEIS DE ESTADO DO MAPA (CORRIGIDO PARA INICIALIZAÇÃO) ---
    let userLocation = null;
    let mapInstance = null;
    let locationMarker = null; // Marcador para a localização atual do usuário
    let accuracyCircle = null; // Círculo para a precisão do GPS
    let cdMarker = null;       // Marcador da Central de Distribuição

    /* --- Referências DOM --- */
    const dom = {
        loginSection: document.getElementById('loginSection'),
        loginUser: document.getElementById('loginUser'),
        loginPass: document.getElementById('loginPass'),
        btnLogin: document.getElementById('btnLogin'),
        loginError: document.getElementById('loginError'),
        
        app: document.querySelector('.app'),
        sidebar: document.getElementById('sidebar'),
        displayUser: document.getElementById('displayUser'),
        btnLogout: document.getElementById('btnLogout'),
        
        contentArea: document.getElementById('contentArea'),
        
        btnDashboard: document.getElementById('btnDashboard'),
        btnScanMode: document.getElementById('btnScanMode'),
        btnMap: document.getElementById('btnMap'),
        btnRoutes: document.getElementById('btnRoutes'),
        btnUsers: document.getElementById('btnUsers'),
        adminMenuOptions: document.getElementById('adminMenuOptions'),
        
        // Câmera/Scanner
        cameraView: document.getElementById('cameraView'),
        videoElement: document.getElementById('videoElement'),
        scanOverlay: document.querySelector('.scan-overlay'),
        feedbackMsg: document.getElementById('feedbackMsg'),
        cameraSelect: document.getElementById('cameraSelect'),
        btnTorch: document.getElementById('btnTorch'),
        
        // Mapa
        mapView: document.getElementById('mapView'),
        currentLocMap: document.getElementById('currentLocMap'), // Span que mostra a coordenada atual
        
        // Export
        btnExport: document.getElementById('btnExport'),
        exportOptions: document.getElementById('exportOptions'),
        btnExportDaily: document.getElementById('btnExportDaily'),
        btnExportWeekly: document.getElementById('btnExportWeekly'),
        btnExportMonthly: document.getElementById('btnExportMonthly'),
        btnExportAll: document.getElementById('btnExportAll'),
        
        mobileMenuBtn: document.getElementById('mobileMenuBtn')
    };

    /* --- FUNÇÕES AUXILIARES E DE DADOS --- */

    function loadUsers() {
        const storedUsers = localStorage.getItem(STORAGE_KEY_USERS);
        if (storedUsers) {
            return JSON.parse(storedUsers);
        } else {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
            return DEFAULT_USERS;
        }
    }

    function saveUsers() {
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }
    
    function saveScanRecord(code, type) {
        if (!userLocation) {
            showFeedback("Localização não disponível. Tente novamente.", "danger");
            return;
        }

        const newRecord = {
            id: 's' + Date.now(),
            raw: code,
            type: type, // 'QR' ou 'Manual'
            date: new Date().toISOString(),
            user: currentUser.username,
            lat: userLocation.lat,
            lon: userLocation.lon
        };
        scanRecords.unshift(newRecord);
        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
        showFeedback(`📦 ${code} registrado com sucesso!`, "success");
        renderDashboard(); // Volta para o dashboard após o scan
        
        // Se o mapa estiver aberto, recarrega os marcadores
        if (dom.mapView.style.display === 'block' && mapInstance) {
            loadMapMarkers();
        }
    }

    /* --- FUNÇÕES DE AUTENTICAÇÃO (IMPLEMENTAÇÃO COMPLETA) --- */

    function handleLogin() {
        const username = dom.loginUser.value;
        const password = dom.loginPass.value;

        const user = users.find(u => u.username === username && u.password === password);

        if (user) {
            currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            dom.loginSection.classList.add('hidden');
            dom.app.classList.remove('hidden');
            dom.loginError.textContent = '';
            
            // Configura o UI após o login
            dom.displayUser.textContent = `${user.username} (${user.role})`;
            if (user.role !== 'admin' && user.role !== 'gestor') {
                dom.adminMenuOptions.classList.add('hidden');
                dom.btnUsers.classList.add('hidden');
            } else {
                 dom.adminMenuOptions.classList.remove('hidden');
                 dom.btnUsers.classList.remove('hidden');
            }
            renderDashboard();

        } else {
            dom.loginError.textContent = 'Usuário ou senha inválidos.';
        }
    }

    function handleLogout() {
        currentUser = null;
        localStorage.removeItem('currentUser');
        dom.app.classList.add('hidden');
        dom.mapView.style.display = 'none';
        dom.cameraView.style.display = 'none';
        dom.loginSection.classList.remove('hidden');
        dom.loginPass.value = '';
    }

    function checkAuth() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            dom.loginSection.classList.add('hidden');
            dom.app.classList.remove('hidden');
            
            dom.displayUser.textContent = `${currentUser.username} (${currentUser.role})`;
            if (currentUser.role !== 'admin' && currentUser.role !== 'gestor') {
                dom.adminMenuOptions.classList.add('hidden');
                dom.btnUsers.classList.add('hidden');
            }
            renderDashboard();
        }
    }

    /* --- FUNÇÕES DE RASTREAMENTO E MAPA --- */

    function startGeolocation() {
        if ("geolocation" in navigator) {
            // watchPosition é ideal para rastreamento contínuo
            navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude, accuracy } = position.coords;
                    updateMapLocation(latitude, longitude, accuracy);
                },
                (error) => {
                    console.error("Erro na geolocalização:", error);
                    if (dom.currentLocMap) {
                        dom.currentLocMap.textContent = "Erro de Geolocalização. GPS Desativado?";
                    }
                    userLocation = null;
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0 // Força a atualização imediata
                }
            );
        } else {
            console.warn("Geolocalização não suportada.");
            if (dom.currentLocMap) {
                dom.currentLocMap.textContent = "Geolocalização não suportada";
            }
            userLocation = null;
        }
    }

    function updateMapLocation(lat, lon, accuracy) {
        // 1. Atualiza o estado da localização
        userLocation = { lat, lon, accuracy };

        // 2. Garante que o span de texto esteja atualizado
        if (dom.currentLocMap) {
            const locText = lat && lon 
                ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` 
                : "Localização Desativada/Indisponível";
            dom.currentLocMap.textContent = `Localização Atual: ${locText}`;
        }
        
        // 3. Se o mapa não estiver ativo, apenas salva a localização e sai.
        if (!mapInstance) return; 
        
        const latlng = [lat, lon];

        // 4. Atualiza ou cria o marcador do usuário
        if (locationMarker) {
            locationMarker.setLatLng(latlng);
        } else {
            // Cria um marcador customizado e o adiciona ao mapa
            locationMarker = L.marker(latlng, { 
                icon: L.divIcon({
                    className: 'current-loc-marker',
                    html: '<div style="background:var(--danger); color:white; border-radius:50%; width:10px; height:10px; border: 2px solid white;"></div>', 
                    iconSize: [14, 14]
                }),
                title: 'Sua Localização Atual'
            }).addTo(mapInstance);
        }

        // 5. Atualiza o círculo de precisão
        if (accuracyCircle) {
            accuracyCircle.setLatLng(latlng).setRadius(accuracy);
        } else {
            accuracyCircle = L.circle(latlng, accuracy, {
                color: 'blue',
                fillColor: '#38bdf8',
                fillOpacity: 0.15,
                weight: 2
            }).addTo(mapInstance);
        }

        // 6. Centraliza o mapa na nova localização para garantir que o usuário veja onde está
        mapInstance.panTo(latlng);
    }

    function loadMapMarkers() {
        if (!mapInstance) return;

        // Remove marcadores antigos (exceto o de localização do usuário e CD)
        mapInstance.eachLayer(layer => {
            if (layer.options && !layer.options.attribution && layer !== locationMarker && layer !== accuracyCircle && layer !== cdMarker) {
                mapInstance.removeLayer(layer);
            }
        });

        const latestScans = {};

        // Encontra o registro de scan mais recente para cada código
        scanRecords.forEach(record => {
            if (!latestScans[record.raw] || new Date(record.date) > new Date(latestScans[record.raw].date)) {
                latestScans[record.raw] = record;
            }
        });

        // Adiciona marcadores para cada scan único
        Object.values(latestScans).forEach(record => {
            if (record.lat && record.lon) {
                const markerLatLon = [record.lat, record.lon];
                L.marker(markerLatLon, { 
                    title: `Código: ${record.raw}\nTipo: ${record.type}\nUsuário: ${record.user}`
                })
                .bindPopup(`<b>${record.raw}</b><br>${record.type} em ${new Date(record.date).toLocaleString('pt-BR')}`)
                .addTo(mapInstance);
            }
        });
    }

    /* --- FUNÇÕES DE RENDERIZAÇÃO DE TELA --- */
    
    window.renderDashboard = function() {
        stopVideo(); // Garante que a câmera seja desligada
        dom.mapView.style.display = 'none'; // Esconde a seção do mapa
        dom.cameraView.style.display = 'none';
        dom.app.classList.remove('hidden');
        dom.contentArea.innerHTML = `<h2>Dashboard</h2><p>Bem-vindo(a), ${currentUser.username}!</p>`;
        
        // Exibe a lista dos 10 scans mais recentes
        const recentScansHtml = scanRecords.slice(0, 10).map(r => 
            `<div class="user-form-card" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${r.raw}</strong> (${r.type})<br>
                    <small>Usuário: ${r.user} | ${new Date(r.date).toLocaleString('pt-BR')}</small>
                </div>
            </div>`
        ).join('');
        
        dom.contentArea.innerHTML += `<h3>Scans Recentes</h3>${recentScansHtml || '<p>Nenhum scan registrado ainda.</p>'}`;
        
        // Atualiza o menu
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        dom.btnDashboard.classList.add('active');

        // Garante que o rastreamento GPS esteja ativo em segundo plano
        if (!userLocation) {
             startGeolocation();
        }
        
        // Esconde o menu mobile se estiver ativo
        if (dom.sidebar.classList.contains('active')) {
             window.toggleSidebar();
        }
    }

    window.renderScanMode = function() {
        dom.app.classList.add('hidden');
        dom.mapView.style.display = 'none';
        dom.cameraView.style.display = 'flex';
        
        // Atualiza o menu
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        dom.btnScanMode.classList.add('active');

        // Inicia o vídeo e a varredura
        startVideoAndScan();
    }
    
    window.renderMap = function() {
        stopVideo(); // Garante que a câmera seja desligada
        dom.contentArea.innerHTML = '';
        dom.app.classList.add('hidden');
        dom.cameraView.style.display = 'none';
        dom.mapView.style.display = 'block';

        // 1. Inicializa o mapa se ainda não foi inicializado
        if (!mapInstance) {
            const initialCoords = userLocation ? [userLocation.lat, userLocation.lon] : [CD_LOCATION.lat, CD_LOCATION.lon];
            mapInstance = L.map('mapObjFullscreen').setView(initialCoords, 13);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(mapInstance);
            
            // Adiciona marcador do CD (Central de Distribuição)
            cdMarker = L.marker([CD_LOCATION.lat, CD_LOCATION.lon], { 
                title: 'Local de Distribuição', 
                icon: L.divIcon({
                    className: 'cd-marker',
                    html: '🏢', 
                    iconSize: [30, 30]
                })
            }).addTo(mapInstance);
            
        }

        // 2. Garante que o rastreamento GPS esteja ativo e atualiza a localização
        if (!userLocation) {
             startGeolocation();
        } else {
             // Se a localização já foi obtida, centraliza o mapa nela.
             updateMapLocation(userLocation.lat, userLocation.lon, userLocation.accuracy || 0);
        }
        
        // 3. Atualiza os marcadores de scans
        loadMapMarkers();
        
        // O Leaflet precisa ser invalidado ao ser exibido após estar escondido
        setTimeout(() => { mapInstance.invalidateSize(); }, 100); 

        // Atualiza o menu
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        dom.btnMap.classList.add('active');
        
        // Esconde o menu mobile se estiver ativo
        if (dom.sidebar.classList.contains('active')) {
             window.toggleSidebar();
        }
    }

    window.renderRoutes = function() { 
        // ... (Implemente a renderização de rotas)
        stopVideo(); 
        dom.mapView.style.display = 'none';
        dom.cameraView.style.display = 'none';
        dom.app.classList.remove('hidden');
        dom.contentArea.innerHTML = `<h2>Otimizar Rotas</h2><p>Funcionalidade de Otimização de Rotas (Ainda não implementada).</p>`;
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        dom.btnRoutes.classList.add('active');
    }

    window.renderUsers = function() { 
        // ... (Implemente a renderização de usuários)
        if (currentUser.role !== 'admin' && currentUser.role !== 'gestor') {
            return renderDashboard(); // Redireciona se não tiver permissão
        }
        stopVideo();
        dom.mapView.style.display = 'none';
        dom.cameraView.style.display = 'none';
        dom.app.classList.remove('hidden');
        
        let usersListHtml = users.map(u => `
            <div class="user-form-card" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${u.username}</strong> (${u.role})<br>
                    <small>ID: ${u.id}</small>
                </div>
                <div>
                    <button onclick="window.renderUserForm('${u.id}')">Editar</button>
                    ${u.role !== 'admin' ? `<button onclick="window.deleteUser('${u.id}')" style="background:var(--danger); color:white; margin-left:10px;">Excluir</button>` : ''}
                </div>
            </div>
        `).join('');

        dom.contentArea.innerHTML = `
            <h2>Gerenciar Usuários</h2>
            <button class="btn-primary" onclick="window.renderUserForm()">+ Novo Usuário</button>
            <div style="margin-top:20px;">${usersListHtml}</div>
        `;
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        dom.btnUsers.classList.add('active');
    }

    window.renderUserForm = function(userId = null) {
        // ... (Implemente o formulário de usuário)
        const userToEdit = userId ? users.find(u => u.id === userId) : { username: '', password: '', role: 'colaborador' };
        
        const isEditing = userId !== null;
        if (isEditing && !userToEdit) return renderUsers();

        dom.contentArea.innerHTML = `
            <h2>${isEditing ? 'Editar' : 'Novo'} Usuário</h2>
            <input type="text" id="formUsername" placeholder="Usuário" value="${userToEdit.username}" ${isEditing ? 'disabled' : ''}>
            <input type="password" id="formPassword" placeholder="Senha (Deixe vazio para manter)" value="">
            <select id="formRole">
                <option value="colaborador" ${userToEdit.role === 'colaborador' ? 'selected' : ''}>Colaborador</option>
                <option value="gestor" ${userToEdit.role === 'gestor' ? 'selected' : ''}>Gestor</option>
                ${currentUser.role === 'admin' ? `<option value="admin" ${userToEdit.role === 'admin' ? 'selected' : ''}>Admin</option>` : ''}
            </select>
            <button class="btn-primary" onclick="window.saveUser('${userId}')" style="margin-top:10px;">${isEditing ? 'Salvar' : 'Criar'}</button>
            <button class="btn-secondary" onclick="window.renderUsers()" style="margin-left:10px;">Cancelar</button>
            <p id="formError" style="color:var(--danger); margin-top:10px;"></p>
        `;
    }

    window.saveUser = function(userId) {
        // ... (Implemente a lógica de salvar usuário)
        const username = document.getElementById('formUsername').value.trim();
        const password = document.getElementById('formPassword').value.trim();
        const role = document.getElementById('formRole').value;
        const formError = document.getElementById('formError');

        if (!username || (!userId && !password)) {
            formError.textContent = 'Usuário e Senha são obrigatórios.';
            return;
        }

        if (userId) {
            const index = users.findIndex(u => u.id === userId);
            if (index !== -1) {
                users[index].role = role;
                if (password) users[index].password = password;
            }
        } else {
            if (users.find(u => u.username === username)) {
                formError.textContent = 'Nome de usuário já existe.';
                return;
            }
            const newUser = {
                id: 'u' + Date.now(),
                username,
                password,
                role,
                creatorId: currentUser.id
            };
            users.push(newUser);
        }

        saveUsers();
        renderUsers();
    }

    window.deleteUser = function(userId) {
        // ... (Implemente a lógica de deletar usuário)
        if (currentUser.id === userId) {
            alert("Você não pode deletar a si mesmo.");
            return;
        }
        if (confirm("Tem certeza que deseja deletar este usuário?")) {
            users = users.filter(u => u.id !== userId);
            saveUsers();
            renderUsers();
        }
    }

    /* --- FUNÇÕES DO SCANNER (QR Code) --- */
    
    function showFeedback(msg, type = 'info') {
        dom.feedbackMsg.textContent = msg;
        dom.feedbackMsg.style.backgroundColor = type === 'success' ? 'var(--success)' : type === 'danger' ? 'var(--danger)' : 'var(--accent)';
        dom.feedbackMsg.style.opacity = '1';
        setTimeout(() => {
            dom.feedbackMsg.style.opacity = '0';
        }, 3000);
    }
    
    function startVideoAndScan() {
        // ... (Implemente a lógica de iniciar câmera e QR scan)
        if (isScanning) return;
        isScanning = true;
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then((stream) => {
                videoStream = stream;
                videoTrack = stream.getVideoTracks()[0];
                dom.videoElement.srcObject = stream;
                dom.videoElement.setAttribute("playsinline", true);
                dom.videoElement.play();
                requestAnimationFrame(scan);
                showFeedback("Câmera Iniciada. Apontando para código...", "info");
            })
            .catch((err) => {
                console.error("Erro ao acessar a câmera:", err);
                showFeedback("Erro ao acessar a câmera. Permissão negada ou indisponível.", "danger");
                isScanning = false;
            });
    }

    function stopVideo() {
        // ... (Implemente a lógica de parar câmera)
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
            videoTrack = null;
        }
        isScanning = false;
    }
    
    function scan() {
        // ... (Implemente a lógica de scan de QR)
        if (!isScanning || dom.videoElement.readyState !== dom.videoElement.HAVE_ENOUGH_DATA) {
            requestAnimationFrame(scan);
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = dom.videoElement.videoWidth;
        canvas.height = dom.videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(dom.videoElement, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code) {
            const currentTime = Date.now();
            if (code.data !== lastScanCode || currentTime > lastScanTime + SCAN_DELAY) {
                dom.scanOverlay.style.borderColor = 'var(--success)';
                stopVideo();
                saveScanRecord(code.data, 'QR');
                lastScanCode = code.data;
                lastScanTime = currentTime;
            } else {
                 dom.scanOverlay.style.borderColor = 'var(--accent)';
            }
        } else {
            dom.scanOverlay.style.borderColor = 'rgba(255,255,255,0.5)';
        }

        if (isScanning) {
            requestAnimationFrame(scan);
        }
    }
    
    window.manualScan = function() {
        const code = document.getElementById('manualCodeInput').value.trim();
        if (code) {
            saveScanRecord(code, 'Manual');
            document.getElementById('manualCodeInput').value = '';
        } else {
            showFeedback("Insira um código válido para registro manual.", "danger");
        }
    }
    
    // ... (restante das funções do scanner, como toggleTorch)
    
    window.toggleSidebar = function() {
        if (window.innerWidth <= 768) {
            dom.sidebar.classList.toggle('active');
        }
    };
    
    /* --- FUNÇÕES DE EXPORTAÇÃO --- */

    function exportData(filter) {
        // ... (Implemente a lógica de exportação, você já tem essa função)
        let filteredRecords = [];
        const today = new Date();
        
        if (filter === 'daily') {
            const oneDayAgo = new Date(today);
            oneDayAgo.setDate(today.getDate() - 1);
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= oneDayAgo);
        } else if (filter === 'weekly') {
            const oneWeekAgo = new Date(today);
            oneWeekAgo.setDate(today.getDate() - 7);
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= oneWeekAgo);
        } else if (filter === 'monthly') {
            const oneMonthAgo = new Date(today);
            oneMonthAgo.setMonth(today.getMonth() - 1);
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= oneMonthAgo);
        } else {
            filteredRecords = scanRecords; // 'all'
        }

        if(!filteredRecords.length) return alert(`Nenhum dado encontrado para o filtro: ${filter}.`);
        
        let csv = 'ID,TIPO,DATA,HORA,USUARIO,LAT,LON,RAW\n';
        filteredRecords.forEach(r => {
            const scanDate = new Date(r.date);
            const dateStr = scanDate.toLocaleDateString('pt-BR');
            const timeStr = scanDate.toLocaleTimeString('pt-BR');
            // Sanitiza o campo RAW para CSV
            csv += `${r.id},${r.type},${dateStr},${timeStr},${r.user},${r.lat.toFixed(6)},${r.lon.toFixed(6)},"${r.raw.replace(/"/g, '""')}"\n`;
        });
        
        const filename = `relatorio_pegazus_${filter}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    
    /* --- INICIALIZAÇÃO E EVENT LISTENERS --- */

    dom.btnLogin.addEventListener('click', handleLogin);
    dom.loginPass.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    dom.btnLogout.addEventListener('click', handleLogout);

    dom.btnDashboard.addEventListener('click', window.renderDashboard);
    dom.btnScanMode.addEventListener('click', window.renderScanMode);
    dom.btnMap.addEventListener('click', window.renderMap);
    dom.btnRoutes.addEventListener('click', window.renderRoutes);
    dom.btnUsers.addEventListener('click', window.renderUsers);
    
    // Eventos de Exportação
    dom.btnExport.addEventListener('click', () => {
        dom.exportOptions.style.display = dom.exportOptions.style.display === 'flex' ? 'none' : 'flex';
    });
    dom.btnExportDaily.addEventListener('click', () => exportData('daily'));
    dom.btnExportWeekly.addEventListener('click', () => exportData('weekly'));
    dom.btnExportMonthly.addEventListener('click', () => exportData('monthly'));
    dom.btnExportAll.addEventListener('click', () => exportData('all'));

    checkAuth();
    startGeolocation(); // Inicia o rastreamento da localização do usuário
});
