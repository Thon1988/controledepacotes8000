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
    
    // --- VARIÁVEIS DE ESTADO DO MAPA ---
    let userLocation = null;
    let mapInstance = null;
    let locationMarker = null; // Marcador para a localização atual do usuário
    let accuracyCircle = null; // Círculo para a precisão do GPS
    let cdMarker = null; // Marcador da Central de Distribuição

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

    /* --- FUNÇÕES AUXILIARES --- */

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

    /* --- FUNÇÕES DE RASTREAMENTO E MAPA (FOCO NA CORREÇÃO) --- */

    /**
     * Inicia o rastreamento contínuo da geolocalização do usuário.
     */
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

    /**
     * Atualiza o estado da localização e o marcador no mapa, corrigindo o erro de visualização.
     */
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

        // 4. Atualiza ou cria o marcador do usuário (Corrigindo o problema de posição)
        if (locationMarker) {
            locationMarker.setLatLng(latlng);
        } else {
            // Cria um marcador customizado e o adiciona ao mapa
            locationMarker = L.marker(latlng, { 
                icon: L.divIcon({
                    className: 'current-loc-marker',
                    // Ícone visualmente distinto para a localização atual
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

    /**
     * Carrega marcadores de todos os scans (mais recente por código) no mapa.
     */
    function loadMapMarkers() {
        if (!mapInstance) return;

        // Remove marcadores antigos (exceto o de localização do usuário e CD)
        mapInstance.eachLayer(layer => {
            // Verifica se não é o layer de tiles, nem o marcador de localização atual, nem o círculo de precisão
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
        // ... (código existente para renderizar o dashboard)
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
        // ... (código existente para renderizar o scanner)
        dom.app.classList.add('hidden');
        dom.mapView.style.display = 'none';
        dom.cameraView.style.display = 'flex';
        
        // Atualiza o menu
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        dom.btnScanMode.classList.add('active');

        // Inicia o vídeo e a varredura
        startVideoAndScan();
    }
    
    /**
     * Função chamada para abrir a tela de mapa.
     */
    window.renderMap = function() {
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

    // ... (restante das funções: renderRoutes, renderUsers, renderUserForm, saveUser, deleteUser)

    /* --- FUNÇÕES DO SCANNER (QR Code) --- */
    
    // ... (código para startVideoAndScan, stopVideo, scan, showFeedback, manualScan)

    /* --- INICIALIZAÇÃO E EVENT LISTENERS --- */

    // ... (event listeners para login, logout, menus)
    
    // Inicia o rastreamento da localização do usuário quando o app carrega
    startGeolocation();
    
    // ... (outras inicializações)
});
