document.addEventListener('DOMContentLoaded', () => {
    
    /* --- Configurações e Estado --- */
    const STORAGE_KEY_USERS = 'pegazus_users_v4';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
    const DEFAULT_USERS = [{ id: 'u1', username: 'thon', password: '123', role: 'admin' }];
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 }; // Exemplo: SP
    
    let currentUser = null;
    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    let users = loadUsers();
    
    // Variáveis do Scanner
    let videoStream = null;
    let isScanning = false;
    let videoTrack = null;
    const SCAN_DELAY = 1000; // Delay entre scans iguais (em ms)
    let lastScanCode = '';
    let lastScanTime = 0;

    /* --- Referências DOM --- */
    const dom = {
        loginSection: document.getElementById('loginSection'),
        menuSection: document.getElementById('menuSection'),
        contentArea: document.getElementById('contentArea'),
        cameraView: document.getElementById('cameraView'),
        video: document.getElementById('videoElement'),
        miniScanList: document.getElementById('miniScanList'),
        sidebar: document.getElementById('sidebar'),
        mobileMenuBtn: document.getElementById('mobileMenuBtn'),
        feedback: document.getElementById('feedbackMsg'),
        cameraSelect: document.getElementById('cameraSelect')
    };

    /* --- Inicialização e Storage --- */
    function loadUsers() {
        const raw = localStorage.getItem(STORAGE_KEY_USERS);
        if(!raw) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
            return JSON.parse(JSON.stringify(DEFAULT_USERS));
        }
        return JSON.parse(raw);
    }
    
    function saveUsers() {
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }

    /* --- Sistema de Login --- */
    document.getElementById('btnLogin').addEventListener('click', () => {
        const u = document.getElementById('loginUser').value.trim();
        const p = document.getElementById('loginPass').value.trim();
        const user = users.find(x => x.username === u && x.password === p);
        
        if (user) {
            currentUser = user;
            document.getElementById('displayUser').textContent = user.username + ` (${user.role})`;
            dom.loginSection.classList.add('hidden');
            dom.menuSection.classList.remove('hidden');
            if(window.innerWidth <= 768) dom.mobileMenuBtn.classList.remove('hidden');
            renderDashboard();
            updateMiniList();
            document.getElementById('loginError').textContent = '';
        } else {
            document.getElementById('loginError').textContent = 'Credenciais inválidas';
        }
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        currentUser = null;
        stopScanner();
        dom.menuSection.classList.add('hidden');
        dom.loginSection.classList.remove('hidden');
        dom.mobileMenuBtn.classList.add('hidden');
        dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.5"><h2>Até logo</h2></div>`;
    });

    /* --- Navegação --- */
    function showContent() {
        dom.cameraView.style.display = 'none';
        dom.contentArea.style.display = 'block';
        if(window.innerWidth <= 768) dom.sidebar.classList.remove('active');
        stopScanner();
    }

    document.getElementById('btnScanMode').addEventListener('click', () => {
        dom.contentArea.style.display = 'none';
        dom.cameraView.style.display = 'block';
        if(window.innerWidth <= 768) dom.sidebar.classList.remove('active');
        startScanner();
    });

    document.getElementById('btnDashboard').addEventListener('click', renderDashboard);
    document.getElementById('btnUsers').addEventListener('click', renderUsers);
    document.getElementById('btnMap').addEventListener('click', renderMap);
    document.getElementById('btnExport').addEventListener('click', generateCSV);
    document.getElementById('btnCloseCamera').addEventListener('click', renderDashboard);

    // Troca de câmera
    dom.cameraSelect.addEventListener('change', (e) => {
        if(isScanning) startScanner(e.target.value);
    });

    // Menu Mobile
    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');

    /* --- Lógica do Scanner --- */
    async function startScanner(deviceId = null) {
        if (isScanning && !deviceId) return;
        
        stopScanner(); // Parar stream anterior

        const constraints = {
            video: deviceId 
                ? { deviceId: { exact: deviceId } } 
                : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        };

        try {
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            dom.video.srcObject = videoStream;
            dom.video.setAttribute('playsinline', true);
            await dom.video.play();
            
            isScanning = true;
            videoTrack = videoStream.getVideoTracks()[0];
            
            // Listar dispositivos
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            if (videoDevices.length > 1) {
                dom.cameraSelect.innerHTML = '';
                videoDevices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Câmera ${dom.cameraSelect.length + 1}`;
                    dom.cameraSelect.appendChild(opt);
                });
                dom.cameraSelect.classList.remove('hidden');
                if(deviceId) dom.cameraSelect.value = deviceId;
            }

            requestAnimationFrame(tick);
            
        } catch (err) {
            console.error(err);
            alert('Erro ao acessar câmera: ' + err.message);
            renderDashboard();
        }
    }

    function stopScanner() {
        isScanning = false;
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
            videoStream = null;
        }
        dom.video.srcObject = null;
    }

    // Loop de Leitura
    function tick() {
        if (!isScanning) return;
        
        if (dom.video.readyState === dom.video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const w = dom.video.videoWidth;
            const h = dom.video.videoHeight;
            
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(dom.video, 0, 0, w, h);
            
            // Otimização: Cortar 60% da área central para foco no QR/código
            const size = Math.min(w, h) * 0.6;
            const sx = (w - size) / 2;
            const sy = (h - size) / 2;
            
            const imageData = ctx.getImageData(sx, sy, size, size);
            
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
            });

            if (code && code.data) {
                handleScan(code.data);
            }
        }
        requestAnimationFrame(tick);
    }

    function handleScan(data) {
        const now = Date.now();
        // Evitar duplicatas rápidas
        if (data === lastScanCode && (now - lastScanTime) < SCAN_DELAY) return;
        
        lastScanCode = data;
        lastScanTime = now;

        beep();
        showFeedback(data);

        // Processar Dados
        const record = parsePayload(data);
        scanRecords.unshift(record);
        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
        
        updateMiniList();
    }

    /* --- Parsers e Helpers --- */
    function parsePayload(raw) {
        let id = raw;
        let type = 'Genérico';
        
        if (raw.includes('shopee')) { type = 'Shopee'; }
        else if (raw.includes('mercadoli')) { type = 'Mercado Livre'; }
        
        const numMatch = raw.match(/(\d{8,})/);
        if (numMatch) id = numMatch[1];

        return {
            id: id,
            raw: raw,
            type: type,
            user: currentUser.username,
            date: new Date().toISOString(),
            lat: CD_LOCATION.lat + (Math.random() - 0.5) * 0.01,
            lon: CD_LOCATION.lon + (Math.random() - 0.5) * 0.01
        };
    }

    function beep() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 1200;
            gain.gain.value = 0.1;
            osc.start();
            setTimeout(() => { osc.stop(); audioCtx.close(); }, 100);
        } catch(e){}
    }

    function showFeedback(text) {
        dom.feedback.textContent = `Lido: ${text.substring(0, 30)}...`;
        dom.feedback.style.opacity = '1';
        setTimeout(() => { dom.feedback.style.opacity = '0'; }, 2000);
        
        // Piscar borda
        const overlay = document.querySelector('.scan-overlay');
        overlay.style.borderColor = '#22c55e';
        setTimeout(() => overlay.style.borderColor = 'rgba(255,255,255,0.5)', 300);
    }

    // Lanterna (Flash)
    document.getElementById('btnTorch').addEventListener('click', async () => {
        if(videoTrack) {
            try {
                const caps = videoTrack.getCapabilities();
                if(caps.torch) {
                    const settings = videoTrack.getSettings();
                    await videoTrack.applyConstraints({ advanced: [{ torch: !settings.torch }] });
                } else {
                    alert('Flash não suportado neste dispositivo/navegador');
                }
            } catch(e) { console.log(e); }
        }
    });

    /* --- Views (Renderização) --- */
    function renderDashboard() {
        showContent();
        const html = `
            <h2>📦 Entregas Realizadas</h2>
            <p>Total de registros: ${scanRecords.length}</p>
            <div style="display:grid; gap:10px; margin-top:20px;">
                ${scanRecords.map(r => `
                    <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; border-left:4px solid var(--accent)">
                        <div style="font-weight:bold; font-size:16px">${r.id}</div>
                        <div style="font-size:12px; color:var(--muted)">
                            ${r.type} • ${new Date(r.date).toLocaleString()} • User: ${r.user}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        dom.contentArea.innerHTML = html;
    }

    function updateMiniList() {
        const last5 = scanRecords.slice(0, 5);
        dom.miniScanList.innerHTML = last5.map(r => `
            <div class="scan-item">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">${r.id}</span>
                <small>${new Date(r.date).toLocaleTimeString().slice(0,5)}</small>
            </div>
        `).join('') || '<div style="font-size:12px;color:gray">Nada ainda</div>';
    }

    function renderUsers() {
        showContent();
        if(currentUser.role !== 'admin') {
            dom.contentArea.innerHTML = '<h2>Acesso Negado</h2><p>Apenas admins.</p>';
            return;
        }
        let html = `<h2>👥 Gestão de Usuários</h2><ul>`;
        users.forEach(u => {
            html += `<li style="margin-bottom:8px"><strong>${u.username}</strong> (${u.role})</li>`;
        });
        html += `</ul><p style="color:gray; font-size:12px">Edição simplificada nesta versão demo.</p>`;
        dom.contentArea.innerHTML = html;
    }

    function renderMap() {
        showContent();
        dom.contentArea.innerHTML = `<h2>📍 Mapa de Entregas</h2><div id="mapObj" style="height:60vh; border-radius:12px; margin-top:10px"></div>`;
        
        setTimeout(() => {
            const map = L.map('mapObj').setView([CD_LOCATION.lat, CD_LOCATION.lon], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM'
            }).addTo(map);

            scanRecords.forEach(r => {
                if(r.lat) {
                    L.marker([r.lat, r.lon]).addTo(map)
                        .bindPopup(`<b>${r.id}</b><br>${r.type}`);
                }
            });
        }, 100);
    }

    function generateCSV() {
        if(!scanRecords.length) return alert('Sem dados');
        let csv = 'ID,TYPE,DATA,USER,RAW\n';
        scanRecords.forEach(r => {
            csv += `${r.id},${r.type},${r.date},${r.user},"${r.raw.replace(/"/g, '""')}"\n`;
        });
        const blob = new Blob([csv], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'relatorio_pegazus.csv';
        a.click();
    }
});
