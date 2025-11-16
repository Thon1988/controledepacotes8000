// app.js — Versão V10: Scanner Completo com Login e Controle de Telas.
// Requisitos: index.html no mesmo diretório. Abra via HTTPS (GitHub Pages) ou localhost.

(() => {
    // --- Variáveis de Elementos (Com Inclusão do Login) ---
    let loginContainer, scannerContainer;
    let loginForm, usernameInput, passwordInput, feedbackMessage;
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
        // Inicia o resto das funcionalidades do scanner
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
        event.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        const user = defaultUsers[username];

        if (user && user.password === password) {
            // LOGIN BEM-SUCEDIDO
            localStorage.setItem(LOGIN_KEY, 'true');
            feedbackMessage.textContent = '✅ Login efetuado com sucesso!';
            feedbackMessage.style.color = 'green';
            
            // Espera um pouco para o usuário ler a mensagem e transiciona para o scanner
            setTimeout(showScanner, 500); 

        } else {
            // LOGIN FALHOU
            feedbackMessage.textContent = '❌ Usuário ou Senha inválidos. Tente novamente.';
            feedbackMessage.style.color = 'red';
            passwordInput.value = '';
            localStorage.removeItem(LOGIN_KEY);
        }
    }

    // --- UTILS (Mantidos do V9) ---
    function beep(duration = 90, freq = 1400, vol = 0.12) {
        try { /* ... código do beep ... */ } catch (e) {}
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

    // --- EXTRAÇÃO DE ID (Mantido do V9) ---
    function extractLinkSpecificId(link) {
        // ... Lógica de extração Shopee/ML ...
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
        // ... Lógica de extração de QR ID ...
        if (!payload || typeof payload !== 'string') return { type: null, value: null };
        const paramsMatch = payload.match(/[?&](qrid|id|sku|tracking|qr)=([^&]+)/i);
        if (paramsMatch) return { type: 'qr_param:' + paramsMatch[1].toLowerCase(), value: paramsMatch[2] };
        const numMatch = payload.match(/(\d{6,})/);
        if (numMatch) return { type: 'numeric', value: numMatch[1] };
        const textMatch = payload.match(/([\w-]{6,})/);
        if (textMatch) return { type: 'text_token', value: textMatch[1] };
        return { type: 'full_payload', value: payload.length > 50 ? payload.substring(0, 47) + '...' : payload };
    }
    
    // --- GESTÃO DA CÂMERA E PERMISSÕES (Mantido do V9) ---
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
        if (stopButton) stopButton.style.display = 'none'; 
        if (torchButton) torchButton.style.display = 'none';
        
        if (overlayCtx) overlayCtx.clearRect(0,0,overlay.width,overlay.height);
        logOutput('Scanner parado. Clique em Iniciar para continuar.');
    }

    async function toggleTorch() { /* ... código para ligar/desligar o flash ... */
        if (!currentVideoTrack) return;
        try { 
            torchOn = !torchOn; 
            await currentVideoTrack.applyConstraints({ advanced: [{ torch: torchOn }] }); 
            torchButton.textContent = torchOn ? '🔦 Flash On' : '🔦 Flash Off'; 
        } catch (e) { logOutput('Flash não suportado neste dispositivo.'); }
    }
    
    // --- SCANNER E PROCESSAMENTO (Mantido do V9) ---
    function fitCanvases() { /* ... código para ajustar canvas ... */
        const vw = video.videoWidth || video.clientWidth || 640; 
        const vh = video.videoHeight || video.clientHeight || 480;
        overlay.width = vw; overlay.height = vh; 
        const processW = Math.min(1024, Math.max(320, Math.round(vw * 0.6))); 
        const processH = Math.round((vh / vw) * processW) || 480;
        tempCanvas.width = processW; tempCanvas.height = processH; 
        drawBoundingBox(null);
    }
    function drawBoundingBox(location) { /* ... código para desenhar mira e box ... */
        if (!overlayCtx) return;
        overlayCtx.clearRect(0,0,overlay.width,overlay.height);
        const w = overlay.width, h = overlay.height; 
        const focusW = Math.round(w * 0.6), focusH = Math.round(h * 0.6); 
        const x = Math.round((w - focusW) / 2), y = Math.round((h - focusH) / 2);
        overlayCtx.strokeStyle = 'rgba(255,255,255,0.4)'; overlayCtx.lineWidth = 2; 
        overlayCtx.setLineDash([10, 5]);
        overlayCtx.strokeRect(x, y, focusW, focusH);
        overlayCtx.setLineDash([]); 
        if (!location) return;
        overlayCtx.strokeStyle = 'rgba(0,200,83,0.95)'; overlayCtx.lineWidth = Math.max(3, overlay.width / 200);
        overlayCtx.beginPath(); 
        overlayCtx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y); 
        overlayCtx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
        overlayCtx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y); 
        overlayCtx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
        overlayCtx.closePath(); overlayCtx.stroke(); 
        overlayCtx.fillStyle = 'rgba(0,200,83,0.14)'; overlayCtx.fill();
    }
    function tick() { /* ... código para processar frame e chamar jsQR ... */
        if (!scanning) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
                const vw = video.videoWidth || video.clientWidth; 
                const vh = video.videoHeight || video.clientHeight;
                if (!vw || !vh) { rafId = requestAnimationFrame(tick); return; }
                
                const cropFactor = 0.6; 
                const sw = Math.floor(vw * cropFactor); 
                const sh = Math.floor(vh * cropFactor);
                const sx = Math.floor((vw - sw) / 2); 
                const sy = Math.floor((vh - sh) / 2);
                
                tempCtx.drawImage(video, sx, sy, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height);
                const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                
                if (code && code.data) {
                    if (code.location) {
                        const scaleX = sw / tempCanvas.width; 
                        const scaleY = sh / tempCanvas.height;
                        const mapCorner = (pt) => ({ x: Math.round(pt.x * scaleX + sx), y: Math.round(pt.y * scaleY + sy) });
                        const loc = { topLeftCorner: mapCorner(code.location.topLeftCorner), topRightCorner: mapCorner(code.location.topRightCorner), bottomLeftCorner: mapCorner(code.location.bottomLeftCorner), bottomRightCorner: mapCorner(code.location.bottomRightCorner) };
                        drawBoundingBox(loc);
                    }
                    const now = Date.now();
                    if (now - lastScanTime >= SCAN_INTERVAL) { 
                        lastScanTime = now; 
                        handleScanResult(code.data.trim()); 
                    }
                } else { drawBoundingBox(null); }
            } catch (e) { console.error('Erro no processamento do frame', e); }
        }
        rafId = requestAnimationFrame(tick);
    }

    function handleScanResult(payload) { /* ... código para salvar resultado, beep, copy, etc. ... */
        if (!payload) return;
        const isDuplicate = scannedData.some(item => item.link === payload && (Date.now() - item.timestamp) < DUPLICATE_WINDOW);
        if (isDuplicate) { logOutput('Código já escaneado recentemente.'); showPopup('Já escaneado'); return; }
        
        const linkSpecificId = extractLinkSpecificId(payload);
        const qrId = extractQrId(payload);

        let plataforma = 'Outra';
        const l = payload.toLowerCase();
        if (l.includes('shopee.com')) plataforma = 'Shopee';
        else if (l.includes('mercadolivre.com') || l.includes('mercadolibre.com')) plataforma = 'Mercado Livre';
        
        const dataHora = new Date().toLocaleString('pt-BR');
        const entry = { plataforma, link: payload, dataHora, timestamp: Date.now(), extractedId: linkSpecificId, qrId: qrId };
        scannedData.unshift(entry); saveScannedData(); renderScans();
        
        beep(); 
        try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
        
        const idToCopy = qrId.value || linkSpecificId.value || payload;
        try { 
            navigator.clipboard.writeText(idToCopy); 
            showPopup(`✅ OK | Copiado: ${idToCopy.substring(0, 30)}...`); 
        } catch (e) {
            showPopup(`✅ OK | Salvo: ${idToCopy.substring(0, 30)}...`); 
        }
        logOutput(`Lido: ${plataforma} • ID: ${idToCopy}`);
        if (autoOpenToggle && autoOpenToggle.checked) { try { window.open(payload, '_blank'); } catch (e) {} }
    }

    // --- UI E DADOS (Mantido do V9) ---
    function renderScans() { /* ... código para renderizar lista ... */
        if (!scansList) return;
        scansList.innerHTML = '';
        if (scannedData.length === 0) {
            scansList.innerHTML = '<div style="color:#6c757d; padding:8px;">Nenhum registro encontrado.</div>';
            return;
        }

        scannedData.forEach(item => {
            const el = document.createElement('div'); el.className = 'item';
            const linkIdValue = item.extractedId?.value || 'N/A';
            const qrIdValue = item.qrId?.value || 'N/A';
            
            el.innerHTML = `
                <div class="row">
                    <span class="badge" style="background:${item.plataforma === 'Shopee' ? '#F58120' : item.plataforma === 'Mercado Livre' ? '#FFF200' : '#eee'}; color: ${item.plataforma === 'Mercado Livre' ? '#111' : '#fff'};">${item.plataforma}</span>
                    <strong style="flex-grow:1;">ID Link: ${escapeHtml(linkIdValue)}</strong>
                    <div class="actions">
                        <a href="${escapeHtml(item.link)}" target="_blank" style="text-decoration:none;"><button style="padding:4px 8px; font-size:12px">🔗 Abrir</button></a>
                    </div>
                </div>
                <div class="meta">
                    QR ID: ${escapeHtml(qrIdValue)} | Escaneado em: ${escapeHtml(item.dataHora)}
                </div>
            `;
            scansList.appendChild(el);
        });
    }

    // --- EXPORTAÇÃO E LIMPEZA (Mantido do V9) ---
    function convertToCSV(data) { /* ... código para converter para CSV ... */
        if (!data || data.length === 0) return '';
        const headers = ['Plataforma', 'Link_Completo', 'QR_ID_Tipo', 'QR_ID_Valor', 'ID_Tipo', 'ID_Valor', 'Data_Hora_Scan', 'Timestamp_MS']; 
        const rows = [headers.join(';')];
        data.forEach(item => {
            const safe = v => `"${String(v == null ? '' : v).replace(/"/g,'""')}"`;
            const qrType = item.qrId?.type || '';
            const qrValue = item.qrId?.value || '';
            const idType = item.extractedId?.type || '';
            const idValue = item.extractedId?.value || '';
            
            rows.push([ safe(item.plataforma), safe(item.link), safe(qrType), safe(qrValue), safe(idType), safe(idValue), safe(item.dataHora), item.timestamp ].join(';'));
        });
        return rows.join('\r\n');
    }

    function exportCSV() { /* ... código para exportar CSV ... */
        if (scannedData.length === 0) { alert('Nenhum dado escaneado para exportar!'); return; }
        const csv = convertToCSV(scannedData);
        const bom = '\uFEFF'; 
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); 
        const a = document.createElement('a'); a.href = url; 
        a.download = `scans_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        logOutput(`CSV exportado com ${scannedData.length} registros.`);
    }

    function clearScans() { /* ... código para limpar registros ... */
        if (!confirm('Deseja limpar todos os registros escaneados? Esta ação não pode ser desfeita.')) return; 
        scannedData = []; 
        saveScannedData(); 
        renderScans(); 
        logOutput('Registros limpos.'); 
    }

    // --- INICIALIZAÇÃO E LISTENERS ---
    
    function setupDOMLinks() {
        // Elementos de Login
        loginContainer = document.getElementById('login-container');
        scannerContainer = document.getElementById('scanner-container');
        loginForm = document.getElementById('loginForm');
        usernameInput = document.getElementById('username');
        passwordInput = document.getElementById('password');
        feedbackMessage = document.getElementById('feedbackMessage');
        
        // Elementos do Scanner
        video = document.getElementById('videoElement');
        overlay = document.getElementById('overlay');
        output = document.getElementById('output');
        startButton = document.getElementById('startButton');
        stopButton = document.getElementById('stopButton');
        torchButton = document.getElementById('torchButton');
        exportBtn = document.getElementById('exportBtn');
        clearBtn = document.getElementById('clearBtn');
        scansList = document.getElementById('scansList');
        scanPopup = document.getElementById('scanPopup');
        autoOpenToggle = document.getElementById('autoOpenToggle');
        autoOpenStatus = document.getElementById('autoOpenStatus');
        
        overlayCtx = overlay ? overlay.getContext('2d') : null;
    }

    function setupListeners() {
        // Listeners de Login
        if (loginForm) loginForm.addEventListener('submit', handleLogin);

        // Listeners do Scanner
        if (startButton) startButton.addEventListener('click', startCamera);
        if (stopButton) stopButton.addEventListener('click', stopCamera);
        if (torchButton) torchButton.addEventListener('click', toggleTorch);
        if (exportBtn) exportBtn.addEventListener('click', exportCSV);
        if (clearBtn) clearBtn.addEventListener('click', clearScans);
        
        window.addEventListener('resize', () => { if (video && video.videoWidth) fitCanvases(); });
        
        if (autoOpenToggle && autoOpenStatus) {
            autoOpenToggle.addEventListener('change', (e) => {
                const checked = e.target.checked;
                autoOpenStatus.textContent = checked ? 'Auto-abrir: Ativado' : 'Auto-abrir: Desativado';
                localStorage.setItem('scanner_auto_open', checked);
            });
            const savedState = localStorage.getItem('scanner_auto_open') === 'true';
            autoOpenToggle.checked = savedState;
            autoOpenStatus.textContent = savedState ? 'Auto-abrir: Ativado' : 'Auto-abrir: Desativado';
        }
    }

    function init() {
        setupDOMLinks(); 
        setupListeners(); 
        
        // Verifica o estado de login e decide qual tela mostrar
        const isLoggedIn = localStorage.getItem(LOGIN_KEY) === 'true';
        if (isLoggedIn) {
            showScanner();
        } else {
            showLogin();
        }

        if (overlayCtx) drawBoundingBox(null);
        if (stopButton) stopButton.style.display = 'none';
        if (torchButton) torchButton.style.display = 'none';

        console.log('Scanner inicializado com controle de Login. Versão V10.');
    }

    if (document.readyState === 'loading') {
         document.addEventListener('DOMContentLoaded', init);
    } else {
         init();
    }
})();
