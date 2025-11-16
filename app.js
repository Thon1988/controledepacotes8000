// app.js — PegazusLog v0.1: Authentication, QR Scanning, and Data Management

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
    let users = loadUsers(); 
    
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
        }
    }
    
    function escapeHtml(s) { return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
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
        // Usuários Padrão para Teste
        const defaultUsers = {
            'thon': { password: '882010', role: 'administrator', createdBy: 'system' }, 
            'manager1': { password: '123', role: 'manager', createdBy: 'system' },     
            'user1': { password: 'user1', role: 'user', createdBy: 'manager1' }        
        };
        
        let loadedUsers = {};
        try { 
            const raw = localStorage.getItem(USER_KEY);
            if (raw) { loadedUsers = JSON.parse(raw); }
        } catch (e) { console.error("Erro ao carregar usuários salvos, usando padrões.", e); }
        
        // Garante que o usuário padrão sempre exista
        if (!loadedUsers['thon']) { loadedUsers['thon'] = defaultUsers['thon']; saveUsers(); }
        return Object.assign(defaultUsers, loadedUsers); // Combina padrões com carregados
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
        users = loadUsers(); 
        
        if (users[username] && users[username].password === password) {
            const user = { username, role: users[username].role, createdBy: users[username].createdBy, timestamp: Date.now() }; 
            sessionStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(user));
            
            if (loginUserField) loginUserField.value = '';
            if (loginPassField) loginPassField.value = '';
            
            logLoginStatus('Login realizado com sucesso!', false);
            
            updateUIForAuth();
            renderScans(); 
            return true;
        }
        logLoginStatus('Login falhou: Usuário ou senha inválidos.', true);
        return false;
    }

    function logoutUser() {
        sessionStorage.removeItem(LOGIN_SESSION_KEY);
        logOutput('Logout realizado.');
        stopCamera();
        updateUIForAuth();
        renderScans(); 
        logLoginStatus('Insira suas credenciais.', false);
    }
    
    // --- LÓGICA DE FILTRAGEM E RENDERIZAÇÃO ---
    
    function getFilterableUsernames(currentUser) {
        if (isAdmin()) { return Object.keys(users); }
        if (isManager()) {
            const managerCreatedUsernames = Object.keys(users).filter(u => users[u].createdBy === currentUser.username && users[u].role === 'user');
            managerCreatedUsernames.push(currentUser.username);
            return managerCreatedUsernames;
        }
        return [currentUser.username];
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
