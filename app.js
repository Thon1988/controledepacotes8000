// app.js — Mobile-friendly scanner (iOS + Android) with authentication and reporting

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
    let users = loadUsers(); // Carrega ou inicializa usuários
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    let currentVideoTrack = null;
    let torchOn = false;

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
    function escapeHtml(s) { return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

    // --- DADOS E LOCAL STORAGE ---
    function saveScannedData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedData)); } catch (e) { console.warn(e); } }
    function loadScannedData() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
    function addScan(entry) { scannedData.unshift(entry); saveScannedData(); renderScans(); }
    
    // --- AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS ---
    
    function saveUsers() { try { localStorage.setItem(USER_KEY, JSON.stringify(users)); } catch (e) { console.warn(e); } }
    
    function loadUsers() {
        try { 
            const raw = localStorage.getItem(USER_KEY);
            if (raw) {
                const savedUsers = JSON.parse(raw);
                // Garantir o administrador padrão
                if (!savedUsers['thon']) {
                    savedUsers['thon'] = { password: '882010', role: 'administrator', createdBy: 'system' };
                    try { localStorage.setItem(USER_KEY, JSON.stringify(savedUsers)); } catch (e) {}
                }
                
                // Garantir o createdBy para usuários antigos (se não tiverem)
                Object.keys(savedUsers).forEach(username => {
                    if (!savedUsers[username].createdBy) {
                        // Se o usuário for 'thon' ou 'user1', setar como 'system' ou 'thon'
                        savedUsers[username].createdBy = (username === 'thon' || username === 'user1') ? 'system' : 'thon'; 
                    }
                });
                return savedUsers;
            }
        } catch (e) {}

        // Usuários padrão
        const defaultUsers = {
            'thon': { password: '882010', role: 'administrator', createdBy: 'system' }, // ADMINISTRADOR PADRÃO
            'manager1': { password: '123', role: 'manager', createdBy: 'thon' }, // GESTOR
            'user1': { password: 'user1', role: 'user', createdBy: 'thon' } // USUÁRIO COMUM
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
            const user = { username, role: users[username].role, timestamp: Date.now() };
            sessionStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(user));
            logOutput(`Login bem-sucedido. Bem-vindo(a), ${user.username} (${user.role}).`);
            updateUIForAuth();
            return true;
        }
        logOutput('Login falhou: Usuário ou senha inválidos.');
        return false;
    }

    function logoutUser() {
        sessionStorage.removeItem(LOGIN_SESSION_KEY);
        logOutput('Logout realizado.');
        stopCamera();
        updateUIForAuth();
    }
    
    // --- GERENCIAMENTO DE USUÁRIOS ---

    function setupUserManagement() {
        if (!isAdmin() && !isManager()) { return; }

        const currentUser = getLoggedInUser();
        
        // Remove a interface antiga de gerenciamento se existir
        const oldContainer = document.querySelector('#userManagementContainer');
        if (oldContainer) oldContainer.remove();

        const container = document.createElement('div');
        container.id = 'userManagementContainer';
        container.classList.add('auth-control');
        
        // Regras para definição de permissões de criação
        let roleOptions = '';
        if (isAdmin()) {
            roleOptions = `
                <option value="user">Usuário Padrão</option>
                <option value="manager">Gestor</option>
                <option value="administrator">Administrador</option>
            `;
        } else if (isManager()) {
            // Gestores só podem criar usuários comuns
            roleOptions = `<option value="user">Usuário Padrão</option>`;
        }


        container.innerHTML = `
            <div class="panel" style="margin-top: 12px; color: #111;">
                <h3 style="margin: 0 0 8px; font-size: 16px;">👤 Gerenciar Usuários</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                    <input type="text" id="newUser" placeholder="Nome de Usuário" style="padding: 6px; border-radius: 6px; border: 1px solid #ccc; width: 120px;">
                    <input type="password" id="newPass" placeholder="Senha" style="padding: 6px; border-radius: 6px; border: 1px solid #ccc; width: 120px;">
                    <select id="newRole" style="padding: 6px; border-radius: 6px; border: 1px solid #ccc;">
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
        
        // Filtra usuários: Administrador vê todos. Gestor vê apenas os que ele criou (User ou Manager).
        const usersToShow = Object.keys(users).filter(username => {
            if (isAdminUser) return true;
            const user = users[username];
            // Gestor só vê usuários criados por ele
            return user.createdBy === currentUser.username;
        });
        
        if (usersToShow.length === 0) { listDiv.innerHTML = '<div style="color:#666">Nenhum usuário gerenciável.</div>'; return; }


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
                    ${user.createdBy && user.createdBy !== 'system' ? `<span style="font-size:12px; color:#6c757d; margin-left: 5px;">(Criado por: ${user.createdBy})</span>` : ''}
                </div>
            `;
            
            // Regras de exclusão
            let canDelete = false;
            if (isAdminUser && username !== currentUser.username) {
                // Admin pode deletar qualquer um (menos a si mesmo)
                canDelete = true;
            } else if (isManager()) {
                // Gestor só pode deletar usuários que ele criou
                if (user.createdBy === currentUser.username && username !== currentUser.username) {
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
        
        // Regra de segurança: Gestor só pode criar usuários comuns
        if (isManager() && role !== 'user') {
             alert('Um Gestor só pode criar Usuários Padrão.');
             return;
        }
        
        users[username] = { password: password, role: role, createdBy: creator };
        saveUsers();
        logOutput(`Usuário ${username} (${role}) criado com sucesso.`);
        
        // Limpa campos e atualiza lista
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
            // Admin pode deletar qualquer um (menos a si mesmo)
            canDelete = true;
        } else if (isManager()) {
            // Gestor só pode deletar:
            // 1. Usuários comuns que ele criou
            // 2. O Gestor só pode excluir usuários Padrão (user).
            if (userToDelete.createdBy === currentUser.username && userToDelete.role === 'user') {
                canDelete = true;
            } else {
                alert('Você só pode excluir usuários Padrão criados por você.');
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

    // --- RENDERIZAÇÃO E UI ---

    function renderScans() {
        scansList.innerHTML = '';
        if (!scannedData.length) { scansList.innerHTML = '<div style="color:#666">Nenhum registro ainda.</div>'; return; }
        scannedData.forEach((item, idx) => {
            const el = document.createElement('div'); el.className = 'item';
            const idBadge = item.extractedId && item.extractedId.value ? `<div class="badge">${escapeHtml(item.extractedId.type)}: ${escapeHtml(item.extractedId.value)}</div>` : '';
            const qrBadge = item.qrId && item.qrId.value ? `<div class="badge">QR: ${escapeHtml(item.qrId.value)}</div>` : '';
            el.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><div class="badge">${escapeHtml(item.plataforma)}</div>${qrBadge}${idBadge}<div style="font-size:14px;word-break:break-all">${escapeHtml(item.link)}</div><div style="margin-left:auto"><button data-idx="${idx}" style="background:#00b4d8;color:#fff;padding:6px;border-radius:6px">Abrir</button></div></div><div class="meta">${escapeHtml(item.dataHora)}</div>`;
            const btn = el.querySelector('button[data-idx]'); btn.addEventListener('click', () => window.open(item.link, '_blank'));
            scansList.appendChild(el);
        });
    }

    function createButton(text, className, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.classList.add(className);
        btn.addEventListener('click', onClick);
        return btn;
    }

    function updateUIForAuth() {
        const loggedIn = isAuthenticated();
        const adminMode = isAdmin();
        const managerMode = isManager();

        // 1. Mostrar/Esconder controles principais
        const visibility = loggedIn ? 'inline-block' : 'none';
        startButton.style.display = visibility;
        
        // Apenas Admin pode exportar TUDO (Gestores usam relatórios filtrados)
        exportBtn.style.display = adminMode ? 'inline-block' : 'none';
        
        // 2. Controlar botão Limpar (Apenas Admin)
        clearBtn.style.display = adminMode ? 'inline-block' : 'none';

        // 3. Remover elementos dinâmicos antigos
        const authElements = document.querySelectorAll('.auth-control');
        authElements.forEach(el => el.remove());

        if (loggedIn) {
            // Adiciona botão de Logout
            const user = getLoggedInUser();
            const logoutBtn = createButton(`👋 ${user.username} - Sair`, 'secondary', logoutUser);
            logoutBtn.classList.add('auth-control');
            controlsContainer.appendChild(logoutBtn);
            
            // Adiciona botões de Relatório (Gestores e Admins)
            if (adminMode || managerMode) {
                 const reportDailyBtn = createButton('📄 Relatório Diário', 'secondary', () => generateReport('daily'));
                 const reportQuinzenalBtn = createButton('📄 Relatório Quinzenal', 'secondary', () => generateReport('quinzenal'));
                 const reportMensalBtn = createButton('📄 Relatório Mensal', 'secondary', () => generateReport('mensal'));
                 
                 reportDailyBtn.classList.add('auth-control'); reportQuinzenalBtn.classList.add('auth-control'); reportMensalBtn.classList.add('auth-control');
                 controlsContainer.appendChild(reportDailyBtn);
                 controlsContainer.appendChild(reportQuinzenalBtn);
                 controlsContainer.appendChild(reportMensalBtn);
            }
            
            logOutput(`Bem-vindo(a), ${user.username}. Scanner pronto.`);
            
            // Adiciona a interface de Gerenciamento de Usuários
            if (adminMode || managerMode) {
                 setupUserManagement();
            }

        } else {
            // Adiciona formulário de Login
            const form = document.createElement('div'); form.classList.add('auth-control'); form.style.display = 'flex'; form.style.gap = '8px'; form.style.flexWrap = 'wrap'; form.style.alignItems = 'center';
            form.innerHTML = `
                <input type="text" id="loginUser" placeholder="Usuário" style="padding: 8px; border-radius: 8px; border: 1px solid #ccc; width: 120px;">
                <input type="password" id="loginPass" placeholder="Senha" style="padding: 8px; border-radius: 8px; border: 1px solid #ccc; width: 120px;">
                <button id
