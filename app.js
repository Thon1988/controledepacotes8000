document.addEventListener('DOMContentLoaded', () => {
    
    /* --- Configurações e Estado --- */
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
    let videoTrack = null; // GARANTIDO QUE ESTÁ AQUI
    const SCAN_DELAY = 1000;
    let lastScanCode = '';
    let lastScanTime = 0;
    let userLocation = null;
    let mapInstance = null;
    let locationMarker = null;
    
    let tempScanRecord = null;
    
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

    /* --- Lógica do Scanner (CORRIGIDO PARA REINICIALIZAÇÃO DA CÂMERA) --- */
    
    /** Função para forçar a permissão e preencher a lista de câmeras */
    async function enumerateDevices() {
        try {
            // Tenta obter uma stream para forçar a permissão do usuário
            const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
            initialStream.getTracks().forEach(track => track.stop());
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            dom.cameraSelect.innerHTML = '';
            if (videoDevices.length > 0) {
                 // Preenche o seletor com todas as câmeras
                videoDevices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Câmera ${dom.cameraSelect.length + 1}`;
                    opt.selected = d.label.toLowerCase().includes('environment') || d.label.toLowerCase().includes('back');
                    dom.cameraSelect.appendChild(opt);
                });
                dom.cameraSelect.classList.remove('hidden');
            } else {
                dom.cameraSelect.classList.add('hidden');
            }
        } catch (err) {
            console.error("Erro ao enumerar dispositivos:", err);
            // Se houver erro, a lista de câmeras ficará vazia/escondida
        }
    }
    
    async function startScanner(deviceId = null) {
        if (isScanning && !deviceId) return;
        stopScanner(); 
        
        const videoDevices = Array.from(dom.cameraSelect.options);
        
        let targetDeviceId = deviceId;
        
        // Lógica de seleção automática da câmera 0 (traseira/environment)
        if (!targetDeviceId && videoDevices.length > 0) {
            // 1. Tenta encontrar a câmera "environment" ou "traseira" pelo label
            const preferredCamera = videoDevices.find(opt => 
                opt.text.toLowerCase().includes('environment') || 
                opt.text.toLowerCase().includes('back') || 
                opt.text.toLowerCase().includes('traseira')
            );
            
            if (preferredCamera) {
                targetDeviceId = preferredCamera.value;
            } else {
                // 2. Se não encontrar pelo label, usa a primeira (índice 0)
                targetDeviceId = videoDevices[0].value;
            }
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
            // ATUALIZAÇÃO IMPORTANTE: Garante que videoTrack seja definido corretamente
            videoTrack = videoStream.getVideoTracks()[0]; 
            
            // Atualiza o seletor para o dispositivo que realmente foi aberto
            if (targetDeviceId) dom.cameraSelect.value = targetDeviceId;

            requestAnimationFrame(tick);
        } catch (err) {
            console.error(err);
            alert('Erro ao acessar câmera: ' + err.message);
            window.renderDashboard(); 
        }
    }

    function stopScanner() {
        isScanning = false;
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
            videoStream = null;
        }
        // ATUALIZAÇÃO IMPORTANTE: Garante que videoTrack seja sempre limpo
        videoTrack = null; 
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
            
            // Lógica de corte para varrer uma área maior (mantida em 90%)
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
        showFeedback("QR Code lido. Processando baixa..."); 

        const scanLat = userLocation ? userLocation.lat : (CD_LOCATION.lat + (Math.random() - 0.5) * 0.01);
        const scanLon = userLocation ? userLocation.lon : (CD_LOCATION.lon + (Math.random() - 0.5) * 0.01);

        // 1. Cria o registro temporário
        tempScanRecord = parsePayload(data, scanLat, scanLon);
        
        // 2. Para o scanner e mostra o formulário de baixa
        stopScanner();
        renderBaixaForm(tempScanRecord); 
    }


    /* --- FUNÇÕES DE BAIXA --- */

    function renderBaixaForm(record) {
        showContent();
        
        const possibleStatus = [
            { code: 'ENTREGUE', label: '✅ Entregue com sucesso' },
            { code: 'AUSENTE', label: '🏠 Ausente/Endereço Fechado' },
            { code: 'RECUSA', label: '❌ Recusado pelo Destinatário' },
            { code: 'PROBLEMA', label: '⚠️ Problema de Rota/Acesso' }
        ];

        const detailsHtml = `
            <div style="background:var(--content-card-bg); padding:20px; border-radius:10px; border-left:4px solid var(--accent); margin-bottom:20px;">
                <h3 style="margin-top:0; color:var(--content-text-dark);">Baixa de Entrega</h3>
                <p style="font-weight:bold; font-size:18px; margin:5px 0;">ID: ${record.id}</p>
                <p style="margin:2px 0;">Destinatário: <strong>${record.recipientName}</strong></p>
                <p style="margin:2px 0;">Endereço: ${record.address}, ${record.zipCode}</p>
                <p style="margin:2px 0; font-size:14px; color:var(--muted);">Transportadora: ${record.type} | Previsto: ${record.scheduledDate}</p>
            </div>
            
            <h3 style="color:var(--content-text-dark);">Status Final da Baixa</h3>
            <select id="finalStatus" style="margin-bottom:15px; background:var(--content-card-bg); border:1px solid var(--muted); padding:10px; border-radius:8px;">
                ${possibleStatus.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}
            </select>
            
            <textarea id="observation" placeholder="Observações (opcional)" style="width:100%; height:100px; padding:10px; border-radius:8px; border:1px solid var(--muted); margin-bottom:15px; resize:vertical; background:var(--content-card-bg); color:var(--content-text-dark);"></textarea>
            
            <button class="btn-primary" onclick="window.confirmBaixa()" style="width:100%;">Confirmar Baixa e Salvar Registro</button>
            <button onclick="window.cancelBaixa()" style="width:100%; margin-top:10px; background:#e5e7eb; color:var(--content-text-dark); padding:12px 20px; border:none; border-radius:10px; cursor:pointer;">Cancelar e Voltar</button>
        `;
        
        dom.contentArea.innerHTML = detailsHtml;
        window.confirmBaixa = confirmBaixa;
        window.cancelBaixa = cancelBaixa;
    }

    function confirmBaixa() {
        if (!tempScanRecord) return;

        const finalStatus = document.getElementById('finalStatus').value;
        const observation = document.getElementById('observation').value.trim();

        // Atualiza o registro temporário com as informações da baixa
        tempScanRecord.finalStatus = finalStatus;
        tempScanRecord.observation = observation;
        tempScanRecord.baixaDate = new Date().toISOString(); 
        tempScanRecord.deliveryStatus = finalStatus; // Sobrescreve o status inicial com o final

        // Salva o registro final
        scanRecords.unshift(tempScanRecord);
        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
        
        const finalId = tempScanRecord.id;
        tempScanRecord = null; // Limpa o estado temporário
        
        showContent(); // Garante a transição visual
        renderDashboard(); // Volta para o dashboard
        alert(`Baixa do ID ${finalId} confirmada com status: ${finalStatus}!`);
    }

    function cancelBaixa() {
        tempScanRecord = null; // Descarta o registro
        renderDashboard(); // Volta para o dashboard
    }

    /* --- Parsers e Helpers (CORRIGIDO PARA O SHIFT DE LINHAS) --- */
    function parsePayload(raw, lat, lon) {
        // Divide o conteúdo do QR code em linhas para extração, filtrando linhas vazias
        const lines = raw.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // --- 1. Extração de campos (Metadata - Linhas 0 a 4) ---
        
        // Linha 0: ID e Data (e.g., "1- 45975475892-01/12/2025")
        let deliveryId = 'N/A';
        let scheduledDate = 'N/A';
        const idDateMatch = lines[0] ? lines[0].match(/(\d+-\s?)?(\d+)-(\d{2}\/\d{2}\/\d{4})/) : null;
        if (idDateMatch) {
            deliveryId = idDateMatch[2] || lines[0]; 
            scheduledDate = idDateMatch[3];         
        } else {
            const numMatch = raw.match(/(\d{8,})/);
            if (numMatch) deliveryId = numMatch[1];
        }

        const carrier = lines[1] || 'Genérico';                   
        const deliveryType = lines[2] || 'Tipo Não Encontrado';  
        // lines[3] é 'NORMAL'
        const status = lines[4] || 'Status Não Encontrado';      
        
        // --- 2. Ajuste do Índice de Destinatário (FIX CORREÇÃO DE SHIFT) ---
        
        // Por padrão, o Destinatário está na linha 6 se a linha 5 (Gerência: PEX) estiver presente.
        let recipientStart = 6;
        
        // Se a linha 5 não existe ou não começa com 'Gerência:', assume que a linha 5 é o Destinatário.
        if (!lines[5] || !lines[5].startsWith('Gerência:')) {
            recipientStart = 5;
        }

        // Garante que o array tenha espaço suficiente antes de tentar extrair
        if (lines.length <= recipientStart) {
             console.warn("Payload curto demais para extrair destinatário/endereço/cep.");
             recipientStart = lines.length; // Garante que a extração falhe graciosamente
        }
        
        // --- 3. Extração dos Dados de Entrega (Ajustada) ---
        // A busca é feita a partir do índice ajustado (recipientStart)
        const recipientName = lines[recipientStart] || 'Destinatário Não Encontrado'; 
        const address = lines[recipientStart + 1] || 'Endereço Não Encontrado';     
        const zipCode = lines[recipientStart + 2] || 'CEP Não Encontrado';
        
        
        // Campo com prefixo: Coletado: MSS019 (Extração dinâmica, já robusta)
        let collectorId = 'N/A';
        const collectorLine = lines.find(l => l.startsWith('Coletado:'));
        const collectorMatch = collectorLine ? collectorLine.match(/Coletado:\s*(.*)/) : null;
        if (collectorMatch) {
            collectorId = collectorMatch[1].trim();
        }
        
        // --- 4. Estrutura do Registro de Retorno ---

        return {
            id: deliveryId, 
            raw: raw,
            type: carrier,  
            user: currentUser.username,
            date: new Date().toISOString(), 
            lat: lat,
            lon: lon,

            scheduledDate: scheduledDate,
            deliveryType: deliveryType,
            deliveryStatus: status, 
            recipientName: recipientName,
            address: address,
            zipCode: zipCode,
            collectorId: collectorId
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
        dom.feedback.textContent = text;
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
                    // O `videoTrack` deve estar ativo para aplicar as constraints
                    await videoTrack.applyConstraints({ advanced: [{ torch: !settings.torch }] });
                } else {
                    alert('Flash não suportado neste dispositivo/navegador');
                }
            } catch(e) { console.log(e); }
        }
    });

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
                    const isDelivered = r.finalStatus === 'ENTREGUE';
                    const borderColor = isDelivered ? 'var(--success)' : 'var(--danger)';
                    const statusDisplay = r.finalStatus || r.deliveryStatus;
                    const dateDisplay = new Date(r.baixaDate || r.date).toLocaleString();
                    
                    return `
                        <div style="background:var(--content-card-bg); padding:15px; border-radius:10px; border-left:4px solid ${borderColor}">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <div style="font-weight:bold; font-size:16px">${r.id}</div>
                                <div style="font-size:12px; font-weight:600; color:var(--accent);">${r.type}</div>
                            </div>
                            <div style="font-size:14px; margin-top:5px; color:var(--content-text-dark);">
                                <p style="margin:0;">Destino: <strong>${r.recipientName}</strong></p>
                                <p style="margin:2px 0;">Endereço: ${r.address} (${r.zipCode})</p>
                                <p style="margin:2px 0; font-size:12px; color:var(--muted);">
                                    Status: <strong>${statusDisplay}</strong> | Coleta: ${r.collectorId}
                                </p>
                                ${r.observation ? `<p style="margin:2px 0; font-size:11px; color:var(--danger);">Obs: ${r.observation}</p>` : ''}
                                <p style="margin:2px 0; font-size:11px; color:#94a3b8;">
                                    Registrado por ${r.user} em ${dateDisplay} | Previsto: ${r.scheduledDate}
                                </p>
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
                // Um gestor só pode criar colaborador. Um admin pode criar qualquer um.
                role: currentUser.role === 'gestor' && role !== 'colaborador' ? 'colaborador' : role, 
                creatorId: currentUser.id
            };
            users.push(updatedUser);
        } else {
            // CORREÇÃO: Usa o userIndex para obter a referência correta
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


    /* --- Exportação CSV com Filtros de Data --- */
    function generateCSV(filter) {
        let filteredRecords = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (filter === 'daily') {
            filteredRecords = scanRecords.filter(r => new Date(r.baixaDate || r.date) >= today);
        } else if (filter === 'weekly') {
            const oneWeekAgo = new Date(today);
            oneWeekAgo.setDate(today.getDate() - 7);
            filteredRecords = scanRecords.filter(r => new Date(r.baixaDate || r.date) >= oneWeekAgo);
        } else if (filter === 'monthly') {
            const oneMonthAgo = new Date(today);
            oneMonthAgo.setMonth(today.getMonth() - 1);
            filteredRecords = scanRecords.filter(r => new Date(r.baixaDate || r.date) >= oneMonthAgo);
        } else {
            filteredRecords = scanRecords; // 'all'
        }

        if(!filteredRecords.length) return alert(`Nenhum dado encontrado para o filtro: ${filter}.`);
        
        let csv = 'ID,TIPO,DATA,HORA,USUARIO,LAT,LON,STATUS_FINAL,OBSERVACAO,RAW\n';
        filteredRecords.forEach(r => {
            const scanDate = new Date(r.baixaDate || r.date);
            const dateStr = scanDate.toLocaleDateString('pt-BR');
            const timeStr = scanDate.toLocaleTimeString('pt-BR');
            const status = r.finalStatus || 'PENDENTE';
            const observation = r.observation || '';
            csv += `${r.id},${r.type},${dateStr},${timeStr},${r.user},${r.lat.toFixed(6)},${r.lon.toFixed(6)},${status},"${observation.replace(/"/g, '""')}","${r.raw.replace(/"/g, '""')}"\n`;
        });
        
        const filename = `relatorio_pegazus_${filter}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        dom.exportOptions.style.display = 'none';
    }
    
    // Inicializa a enumeração de dispositivos (para preencher a lista de câmeras)
    enumerateDevices();
});
