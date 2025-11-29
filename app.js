/* app.js — Versão integrada e aprimorada (mantendo sua lógica original) */
document.addEventListener('DOMContentLoaded', () => {
    /* --- Configurações e Estado --- */
    const STORAGE_KEY_USERS = 'pegazus_users_v4';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
    const DEFAULT_USERS = [
        { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
        { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
        { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
    ];
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 };

    let currentUser = null;
    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    let users = loadUsers();

    let videoStream = null;
    let isScanning = false;
    let videoTrack = null;
    const SCAN_DELAY = 1000;
    let lastScanCode = '';
    let lastScanTime = 0;
    let userLocation = null;
    let mapInstance = null;
    let locationMarker = null;

    /* --- DOM --- */
    const dom = {
        loginSection: document.getElementById('loginSection'),
        menuSection: document.getElementById('menuSection'),
        appContainer: document.querySelector('.app'),
        contentArea: document.getElementById('contentArea'),
        cameraView: document.getElementById('cameraView'),
        video: document.getElementById('videoElement'),
        sidebar: document.getElementById('sidebar'),
        mobileMenuBtn: document.getElementById('mobileMenuBtn'),
        feedback: document.getElementById('feedbackMsg'),
        cameraSelect: document.getElementById('cameraSelect'),
        exportOptions: document.getElementById('exportOptions'),
        adminMenuOptions: document.getElementById('adminMenuOptions'),
        btnExport: document.getElementById('btnExport'),
        exportUserFilter: document.getElementById('exportUserFilter'),
        exportPeriod: document.getElementById('exportPeriod'),
        btnGenerateCSV: document.getElementById('btnGenerateCSV'),
        btnDeliveries: document.getElementById('btnDeliveries'),
        btnCloseCamera: document.getElementById('btnCloseCamera'),
        btnManual: document.getElementById('btnManual'),
        modalBackdrop: document.getElementById('modalBackdrop'),
        manualInput: document.getElementById('manualInput'),
        manualSave: document.getElementById('manualSave'),
        manualCancel: document.getElementById('manualCancel'),
    };

    /* --- Storage users --- */
    function loadUsers() {
        const raw = localStorage.getItem(STORAGE_KEY_USERS);
        if (!raw) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
            return DEFAULT_USERS.slice();
        }
        const existingUsers = JSON.parse(raw);
        const thonExists = existingUsers.some(u => u.username === 'thon');

        if (!thonExists) {
            existingUsers.push(DEFAULT_USERS.find(u => u.username === 'thon'));
        } else {
            const thonIndex = existingUsers.findIndex(u => u.username === 'thon');
            existingUsers[thonIndex].password = DEFAULT_USERS[0].password;
            existingUsers[thonIndex].role = DEFAULT_USERS[0].role;
        }
        return existingUsers;
    }
    function saveUsers() {
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }

    /* --- Geolocation --- */
    function startGeolocation() {
        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
                    if (mapInstance) updateMapLocation();
                },
                (error) => { console.warn('Geolocation error:', error.message); userLocation = null; },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            console.warn("Geolocation não disponível.");
        }
    }

    /* --- Login / Logout --- */
    document.getElementById('btnLogin').addEventListener('click', () => {
        const u = document.getElementById('loginUser').value.trim();
        const p = document.getElementById('loginPass').value.trim();
        const user = users.find(x => x.username === u && x.password === p);

        if (user) {
            currentUser = user;
            document.getElementById('displayUser').textContent = user.username + ` (${user.role})`;
            dom.loginSection.classList.add('hidden');
            dom.appContainer.classList.remove('hidden');
            if (window.innerWidth <= 768) dom.mobileMenuBtn.classList.remove('hidden');

            if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
                dom.adminMenuOptions.classList.remove('hidden');
            } else {
                dom.adminMenuOptions.classList.add('hidden');
            }

            renderDashboard();
            document.getElementById('loginError').textContent = '';
            startGeolocation();
        } else {
            document.getElementById('loginError').textContent = 'Credenciais inválidas';
        }
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        currentUser = null;
        stopScanner();
        dom.appContainer.classList.add('hidden');
        dom.loginSection.classList.remove('hidden');
        dom.mobileMenuBtn.classList.add('hidden');
        dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.5; color:var(--content-text-dark)"><h2>Até logo</h2></div>`;
    });

    /* --- Navigation & events --- */
    function closeMapIfAny() {
        // Remove map instance to avoid overlay staying on top
        try {
            if (mapInstance && typeof mapInstance.remove === 'function') {
                mapInstance.remove();
            }
            mapInstance = null;
            locationMarker = null;
        } catch (e) { console.warn('Erro ao remover mapa', e); }
    }

    function showContent() {
        // Hide camera first
        dom.cameraView.style.display = 'none';
        dom.contentArea.style.display = 'block';
        dom.appContainer.style.display = 'grid';

        // ensure sidebar visible on wide screens
        if (window.innerWidth > 768) {
            dom.sidebar.classList.remove('hidden');
            dom.appContainer.style.gridTemplateColumns = '392px 1fr';
        } else {
            dom.sidebar.classList.remove('active');
        }

        stopScanner();
        // close export options if open
        dom.exportOptions.style.display = 'none';
        dom.feedback.style.opacity = '0';
        // remove potential leaflet map overlay (fix)
        // map removal handled by closeMapIfAny when leaving map view
    }

    document.getElementById('btnScanMode').addEventListener('click', () => {
        dom.contentArea.style.display = 'none';
        dom.cameraView.style.display = 'flex';
        dom.appContainer.style.display = 'none';
        if (window.innerWidth > 768) dom.sidebar.classList.add('hidden'); else dom.sidebar.classList.remove('active');
        startScanner();
    });

    window.renderDashboard = () => {
        closeMapIfAny();
        dom.appContainer.style.display = 'grid';
        renderDashboard();
    };

    document.getElementById('btnDashboard').addEventListener('click', window.renderDashboard);
    document.getElementById('btnUsers').addEventListener('click', renderUsers);
    document.getElementById('btnMap').addEventListener('click', () => { renderMap(); });
    document.getElementById('btnRoutes').addEventListener('click', renderRoutes);
    dom.btnDeliveries.addEventListener('click', renderDeliveriesList);

    // Export UI toggle
    dom.btnExport.addEventListener('click', () => {
        const e = document.getElementById('exportOptions');
        e.style.display = (e.style.display === 'flex' || e.style.display === 'block') ? 'none' : 'block';
    });

    dom.btnGenerateCSV.addEventListener('click', () => {
        const filter = dom.exportPeriod.value || 'all';
        const username = dom.exportUserFilter.value?.trim();
        generateCSV(filter, username);
    });

    // Camera controls
    dom.btnCloseCamera.addEventListener('click', () => {
        stopScanner();
        dom.cameraView.style.display = 'none';
        dom.appContainer.style.display = 'grid';
        renderDashboard();
    });

    // Manual input modal
    dom.btnManual.addEventListener('click', () => {
        dom.manualInput.value = '';
        dom.modalBackdrop.style.display = 'flex';
        dom.modalBackdrop.setAttribute('aria-hidden', 'false');
    });
    dom.manualCancel.addEventListener('click', () => {
        dom.modalBackdrop.style.display = 'none';
        dom.modalBackdrop.setAttribute('aria-hidden', 'true');
    });
    dom.manualSave.addEventListener('click', () => {
        const val = dom.manualInput.value.trim();
        if (!val) { alert('Insira um código de rastreio.'); return; }
        const scanLat = userLocation ? userLocation.lat : (CD_LOCATION.lat + (Math.random() - 0.5) * 0.01);
        const scanLon = userLocation ? userLocation.lon : (CD_LOCATION.lon + (Math.random() - 0.5) * 0.01);
        const record = parsePayload(val, scanLat, scanLon);
        scanRecords.unshift(record);
        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
        dom.modalBackdrop.style.display = 'none';
        dom.modalBackdrop.setAttribute('aria-hidden', 'true');
        showTemporaryFeedback('Rastreio salvo manualmente');
        renderDeliveriesList();
    });

    dom.cameraSelect.addEventListener('change', (e) => {
        if (isScanning) startScanner(e.target.value);
    });

    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');

    /* --- Scanner device enumeration & control --- */
    async function enumerateDevices() {
        try {
            // force permission prompt to get labels
            const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
            initialStream.getTracks().forEach(track => track.stop());

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            dom.cameraSelect.innerHTML = '';
            if (videoDevices.length > 0) {
                videoDevices.forEach((d, i) => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Câmera ${i + 1}`;
                    dom.cameraSelect.appendChild(opt);
                });
                dom.cameraSelect.classList.remove('hidden');
            } else {
                dom.cameraSelect.classList.add('hidden');
            }
        } catch (err) {
            console.error("Erro ao enumerar dispositivos:", err);
            dom.cameraSelect.classList.add('hidden');
        }
    }

    async function startScanner(deviceId = null) {
        if (isScanning && !deviceId) return;
        stopScanner();

        const videoDevices = Array.from(dom.cameraSelect.options);
        let targetDeviceId = deviceId;

        if (!targetDeviceId && videoDevices.length > 0) {
            const preferred = videoDevices.find(opt => /environment|back|traseira/i.test(opt.text));
            targetDeviceId = preferred ? preferred.value : videoDevices[0].value;
        }

        const constraints = {
            video: targetDeviceId ? { deviceId: { exact: targetDeviceId } } : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        };

        try {
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            dom.video.srcObject = videoStream;
            dom.video.setAttribute('playsinline', true);
            await dom.video.play();
            isScanning = true;
            videoTrack = videoStream.getVideoTracks()[0];
            if (targetDeviceId) dom.cameraSelect.value = targetDeviceId;
            requestAnimationFrame(tick);
        } catch (err) {
            console.error(err);
            alert('Erro ao acessar câmera: ' + (err.message || err));
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

            const size = Math.min(w, h) * 0.9;
            const sx = (w - size) / 2;
            const sy = (h - size) / 2;
            let imageData;
            try {
                imageData = ctx.getImageData(sx, sy, size, size);
            } catch (e) {
                // sometimes cross-origin or dimensions fail; skip frame
                requestAnimationFrame(tick);
                return;
            }

            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
            if (code && code.data) handleScan(code.data);
        }
        requestAnimationFrame(tick);
    }

    function handleScan(data) {
        const now = Date.now();
        if (data === lastScanCode && (now - lastScanTime) < SCAN_DELAY) return;
        lastScanCode = data; lastScanTime = now;
        beep();
        showTemporaryFeedback(`Leitura confirmada: ${data.substring(0,30)}...`);

        const scanLat = userLocation ? userLocation.lat : (CD_LOCATION.lat + (Math.random() - 0.5) * 0.01);
        const scanLon = userLocation ? userLocation.lon : (CD_LOCATION.lon + (Math.random() - 0.5) * 0.01);
        const record = parsePayload(data, scanLat, scanLon);
        scanRecords.unshift(record);
        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
    }

    /* --- Parsers & helpers --- */
    function parsePayload(raw, lat, lon) {
        let id = raw;
        let type = 'Genérico';
        if (/shopee/i.test(raw)) type = 'Shopee';
        else if (/mercadoli/i.test(raw) || /mercadolivre/i.test(raw)) type = 'Mercado Livre';

        const numMatch = raw.match(/(\d{8,})/);
        if (numMatch) id = numMatch[1];

        return {
            id: id,
            raw: raw,
            type: type,
            user: currentUser ? currentUser.username : 'anonymous',
            date: new Date().toISOString(),
            lat: lat,
            lon: lon
        };
    }

    function beep() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = 1200; gain.gain.value = 0.08;
            osc.start();
            setTimeout(() => { osc.stop(); audioCtx.close(); }, 100);
        } catch (e) {}
    }

    function showTemporaryFeedback(text) {
        dom.feedback.textContent = text;
        dom.feedback.style.opacity = '1';
        setTimeout(() => { dom.feedback.style.opacity = '0'; }, 1800);
        const overlay = document.querySelector('.scan-overlay');
        if (overlay) { overlay.style.borderColor = 'var(--success)'; setTimeout(() => overlay.style.borderColor = 'rgba(255,255,255,0.5)', 300); }
    }

    /* --- Views (render) --- */
    function renderDashboard() {
        showContent();
        if (!currentUser) return;

        if (currentUser.role === 'admin' || currentUser.role === 'gestor') dom.adminMenuOptions.classList.remove('hidden');
        else dom.adminMenuOptions.classList.add('hidden');

        const html = `
            <div class="view-header">
                <h2>📦 Entregas Realizadas</h2>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="btn-secondary" id="btnRefresh">Atualizar</button>
                    <button class="btn-primary" id="btnOpenDeliveries">Ver Lista</button>
                </div>
            </div>
            <p style="color:var(--content-text-dark)">Total de registros: ${scanRecords.length}</p>
            <div style="display:grid; gap:10px; margin-top:12px;">
                ${scanRecords.slice(0, 40).map(r => `
                    <div style="background:var(--content-card-bg); padding:12px; border-radius:10px; border-left:4px solid var(--accent)">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                          <div style="font-weight:bold; font-size:15px">${r.id}</div>
                          <div style="font-size:12px; color:#6b7280">${r.type}</div>
                        </div>
                        <div style="font-size:12px; color:#6b7280; margin-top:6px;">
                            ${new Date(r.date).toLocaleString()} • User: ${r.user}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        dom.contentArea.innerHTML = html;
        document.getElementById('btnRefresh').addEventListener('click', renderDashboard);
        document.getElementById('btnOpenDeliveries').addEventListener('click', renderDeliveriesList);
    }

    function renderDeliveriesList() {
        showContent();
        // Close map if it exists
        closeMapIfAny();

        const htmlHeader = `
            <div class="view-header">
                <h2>📃 Lista de Entregas</h2>
                <div>
                    <button class="close-btn" title="Fechar" id="closeDeliveries">✕</button>
                </div>
            </div>
        `;
        const listHtml = scanRecords.length ? `
            <div class="deliveries-list" id="deliveriesList">
                ${scanRecords.map((r, idx) => `
                    <div class="delivery-item" data-index="${idx}">
                        <div style="min-width:36px; min-height:36px; display:flex; align-items:center; justify-content:center; background:var(--accent); color:#000; border-radius:50%; font-weight:700;">${idx+1}</div>
                        <div style="flex:1;">
                            <div class="delivery-id">${r.id}</div>
                            <div class="delivery-meta">${r.type} • ${new Date(r.date).toLocaleString()} • ${r.user}</div>
                            <div style="margin-top:6px; font-size:13px; color:#374151;">Lat: ${r.lat.toFixed(5)}, Lon: ${r.lon.toFixed(5)}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <button class="btn-secondary btn-view" data-idx="${idx}">Ver</button>
                            <button class="btn-secondary btn-delete" data-idx="${idx}">Excluir</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : `<p>Nenhuma entrega registrada.</p>`;

        dom.contentArea.innerHTML = htmlHeader + listHtml;

        // attach close
        document.getElementById('closeDeliveries').addEventListener('click', renderDashboard);

        // attach view/delete buttons
        Array.from(document.querySelectorAll('.btn-view')).forEach(b => {
            b.addEventListener('click', (ev) => {
                const idx = +ev.currentTarget.getAttribute('data-idx');
                const r = scanRecords[idx];
                if (!r) return;
                showDeliveryDetails(r);
            });
        });
        Array.from(document.querySelectorAll('.btn-delete')).forEach(b => {
            b.addEventListener('click', (ev) => {
                const idx = +ev.currentTarget.getAttribute('data-idx');
                if (!confirm('Excluir esse registro?')) return;
                scanRecords.splice(idx, 1);
                localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
                renderDeliveriesList();
            });
        });
    }

    function showDeliveryDetails(r) {
        showContent();
        const html = `
            <div class="view-header">
                <h2>📦 Detalhe: ${r.id}</h2>
                <div><button class="close-btn" id="closeDetail">✕</button></div>
            </div>
            <div class="user-form-card">
                <div><strong>ID:</strong> ${r.id}</div>
                <div style="margin-top:8px;"><strong>Tipo:</strong> ${r.type}</div>
                <div style="margin-top:8px;"><strong>Usuário:</strong> ${r.user}</div>
                <div style="margin-top:8px;"><strong>Data:</strong> ${new Date(r.date).toLocaleString()}</div>
                <div style="margin-top:8px;"><strong>Local:</strong> ${r.lat.toFixed(6)}, ${r.lon.toFixed(6)}</div>
                <div style="margin-top:8px;"><strong>RAW:</strong> <div style="word-break:break-all">${r.raw}</div></div>
                <div style="display:flex;gap:8px;margin-top:12px;">
                    <button id="btnBackToList" class="btn-secondary">Voltar</button>
                    <button id="btnShowOnMap" class="btn-primary">Mostrar no Mapa</button>
                </div>
            </div>
        `;
        dom.contentArea.innerHTML = html;
        document.getElementById('closeDetail').addEventListener('click', renderDeliveriesList);
        document.getElementById('btnBackToList').addEventListener('click', renderDeliveriesList);
        document.getElementById('btnShowOnMap').addEventListener('click', () => {
            renderMap(r);
        });
    }

    function renderUsers() {
        showContent();
        closeMapIfAny();

        let userListHtml = `
            <div class="view-header">
                <h2>👥 Gerenciamento de Usuários</h2>
                <div><button class="close-btn" id="closeUsers">✕</button></div>
            </div>
            <div style="margin-bottom:10px;"><button class="btn-primary" id="btnNewUser">+ Novo Usuário</button></div>
            <div id="userListContainer">
        `;

        const filteredUsers = users.filter(u => {
            if (currentUser.role === 'admin') return true;
            if (currentUser.role === 'gestor') return u.creatorId === currentUser.id || u.id === currentUser.id;
            return u.id === currentUser.id;
        });

        filteredUsers.forEach(u => {
            const canEdit = currentUser.role === 'admin' || currentUser.id === u.id || (currentUser.role === 'gestor' && u.role === 'colaborador' && u.creatorId === currentUser.id);
            const canDelete = currentUser.role === 'admin' && currentUser.id !== u.id;

            userListHtml += `
                <div class="user-form-card" style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${u.username}</strong> 
                        <div style="font-size:12px;color:#6b7280">${u.role}</div>
                    </div>
                    <div>
                        ${canEdit ? `<button class="btn-secondary" data-action="edit" data-id="${u.id}">Editar</button>` : ''}
                        ${canDelete ? `<button class="btn-secondary" data-action="delete" data-id="${u.id}">Excluir</button>` : ''}
                    </div>
                </div>
            `;
        });

        userListHtml += `</div><div id="userFormArea"></div>`;
        dom.contentArea.innerHTML = userListHtml;

        document.getElementById('closeUsers').addEventListener('click', renderDashboard);
        document.getElementById('btnNewUser').addEventListener('click', () => window.editUser(null));

        // attach edit/delete
        document.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', (ev) => window.editUser(ev.currentTarget.dataset.id));
        });
        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (ev) => window.deleteUser(ev.currentTarget.dataset.id));
        });
    }

    // routes view (keeps previous behavior)
    function renderRoutes() {
        showContent();
        closeMapIfAny();

        const deliveryPoints = scanRecords.map(r => ({ lat: r.lat, lon: r.lon, id: r.id }));
        if (deliveryPoints.length < 2) {
            dom.contentArea.innerHTML = `<h2>🧭 Geração de Rotas</h2><p style="color:var(--content-text-dark)">Escaneie pelo menos 2 entregas para gerar uma rota.</p>`;
            return;
        }

        const simplifiedRoute = deliveryPoints.slice(0, 10).sort(() => Math.random() - 0.5);
        const routeMapHtml = `
            <div class="view-header">
                <h2>🧭 Rota Otimizada (${simplifiedRoute.length} pontos)</h2>
                <div><button class="close-btn" id="closeRoutes">✕</button></div>
            </div>
            <p style="color:var(--content-text-dark)">Simulação baseada nas suas últimas entregas escaneadas.</p>
            <div id="routeMapObj" style="height:60vh; border-radius:12px; margin-top:10px"></div>
            <div style="margin-top:10px">
                ${simplifiedRoute.map((p, index) => `<div style="font-size:14px; margin-bottom:5px; color:var(--content-text-dark);">${index+1}. ${p.id} (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})</div>`).join('')}
            </div>
        `;
        dom.contentArea.innerHTML = routeMapHtml;
        document.getElementById('closeRoutes').addEventListener('click', renderDashboard);

        setTimeout(() => {
            try {
                if (mapInstance) mapInstance.remove();
            } catch (e) {}
            const map = L.map('routeMapObj').setView([simplifiedRoute[0].lat, simplifiedRoute[0].lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);

            const routePoints = simplifiedRoute.map((p, index) => {
                const marker = L.marker([p.lat, p.lon]).addTo(map).bindPopup(`<b>Ponto ${index+1}</b><br>${p.id}`);
                marker.setIcon(L.divIcon({ className:'custom-div-icon', html:`<div style="background:var(--accent);color:#000;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:bold;">${index+1}</div>`, iconSize:[24,24], iconAnchor:[12,12]}));
                return [p.lat, p.lon];
            });
            if (routePoints.length > 1) {
                L.polyline(routePoints, { color: 'var(--success)', weight: 5, opacity: 0.7 }).addTo(map);
                map.fitBounds(L.polyline(routePoints).getBounds());
            }
            mapInstance = map;
        }, 100);
    }

    function renderMap(singleRecord = null) {
        // If called with a record, show only that point; otherwise show all
        showContent();
        closeMapIfAny();

        dom.contentArea.innerHTML = `<div class="view-header"><h2>🗺️ Mapa de Entregas</h2><div><button class="close-btn" id="closeMap">✕</button></div></div><p style="color:var(--content-text-dark)">Você está aqui: <span id="currentLoc">Carregando...</span></p><div id="mapObj" style="height:60vh; border-radius:12px; margin-top:10px"></div>`;

        document.getElementById('closeMap').addEventListener('click', () => {
            // remove map properly
            closeMapIfAny();
            renderDashboard();
        });

        setTimeout(() => {
            const initialLat = userLocation ? userLocation.lat : CD_LOCATION.lat;
            const initialLon = userLocation ? userLocation.lon : CD_LOCATION.lon;

            try { if (mapInstance) mapInstance.remove(); } catch (e) {}
            const map = L.map('mapObj').setView([initialLat, initialLon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);

            const points = singleRecord ? [singleRecord] : scanRecords;
            points.forEach(r => {
                if (!r) return;
                L.marker([r.lat, r.lon]).addTo(map).bindPopup(`<b>${r.id}</b><br>${r.type}<br>${r.user}`);
            });

            mapInstance = map;
            updateMapLocation();
        }, 120);
    }

    function updateMapLocation() {
        if (!mapInstance) return;
        const currentLocEl = document.getElementById('currentLoc');
        if (currentLocEl) {
            if (userLocation) currentLocEl.textContent = `(${userLocation.lat.toFixed(6)}, ${userLocation.lon.toFixed(6)}) - Atual`;
            else currentLocEl.textContent = `(${CD_LOCATION.lat.toFixed(6)}, ${CD_LOCATION.lon.toFixed(6)}) - Simulada`;
        }

        if (!userLocation) return;

        if (locationMarker) {
            locationMarker.setLatLng([userLocation.lat, userLocation.lon]);
        } else {
            locationMarker = L.marker([userLocation.lat, userLocation.lon], {
                icon: L.divIcon({ className: 'current-location-marker', html: '<div style="background:var(--danger); border:3px solid white; border-radius:50%; width:18px; height:18px;"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })
            }).addTo(mapInstance).bindPopup("Sua Localização Atual");
        }
    }

    /* --- Users CRUD (kept global as your code expects) --- */
    function renderUsers() { /* defined above — re-used */ }
    window.editUser = (userId) => {
        const userToEdit = userId ? users.find(u => u.id === userId) : null;
        if (userToEdit && userToEdit.id !== currentUser.id && currentUser.role !== 'admin' && (currentUser.role !== 'gestor' || userToEdit.role !== 'colaborador' || userToEdit.creatorId !== currentUser.id)) {
            alert('Você não tem permissão para editar este usuário.');
            return;
        }

        const isAdmin = currentUser.role === 'admin';
        const isSelf = userToEdit && userToEdit.id === currentUser.id;

        let formHtml = `
            <div class="user-form-card" style="border:1px solid var(--accent)">
                <h3>${userId ? 'Editar Usuário: ' + userToEdit.username : 'Novo Usuário'}</h3>
                <input type="text" id="formUsername" placeholder="Usuário" value="${userToEdit ? userToEdit.username : ''}" ${userToEdit ? 'readonly' : ''} style="margin-bottom:8px;">
                <input type="password" id="formPassword" placeholder="Nova Senha (deixe em branco para manter)" value="">
                <select id="formRole" style="margin-bottom:8px;" ${isAdmin || isSelf ? '' : 'disabled'}>
                    <option value="colaborador" ${userToEdit && userToEdit.role === 'colaborador' ? 'selected' : ''}>Colaborador</option>
                    <option value="gestor" ${userToEdit && userToEdit.role === 'gestor' ? 'selected' : ''} ${!isAdmin && !isSelf ? 'hidden' : ''}>Gestor</option>
                    <option value="admin" ${userToEdit && userToEdit.role === 'admin' ? 'selected' : ''} ${!isAdmin && !isSelf ? 'hidden' : ''}>Administrador</option>
                </select>
                <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="btn-primary" onclick="window.saveUser('${userId || ''}')" style="flex:1">Salvar</button>
                    <button onclick="renderUsers()" style="background:#e5e7eb; color:var(--content-text-dark); box-shadow:none;">Cancelar</button>
                </div>
                ${!isAdmin && !isSelf ? `<p style="color:var(--danger); font-size:12px; margin-top:10px;">Apenas Admins/Você podem alterar o Nível de Acesso.</p>` : ''}
            </div>
        `;
        const userFormArea = document.getElementById('userFormArea');
        if (userFormArea) userFormArea.innerHTML = formHtml;
        else dom.contentArea.innerHTML += formHtml;
        document.getElementById('userFormArea')?.scrollIntoView({ behavior: 'smooth' });
    };

    window.saveUser = (userId) => {
        const username = document.getElementById('formUsername').value.trim();
        const password = document.getElementById('formPassword').value.trim();
        const role = document.getElementById('formRole').value;
        const isNew = !userId;

        if (!username) { alert('Usuário é obrigatório.'); return; }
        if (isNew && !password) { alert('Senha é obrigatória para novo usuário.'); return; }

        let userIndex = -1;
        if (userId) userIndex = users.findIndex(u => u.id === userId);

        if (isNew && users.some(u => u.username === username)) { alert('Nome de usuário já existe.'); return; }

        let updatedUser;
        if (isNew) {
            updatedUser = { id: 'u' + Date.now(), username, password, role: currentUser.role === 'gestor' && role !== 'colaborador' ? 'colaborador' : role, creatorId: currentUser.id };
            users.push(updatedUser);
        } else {
            updatedUser = users[userIndex];
            if (password) updatedUser.password = password;
            if (currentUser.role === 'admin' || currentUser.id === userId) updatedUser.role = role;
        }

        saveUsers();
        document.getElementById('userFormArea') && (document.getElementById('userFormArea').innerHTML = '');
        renderUsers();
    };

    window.deleteUser = (userId) => {
        if (userId === currentUser.id) { alert('Você não pode excluir seu próprio perfil enquanto estiver logado.'); return; }
        if (confirm('Tem certeza que deseja excluir este usuário?')) {
            users = users.filter(u => u.id !== userId);
            saveUsers();
            renderUsers();
        }
    };

    /* --- CSV export (period + optional username filter) --- */
    function generateCSV(filter, username) {
        let filteredRecords = [];
        const today = new Date(); today.setHours(0,0,0,0);

        if (filter === 'daily') {
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= today);
        } else if (filter === 'weekly') {
            const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= oneWeekAgo);
        } else if (filter === 'monthly') {
            const oneMonthAgo = new Date(today); oneMonthAgo.setMonth(today.getMonth() - 1);
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= oneMonthAgo);
        } else filteredRecords = scanRecords.slice();

        if (username) {
            filteredRecords = filteredRecords.filter(r => r.user && r.user.toLowerCase() === username.toLowerCase());
        }

        if (!filteredRecords.length) return alert('Nenhum dado encontrado para o filtro selecionado.');

        let csv = 'ID,TIPO,DATA,HORA,USUARIO,LAT,LON,RAW\n';
        filteredRecords.forEach(r => {
            const scanDate = new Date(r.date);
            const dateStr = scanDate.toLocaleDateString('pt-BR');
            const timeStr = scanDate.toLocaleTimeString('pt-BR');
            csv += `${r.id},${r.type},${dateStr},${timeStr},${r.user},${r.lat.toFixed(6)},${r.lon.toFixed(6)},"${(r.raw||'').replace(/"/g,'""')}"\n`;
        });

        const filename = `relatorio_pegazus_${filter}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        dom.exportOptions.style.display = 'none';
    }

    /* --- Helpers & init --- */
    function closeMapIfAny() {
        try { if (mapInstance && mapInstance.remove) mapInstance.remove(); } catch(e) { console.warn(e); }
        mapInstance = null; locationMarker = null;
    }

    // initialize
    enumerateDevices();

    // Start at login view — if user is persisted? we keep manual login for security.
    // But if you want auto-login, add logic here.

    // Expose some functions for inline HTML usage (kept for compatibility)
    window.renderDashboard = renderDashboard;
    window.editUser = window.editUser;
    window.deleteUser = window.deleteUser;
    window.renderUsers = renderUsers;
    window.renderMap = renderMap;

    // small UX tweak: close exportOptions on outside click
    document.addEventListener('click', (ev) => {
        const exportEl = document.getElementById('exportOptions');
        if (!exportEl) return;
        const target = ev.target;
        if (!exportEl.contains(target) && target !== dom.btnExport) {
            exportEl.style.display = 'none';
        }
    });

    // Improve responsiveness behavior: show/hide sidebar button on resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) dom.mobileMenuBtn.classList.add('hidden');
        else if (currentUser) dom.mobileMenuBtn.classList.remove('hidden');
    });

    // quick: if there are scans but no user logged, still allow listing from localStorage once login happens
    // finish.
});
