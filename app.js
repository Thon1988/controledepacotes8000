// app.js — PegazusLog v0.1: Autenticação, QR Scanning e Gestão de Dados

(() => {
    // --- Referências de Elementos ---
    let video, overlay, output, scansList, startButton, stopButton, torchButton;
    let deviceSelect, deviceSelectLabel, exportBtn, clearBtn, scanPopup, overlayCtx;
    let controlsContainer, body, loginScreen, loginBtn, loginUserField, loginPassField, loginStatusEl;
    let cameraWrap;

    // --- Variáveis e Constantes ---
    const STORAGE_KEY = 'scannedPackages_v1_mobile';
    const USER_KEY = 'scanner_users_v1';
    const LOGIN_SESSION_KEY = 'scanner_loggedInUser';
    
    const SCAN_INTERVAL = 700;
    const DUPLICATE_WINDOW = 60 * 1000;

    let mediaStream = null;
    let rafId = null;
    let scanning = false;
    let lastScanTime = 0;
    let scannedData = loadScannedData();
    let users = loadUsers(); // Carrega lista de usuários e suas roles
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    let currentVideoTrack = null;
    let torchOn = false;
    
    // A data selecionada é sempre o dia atual por padrão
    let selectedDate = new Date().toISOString().substring(0, 10); 

    // --- UTILS (Log, Popup) ---
    function beep(duration = 90, freq = 1400, vol = 0.12) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = freq; g.gain.value = vol;
            o.connect(g); g.connect(ctx.destination); o.start();
            setTimeout(() => { try { o.stop(); ctx.close(); } catch (e) {} }, duration);
        } catch (e) {}
    }

    function showPopup(text, ms = 900) { scanPopup.textContent = text; scanPopup.style.display = 'block'; setTimeout(() => { scanPopup.style.display = 'none'; }, ms); }
    function logOutput(msg) { output.textContent = msg; console.info(msg); }
    
    function logLoginStatus(msg, isError = false) { 
        if (loginStatusEl) {
            loginStatusEl.textContent = msg;
            loginStatusEl.style.color = isError ? '#dc3545' : '#6c757d'; 
            loginStatusEl.style.fontWeight = isError ? 'bold' : 'normal';
        }
    }
    
    function escapeHtml(s) { return (s+'').replace(/[&<>"']/g, c => ({'&':'&','<':'<','>':'>','"':'"',"'":'''})[c]); }
    function formatDate(date) { return date.toISOString().substring(0, 10); }

    // --- DADOS E LOCAL STORAGE ---
    function saveScannedData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedData)); } catch (e) { console.warn(e); } }
    function loadScannedData() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
    
    function addScan(entry) { 
        const currentUser = getLoggedInUser();
        if (currentUser) { entry.scannedBy = currentUser.username; }
        entry.date = formatDate(new Date(entry.timestamp)); 
        scannedData.unshift(entry); 
        saveScannedData(); 
        renderScans(); 
    }
    
    // --- AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS ---
    function saveUsers() { try { localStorage.setItem(USER_KEY, JSON.stringify(users)); } catch (e) { console.warn(e); } }
    
    function loadUsers() {
        // Usuários Padrão (Usados para definir roles e permissões)
        const defaultUsers = {
            'thon': { password: '882010', role: 'administrator', createdBy: 'system' }, 
            'manager1': { password: '123', role: 'manager', createdBy: 'system' },     
            'user1': { password: 'user1', role: 'user', createdBy: 'manager1' },
            'convidado': { password: 'nao-se-aplica', role: 'guest', createdBy: 'system' }
        };
        
        let loadedUsers = {};
        try { 
            const raw = localStorage.getItem(USER_KEY);
            if (raw) { loadedUsers = JSON.parse(raw); }
        } catch (e) { console.error("Erro ao carregar usuários salvos, usando padrões.", e); }
        
        // Combina padrões com carregados
        return Object.assign(defaultUsers, loadedUsers); 
    }
    
    function getLoggedInUser() {
        try {
            const userStr = sessionStorage.getItem(LOGIN_SESSION_KEY);
            if (userStr) return JSON.parse(userStr);
        } catch (e) {}
        return null;
    }

    function isAuthenticated() { return !!getLoggedInUser(); }
    function isAdmin() { const user = getLoggedInUser(); return user && user.role === 'administrator'; }
    function isManager() { const user = getLoggedInUser(); return user && (user.role === 'manager' || user.role === 'administrator'); }

    // **********************************************
    // Função de Login COM Verificação de Senha
    // **********************************************
    function loginUser(username, password) {
        users = loadUsers(); // Garante que a lista de usuários esteja atualizada

        const userToLog = username.trim();
        const userExists = users[userToLog];

        // 1. VERIFICAÇÃO REAL DE CREDENCIAIS
        if (userExists && userExists.password === password) {
            // LOGIN BEM-SUCEDIDO
            
            const user = { username: userToLog, role: userExists.role, timestamp: Date.now() }; 
            sessionStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(user));

            if (loginUserField) loginUserField.value = '';
            if (loginPassField) loginPassField.value = '';
            
            // MENSAGEM DE SUCESSO SOLICITADA
            logLoginStatus('Login efetuado com sucesso!', false);
            
            // Abre o aplicativo após um pequeno atraso para o usuário ver a mensagem
            setTimeout(() => {
                updateUIForAuth();
                renderScans(); 
            }, 500);
            
            return true;
        }

        // LOGIN FALHOU
        sessionStorage.removeItem(LOGIN_SESSION_KEY);
        
        // MENSAGEM DE ERRO SOLICITADA
        logLoginStatus('Usuário ou senha incorreta.', true);
        
        // Limpa o campo da senha e foca nele
        if (loginPassField) loginPassField.value = '';
        
        updateUIForAuth(); // Garante que a tela de login permaneça
        return false;
    }

    function logoutUser() {
        sessionStorage.removeItem(LOGIN_SESSION_KEY);
        logOutput('Logout realizado.');
        stopCamera();
        updateUIForAuth();
        renderScans(); 
        logLoginStatus('Insira suas credenciais e clique em Entrar.', false);
    }
    
    // --- LÓGICA DE FILTRAGEM E RENDERIZAÇÃO ---
    
    function getFilterableUsernames(currentUser) {
        if (isAdmin()) { return Object.keys(users); }
        if (isManager()) {
            // Gerentes podem ver seus próprios scans e os scans dos usuários que criaram (se a lógica de criação fosse real)
            const managerCreatedUsernames = Object.keys(users).filter(u => users[u].createdBy === currentUser.username && users[u].role === 'user');
            managerCreatedUsernames.push(currentUser.username);
            return managerCreatedUsernames;
        }
        return [currentUser.username]; // Usuário comum ou convidado só vê os próprios
    }
    
    function getFilteredScans() {
        const currentUser = getLoggedInUser();
        if (!currentUser) return [];
        const allowedUsers = getFilterableUsernames(currentUser);
        return scannedData.filter(item => {
            // Filtra por usuário e data selecionada
            return item.scannedBy && allowedUsers.includes(item.scannedBy) && item.date === selectedDate;
        });
    }

    function getCompradorInfo(mainId) {
        // Simulação de dados do comprador (baseado no ID do QR para consistência)
        const hash = (mainId || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const names = ["João Silva", "Maria Santos", "Pedro Almeida", "Ana Oliveira", "Carlos Souza", "Juliana Lima"];
        const addresses = ["Rua das Flores, 100, Centro, SP", "Av. Paulista, 1578, Bela Vista, SP", "Praça da Sé, s/n, Sé, RJ", "Rua Doutor Cesário, 112, Campinas, SP", "Rua Tabapuã, 41, Itaim Bibi, SP"];
        const ceps = ["01001-000", "04538-132", "05407-002", "09726-210", "13087-460"];

        return {
            nome: names[hash % names.length],
            endereco: addresses[(hash + 1) % addresses.length],
            cep: ceps[(hash + 2) % ceps.length]
        };
    }

    function renderScans() {
        const loggedIn = isAuthenticated();
        scansList.innerHTML = '';
        
        if (!loggedIn) { scansList.innerHTML = '<div style="color:#6c757d">Faça login para ver os registros.</div>'; return; }
        
        const scans = getFilteredScans();
        if (scans.length === 0) { scansList.innerHTML = `<div style="color:#6c757d">Nenhum registro encontrado para o dia ${selectedDate.split('-').reverse().join('/')}.</div>`; return; }
        
        scans.sort((a, b) => b.timestamp - a.timestamp); 
        
        scans.forEach(item => {
            const el = document.createElement('div'); el.className = 'item';
            
            const mainId = item.link || item.qrId.value || item.extractedId.value; 
            // Garante que o compradorInfo seja preenchido se não existir (para scans antigos)
            if (!item.comprador) { item.comprador = getCompradorInfo(mainId); }
            const address = item.comprador?.endereco || '';
            
            // Codifica o endereço para ser seguro em URLs
            const encodedAddress = encodeURIComponent(address);

            // Link para Google Maps
            const googleMapsUrl = `http://maps.google.com/?q=${encodedAddress}`; 
            
            // Link para Waze
            const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
            
            el.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div style="font-size:14px; word-break: break-all; flex-grow: 1;">
                        <strong>ID:</strong> <span class="link-text">${escapeHtml(mainId)}</span>
                    </div>

                    ${address ? `
                        <div style="display: flex; gap: 4px; flex-shrink: 0; margin-top: -3px;">
                            <a href="${googleMapsUrl}" target="_blank" style="text-decoration: none;">
                                <button style="padding: 4px 8px; font-size: 11px; background: #4285F4; color: white; border-radius: 6px; cursor: pointer;">🗺️ Maps</button>
                            </a>
                            <a href="${wazeUrl}" target="_blank" style="text-decoration: none;">
                                <button style="padding: 4px 8px; font-size: 11px; background: #6fe9ff; color: #111; border-radius: 6px; cursor: pointer;">Waze</button>
                            </a>
                        </div>
                    ` : ''}
                </div>
                <div style="font-size:12px; color:#495057; margin-top:2px;">
                    👤 ${escapeHtml(item.comprador?.nome || 'N/A')} | Endereço: ${escapeHtml(address || 'N/A')}
                </div>
                <div style="font-size:11px; color:#6c757d;">
                    ${escapeHtml(item.dataHora.split(' ')[1])} | Por: ${escapeHtml(item.scannedBy)}
                </div>
            `;
            scansList.appendChild(el);
        });
        if (scansList.lastChild) { scansList.lastChild.style.borderBottom = 'none'; }
    }
    
    // --- UI/AUTH UPDATE ---
    
    function createButton(text, id, className, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.id = id;
        btn.classList.add(className, 'auth-control');
        btn.addEventListener('click', onClick);
        return btn;
    }

    function updateUIForAuth() {
        const loggedIn = isAuthenticated();
        const user = getLoggedInUser();
        const adminMode = user && user.role === 'administrator';
        const managerMode = user && user.role === 'manager';
        
        // 1. Alterna o estado de exibição (controlado pelo CSS)
        if (loggedIn) {
            body.classList.add('logged-in');
            loginScreen.style.display = 'none';
            document.querySelector('.app').style.display = 'block';
        } else {
            body.classList.remove('logged-in');
            loginScreen.style.display = 'flex'; // Exibe o container de login centralizado
            document.querySelector('.app').style.display = 'none';
        }

        // 2. Remove elementos dinâmicos antigos (botões de logout/relatório)
        document.querySelectorAll('.auth-control').forEach(el => el.remove());

        if (loggedIn) {
            // --- MODO LOGADO ---
            
            // 3. Adiciona Logout
            const logoutBtn = createButton(`👋 ${user.username} - Sair`, 'logoutBtn', 'secondary', logoutUser);
            controlsContainer.appendChild(logoutBtn);
            
            // 4. Cria e mostra o seletor de Data
            let dateContainer = document.querySelector('#dateContainer');
            if (!dateContainer) {
                 dateContainer = document.createElement('div');
                 dateContainer.id = 'dateContainer';
                 dateContainer.classList.add('auth-control', 'controls');
                 dateContainer.style.flexWrap = 'nowrap';
                 dateContainer.style.justifyContent = 'flex-start';
                 controlsContainer.parentNode.insertBefore(dateContainer, controlsContainer.nextSibling); 
            }
            // Define o dia atual como o padrão
            // selectedDate já está definido como o dia atual na inicialização.
             dateContainer.innerHTML = `
                <label for="dateSelectInput" class="select-label">📅 Dia:</label>
                <input type="date" id="dateSelectInput" value="${selectedDate}">
             `;
            document.getElementById('dateSelectInput').addEventListener('change', (e) => {
                 selectedDate = e.target.value;
                 renderScans();
            });

            // 5. Mostra controles do scanner e relatórios
            startButton.style.display = 'inline-block';
            exportBtn.style.display = (adminMode || managerMode) ? 'inline-block' : 'none';
            clearBtn.style.display = adminMode ? 'inline-block' : 'none';

            if (adminMode || managerMode) {
                 const reportDailyBtn = createButton('📄 Diário', 'reportDailyBtn', 'secondary', () => generateReport('daily'));
                 controlsContainer.appendChild(reportDailyBtn);
            }
            
            logOutput(`Bem-vindo(a), ${user.username}. Scanner pronto.`);

        } else {
            // --- MODO DESLOGADO ---
            const controls = [startButton, stopButton, torchButton, deviceSelect, deviceSelectLabel, exportBtn, clearBtn];
            controls.forEach(el => el.style.display = 'none');
            logOutput('Por favor, faça login para começar.');
        }

        if (!loggedIn) { stopCamera(); }
    }
    
    // --- CÂMERA E SCANNER ---
    
    function extractIdFromLink(link) {
         if (!link || typeof link !== 'string') return { type: null, value: null };
         // Tenta extrair qualquer número longo (ex: ID de pedido/item)
         const num = link.match(/(\d{6,})/); if (num) return { type: 'numeric', value: num[1] };
         return { type: 'text', value: link.split(/\s|;|,|\|/)[0] };
    }

    async function handleScanResult(payload) {
        if (!payload) return;
        
        // Verifica duplicidade no tempo
        if (scannedData.some(item => item.link === payload && (Date.now() - item.timestamp) < DUPLICATE_WINDOW)) { logOutput('Já escaneado recentemente.'); showPopup('Já escaneado'); return; }
        
        const plataforma = (() => { const l = payload.toLowerCase(); if (l.includes('shopee.')) return 'Shopee'; if (l.includes('mercadolivre.')||l.includes('mercadolibre')) return 'Mercado Livre'; return 'Outra'; })();
        const extractedId = extractIdFromLink(payload); 
        const mainId = payload; 
        const compradorInfo = getCompradorInfo(mainId);
        
        const entry = { plataforma, link: payload, dataHora: new Date().toLocaleString('pt-BR'), timestamp: Date.now(), extractedId, qrId: {type: 'full_link', value: payload}, comprador: compradorInfo };
        
        addScan(entry); 
        
        // Atualiza a data se o scan for no dia atual
        const today = formatDate(new Date());
        if (today !== selectedDate) {
            selectedDate = today;
            const dateInput = document.getElementById('dateSelectInput');
            if(dateInput) dateInput.value = selectedDate;
            renderScans();
        }

        beep(); 
        try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
        
        showPopup(`✅ OK • ${mainId.substring(0, 30)}...`); 
        
        try { await navigator.clipboard.writeText(mainId); logOutput('Copiado para área de transferência.'); } catch (e) {}
        
        logOutput(`Lido: ${plataforma} • ${mainId}`);
    }
    
    async function enumerateVideoDevices() {
        try { const devices = await navigator.mediaDevices.enumerateDevices(); return devices.filter(d => d.kind === 'videoinput'); } catch (e) { return []; }
    }

    function populateDeviceSelect(devices) {
        deviceSelect.innerHTML = '';
        if (!devices || devices.length === 0) { deviceSelect.style.display = 'none'; deviceSelectLabel.style.display = 'none'; return; }
        devices.forEach(d => { const opt = document.createElement('option'); opt.value = d.deviceId; opt.text = d.label || `Câmera ${deviceSelect.length + 1}`; deviceSelect.appendChild(opt); });
        deviceSelect.style.display = devices.length > 1 ? 'inline-block' : 'none';
        deviceSelectLabel.style.display = devices.length > 1 ? 'inline-block' : 'none';
    }

    async function startCamera() {
        if (!isAuthenticated()) { logOutput('🛑 Faça login para iniciar o scanner.'); return; }
        if (scanning) return;
        logOutput('Solicitando permissão da câmera...');
        startButton.disabled = true;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { logOutput('getUserMedia não suportado neste navegador.'); startButton.disabled = false; return; }

        try {
            let stream;
            let chosenDeviceId = deviceSelect.value;

            // Se nenhum dispositivo foi selecionado, tenta a câmera traseira
            if (!chosenDeviceId) {
                try { 
                    // Tenta câmera traseira ideal (default para mobile)
                    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); 
                } 
                catch (errFacing) {
                    // Tenta fallback: busca o ID da câmera traseira
                    const devices = await enumerateVideoDevices();
                    populateDeviceSelect(devices);
                    const rear = devices.find(d => /rear|back|traseira|environment|facing back/i.test(d.label));
                    chosenDeviceId = rear ? rear.deviceId : (devices[0] && devices[0].deviceId);
                    
                    if (chosenDeviceId) {
                        try { stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: chosenDeviceId } }, audio: false }); } 
                        catch (e) { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
                    } else { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
                }
            } else {
                 // Usa o dispositivo selecionado
                 stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: chosenDeviceId } }, audio: false });
            }


            mediaStream = stream;
            video.srcObject = mediaStream; await video.play().catch(() => {});
            currentVideoTrack = mediaStream.getVideoTracks()[0] || null;
            
            torchOn = false;
            // Configura o botão do flash
            if (currentVideoTrack && typeof currentVideoTrack.getCapabilities === 'function') {
                try { const caps = currentVideoTrack.getCapabilities(); if (caps && caps.torch) torchButton.style.display = 'inline-block'; else torchButton.style.display = 'none'; } catch (e) { torchButton.style.display = 'none'; }
            } else { torchButton.style.display = 'none'; }

            const devicesNow = await enumerateVideoDevices(); populateDeviceSelect(devicesNow);

            scanning = true; startButton.style.display = 'none'; stopButton.style.display = 'inline-block';
            logOutput('✅ Scanner ativo — aponte para o QR.');
            if (video.readyState >= 1) fitCanvases(); else video.addEventListener('loadedmetadata', fitCanvases, { once: true });
            rafId = requestAnimationFrame(scanLoop);
        } catch (err) {
            console.error('Erro ao abrir câmera:', err);
            startButton.disabled = false;
            let msg = 'Erro ao acessar a câmera. Ver console.';
            if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) msg = '🛑 Permissão negada. Permita a câmera nas configurações do navegador.';
            else if (err && err.name === 'NotFoundError') msg = 'Câmera não encontrada.';
            else if (err && err.name === 'SecurityError') msg = 'Requer HTTPS (use GitHub Pages/Netlify) ou localhost.';
            logOutput(msg);
        }
    }

    async function toggleTorch() {
        if (!currentVideoTrack) return;
        try { torchOn = !torchOn; await currentVideoTrack.applyConstraints({ advanced: [{ torch: torchOn }] }); torchButton.textContent = torchOn ? '🔦 On' : '🔦 Flash'; } catch (e) { logOutput('Flash não suportado neste dispositivo.'); }
    }

    function stopCamera() {
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null; currentVideoTrack = null;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null; scanning = false; video.pause(); video.srcObject = null;
        
        startButton.disabled = false; 
        if (isAuthenticated()) { startButton.style.display = 'inline-block'; } else { startButton.style.display = 'none'; }
        
        stopButton.style.display = 'none'; torchButton.style.display = 'none'; deviceSelect.style.display = 'none'; deviceSelectLabel.style.display = 'none';
        overlayCtx.clearRect(0,0,overlay.width,overlay.height);
        logOutput(isAuthenticated() ? 'Scanner parado.' : 'Por favor, faça login para começar.');
    }
    
    function fitCanvases() {
        // Redimensiona o canvas para o tamanho real do vídeo para mapeamento
        const vw = video.videoWidth || video.clientWidth || 640; 
        const vh = video.videoHeight || video.clientHeight || 480;
        
        // Define as dimensões do canvas de overlay e de processamento
        overlay.width = vw; overlay.height = vh; 
        
        // Redimensiona o canvas temporário de processamento para ser menor (melhor performance)
        const processW = Math.min(1024, Math.max(320, Math.round(vw * 0.6))); 
        const processH = Math.round((vh / vw) * processW) || 480;
        tempCanvas.width = processW; 
        tempCanvas.height = processH; 
        
        drawBoundingBox(null);
    }
    
    function drawBoundingBox(location) {
        overlayCtx.clearRect(0,0,overlay.width,overlay.height);
        // Desenha a caixa de foco central (mesmo sem código detectado)
        if (!location) { 
            const w = overlay.width, h = overlay.height; 
            const boxW = Math.round(w * 0.62), boxH = Math.round(h * 0.5); 
            const x = Math.round((w - boxW) / 2), y = Math.round((h - boxH) / 2);
            overlayCtx.strokeStyle = 'rgba(255,255,255,0.35)'; overlayCtx.lineWidth = 3; 
            overlayCtx.strokeRect(x, y, boxW, boxH); 
            return;
        }
        // Desenha a caixa de detecção do QR Code
        overlayCtx.strokeStyle = 'rgba(0,200,83,0.95)'; overlayCtx.lineWidth = Math.max(2, overlay.width / 200);
        overlayCtx.beginPath(); 
        overlayCtx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y); 
        overlayCtx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
        overlayCtx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y); 
        overlayCtx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
        overlayCtx.closePath(); overlayCtx.stroke(); 
        overlayCtx.fillStyle = 'rgba(0,200,83,0.14)'; overlayCtx.fill();
    }
    
    function scanLoop() {
        if (!scanning) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
                const vw = video.videoWidth || video.clientWidth; 
                const vh = video.videoHeight || video.clientHeight;
                if (!vw || !vh) { rafId = requestAnimationFrame(scanLoop); return; }
                
                // Define a área de corte central no vídeo
                const cropFactor = 0.6; 
                const sw = Math.floor(vw * cropFactor); 
                const sh = Math.floor(vh * cropFactor);
                const sx = Math.floor((vw - sw) / 2); 
                const sy = Math.floor((vh - sh) / 2);
                
                // Desenha o frame cortado no canvas temporário e processa
                tempCtx.drawImage(video, sx, sy, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height);
                const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                // jsQR é uma dependência que deve ser incluída no HTML
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                
                if (code && code.data) {
                    if (code.location) {
                        // Mapeia as coordenadas do canvas temporário para o canvas de overlay (tamanho real)
                        const scaleX = sw / tempCanvas.width; 
                        const scaleY = sh / tempCanvas.height;
                        const mapCorner = (pt) => ({ x: Math.round(pt.x * scaleX + sx), y: Math.round(pt.y * scaleY + sy) });
                        const loc = { topLeftCorner: mapCorner(code.location.topLeftCorner), topRightCorner: mapCorner(code.location.topRightCorner), bottomLeftCorner: mapCorner(code.location.bottomLeftCorner), bottomRightCorner: mapCorner(code.location.bottomRightCorner) };
                        drawBoundingBox(loc);
                    } else { drawBoundingBox(null); }
                    
                    const now = Date.now();
                    if (now - lastScanTime >= SCAN_INTERVAL) { 
                        lastScanTime = now; 
                        const payload = (code.data || '').trim(); 
                        handleScanResult(payload); 
                    }
                } else { drawBoundingBox(null); }
            } catch (e) { console.error('Erro no processamento do frame', e); }
        }
        rafId = requestAnimationFrame(scanLoop);
    }
    
    // --- FUNÇÕES DE RELATÓRIO E LIMPEZA ---

    function convertToCSV(data) {
        if (!data || data.length === 0) return '';
        const headers = ['Plataforma','Link_Completo','ID_Tipo','ID_Valor', 'Comprador_Nome', 'Comprador_Endereco', 'Comprador_CEP', 'Data_Hora_Scan', 'Scanned_By']; 
        const rows = [headers.join(';')];
        data.forEach(item => {
            const safe = v => `"${String(v == null ? '' : v).replace(/"/g,'""')}"`;
            const idType = item.extractedId && item.extractedId.type ? item.extractedId.type : '';
            const idValue = item.extractedId && item.extractedId.value ? item.extractedId.value : '';
            const compNome = item.comprador?.nome || '';
            const compEnd = item.comprador?.endereco || '';
            const compCep = item.comprador?.cep || '';
            const scannedBy = item.scannedBy || '';
            
            rows.push([
                safe(item.plataforma), safe(item.link), safe(idType), safe(idValue), 
                safe(compNome), safe(compEnd), safe(compCep),
                safe(item.dataHora), safe(scannedBy)
            ].join(';'));
        });
        return rows.join('\r\n');
    }
    
    function generateReport(period) {
        const currentUser = getLoggedInUser();
        if (!currentUser || (!isAdmin() && !isManager())) { alert('Acesso negado para relatórios.'); return; }
        
        const today = new Date();
        const todayStr = formatDate(today);
        
        const allowedUsers = getFilterableUsernames(currentUser);
        let filteredData = scannedData.filter(item => {
            // Relatório Diário: filtra por dia atual e usuários permitidos
            return item.scannedBy && allowedUsers.includes(item.scannedBy) && item.date === todayStr;
        });

        if (filteredData.length === 0) { alert(`Nenhum dado escaneado encontrado para o dia ${todayStr.split('-').reverse().join('/')}.`); return; }

        const dataToExport = filteredData.map(item => ({
             plataforma: item.plataforma, link: item.link, dataHora: item.dataHora, extractedId: item.extractedId,
             qrId: item.qrId, scannedBy: item.scannedBy, comprador: item.comprador 
        }));

        const csv = convertToCSV(dataToExport);
        const bom = '\uFEFF'; 
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement('a'); a.href = url; 
        a.download = `relatorio_diario_${todayStr}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        logOutput(`Relatório Diário gerado com ${filteredData.length} registros.`);
    }

    function exportCSV() {
        if (!isAdmin()) { alert('Apenas administradores podem exportar todos os dados.'); return; }
        if (!scannedData || scannedData.length === 0) { alert('Nenhum dado para exportar.'); return; }
        
        const dataToExport = scannedData.map(item => ({
             plataforma: item.plataforma, link: item.link, dataHora: item.dataHora, extractedId: item.extractedId,
             qrId: item.qrId, scannedBy: item.scannedBy, comprador: item.comprador 
        }));

        const csv = convertToCSV(dataToExport);
        const bom = '\uFEFF'; 
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement('a'); a.href = url; 
        a.download = `scans_ALL_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        logOutput('Todos os registros exportados.');
    }

    function clearScans() { 
        if (!isAdmin()) { alert('Apenas administradores podem limpar os registros.'); return; }
        if (!confirm('Apagar todos os registros? Esta ação não pode ser desfeita.')) return; 
        scannedData = []; saveScannedData(); renderScans(); logOutput('Registros limpos.'); 
    }

    // --- INICIALIZAÇÃO E LISTENERS ---
    
    function setupDOMLinks() {
        video = document.getElementById('videoElement');
        overlay = document.getElementById('overlay');
        output = document.getElementById('output');
        scansList = document.getElementById('scansList');
        startButton = document.getElementById('startButton');
        stopButton = document.getElementById('stopButton');
        torchButton = document.getElementById('torchButton');
        deviceSelect = document.getElementById('deviceSelect');
        deviceSelectLabel = document.getElementById('deviceSelectLabel');
        exportBtn = document.getElementById('exportBtn');
        clearBtn = document.getElementById('clearBtn');
        scanPopup = document.getElementById('scanPopup');
        // Verifica se o overlay existe antes de tentar obter o contexto
        overlayCtx = overlay ? overlay.getContext('2d') : null;
        controlsContainer = document.getElementById('controls');
        body = document.body;
        
        loginScreen = document.getElementById('loginScreen');
        loginBtn = document.getElementById('loginBtn'); 
        loginUserField = document.getElementById('loginUser');
        loginPassField = document.getElementById('loginPass');
        loginStatusEl = document.getElementById('loginStatus');
        cameraWrap = document.getElementById('cameraWrap');
    }

    function setupLoginListeners() {
        if (!loginBtn) return;
        const handleLoginAttempt = (e) => {
            if (e) e.preventDefault(); 
            const user = loginUserField.value.trim(); 
            const pass = loginPassField.value;
            // Tenta logar com verificação de credenciais
            loginUser(user, pass);
        };

        loginBtn.addEventListener('click', handleLoginAttempt);
        if (loginPassField) loginPassField.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLoginAttempt(e); });
        if (loginUserField) loginUserField.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLoginAttempt(e); });
        
        logLoginStatus('Insira suas credenciais e clique em Entrar.', false);
    }

    function setupOtherListeners() {
        // Verifica se os elementos existem antes de anexar listeners
        if (startButton) startButton.addEventListener('click', startCamera);
        if (stopButton) stopButton.addEventListener('click', stopCamera);
        if (torchButton) torchButton.addEventListener('click', toggleTorch);
        if (exportBtn) exportBtn.addEventListener('click', exportCSV);
        if (clearBtn) clearBtn.addEventListener('click', clearScans);
        window.addEventListener('resize', () => { if (video && video.videoWidth) fitCanvases(); });
        
        if (deviceSelect) {
            deviceSelect.addEventListener('change', async () => {
                if (!isAuthenticated()) return;
                const id = deviceSelect.value; if (!id) return;
                try { stopCamera(); 
                    // Reinicia a câmera com o novo ID
                    startCamera(); 
                } catch (e) { 
                    console.warn('Falha ao selecionar deviceId', e); 
                    logOutput('Falha ao usar câmera selecionada.'); 
                }
            });
        }
    }

    function init() {
        setupDOMLinks();
        // A data é definida como o dia atual ao carregar o app, se logado
        selectedDate = formatDate(new Date()); 
        setupLoginListeners();
        setupOtherListeners();
        // Só desenha a caixa de foco se o contexto 2D foi inicializado
        if (overlayCtx) drawBoundingBox(null);
        updateUIForAuth(); 
        renderScans(); 
    }

    function runInitSafely() {
        if (document.readyState === 'loading') {
             document.addEventListener('DOMContentLoaded', init);
        } else {
             init();
        }
    }

    runInitSafely();

})();
