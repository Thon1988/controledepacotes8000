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
    let users = loadUsers(); // Carrega usuários na inicialização
    
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
        return (s+'').replace(/[&<>"']/g, c => ({'&':'&','<':'<','>':'>','"':'"',"'":'''})[c]); 
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
    
    // --- AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS ---
    
    function saveUsers() { try { localStorage.setItem(USER_KEY, JSON.stringify(users)); } catch (e) { console.warn(e); } }
    
    function loadUsers() {
        const defaultUsers = {
            'thon': { password: '882010', role: 'administrator', createdBy: 'system' }, 
            'manager1': { password: '123', role: 'manager', createdBy: 'system' },     
            'user1': { password: 'user1', role: 'user', createdBy: 'manager1' }        
        };
        
        let loadedUsers = {};
        let isDefault = true;

        try { 
            const raw = localStorage.getItem(USER_KEY);
            if (raw) {
                loadedUsers = JSON.parse(raw);
                isDefault = false;
            }
        } catch (e) {
            console.error("Erro ao carregar usuários salvos, usando padrões.", e);
        }
        
        // Garante que o usuário administrador padrão sempre exista, caso tenha sido apagado ou o storage esteja vazio
        if (!loadedUsers['thon']) {
            loadedUsers['thon'] = defaultUsers['thon'];
            if (!isDefault) { // Se existiam outros usuários, mas o thon foi apagado, salva de novo.
                saveUsers(); 
            }
        }

        // Se o storage estava vazio, salva a lista padrão completa
        if (isDefault && Object.keys(loadedUsers).length > 0) {
             // Garante que todos os defaults estejam presentes se for a primeira carga
             loadedUsers = { ...defaultUsers, ...loadedUsers };
             saveUsers();
        }
