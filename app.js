// app.js — Versão V11: Scanner Completo, Lógica de Login Coerente e Funcionalidades Mantidas.

(() => {
    // --- Variáveis de Elementos (Links para IDs do index.html) ---
    // ESTES IDs DEVEM EXISTIR NO HTML:
    let loginContainer, scannerContainer; 
    let loginForm, usernameInput, passwordInput, feedbackMessage;
    
    // IDs do Scanner:
    let video, overlay, output, startButton, stopButton, torchButton, exportBtn, clearBtn, autoOpenToggle, autoOpenStatus;
    let scansList, overlayCtx, scanPopup;

    // --- Variáveis de Estado ---
    const STORAGE_KEY = 'scannedPackages_v3';
    const LOGIN_KEY = 'scanner_loggedIn';
    const SCAN_INTERVAL = 700;
    const DUPLICATE_WINDOW = 60 * 1000;
    const DEFAULT_TIMEOUT = 8000;
    
    let mediaStream = null;
    let rafId = null;
    let scanning = false;
    let lastScanTime = 0;
    let scannedData = [];
    let currentVideoTrack = null;
    let torchOn = false;
    
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // --- Dicionário de Usuários e Senhas (Credenciais Fixas) ---
    const defaultUsers = {
        'thon': { password: '882010', role: 'administrator' }, 
        'manager1': { password: '123', role: 'manager' },
    };

    // --- FUNÇÕES DE CONTROLE DE TELA ---

    function showScanner() {
        if (loginContainer) loginContainer.style.display = 'none';
        if (scannerContainer) scannerContainer.style.display = 'block';
        loadScannedData();
        renderScans();
        logOutput('Aguardando início do scanner. Clique em Iniciar.');
    }

    function showLogin() {
        if (loginContainer) loginContainer.style.display = 'block';
        if (scannerContainer) scannerContainer.style.display = 'none';
    }

    // --- FUNÇÕES DE LOGIN ---

    function handleLogin(event) {
        // ESSENCIAL: Impede que o formulário recarregue a página
        event.preventDefault(); 

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        const user = defaultUsers[username];

        if (user && user.password === password) {
            // LOGIN BEM-SUCEDIDO
            localStorage.setItem(LOGIN_KEY, 'true');
            feedbackMessage.textContent = '✅ Login efetuado com sucesso!';
            feedbackMessage.style.color = 'green';
            
            // Transiciona para o scanner
            setTimeout(showScanner, 500); 

        } else {
            // LOGIN FALHOU
            feedbackMessage.textContent = '❌ Usuário ou Senha inválidos. Tente novamente.';
            feedbackMessage.style.color = 'red';
            passwordInput.value = '';
            // Se o login falhar, remove o estado para exigir novo login
            localStorage.removeItem(LOGIN_KEY);
        }
    }

    // --- UTILS (Beep, Popup, Storage) ---
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

    function showPopup(text, ms = 900) { 
        if (!scanPopup) return;
        scanPopup.textContent = text; 
        scanPopup.style.display = 'block'; 
        setTimeout(() => { scanPopup.style.display = 'none'; }, ms); 
    }

    function logOutput(msg) { 
        if (output) output.textContent = msg; 
        console.info(msg); 
    }

    function loadScannedData() {
        try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } 
        catch (e) { return []; }
    }

    function saveScannedData() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedData)); } 
        catch (e) { console.warn("Falha ao salvar dados no LocalStorage", e); }
    }

    function escapeHtml(s) { return (s+'').replace(/[&<>"']/g, c => ({'&':'&','<':'>','>':'>','"':'"',"'":'''})[c]); }

    // --- EXTRAÇÃO DE ID ---
    function extractLinkSpecificId(link) {
        if (!link || typeof link !== 'string') return { type: null, value: null };
        const l = link.toLowerCase();
        // 1. Shopee
        if (l.includes('shopee.com')) {
            const shopeePattern = /-(\w)\.(\d+)\.(\d+)/i;
            const productPattern = /\/product\/(\d+)\/?$/i;
            let match = link.match(shopeePattern);
            if (match) return { type: 'shopee_item', value: match[3], shopId: match[2] };
            match = link.match(productPattern);
            if (match) return { type: 'shopee_item', value: match[1] };
            const numMatch = link.match(/(\d{8,})/); 
            if (numMatch) return { type: 'shopee_fallback', value: numMatch[1] };
        }
        // 2. Mercado Livre
        if (l.includes('mercadolivre.com') || l.includes('mercadolibre.com')) {
            const mlbPattern = /MLB-(\d+)/i;
            const numPattern = /(\d{9,})/;
            let match = link.match(mlbPattern);
            if (match) return { type: 'mlb_id', value: match[1] };
            match = link.match(numPattern);
            if (match) return { type: 'ml_fallback', value: match[1] };
        }
        return { type: 'link_url', value: link.length > 50 ? link.substring(0, 47) + '...' : link };
    }

    function extractQrId(payload) {
        if (!payload || typeof payload !== 'string') return { type: null, value: null };
        const paramsMatch = payload.match(/[?&](qrid|id|sku|tracking|qr)=([^&]+)/i);
        if (paramsMatch) return { type: 'qr_param:' + paramsMatch[1].toLowerCase(), value: paramsMatch[2] };
        const numMatch = payload.match(/(\d{6,})/);
        if (numMatch) return { type: 'numeric', value: numMatch[1] };
        const textMatch = payload.match(/([\w-]{6,})/);
        if (textMatch) return { type: 'text_token', value: textMatch[1] };
        return { type: 'full_payload', value: payload.length > 50 ? payload.substring(0, 47) + '...' : payload };
    }
    
    // --- GESTÃO DA CÂMERA E PERMISSÕES (Mantida) ---
    async function enumerateVideoDevices() { /* ... código para enumerar dispositivos ... */
        try { 
            await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            const devices = await navigator.mediaDevices.enumerateDevices(); 
            return devices.filter(d => d.kind === 'videoinput'); 
        } 
        catch (e) { 
            console.warn("Falha ao enumerar dispositivos (Permissão negada ou não implementada)", e);
            return [];
        }
    }
    async function getCameraStream(constraints) { /* ... código para obter stream da câmera ... */
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new Error('TIMEOUT: Câmera demorou a abrir.')), DEFAULT_TIMEOUT);
            
            navigator.mediaDevices.getUserMedia(constraints)
                .then(stream => {
                    clearTimeout(timeoutId);
                    resolve(stream);
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    reject(err);
                });
        });
    }
    async function startCamera() {
        if (scanning) return;
        logOutput("Solicitando acesso à câmera...");
        if (startButton) startButton.disabled = true;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            logOutput("Seu navegador não suporta a API de mídia.");
            if (startButton) startButton.disabled = false;
            return;
        }
        
        let constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
        let stream = null;
        let lastError = null;

        try { stream = await getCameraStream(constraints); } 
        catch (err) {
            lastError = err;
            console.warn("Falha na Câmera Traseira (facingMode):", err);
            logOutput("Tentando outro método...");
            constraints = { video: true, audio: false };
            try { stream = await getCameraStream(constraints); } 
            catch (errFallback) {
                lastError = errFallback;
                console.warn("Falha no Fallback {video: true}:", errFallback);
                try {
                    const devices = await enumerateVideoDevices();
                    if (devices.length > 0) {
                        constraints = { video: { deviceId: { exact: devices[0].deviceId } }, audio: false };
                        stream = await getCameraStream(constraints);
                    }
                } catch (errDevice) { lastError = errDevice; console.error("Falha ao abrir qualquer câmera.", errDevice); }
            }
        }

        if (stream) {
            mediaStream = stream; video.srcObject = mediaStream;
            await video.play().catch(e => console.error("Erro ao dar play no vídeo", e));
            currentVideoTrack = mediaStream.getVideoTracks()[0] || null; scanning = true; 
            
            if (currentVideoTrack && typeof currentVideoTrack.getCapabilities === 'function') {
                try { const caps = currentVideoTrack.getCapabilities(); if (caps && caps.torch) torchButton.style.display = 'inline-block'; else torchButton.style.display = 'none'; } catch (e) { torchButton.style.display = 'none'; }
            } else { torchButton.style.display = 'none'; }

            if (startButton) startButton.style.display = 'none';
            if (stopButton) stopButton.style.display = 'inline-block';
            logOutput('✅ Scanner ativo! Aponte para o QR.');
            
            if (video.readyState >= 1) fitCanvases(); 
            else video.addEventListener('loadedmetadata', fitCanvases, { once: true });
            
            lastScanTime = 0; rafId = requestAnimationFrame(tick);

        } else {
            let msg = '🛑 Erro Crítico: Falha ao acessar a câmera.';
            if (lastError.name === 'NotAllowedError' || lastError.name === 'PermissionDeniedError') { msg = '🛑 Permissão negada. Permita a câmera nas configurações do site/navegador.'; } 
            else if (lastError.name === 'NotFoundError') { msg = 'Câmera não encontrada.'; } 
            else if (lastError.name === 'SecurityError') { msg = '⚠️ Erro de segurança. Serviço requer HTTPS (GitHub Pages) ou localhost.'; }
            logOutput(msg);
            console.error("Erro final getUserMedia:", lastError);
            if (startButton) startButton.disabled = false;
        }
    }

    function stopCamera() { /* ... código para parar a câmera ... */
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null; currentVideoTrack = null; torchOn = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null; scanning = false; 
        if(video) video.pause(); 
        if(video) video.srcObject = null;
        
        if (startButton) { startButton.disabled = false; startButton.style.display = 'inline-block'; }
        if (stopButton

