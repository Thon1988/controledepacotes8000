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
