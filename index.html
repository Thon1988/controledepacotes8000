document.addEventListener('DOMContentLoaded', () => {
    
    /* --- Configurações e Estado --- */
    const STORAGE_KEY_USERS = 'pegazus_users_v4';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
    const DEFAULT_USERS = [
        { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
        { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
        { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
    ]; 
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 }; // Localização simulada do CD
    
    let currentUser = null;
    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    // Garante que registros antigos tenham um status padrão
    scanRecords.forEach(r => {
        if (!r.status) r.status = 'pending';
    });

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

    /* --- Referências DOM --- */
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
    };

    /* --- Inicialização e Storage --- */
    function loadUsers() {
        const raw = localStorage.getItem(STORAGE_KEY_USERS);
        if(!raw) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
            return DEFAULT_USERS;
        }
        const existingUsers = JSON.parse(raw);
        const thonExists = existingUsers.some(u => u.username === 'thon');

        // Garante que o usuário admin padrão 'thon' exista
        if (!thonExists) {
            existingUsers.push(DEFAULT_USERS.find(u => u.username === 'thon'));
        } else {
            const thonIndex = existingUsers.findIndex(u => u.username === 'thon');
            // Mantém a senha e role do admin padrão
            existingUsers[thonIndex].password = DEFAULT_USERS[0].password;
            existingUsers[thonIndex].role = DEFAULT_USERS[0].role;
        }
        return existingUsers;
    }
    
    function saveUsers() {
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }

    /* --- Geolocalização (Localização do Usuário) --- */
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
            
            // Esconde o login e mostra o app principal
            dom.loginSection.classList.add('hidden');
            dom.appContainer.classList.remove('hidden'); 
            
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
        
        // Mostra o login e esconde o app principal
        dom.appContainer.classList.add('hidden');
        dom.loginSection.classList.remove('hidden'); 

        dom.mobileMenuBtn.classList.add('hidden');
        dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.5; color:var(--content-text-dark)"><h2>Até logo</h2></div>`;
    });

    /* --- Navegação e Eventos --- */
    function showContent() {
        dom.cameraView.style.display = 'none';
        dom.contentArea.style.display = 'block';
        
        dom.appContainer.style.display = 'grid'; 
        
        // Garante o layout padrão (sidebar + content) ao sair do scanner/mapa full screen
        if (window.innerWidth > 768) { 
            dom.sidebar.classList.remove('hidden'); 
            dom.appContainer.style.gridTemplateColumns = '392px 1fr';
        } else {
            dom.sidebar.classList.remove('active');
        }
        
        stopScanner();
        if (dom.exportOptions.style.display === 'flex') {
            dom.exportOptions.style.display = 'none'; 
        }
        dom.feedback.style.opacity = '0'; 
    }

    document.getElementById('btnScanMode').addEventListener('click', () => {
        dom.contentArea.style.display = 'none';
        dom.cameraView.style.display = 'flex'; 
        
        dom.appContainer.style.display = 'none'; // Esconde o grid app
        
        if(window.innerWidth > 768) {
            dom.sidebar.classList.add('hidden'); 
        } else {
            dom.sidebar.classList.remove('active');
        }
        startScanner();
    });

    window.renderDashboard = () => {
        dom.appContainer.style.display = 'grid'; 
        renderDashboard();
    }
    
    document.getElementById('btnDashboard').addEventListener('click', window.renderDashboard); 
    document.getElementById('btnUsers').addEventListener('click', renderUsers);
    document.getElementById('btnMap').addEventListener('click', renderMap);
    document.getElementById('btnRoutes').addEventListener('click', renderRoutes);

    document.getElementById('btnExport').addEventListener('click', () => {
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

    /* --- Lógica do Scanner --- */
    
    /** Função para forçar a permissão e preencher a lista de câmeras (CORRIGIDA) */
    async function enumerateDevices() {
        try {
            // Tenta obter uma stream para forçar a permissão do usuário
            const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
            initialStream.getTracks().forEach(track => track.stop());
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            dom.cameraSelect.innerHTML = '';
            
            if (videoDevices.length > 1) { // Só mostra o seletor se houver MAIS DE UMA opção
                 // Preenche o seletor com todas as câmeras
                videoDevices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Câmera ${dom.cameraSelect.length + 1}`;
                    dom.cameraSelect.appendChild(opt);
                });
                dom.cameraSelect.classList.remove('hidden');
            } else {
                dom.cameraSelect.classList.add('hidden'); // Esconde se for 1 ou 0 câmeras
            }
        } catch (err) {
            console.error("Erro ao enumerar dispositivos:", err);
        }
    }
    
    async function startScanner(deviceId = null) {
        if (isScanning && !deviceId) return;
        stopScanner(); 
        
        // Chamada de enumeração AQUI para garantir que a lista esteja atualizada
        await enumerateDevices(); 

        const videoDevices = Array.from(dom.cameraSelect.options);
        
        let targetDeviceId = deviceId;
        
        // Lógica de seleção automática da câmera 
        if (!targetDeviceId && videoDevices.length > 0) {
            const preferredCamera = videoDevices.find(opt => 
                opt.text.toLowerCase().includes('environment') || 
                opt.text.toLowerCase().includes('back') || 
                opt.text.toLowerCase().includes('traseira')
            );
            
            if (preferredCamera) {
                targetDeviceId = preferredCamera.value;
            } else {
                targetDeviceId = videoDevices[0].value;
            }
        }

        // Se o targetDeviceId ainda for nulo e tivermos opções no seletor, usa o valor atual
        if (!targetDeviceId && dom.cameraSelect.value) {
            targetDeviceId = dom.cameraSelect.value;
        }

        const constraints = {
            video: targetDeviceId
                ? { deviceId: { exact: targetDeviceId } } 
                : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        };

        try {
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            dom.video.srcObject = videoStream;
            dom.video.setAttribute('playsinline', true);
            await dom.video.play();
            isScanning = true;
            videoTrack = videoStream.getVideoTracks()[0];
            
            // Atualiza o seletor para o dispositivo que realmente foi aberto
            if (targetDeviceId && dom.cameraSelect.value !== targetDeviceId) {
                dom.cameraSelect.value = targetDeviceId;
            }

            requestAnimationFrame(tick);
        } catch (err) {
            console.error(err);
             Swal.fire({
                icon: 'error',
                title: 'Erro ao Acessar Câmera',
                text: 'Certifique-se de que a câmera está conectada e as permissões foram concedidas.' + (err.message ? ` Mensagem: ${err.message}` : ''),
                confirmButtonText: 'Voltar ao Dashboard'
            }).then(() => {
                window.renderDashboard(); 
            });
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
        if (!isScanning) return;
        if (dom.video.readyState === dom.video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const w = dom.video.videoWidth;
            const h = dom.video.videoHeight;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(dom.video, 0, 0, w, h); 
            
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

    /* --- Parsers e Helpers --- */
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
            lon: lon,
            status: 'pending' // Status inicial
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
    
    // Feedback visual para o Dashboard
    function showDashboardFeedback(text) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); padding:20px 40px; background:var(--success); color:white; border-radius:12px; z-index:10000; box-shadow:0 10px 20px rgba(0,0,0,0.2); opacity:0; transition:opacity 0.3s; font-family: 'Inter', sans-serif;";
        feedbackDiv.innerHTML = `<h3>${text}</h3>`;
        document.body.appendChild(feedbackDiv);
        
        setTimeout(() => { feedbackDiv.style.opacity = '1'; }, 50);
        setTimeout(() => { 
            feedbackDiv.style.opacity = '0'; 
            setTimeout(() => { document.body.removeChild(feedbackDiv); }, 300);
            renderDashboard(); // Re-renderiza para mostrar a lista atualizada
        }, 1500);
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
    
    // Função para dar baixa no registro (clicável no dashboard)
    window.markAsDelivered = (recordId) => {
        // Apenas o usuário que escaneou pode marcar como entregue, a menos que seja um admin/gestor (simplificação: apenas o próprio)
        const record = scanRecords.find(r => r.id === recordId && r.user === currentUser.username); 
        
        if (record) {
            if (record.status === 'delivered') {
                Swal.fire({
                    title: 'Entrega Já Confirmada',
                    text: `A entrega ${recordId} já foi marcada como entregue. Deseja reverter o status para "Pendente"?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sim, Reverter',
                    cancelButtonText: 'Não, Manter'
                }).then((result) => {
                    if (result.isConfirmed) {
                        record.status = 'pending';
                        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
                        showDashboardFeedback(`Status da entrega ${recordId} revertido para PENDENTE.`);
                    }
                });
            } else {
                record.status = 'delivered';
                localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
                
                showDashboardFeedback(`Entrega ${recordId} confirmada como entregue!`);
            }
        } else {
             Swal.fire({
                icon: 'error',
                title: 'Sem Permissão',
                text: 'Registro não encontrado ou você não tem permissão para alterar o status desta entrega.',
                confirmButtonText: 'Ok'
            });
        }
    };


    /* --- Views (Renderização) --- */
    
    function renderDashboard() {
        showContent();
        
        if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
            dom.adminMenuOptions.classList.remove('hidden');
        } else {
            dom.adminMenuOptions.classList.add('hidden');
        }
        
        const html = `
            <h2>📦 Entregas Realizadas</h2>
            <p style="color:var(--content-text-dark)">Total de registros: ${scanRecords.length}</p>
            <div style="display:grid; gap:10px; margin-top:20px;">
                ${scanRecords.map(r => {
                    const statusColor = r.status === 'delivered' ? 'var(--success)' : 'var(--danger)';
                    const actionText = r.status === 'delivered' ? 'ENTREGUE ✅' : 'CLIQUE PARA DAR BAIXA 📝';
                    const cursorStyle = r.status === 'delivered' ? 'default' : 'pointer';
                    const onclickHandler = r.status === 'delivered' ? '' : `onclick="window.markAsDelivered('${r.id}')"`;
                    
                    return `
                        <div ${onclickHandler} 
                             style="background:var(--content-card-bg); padding:15px; border-radius:10px; border-left:4px solid ${statusColor}; cursor:${cursorStyle};">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-weight:bold; font-size:16px">${r.id}</div>
                                <div style="font-size:12px; font-weight:bold; color:${statusColor};">${actionText}</div>
                            </div>
                            <div style="font-size:12px; color:#6b7280; margin-top:5px;">
                                ${r.type} • ${new Date(r.date).toLocaleString()} • User: ${r.user}
                            </div>
                        </div>
                    `;
                }).join('')}
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
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>🧭 Rota Otimizada (${simplifiedRoute.length} pontos)</h2>
                ${deliveryPoints.length >= 2 ? `
                    <button id="btnToggleRouteFullscreen" class="btn-primary" style="padding: 8px 12px; font-size: 14px; box-shadow:none;">
                        🖥️ Tela Cheia
                    </button>` : ''}
            </div>
            <p style="color:var(--content-text-dark)">Simulação baseada nas suas últimas entregas escaneadas. </p>
            <div id="routeMapObj" style="height:70vh; border-radius:12px; margin-top:10px"></div>
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

            // Lógica de tela cheia
            if (deliveryPoints.length >= 2) {
                document.getElementById('btnToggleRouteFullscreen').addEventListener('click', () => {
                    const sidebar = document.getElementById('sidebar');
                    const appContainer = document.querySelector('.app');
                    const button = document.getElementById('btnToggleRouteFullscreen');

                    if (window.innerWidth > 768) { 
                        if (!sidebar.classList.contains('hidden')) {
                            sidebar.classList.add('hidden');
                            appContainer.style.gridTemplateColumns = '1fr';
                            button.innerHTML = '◀️ Voltar';
                        } else {
                            sidebar.classList.remove('hidden');
                            appContainer.style.gridTemplateColumns = '392px 1fr';
                            button.innerHTML = '🖥️ Tela Cheia';
                        }
                    }
                    
                    if (map) {
                        setTimeout(() => {
                            map.invalidateSize();
                        }, 350);
                    }
                });
            }

        }, 100);
    }

    function renderMap() {
        showContent();
        mapInstance = null;
        dom.contentArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>🗺️ Mapa de Entregas</h2>
                <button id="btnToggleMapFullscreen" class="btn-primary" style="padding: 8px 12px; font-size: 14px; box-shadow:none;">
                    🖥️ Tela Cheia
                </button>
            </div>
            <p style="color:var(--content-text-dark)">Você está aqui: <span id="currentLoc">Carregando...</span></p>
            <div id="mapObj" style="height:70vh; border-radius:12px; margin-top:10px"></div>`; // Altura 70vh
        
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
            
            // Lógica de tela cheia
            document.getElementById('btnToggleMapFullscreen').addEventListener('click', () => {
                const sidebar = document.getElementById('sidebar');
                const appContainer = document.querySelector('.app');
                const button = document.getElementById('btnToggleMapFullscreen');

                if (window.innerWidth > 768) { 
                    if (!sidebar.classList.contains('hidden')) {
                        // Entra em Tela Cheia
                        sidebar.classList.add('hidden');
                        appContainer.style.gridTemplateColumns = '1fr';
                        button.innerHTML = '◀️ Voltar';
                    } else {
                        // Sai de Tela Cheia
                        sidebar.classList.remove('hidden');
                        appContainer.style.gridTemplateColumns = '392px 1fr';
                        button.innerHTML = '🖥️ Tela Cheia';
                    }
                }
                
                // Força o redimensionamento do mapa
                if (mapInstance) {
                    setTimeout(() => {
                        mapInstance.invalidateSize();
                    }, 350);
                }
            });


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


    /* --- Gerenciamento de Usuários (CRUD com Permissões) --- */
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
                        ${canEdit ? `<button onclick="window.editUser('${u.id}')" style="background:rgba(56, 189, 248, 0.2); color:var(--accent); padding:5px 10px; margin-right:5px; font-size:14px; box-shadow:none;" title="Editar">✏️</button>` : ''}
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
            Swal.fire({
                icon: 'error',
                title: 'Acesso Negado',
                text: 'Você não tem permissão para editar este usuário.'
            });
            return;
        }

        const isAdmin = currentUser.role === 'admin';
        const isSelf = userToEdit && userToEdit.id === currentUser.id;
        
        let formHtml = `
            <div class="user-form-card" style="border:1px solid var(--accent)">
                <h3>${userId ? 'Editar Usuário: ' + userToEdit.username : 'Novo Usuário'}</h3>
                <input type="text" id="formUsername" placeholder="Usuário" value="${userToEdit ? userToEdit.username : ''}" ${userToEdit ? 'readonly' : ''} style="margin-bottom:8px;">
                <input type="password" id="formPassword" placeholder="Nova Senha (deixe em branco para manter)" value="">
                <select id="formRole" style="margin-bottom:8px;" ${isAdmin || isSelf ? '' : 'disabled'}>
                    <option value="colaborador" ${userToEdit && userToEdit.role === 'colaborador' ? 'selected' : ''}>Colaborador</option>
                    <option value="gestor" ${userToEdit && userToEdit.role === 'gestor' ? 'selected' : ''} ${!isAdmin && !isSelf ? 'hidden' : ''}>Gestor</option>
                    <option value="admin" ${userToEdit && userToEdit.role === 'admin' ? 'selected' : ''} ${!isAdmin && !isSelf ? 'hidden' : ''}>Administrador</option>
                </select>
                <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="btn-primary" onclick="window.saveUser('${userId || ''}')" style="flex:1">Salvar</button>
                    <button onclick="renderUsers()" style="background:#e5e7eb; color:var(--content-text-dark); box-shadow:none;">Cancelar</button>
                </div>
                ${!isAdmin && !isSelf ? `<p style="color:var(--danger); font-size:12px; margin-top:10px;">Apenas Admins/Você podem alterar o Nível de Acesso.</p>` : ''}
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

        if (!username) { Swal.fire('Erro', 'Usuário é obrigatório.', 'error'); return; }
        if (isNew && !password) { Swal.fire('Erro', 'Senha é obrigatória para novo usuário.', 'error'); return; }

        let userIndex = -1;
        if (userId) userIndex = users.findIndex(u => u.id === userId);

        if (isNew && users.some(u => u.username === username)) {
            Swal.fire('Erro', 'Nome de usuário já existe.', 'error');
            return;
        }
        
        let updatedUser;
        if (isNew) {
            updatedUser = {
                id: 'u' + Date.now(),
                username,
                password,
                // Um gestor só pode criar colaborador. Um admin pode criar qualquer um.
                role: currentUser.role === 'gestor' && role !== 'colaborador' ? 'colaborador' : role, 
                creatorId: currentUser.id
            };
            users.push(updatedUser);
        } else {
            updatedUser = users[userIndex]; 

            if (password) updatedUser.password = password;

            // Permite que Admin edite a role de qualquer um, e o próprio usuário edite a sua.
            if (currentUser.role === 'admin' || currentUser.id === userId) {
                updatedUser.role = role; 
            }
        }

        saveUsers();
        document.getElementById('userFormArea').innerHTML = '';
        renderUsers();
        Swal.fire('Sucesso', 'Usuário salvo com sucesso!', 'success');
    };

    window.deleteUser = (userId) => {
        if (userId === currentUser.id) {
            Swal.fire('Erro', 'Você não pode excluir seu próprio perfil enquanto estiver logado.', 'error');
            return;
        }
        Swal.fire({
            title: 'Tem certeza?',
            text: "Você não poderá reverter isso!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--danger)',
            cancelButtonColor: '#aaa',
            confirmButtonText: 'Sim, excluir!'
        }).then((result) => {
            if (result.isConfirmed) {
                users = users.filter(u => u.id !== userId);
                saveUsers();
                renderUsers();
                Swal.fire('Excluído!', 'O usuário foi excluído.', 'success');
            }
        });
    };


    /* --- Exportação CSV com Filtros de Data --- */
    function generateCSV(filter) {
        let filteredRecords = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (filter === 'daily') {
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= today);
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

        if(!filteredRecords.length) return Swal.fire('Aviso', `Nenhum dado encontrado para o filtro: ${filter}.`, 'warning');
        
        let csv = 'ID,TIPO,DATA,HORA,USUARIO,LAT,LON,RAW,STATUS\n'; 
        filteredRecords.forEach(r => {
            const scanDate = new Date(r.date);
            const dateStr = scanDate.toLocaleDateString('pt-BR');
            const timeStr = scanDate.toLocaleTimeString('pt-BR');
            csv += `${r.id},${r.type},${dateStr},${timeStr},${r.user},${r.lat.toFixed(6)},${r.lon.toFixed(6)},"${r.raw.replace(/"/g, '""')}",${r.status || 'pending'}\n`;
        });
        
        const filename = `relatorio_pegazus_${filter}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        dom.exportOptions.style.display = 'none';
        Swal.fire('Sucesso', 'Exportação CSV concluída!', 'success');
    }
});
