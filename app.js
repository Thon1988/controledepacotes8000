// app.js — Mobile-friendly scanner (iOS + Android) with authentication and reporting (Admin, Manager, User)

(() => {
    // --- Referências de Elementos Existentes ---
    const video = document.getElementById('videoElement');
    const overlay = document.getElementById('overlay');
    const output = document.getElementById('output');
    const scansList = document.getElementById('scansList');
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const torchButton = document.getElementById('torchButton');
    const deviceSelect = document.getElementById('deviceSelect');
    const deviceSelectLabel = document.getElementById('deviceSelectLabel');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');
    const scanPopup = document.getElementById('scanPopup');
    const overlayCtx = overlay.getContext('2d');
    const controlsContainer = document.getElementById('controls');
    const appContainer = document.querySelector('.app'); 
    const body = document.body;
    
    // NOVO: Referências diretas aos elementos de login (agora fixos no HTML)
    const loginScreen = document.getElementById('loginScreen');
    const loginBtn = document.getElementById('loginBtn');
    const loginUserField = document.getElementById('loginUser');
    const loginPassField = document.getElementById('loginPass');
    
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
    let users = loadUsers(); 
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    let currentVideoTrack = null;
    let torchOn = false;
    
    let selectedDate = new Date().toISOString().substring(0, 10); 


    // --- UTILS (Beep, Popup, Log) ---
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
    function logLoginStatus(msg) { 
        const statusEl = document.getElementById('loginStatus');
        if (statusEl) {
            statusEl.textContent = msg;
            statusEl.style.color = msg.includes('falhou') ? '#dc3545' : '#6c757d'; 
        }
    }
    // Melhoria: Usar template literal para evitar erro de aspas/quebra de linha
    function escapeHtml(s) { 
        return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); 
    }
    
    function formatDate(date) { return date.toISOString().substring(0, 10); }

    // --- DADOS E LOCAL STORAGE (Mantida) ---
    function saveScannedData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedData)); } catch (e) { console.warn(e); } }
    function loadScannedData() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
    function addScan(entry) { 
        const currentUser = getLoggedInUser();
        if (currentUser) {
            entry.scannedBy = currentUser.username;
        }
        entry.date = formatDate(new Date(entry.timestamp)); 
        
        scannedData.unshift(entry); 
        saveScannedData(); 
        renderScans(); 
    }
    
    // --- AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS (Mantida) ---
    
    function saveUsers() { try { localStorage.setItem(USER_KEY, JSON.stringify(users)); } catch (e) { console.warn(e); } }
    
    function loadUsers() {
        try { 
            const raw = localStorage.getItem(USER_KEY);
            if (raw) {
                const savedUsers = JSON.parse(raw);
                if (!savedUsers['thon']) {
                    savedUsers['thon'] = { password: '882010', role: 'administrator', createdBy: 'system' };
                }
                Object.keys(savedUsers).forEach(username => {
                    if (!savedUsers[username].createdBy) {
                        savedUsers[username].createdBy = (username === 'thon' || username === 'user1' || username === 'manager1') ? 'system' : 'thon'; 
                    }
                });
                return savedUsers;
            }
        } catch (e) {}

        const defaultUsers = {
            'thon': { password: '882010', role: 'administrator', createdBy: 'system' }, 
            'manager1': { password: '123', role: 'manager', createdBy: 'system' },     
            'user1': { password: 'user1', role: 'user', createdBy: 'manager1' }        
        };
        try { localStorage.setItem(USER_KEY, JSON.stringify(defaultUsers)); } catch (e) {}
        return defaultUsers;
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
    function isManager() { const user = getLoggedInUser(); return user && user.role === 'manager'; }

    function loginUser(username, password) {
        if (users[username] && users[username].password === password) {
            const user = { username, role: users[username].role, createdBy: users[username].createdBy, timestamp: Date.now() }; 
            sessionStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(user));
            loginUserField.value = '';
            loginPassField.value = '';
            logLoginStatus('');
            
            updateUIForAuth();
            renderScans(); 
            return true;
        }
        logLoginStatus('Login falhou: Usuário ou senha inválidos.');
        return false;
    }

    function logoutUser() {
        sessionStorage.removeItem(LOGIN_SESSION_KEY);
        logOutput('Logout realizado.');
        stopCamera();
        updateUIForAuth();
        renderScans(); 
        logLoginStatus('Insira suas credenciais.');
    }
    
    function setupUserManagement() {
        if (!isAdmin() && !isManager()) { return; }

        const oldContainer = document.querySelector('#userManagementContainer');
        if (oldContainer) oldContainer.remove();

        const container = document.createElement('div');
        container.id = 'userManagementContainer';
        container.classList.add('auth-control');
        
        let roleOptions = '';
        if (isAdmin()) {
            roleOptions = `
                <option value="user">Usuário Padrão</option>
                <option value="manager">Gestor</option>
                <option value="administrator">Administrador</option>
            `;
        } else if (isManager()) {
            roleOptions = `<option value="user">Usuário Padrão</option>`;
        }
        
        container.innerHTML = `
            <div class="panel" style="margin-top: 12px; background: #fff; color: #111;">
                <h3 style="margin: 0 0 8px; font-size: 16px; color: #111;">👤 Gerenciar Usuários</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                    <input type="text" id="newUser" placeholder="Nome de Usuário" style="padding: 6px; border-radius: 6px; border: 1px solid #ccc; width: 120px; color: #111; background-color: #fff;">
                    <input type="password" id="newPass" placeholder="Senha" style="padding: 6px; border-radius: 6px; border: 1px solid #ccc; width: 120px; color: #111; background-color: #fff;">
                    <select id="newRole" style="padding: 6px; border-radius: 6px; border: 1px solid #ccc; color: #111; background-color: #fff;">
                        ${roleOptions}
                    </select>
                    <button id="createUserBtn" style="background:#28a745;color:#fff;padding: 6px 10px;">➕ Adicionar</button>
                </div>
                <div id="userListDisplay" class="list" style="max-height: 120px; border: 0; padding: 0;"></div>
            </div>
        `;
        
        controlsContainer.parentNode.insertBefore(container, controlsContainer.nextSibling);

        document.getElementById('createUserBtn').addEventListener('click', handleCreateUser);
        renderUserList();
    }
    
    function renderUserList() {
        const listDiv = document.getElementById('userListDisplay');
        if (!listDiv) return;
        listDiv.innerHTML = '';
        
        const currentUser = getLoggedInUser();
        const isAdminUser = isAdmin();
        const isManagerUser = isManager();
        
        const usersToShow = Object.keys(users).filter(username => {
            if (isAdminUser) return true;
            const user = users[username];
            return user.createdBy === currentUser.username;
        });
        
        if (usersToShow.length === 0) { listDiv.innerHTML = '<div style="color:#6c757d">Nenhum usuário gerenciável.</div>'; return; }


        usersToShow.forEach(username => {
            const user = users[username];
            const el = document.createElement('div'); el.className = 'item';
            el.style.display = 'flex'; el.style.justifyContent = 'space-between'; el.style.alignItems = 'center';
            
            const roleColor = { 'administrator': '#dc3545', 'manager': '#ffc107', 'user': '#17a2b8' }[user.role];
            const roleText = { 'administrator': 'Admin', 'manager': 'Gestor', 'user': 'Padrão' }[user.role];

            el.innerHTML = `
                <div style="font-size:14px;">
                    <strong>${escapeHtml(username)}</strong> 
                    (<span style="color:${roleColor}">${roleText}</span>)
                    <span style="font-size:12px; color:#6c757d; margin-left: 5px;">${user.createdBy && user.createdBy !== 'system' ? `(Criado por: ${user.createdBy})` : ''}</span>
                </div>
            `;
            
            let canDelete = false;
            if (isAdminUser && username !== currentUser.username) {
                canDelete = true;
            } else if (isManagerUser) {
                if (user.createdBy === currentUser.username && user.role === 'user' && username !== currentUser.username) {
                    canDelete = true;
                }
            }

            if (canDelete) {
                 const deleteBtn = document.createElement('button');
                 deleteBtn.textContent = 'Remover';
                 deleteBtn.style.background = '#dc3545'; deleteBtn.style.marginLeft = '8px'; deleteBtn.style.padding = '4px 8px';
                 deleteBtn.addEventListener('click', () => handleDeleteUser(username));
                 el.appendChild(deleteBtn);
            } else if (username === currentUser.username) {
                 el.innerHTML += '<span style="font-size:12px; color:#6c757d; margin-left: 10px;">(Você)</span>';
            }
            listDiv.appendChild(el);
        });
    }
    
    function handleCreateUser() {
        if (!isAdmin() && !isManager()) { alert('Você não tem permissão para criar usuários.'); return; }
        
        const usernameInput = document.getElementById('newUser');
        const passwordInput = document.getElementById('newPass');
        const roleInput = document.getElementById('newRole');

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const role = roleInput.value;
        const creator = getLoggedInUser().username;

        if (!username || !password) { alert('Usuário e Senha são obrigatórios.'); return; }
        if (users[username]) { alert(`O usuário '${username}' já existe.`); return; }
        
        if (isManager() && role !== 'user') {
             alert('Um Gestor só pode criar Usuários Padrão.');
             return;
        }
        
        users[username] = { password: password, role: role, createdBy: creator };
        saveUsers();
        logOutput(`Usuário ${username} (${role}) criado com sucesso.`);
        
        usernameInput.value = '';
        passwordInput.value = '';
        renderUserList();
    }
    
    function handleDeleteUser(username) {
        const currentUser = getLoggedInUser();
        const userToDelete = users[username];

        if (!userToDelete) { alert('Usuário não encontrado.'); return; }
        if (username === currentUser.username) { alert('Você não pode remover a si mesmo.'); return; }

        let canDelete = false;

        if (isAdmin()) {
            canDelete = true;
        } else if (isManager()) {
            if (userToDelete.createdBy === currentUser.username && userToDelete.role === 'user') {
                canDelete = true;
            } else {
                alert('Você só pode excluir Usuários Padrão que foram criados por você.');
                return;
            }
        }
        
        if (canDelete) {
            if (confirm(`Tem certeza que deseja remover o usuário '${username}'?`)) {
                delete users[username];
                saveUsers();
                logOutput(`Usuário ${username} removido.`);
                renderUserList();
            }
        } else {
             alert('Você não tem permissão para remover este usuário.');
        }
    }


    // --- LÓGICA DE FILTRAGEM DE SCANS (Mantida) ---
    
    function getFilterableUsernames(currentUser) {
        if (isAdmin()) {
            return Object.keys(users);
        }
        if (isManager()) {
            const managerCreatedUsernames = Object.keys(users)
                .filter(u => users[u].createdBy === currentUser.username && users[u].role === 'user');
            managerCreatedUsernames.push(currentUser.username);
            return managerCreatedUsernames;
        }
        return [currentUser.username];
    }
    
    function getFilteredScans() {
        const currentUser = getLoggedInUser();
        if (!currentUser) return [];
        
        const allowedUsers = getFilterableUsernames(currentUser);
        
        let filteredByAccess = scannedData.filter(item => {
            return item.scannedBy && allowedUsers.includes(item.scannedBy);
        });
        
        let filteredByDate = filteredByAccess.filter(item => {
            return item.date === selectedDate;
        });
        
        return filteredByDate;
    }


    // --- RENDERIZAÇÃO E UI ---

    // NOVO: Função para perguntar ao usuário qual app usar
    function openMapForAddress(address) {
        if (!address || address.trim() === 'N/A, N/A, CEP N/A') {
            alert("Endereço indisponível para este item.");
            return;
        }

        const encodedAddress = encodeURIComponent(address);
        
        // Use prompt para dar a opção de escolha
        const choice = prompt(
            `Abrir "${address}" com:\n1. Google Maps\n2. Waze\n\nDigite 1 ou 2:`,
            '1' // Sugere Google Maps como padrão
        );

        if (choice === '1') {
            // Google Maps URL (q= para pesquisa de endereço)
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
        } else if (choice === '2') {
            // Waze URL (q= para pesquisa, use format: ${address} para forçar endereço)
            window.open(`https://waze.com/ul?q=${encodedAddress}&navigate=yes`, '_blank');
        } else if (choice !== null) {
            alert("Opção inválida. Por favor, digite 1 (Google Maps) ou 2 (Waze).");
        }
    }

    function renderScans() {
        const loggedIn = isAuthenticated();
        scansList.innerHTML = '';
        
        if (!loggedIn) { 
             scansList.innerHTML = '<div style="color:#6c757d">Faça login para ver os registros.</div>';
             return;
        }
        
        const scans = getFilteredScans();
        
        if (scans.length === 0) { 
            scansList.innerHTML = `<div style="color:#6c757d">Nenhum registro encontrado para o dia ${selectedDate.split('-').reverse().join('/')}.</div>`; 
            return; 
        }
        
        scans.sort((a, b) => b.timestamp - a.timestamp); 
        
        scans.forEach(item => {
            const el = document.createElement('div'); el.className = 'item';
            el.style.display = 'flex'; 
            el.style.flexDirection = 'column'; 
            el.style.padding = '6px 0';
            el.style.borderBottom = '1px dashed #eee';
            
            const mainId = item.qrId.value || item.extractedId.value || item.link;
            const idType = item.qrId.value ? item.qrId.type : item.extractedId.value ? item.extractedId.type : 'Link Completo';
            
            // Container para a linha principal (ID + Botões)
            const mainLine = document.createElement('div');
            mainLine.style.display = 'flex';
            mainLine.style.justifyContent = 'space-between';
            mainLine.style.alignItems = 'center';
            mainLine.style.marginBottom = '4px';

            // ID Principal
            const idText = document.createElement('span');
            idText.style.fontSize = '14px';
            idText.style.wordBreak = 'break-all';
            idText.style.color = '#343a40';
            idText.innerHTML = `<strong>ID: ${escapeHtml(mainId)}</strong>`;
            
            // Endereço completo para o mapa (Nome, Rua, CEP)
            const fullAddress = `${item.comprador?.nome || ''}, ${item.comprador?.endereco || ''}, CEP ${item.comprador?.cep || ''}`.trim();
            
            // NOVO: Ícone de Alfinete (Mapa)
            const mapPin = document.createElement('span');
            mapPin.innerHTML = '📍';
            mapPin.title = 'Abrir no Mapa (Google Maps ou Waze)';
            mapPin.style.fontSize = '20px'; // Aumenta o ícone
            mapPin.style.cursor = 'pointer';
            mapPin.style.marginLeft = '8px';
            mapPin.style.marginRight = '4px';
            mapPin.style.transition = 'transform 0.1s';
            
            mapPin.addEventListener('click', (e) => {
                e.stopPropagation(); 
                openMapForAddress(fullAddress);
            });
            mapPin.addEventListener('mouseenter', () => mapPin.style.transform = 'scale(1.1)');
            mapPin.addEventListener('mouseleave', () => mapPin.style.transform = 'scale(1)');


            // Linha de Informações do Comprador
            const infoLine = document.createElement('div');
            infoLine.style.fontSize = '12px';
            infoLine.style.color = '#495057';
            infoLine.innerHTML = `
                👤 **Comprador:** ${escapeHtml(item.comprador?.nome || 'N/A')}
                <br> 
                📍 **Endereço:** ${escapeHtml(item.comprador?.endereco || 'N/A')} | **CEP:** ${escapeHtml(item.comprador?.cep || 'N/A')}
            `;

            // Linha de metadados
            const metaLine = document.createElement('div');
            metaLine.style.fontSize = '11px';
            metaLine.style.color = '#6c757d';
            
            const scannedByText = item.scannedBy ? ` | Por: ${escapeHtml(item.scannedBy)}` : '';
            const platformText = item.plataforma && item.plataforma !== 'Outra' ? ` | Plataforma: ${escapeHtml(item.plataforma)}` : '';
            
            metaLine.textContent = `${escapeHtml(item.dataHora.split(' ')[1])} ${scannedByText} ${platformText} | Tipo ID: ${escapeHtml(idType)}`;
            
            // Adiciona o alfinete antes do texto principal
            mainLine.appendChild(mapPin); 
            mainLine.appendChild(idText);

            el.appendChild(mainLine);
            el.appendChild(infoLine);
            el.appendChild(metaLine);
            scansList.appendChild(el);
        });
        
         if (scansList.lastChild) {
            scansList.lastChild.style.borderBottom = 'none';
        }
    }

    function createButton(text, className, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.classList.add(className);
        btn.addEventListener('click', onClick);
        return btn;
    }

    // Função de controle de UI (Mantida)
    function updateUIForAuth() {
        const loggedIn = isAuthenticated();
        const adminMode = isAdmin();
        const managerMode = isManager();
        
        // 1. Alterna a classe principal no body
        if (loggedIn) {
            body.classList.add('logged-in');
            body.classList.remove('login-active'); 
        } else {
            body.classList.remove('logged-in');
            body.classList.add('login-active');
        }

        // 2. Remove todos os elementos dinâmicos (Gerenciamento de usuários e botões de relatórios/logout)
        const authElements = document.querySelectorAll('.auth-control');
        authElements.forEach(el => el.remove());

        // 3. Configuração do Date Selector
        let dateContainer = document.querySelector('#dateContainer');
        if (dateContainer) dateContainer.remove();
        
        
        if (loggedIn) {
            // --- MODO LOGADO ---
            
            // 4. Cria e mostra o seletor de Data
            dateContainer = document.createElement('div');
            dateContainer.id = 'dateContainer';
            dateContainer.classList.add('auth-control', 'controls');
            dateContainer.style.flexWrap = 'nowrap';
            dateContainer.style.justifyContent = 'flex-start';
             dateContainer.innerHTML = `
                <label style="color: #111; font-size: 14px; white-space: nowrap;">📅 Dia:</label>
                <input type="date" id="dateSelectInput" class="select-device" value="${selectedDate}">
             `;
            controlsContainer.parentNode.insertBefore(dateContainer, controlsContainer);
            
            document.getElementById('dateSelectInput').addEventListener('change', (e) => {
                 selectedDate = e.target.value;
                 renderScans();
            });

            // 5. Oculta/Mostra Controles Principais (Scanner/Exportar)
            startButton.style.display = 'inline-block';
            exportBtn.style.display = adminMode ? 'inline-block' : 'none';
            clearBtn.style.display = adminMode ? 'inline-block' : 'none';

            // 6. Adiciona Logout e Relatórios (dentro de #controls)
            const user = getLoggedInUser();
            const logoutBtn = createButton(`👋 ${user.username} - Sair`, 'secondary', logoutUser);
            logoutBtn.classList.add('auth-control');
            controlsContainer.appendChild(logoutBtn);
            
            if (adminMode || managerMode) {
                 const reportDailyBtn = createButton('📄 Relatório Diário', 'secondary', () => generateReport('daily'));
                 const reportQuinzenalBtn = createButton('📄 Relatório Quinzenal', 'secondary', () => generateReport('quinzenal'));
                 const reportMensalBtn = createButton('📄 Relatório Mensal', 'secondary', () => generateReport('mensal'));
                 
                 reportDailyBtn.classList.add('auth-control'); 
                 reportQuinzenalBtn.classList.add('auth-control'); 
                 reportMensalBtn.classList.add('auth-control');
                 controlsContainer.appendChild(reportDailyBtn);
                 controlsContainer.appendChild(reportQuinzenalBtn);
                 controlsContainer.appendChild(reportMensalBtn);
            }
            
            logOutput(`Bem-vindo(a), ${user.username}. Scanner pronto.`);
            
            if (adminMode || managerMode) {
                 setupUserManagement();
            }

        } else {
            // --- MODO DESLOGADO ---
            
            // Oculta todos os controles principais
            const controls = [startButton, stopButton, torchButton, deviceSelect, deviceSelectLabel, exportBtn, clearBtn];
            controls.forEach(el => el.style.display = 'none');
            
            logOutput('Por favor, faça login para começar.');
        }

        if (!loggedIn) { stopCamera(); }
    }
    
    // --- LÓGICA DA CÂMERA (Mantida) ---
    
    async function requestPermissionOnce() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('getUserMedia não suportado');
        const s = await navigator.mediaDevices.getUserMedia({ video: true }).catch(e => { throw e; });
        s.getTracks().forEach(t => t.stop()); return true;
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
            try { mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); } 
            catch (errFacing) {
                await requestPermissionOnce();
                const devices = await enumerateVideoDevices();
                populateDeviceSelect(devices);
                const rear = devices.find(d => /rear|back|traseira|environment|facing back/i.test(d.label));
                const chosen = deviceSelect.value || (rear ? rear.deviceId : (devices[0] && devices[0].deviceId));
                if (chosen) {
                    try { mediaStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: chosen } }, audio: false }); } 
                    catch (e) { mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
                } else { mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
            }

            video.srcObject = mediaStream; await video.play().catch(() => {});
            currentVideoTrack = mediaStream.getVideoTracks()[0] || null;
            
            torchOn = false;
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
            else if (err && err.name === 'SecurityError') msg = 'Requer HTTPS (use GitHub Pages) ou localhost.';
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
        const vw = video.videoWidth || video.clientWidth || 640; const vh = video.videoHeight || video.clientHeight || 480;
        const targetW = Math.min(1024, Math.max(320, Math.round(vw * 0.6))); const targetH = Math.round((vh / vw) * targetW) || 480;
        tempCanvas.width = targetW; tempCanvas.height = targetH; overlay.width = vw; overlay.height = vh; drawBoundingBox(null);
    }
    
    function drawBoundingBox(location) {
        overlayCtx.clearRect(0,0,overlay.width,overlay.height);
        if (!location) { const w = overlay.width, h = overlay.height; const boxW = Math.round(w * 0.62), boxH = Math.round(h * 0.5); const x = Math.round((w - boxW) / 2), y = Math.round((h - boxH) / 2);
            overlayCtx.strokeStyle = 'rgba(255,255,255,0.35)'; overlayCtx.lineWidth = 3; overlayCtx.strokeRect(x, y, boxW, boxH); return;
        }
        overlayCtx.strokeStyle = 'rgba(0,200,83,0.95)'; overlayCtx.lineWidth = Math.max(2, overlay.width / 200);
        overlayCtx.beginPath(); overlayCtx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y); overlayCtx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
        overlayCtx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y); overlayCtx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
        overlayCtx.closePath(); overlayCtx.stroke(); overlayCtx.fillStyle = 'rgba(0,200,83,0.14)'; overlayCtx.fill();
    }
    
    function scanLoop() {
        if (!scanning) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
                const vw = video.videoWidth || video.clientWidth; const vh = video.videoHeight || video.clientHeight;
                if (!vw || !vh) { rafId = requestAnimationFrame(scanLoop); return; }
                
                const cropFactor = 0.6; const sw = Math.floor(vw * cropFactor); const sh = Math.floor(vh * cropFactor);
                const sx = Math.floor((vw - sw) / 2); const sy = Math.floor((vh - sh) / 2);
                
                tempCtx.drawImage(video, sx, sy, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height);
                const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                
                if (code && code.data) {
                    if (code.location) {
                        const scaleX = sw / tempCanvas.width; const scaleY = sh / tempCanvas.height;
                        const mapCorner = (pt) => ({ x: Math.round(pt.x * scaleX + sx), y: Math.round(pt.y * scaleY + sy) });
                        const loc = { topLeftCorner: mapCorner(code.location.topLeftCorner), topRightCorner: mapCorner(code.location.topRightCorner), bottomLeftCorner: mapCorner(code.location.bottomLeftCorner), bottomRightCorner: mapCorner(code.location.bottomRightCorner) };
                        drawBoundingBox(loc);
                    } else { drawBoundingBox(null); }
                    
                    const now = Date.now();
                    if (now - lastScanTime >= SCAN_INTERVAL) { lastScanTime = now; const payload = (code.data || '').trim(); handleScanResult(payload); }
                } else { drawBoundingBox(null); }
            } catch (e) { console.error('Erro no processamento do frame', e); }
        }
        rafId = requestAnimationFrame(scanLoop);
    }
    
    // --- LÓGICA DE EXTRAÇÃO E RESULTADO (Mantida) ---
    
    function extractIdFromLink(link) {
        if (!link || typeof link !== 'string') return { type: null, value: null };
        const l = link.trim();
        const shopeePattern1 = /-i\.(\d+)\.(\d+)/i; const m1 = l.match(shopeePattern1); if (m1) return { type: 'shopee_item', value: m1[2], shopId: m1[1] };
        const shopeePattern2 = /shopee\.[^\/]+\/(?:product|products|item)\/(\d+)/i; const m2 = l.match(shopeePattern2); if (m2) return { type: 'shopee_item', value: m2[1] };
        const mlPattern1 = /ML[A-Z]*-?(\d+)/i; const m3 = l.match(mlPattern1); if (m3) return { type: 'mercadolivre_item', value: m3[1] };
        const mlPattern2 = /\/(\d{6,})(?:[^\d]|$)/; const m4 = l.match(mlPattern2); if (m4) return { type: 'mercadolivre_item', value: m4[1] };
        const orderPattern = /order[_\-\/]?(\d{6,})/i; const m5 = l.match(orderPattern); if (m5) return { type: 'order', value: m5[1] };
        const fallback = l.match(/(\d{6,})/); if (fallback) return { type: 'number', value: fallback[1] };
        return { type: null, value: null };
    }

    function extractQrId(payload) {
        if (!payload || typeof payload !== 'string') return { type: null, value: null };
        const p = payload.trim(); const kv = [/(?:qr[_\-]?id|qrid|id|codigo|cod|codigo_id|qrCodeId)[:=]\s*([A-Za-z0-9\-_]+)/i, /(?:idPedido|pedido_id|order_id|order)[:=]\s*([A-Za-z0-9\-_]+)/i];
        for (const re of kv) { const m = p.match(re); if (m) return { type: 'qr_field', value: m[1] }; }
        try { const url = new URL(p); const qp = ['id','qrid','qr_id','codigo','code','itemId','orderId','order_id']; for (const k of qp) if (url.searchParams.has(k)) return { type: `qr_param:${k}`, value: url.searchParams.get(k) }; } catch (e) {}
        const num = p.match(/([0-9]{6,})/); if (num) return { type: 'numeric', value: num[1] };
        if (p.length <= 64 && /[A-Za-z0-9\-_]{4,}/.test(p)) return { type: 'text', value: p.split(/\s|;|,|\|/)[0] };
        return { type: null, value: null };
    }
    
    // Simula a obtenção de dados do comprador
    function getCompradorInfo(mainId) {
        // Esta é uma simulação. Na vida real, você faria uma chamada API com o mainId.
        const hash = (mainId || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const names = ["João Silva", "Maria Santos", "Pedro Almeida", "Ana Oliveira", "Carlos Souza", "Fernando Costa", "Juliana Lima", "Ricardo Teles"];
        const addresses = [
            "Rua das Flores, 100, Centro", 
            "Av. Paulista, 1578 - Apto 5, Bela Vista", 
            "Praça da Sé, s/n, Sé", 
            "Travessa do Comércio, 50, Pinheiros",
            "Rua Doutor Cesário Mota Junior, 112, Vila Buarque",
            "Av. Marginal Tietê, Km 15, Pirituba",
            "Rua Augusta, 2690, Jardins",
            "Rua Tabapuã, 41, Itaim Bibi"
        ];
        const ceps = ["01001-000", "04538-132", "05407-002", "09726-210", "13087-460", "02916-000", "01413-001", "04533-000"];

        return {
            nome: names[hash % names.length],
            endereco: addresses[(hash + 1) % addresses.length],
            cep: ceps[(hash + 2) % ceps.length]
        };
    }

    async function handleScanResult(payload) {
        if (!payload) return;
        
        if (scannedData.some(item => item.link === payload && (Date.now() - item.timestamp) < DUPLICATE_WINDOW)) { logOutput('Já escaneado recentemente.'); showPopup('Já escaneado'); return; }
        
        const plataforma = (() => { const l = payload.toLowerCase(); if (l.includes('shopee.')) return 'Shopee'; if (l.includes('mercadolivre.')||l.includes('mercadolibre')) return 'Mercado Livre'; return 'Outra'; })();
        const extractedId = extractIdFromLink(payload); 
        const qrId = extractQrId(payload);
        const mainId = qrId.value || extractedId.value || payload;

        // Adiciona a informação do comprador
        const compradorInfo = getCompradorInfo(mainId);
        
        const entry = { plataforma, link: payload, dataHora: new Date().toLocaleString('pt-BR'), timestamp: Date.now(), extractedId, qrId, comprador: compradorInfo };
        
        addScan(entry); 
        
        if (formatDate(new Date()) !== selectedDate) {
            selectedDate = formatDate(new Date());
            const dateInput = document.getElementById('dateSelectInput');
            if(dateInput) dateInput.value = selectedDate;
            renderScans();
        }

        beep(); try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
        
        showPopup(`OK • ${qrId.value || extractedId.value || 'salvo'}`);
        
        try { await navigator.clipboard.writeText(qrId.value || extractedId.value || payload); logOutput('Copiado para área de transferência.'); } catch (e) {}
        
        logOutput(`Lido: ${plataforma} • ${qrId.value || extractedId.value || ''}`);
    }

    // --- FUNÇÕES DE RELATÓRIO (Mantida) ---
    
    function getDateRange(period) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (period === 'daily') {
        } else if (period === 'quinzenal') {
            start.setDate(start.getDate() - 14);
        } else if (period === 'mensal') {
            start.setMonth(start.getMonth() - 1);
        }
        
        return start.getTime();
    }
    
    function generateReport(period) {
        const currentUser = getLoggedInUser();
        if (!currentUser || (!isAdmin() && !isManager())) return;
        
        const startTime = getDateRange(period);
        
        const allowedUsers = getFilterableUsernames(currentUser);
        let filteredData = scannedData.filter(item => {
            return item.scannedBy && allowedUsers.includes(item.scannedBy) && item.timestamp >= startTime;
        });

        const periodName = { 'daily': 'Diário', 'quinzenal': 'Quinzenal', 'mensal': 'Mensal' }[period];

        if (filteredData.length === 0) {
            alert(`Nenhum dado escaneado encontrado para o relatório ${periodName} na sua área de cobertura.`);
            return;
        }

        const dataToExport = filteredData.map(item => ({
             plataforma: item.plataforma,
             link: item.link,
             dataHora: item.dataHora,
             extractedId: item.extractedId,
             qrId: item.qrId,
             scannedBy: item.scannedBy,
             comprador: item.comprador 
        }));

        const csv = convertToCSV(dataToExport);
        const bom = '\uFEFF'; 
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement('a');
        
        a.href = url; 
        a.download = `relatorio_${period}_${new Date().toISOString().substring(0, 10)}.csv`;
        document.body.appendChild(a); 
        a.click(); 
        a.remove(); 
        URL.revokeObjectURL(url);
        
        logOutput(`Relatório ${periodName} gerado com ${filteredData.length} registros.`);
    }

    // --- FUNÇÕES DE EXPORTAÇÃO E LIMPEZA (Mantida) ---
    
    function convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = ['Plataforma','Link_Completo','QR_ID_Tipo','QR_ID_Valor','ID_Tipo','ID_Valor', 'Comprador_Nome', 'Comprador_Endereco', 'Comprador_CEP', 'Data_Hora_Scan', 'Scanned_By']; 
        const rows = [headers.join(';')];
        data.forEach(item => {
            const safe = v => `"${String(v == null ? '' : v).replace(/"/g,'""')}"`;
            const qrType = item.qrId && item.qrId.type ? item.qrId.type : '';
            const qrValue = item.qrId && item.qrId.value ? item.qrId.value : '';
            const idType = item.extractedId && item.extractedId.type ? item.extractedId.type : '';
            const idValue = item.extractedId && item.extractedId.value ? item.extractedId.value : '';
            
            const compNome = item.comprador?.nome || '';
            const compEnd = item.comprador?.endereco || '';
            const compCep = item.comprador?.cep || '';

            const scannedBy = item.scannedBy || '';
            
            rows.push([
                safe(item.plataforma), safe(item.link), safe(qrType), safe(qrValue), safe(idType), safe(idValue), 
                safe(compNome), safe(compEnd), safe(compCep),
                safe(item.dataHora), safe(scannedBy)
            ].join(';'));
        });
        return rows.join('\r\n');
    }

    function exportCSV() {
        if (!isAdmin()) { alert('Apenas administradores podem exportar todos os dados.'); return; }
        if (!scannedData || scannedData.length === 0) { alert('Nenhum dado para exportar.'); return; }
        
        const dataToExport = scannedData.map(item => ({
             plataforma: item.plataforma,
             link: item.link,
             dataHora: item.dataHora,
             extractedId: item.extractedId,
             qrId: item.qrId,
             scannedBy: item.scannedBy,
             comprador: item.comprador 
        }));

        const csv = convertToCSV(dataToExport);
        const bom = '\uFEFF'; 
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = `scans_ALL_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        logOutput('Todos os registros exportados.');
    }

    function clearScans() { 
        if (!isAdmin()) { alert('Apenas administradores podem limpar os registros.'); return; }
        if (!confirm('Apagar todos os registros? Esta ação não pode ser desfeita.')) return; 
        scannedData = []; saveScannedData(); renderScans(); logOutput('Registros limpos.'); 
    }

    // --- INICIALIZAÇÃO ---

    function setupLoginListeners() {
        if (!loginBtn) return; 

        const handleLoginAttempt = () => {
            const user = loginUserField.value;
            const pass = loginPassField.value;
            logLoginStatus('Verificando credenciais...');
            loginUser(user, pass);
        };

        loginBtn.addEventListener('click', handleLoginAttempt);
        loginPassField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLoginAttempt();
        });
        
        logLoginStatus('Insira suas credenciais.');
    }

    deviceSelect.addEventListener('change', async () => {
        if (!isAuthenticated()) return;
        const id = deviceSelect.value; if (!id) return;
        try { stopCamera(); mediaStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id } }, audio: false }); video.srcObject = mediaStream; await video.play(); currentVideoTrack = mediaStream.getVideoTracks()[0] || null; fitCanvases(); scanning = true; rafId = requestAnimationFrame(scanLoop); startButton.style.display = 'none'; stopButton.style.display = 'inline-block'; logOutput('Usando câmera selecionada.'); } catch (e) { console.warn('Falha ao selecionar deviceId', e); logOutput('Falha ao usar câmera selecionada.'); }
    });

    function init() {
        selectedDate = formatDate(new Date()); 
        
        setupLoginListeners();

        startButton.addEventListener('click', startCamera);
        stopButton.addEventListener('click', stopCamera);
        torchButton.addEventListener('click', toggleTorch);
        exportBtn.addEventListener('click', exportCSV);
        clearBtn.addEventListener('click', clearScans);
        window.addEventListener('resize', () => { if (video && video.videoWidth) fitCanvases(); });
        drawBoundingBox(null);
        
        updateUIForAuth(); 
        renderScans(); 
        
        window._scanner = { startCamera, stopCamera, exportCSV, clearScans, getScans: () => scannedData, openMapForAddress };
    }

    init();
})();
