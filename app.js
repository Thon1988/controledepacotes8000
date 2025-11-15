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
    function addScan(entry) { 
        // Adiciona o usuário logado ao registro de scan (CRÍTICO para relatórios de gestores)
        const currentUser = getLoggedInUser();
        if (currentUser) {
            entry.scannedBy = currentUser.username;
        }
        scannedData.unshift(entry); 
        saveScannedData(); 
        renderScans(); 
    }
    
    // --- AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS ---
    
    function saveUsers() { try { localStorage.setItem(USER_KEY, JSON.stringify(users)); } catch (e) { console.warn(e); } }
    
    function loadUsers() {
        try { 
            const raw = localStorage.getItem(USER_KEY);
            if (raw) {
                const savedUsers = JSON.parse(raw);
                
                // Garante que o administrador padrão 'thon' sempre exista
                if (!savedUsers['thon']) {
                    savedUsers['thon'] = { password: '882010', role: 'administrator', createdBy: 'system' };
                }
                
                // Garante o createdBy para usuários antigos
                Object.keys(savedUsers).forEach(username => {
                    if (!savedUsers[username].createdBy) {
                        // Tenta inferir se foi criado por admin ou é usuário padrão antigo
                        savedUsers[username].createdBy = (username === 'thon' || username === 'user1' || username === 'manager1') ? 'system' : 'thon'; 
                    }
                });
                return savedUsers;
            }
        } catch (e) {}

        // Usuários padrão
        const defaultUsers = {
            'thon': { password: '882010', role: 'administrator', createdBy: 'system' }, // ADMINISTRADOR PADRÃO
            'manager1': { password: '123', role: 'manager', createdBy: 'system' },     // GESTOR PADRÃO
            'user1': { password: 'user1', role: 'user', createdBy: 'manager1' }        // USUÁRIO COMUM PADRÃO
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
            // Salva também o createdBy na sessão para facilitar
            const user = { username, role: users[username].role, createdBy: users[username].createdBy, timestamp: Date.now() }; 
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
            // Gestores só podem criar usuários comuns
            roleOptions = `<option value="user">Usuário Padrão</option>`;
        }


        container.innerHTML = `
            <div class="panel" style="margin-top: 12px; color: #111;">
                <h3 style="margin: 0 0
