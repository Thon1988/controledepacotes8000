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
            
            const mainId = item.link ||
