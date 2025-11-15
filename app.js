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
    const appContainer = document.querySelector('.app'); // Referência ao container principal da aplicação
    
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
    
    // VARIÁVEL GLOBAL PARA FILTRO DE DATA
    let selectedDate = new Date().toISOString().substring(0, 10); // Inicializa com a data de hoje (AAAA-MM-DD)


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
    
    // Formata uma data Date() para AAAA-MM-DD
    function formatDate(date) { return date.toISOString().substring(0, 10); }

    // --- DADOS E LOCAL STORAGE ---
    function saveScannedData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedData)); } catch (e) { console.warn(e); } }
    function loadScannedData() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; } }
    function addScan(entry) { 
        const currentUser = getLoggedInUser();
        if (currentUser) {
            entry.scannedBy = currentUser.username;
        }
        // Adiciona a data no formato AAAA-MM-DD para facilitar a filtragem
        entry.date = formatDate(new Date(entry.timestamp)); 
        
        scannedData.unshift(entry); 
        saveScannedData(); 
        renderScans(); 
    }
    
    // --- AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS (Sem Alterações na Lógica Base) ---
    
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
            logOutput(`Login bem-sucedido. Bem-vindo(a), ${user.username} (${user.role}).`);
            updateUIForAuth();
            renderScans(); // Renderiza após o login
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
        renderScans(); // Limpa/re-renderiza a lista após o logout
    }
    
    // ... (Funções setupUserManagement, renderUserList, handleCreateUser, handleDeleteUser permanecem as mesmas) ...
    // Para simplificar, vou incluir apenas as funções alteradas ou que dependem da nova lógica de filtragem

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


    // --- LÓGICA DE FILTRAGEM DE SCANS ---
    
    function getFilterableUsernames(currentUser) {
        if (isAdmin()) {
            return Object.keys(users);
        }
        if (isManager()) {
            // Gestor: vê seus próprios scans + scans dos usuários que ele criou
            const managerCreatedUsernames = Object.keys(users)
                .filter(u => users[u].createdBy === currentUser.username && users[u].role === 'user');
            managerCreatedUsernames.push(currentUser.username);
            return managerCreatedUsernames;
        }
        // Usuário Padrão: vê apenas os próprios scans
        return [currentUser.username];
    }
    
    function getFilteredScans() {
        const currentUser = getLoggedInUser();
        if (!currentUser) return [];
        
        const allowedUsers = getFilterableUsernames(currentUser);
        
        // 1. Filtra por usuário (visibilidade)
        let filteredByAccess = scannedData.filter(item => {
            return item.scannedBy && allowedUsers.includes(item.scannedBy);
        });
        
        // 2. Filtra por data (apenas o dia selecionado)
        let filteredByDate = filteredByAccess.filter(item => {
            // Compara a data do scan (AAAA-MM-DD) com a data selecionada
            return item.date === selectedDate;
        });
        
        return filteredByDate;
    }


    // --- RENDERIZAÇÃO E UI (Atualizado) ---

    function renderScans() {
        scansList.innerHTML = '';
        if (!isAuthenticated()) { 
             scansList.innerHTML = '<div style="color:#6c757d">Faça login para ver os registros.</div>';
             return;
        }
        
        const scans = getFilteredScans();
        
        if (scans.length === 0) { 
            scansList.innerHTML = `<div style="color:#6c757d">Nenhum registro encontrado para o dia ${selectedDate.split('-').reverse().join('/')}.</div>`; 
            return; 
        }
        
        // Ordena os scans pelo timestamp do mais recente para o mais antigo (do topo para baixo)
        scans.sort((a, b) => b.timestamp - a.timestamp); 
        
        scans.forEach(item => {
            const el = document.createElement('div'); el.className = 'item';
            el.style.display = 'flex'; 
            el.style.flexDirection = 'column'; // Organiza verticalmente
            el.style.padding = '6px 0';
            el.style.borderBottom = '1px dashed #eee';
            
            // Tenta obter o ID mais relevante para exibição
            const mainId = item.qrId.value || item.extractedId.value || item.link;
            const idType = item.qrId.value ? item.qrId.type : item.extractedId.value ? item.extractedId.type : 'Link Completo';
            
            // Linha principal do ID
            const idLine = document.createElement('div');
            idLine.style.fontSize = '14px';
            idLine.style.wordBreak = 'break-all';
            idLine.style.color = '#343a40';
            idLine.innerHTML = `<strong>${escapeHtml(mainId)}</strong>`;

            // Linha de metadados
            const metaLine = document.createElement('div');
            metaLine.style.fontSize = '11px';
            metaLine.style.color = '#6c757d';
            
            const scannedByText = item.scannedBy ? ` | Por: ${escapeHtml(item.scannedBy)}` : '';
            const platformText = item.plataforma && item.plataforma !== 'Outra' ? ` | Plataforma: ${escapeHtml(item.plataforma)}` : '';
            
            metaLine.textContent = `${escapeHtml(item.dataHora.split(' ')[1])} ${scannedByText} ${platformText} | Tipo ID: ${escapeHtml(idType)}`;
            
            el.appendChild(idLine);
            el.appendChild(metaLine);
            scansList.appendChild(el);
        });
        
         // Remove a borda do último item
         if (scansList.lastChild) {
            scansList.lastChild.style.borderBottom = 'none';
        }
    }

    function create
