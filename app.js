/* app.js
    Pegazus — Dashboard + Scanner + Map (clustering, heatmap, OSRM routes)
    Dados persistidos em localStorage: 'pegazus_scans_v4' e 'pegazus_shipments_v1'
*/

(() => {
    /* ---------- Config / state ---------- */
    const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
    const STORAGE_KEY_SHIPMENTS = 'pegazus_shipments_v1';
    const DEFAULT_CENTER = { lat: -23.5505, lon: -46.6333 };

    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    let shipments = JSON.parse(localStorage.getItem(STORAGE_KEY_SHIPMENTS) || '{}');

    // UI refs
    const sidebar = document.getElementById('sidebar');
    const displayUser = document.getElementById('displayUser');
    const dashboardRoot = document.getElementById('dashboardRoot');
    const mapOverlay = document.getElementById('mapOverlay');
    const mapCloseBtn = document.getElementById('mapCloseBtn');
    const cameraView = document.getElementById('cameraView');
    const videoEl = document.getElementById('videoElement');
    const cameraSelect = document.getElementById('cameraSelect');
    const btnToggleFlash = document.getElementById('btnToggleFlash');
    const btnCloseScanner = document.getElementById('btnCloseScanner');
    const btnToggleManualInput = document.getElementById('btnToggleManualInput');
    const manualInputContainer = document.getElementById('manualInputContainer');
    const manualInput = document.getElementById('manualInput');
    const manualSave = document.getElementById('manualSave');
    const manualCancel = document.getElementById('manualCancel');
    const feedbackMsg = document.getElementById('feedbackMsg');
    
    // NOVO: Referências DOM para a Modal de Câmera/Filtros
    const cameraModal = document.getElementById('cameraModal');
    const btnOpenCameraModal = document.getElementById('btnComar');
    const btnCloseCameraModal = document.getElementById('btnCloseCameraModal');
    const btnAbrirCameraParaComprovante = document.getElementById('abrirCameraParaComprovante');
    const btnAptsaischanComprovante = document.getElementById('AptsaischanComprovante');
    const btnAfssranRota = document.getElementById('AfssranRota');
    const btnMesranRota = document.getElementById('MesranRota');
    const btnCararIagas = document.getElementById('CararIagas');
    
    // map state
    let mapInstance = null;
    let markerCluster = null;
    let heatLayer = null;
    let routingControl = null;

    // scanner state
    let videoStream = null;
    let scanning = false;
    let currentDeviceId = null;
    let lastScanned = { code: null, time: 0 };

    /* ---------- Helpers ---------- */
    function saveScans(){ localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords)); }
    function saveShipments(){ localStorage.setItem(STORAGE_KEY_SHIPMENTS, JSON.stringify(shipments)); }

    function nowISO(){ return new Date().toISOString(); }
    function formatDateTime(iso){ try { return new Date(iso).toLocaleString(); } catch(e) { return iso; } }
    
    function showSwal(icon, title, text, timer = 0) {
        Swal.fire({
            icon: icon,
            title: title,
            text: text,
            timer: timer,
            showConfirmButton: timer === 0
        });
    }

    /* ---------- Data derived ---------- */
    function getPendingDeliveries(){ return scanRecords.filter(r => !(r.status && r.status.toLowerCase()==='entregue')); }
    function getCollectedToday(){
        const today = new Date();
        return scanRecords.filter(r => {
            const d = new Date(r.date);
            return d.getFullYear()===today.getFullYear() && d.getMonth()===today.getMonth() && d.getDate()===today.getDate() &&
                    ((r.type && r.type.toLowerCase().includes('coleta')) || (r.raw && r.raw.toLowerCase().includes('coleta'))===false ? false : true);
        });
    }
    function getCompleted(){ return scanRecords.filter(r => r.status && r.status.toLowerCase()==='entregue'); }
    function getUpcoming(n=5){
        const open = scanRecords.filter(r => !(r.status && r.status.toLowerCase()==='entregue'));
        open.forEach(r => { const s = shipments[r.tracking] || {}; r._previsao = s.previsao_entrega ? new Date(s.previsao_entrega) : new Date(r.date); });
        open.sort((a,b) => new Date(a._previsao) - new Date(b._previsao));
        return open.slice(0,n);
    }

    /* ---------- Modal Câmera/Filtros (NOVO) ---------- */
    function openCameraModal() {
        cameraModal.style.display = 'flex';
        // Garante que o scanner e mapa estejam fechados
        stopScanner();
        closeMapOverlayIfOpen();
    }

    function closeCameraModal() {
        cameraModal.style.display = 'none';
    }

    function handleModalAction(action) {
        closeCameraModal();

        switch (action) {
            case 'abrirCameraParaComprovante':
                // Abre o scanner, talvez para um modo de captura de imagem de comprovante
                openScannerUi();
                showSwal('info', 'Scanner Ativo', 'Aguardando QR Code ou Comprovante de ID.', 2000);
                break;
            case 'AfssranRota':
                // Simula o cálculo de rota para um dos pacotes pendentes
                const firstPending = getPendingDeliveries()[0];
                if (firstPending && shipments[firstPending.tracking] && shipments[firstPending.tracking].lat) {
                    drawRoute(shipments[firstPending.tracking].lat, shipments[firstPending.tracking].lon);
                    setActiveMenu('btnRoutes');
                    showSwal('success', 'Rota Gerada', `Rota para ${firstPending.tracking} calculada.`, 2000);
                } else {
                    showSwal('warning', 'Sem Dados de Rota', 'Nenhum pacote pendente com coordenadas disponíveis.', 2000);
                    openMapOverlay();
                    setActiveMenu('btnMap');
                }
                break;
            // Outras ações: apenas feedback para demonstração
            default:
                showSwal('success', 'Ação Confirmada', `Executando a funcionalidade: ${action}`, 1500);
                renderDashboard();
                break;
        }
    }

    /* ---------- Renderers ---------- */
    function renderDashboard(){
        const pend = getPendingDeliveries();
        const collected = getCollectedToday();
        const completed = getCompleted();
        const upcoming = getUpcoming(5);

        const html = `
            <div>
                <h2>📊 Dashboard do Entregador</h2>
                <div class="cards">
                    <div class="card" id="cardPending" aria-expanded="false">
                        <h3>Entregas Pendentes</h3>
                        <div class="big">${pend.length}</div>
                        <div class="muted">Ainda não entregues</div>
                        <div class="expandable" id="pendingExpand"><div class="list">${pend.map(renderListItem).join('')}</div></div>
                    </div>
                    <div class="card" id="cardCollected" aria-expanded="false">
                        <h3>Coletas de Hoje</h3>
                        <div class="big">${collected.length}</div>
                        <div class="muted">Escaneamentos classificados como coleta</div>
                        <div class="expandable" id="collectedExpand"><div class="list">${collected.map(renderListItem).join('')}</div></div>
                    </div>
                    <div class="card" id="cardCompleted" aria-expanded="false">
                        <h3>Total Concluído</h3>
                        <div class="big">${completed.length}</div>
                        <div class="muted">Entregues</div>
                        <div class="expandable" id="completedExpand"><div class="list">${completed.map(renderListItem).join('')}</div></div>
                    </div>
                    <div class="card" id="cardUpcoming" aria-expanded="true">
                        <h3>Próximas Entregas (Amostra)</h3>
                        <div class="big">${upcoming.length}</div>
                        <div class="muted">Ordenado por previsão/data do scan</div>
                        <div class="expandable open" id="upcomingExpand"><div class="list">${upcoming.map(renderListItem).join('')}</div></div>
                    </div>
                </div>

                <div style="margin-top:12px">
                    <h3>📦 Próximas (detalhado)</h3>
                    <div class="list">${upcoming.map(renderDetailed).join('')}</div>
                </div>
            </div>
        `;
        dashboardRoot.innerHTML = html;
        attachCardToggles();
    }

    function renderListItem(p){
        const cliente = p.cliente || (shipments[p.tracking] && shipments[p.tracking].name) || '—';
        const endereco = p.endereco || (shipments[p.tracking] && shipments[p.tracking].address) || '';
        return `<div class="list-item">
            <div>
                <div style="font-weight:700">${p.tracking}</div>
                <small>${cliente} • ${endereco}</small>
            </div>
            <div style="text-align:right">
                <div class="muted">${p.status || 'Aberto'}</div>
                <small>${formatDateTime(p.date)}</small>
            </div>
        </div>`;
    }

    function renderDetailed(p){
        const cliente = p.cliente || (shipments[p.tracking] && shipments[p.tracking].name) || '—';
        const endereco = p.endereco || (shipments[p.tracking] && shipments[p.tracking].address) || '';
        const previsao = (shipments[p.tracking] && shipments[p.tracking].previsao_entrega) ? new Date(shipments[p.tracking].previsao_entrega).toLocaleString() : '-';
        return `<div class="list-item">
            <div style="flex:1">
                <div style="font-weight:700">${p.tracking} <span style="color:#6b7280; font-weight:600; margin-left:8px">${p.status || 'Aberto'}</span></div>
                <div style="font-size:13px">${cliente} — ${endereco}</div>
                <div style="font-size:12px; color:#7b8794; margin-top:6px">Previsão: ${previsao}</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end">
                <button class="btn secondary" onclick="centerMapForTracking('${p.tracking}')">Mostrar no Mapa</button>
                <button class="btn" onclick="openDeliveryDetails('${p.tracking}')">Detalhes</button>
            </div>
        </div>`;
    }

    function attachCardToggles(){
        [['cardPending','pendingExpand'],['cardCollected','collectedExpand'],['cardCompleted','completedExpand'],['cardUpcoming','upcomingExpand']]
            .forEach(([c,e])=>{
                const card = document.getElementById(c), exp = document.getElementById(e);
                if(!card||!exp) return;
                card.addEventListener('click', ()=>{ exp.classList.toggle('open'); card.setAttribute('aria-expanded', exp.classList.contains('open')? 'true':'false'); });
            });
    }

    /* ---------- Map: clustering, heatmap, routing ---------- */

    function openMapOverlay(){
        // set dynamic left based on sidebar width
        const sidebarW = sidebar.getBoundingClientRect().width;
        mapOverlay.style.left = sidebarW + 60 + 'px'; // 60px do menu fixo
        mapOverlay.style.width = `calc(100% - ${sidebarW + 60}px)`;
        mapOverlay.classList.remove('hidden');
        mapOverlay.classList.add('open');
        mapOverlay.setAttribute('aria-hidden','false');
        setTimeout(initMapIfNeeded, 120);
    }

    function closeMapOverlay(){
        mapOverlay.classList.remove('open'); mapOverlay.setAttribute('aria-hidden','true');
        setTimeout(() => { mapOverlay.classList.add('hidden'); }, 300); // Esconde após a transição
        if (mapInstance) { try{ mapInstance.remove(); }catch(e){} mapInstance = null; markerCluster=null; heatLayer=null; routingControl=null; }
        renderDashboard();
    }

    function initMapIfNeeded(){
        if (mapInstance) { renderMapData(); return; }
        if (typeof L === 'undefined') { alert('Leaflet não carregado'); return; }

        mapInstance = L.map('mapContainer', { preferCanvas:true }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'&copy; OSM' }).addTo(mapInstance);

        // clustering
        markerCluster = L.markerClusterGroup({ chunkedLoading:true });
        mapInstance.addLayer(markerCluster);

        // heatmap
        if (typeof L.heatLayer !== 'undefined') { // Verifica se a biblioteca foi carregada
            heatLayer = L.heatLayer([], { radius: 25, blur: 18, maxZoom: 17 }).addTo(mapInstance);
        }

        renderMapData();
    }

    function renderMapData(){
        if (!mapInstance || !markerCluster) return;
        markerCluster.clearLayers(); 
        if (heatLayer) heatLayer.setLatLngs([]);

        const points = [];
        scanRecords.forEach(r => {
            const s = shipments[r.tracking] || {};
            const lat = r.lat || s.lat, lon = r.lon || s.lon;
            if (!lat || !lon) return;
            const popup = `<b>${r.tracking}</b><br>${r.cliente || s.name || ''}<br>${r.endereco || s.address || ''}<br><small>${formatDateTime(r.date)}</small>
                <br><button onclick="window.drawRoute(${lat}, ${lon})" class="btn secondary" style="margin-top:5px; padding: 5px;">Gerar Rota</button>`;
            const marker = L.marker([lat, lon], { title: r.tracking }).bindPopup(popup);
            markerCluster.addLayer(marker);
            points.push([lat, lon, 1]);
        });

        if (points.length) {
            if (heatLayer) heatLayer.setLatLngs(points);
            try { mapInstance.fitBounds(markerCluster.getBounds().pad(0.12)); } catch(e){}
        } else {
            mapInstance.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], 12);
        }
    }

    // center map and open popup (if exists)
    window.centerMapForTracking = function(tracking){
        openMapOverlay();
        setTimeout(()=> {
            renderMapData();
            markerCluster.eachLayer(m => {
                if (m.getPopup && m.getPopup().getContent().includes(tracking)) {
                    try { mapInstance.setView(m.getLatLng(), 15, { animate:true }); m.openPopup(); } catch(e){}
                }
            });
        }, 300);
    };

    // draw route from depot to a destination lat/lng using OSRM via leaflet-routing-machine
    window.drawRoute = function(lat, lng){
        openMapOverlay();
        setTimeout(()=> {
            if (routingControl) { try{ mapInstance.removeControl(routingControl); } catch(e){} routingControl=null; }
            if (typeof L.Routing === 'undefined') { return showSwal('error', 'Erro de Roteamento', 'Leaflet Routing Machine não carregado.'); }
            
            const depot = L.latLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon);
            const destino = L.latLng(lat, lng);
            routingControl = L.Routing.control({
                waypoints: [depot, destino],
                router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
                showAlternatives: false,
                lineOptions: { styles: [{color:'#007bff', weight:4, opacity:0.95}]},
                addWaypoints: false,
                draggableWaypoints: false,
                fitSelectedRoute: true
            }).addTo(mapInstance);
        }, 300);
    };

    /* ---------- Delivery details actions ---------- */

    window.openDeliveryDetails = function(tracking){
        const rec = scanRecords.find(r=>r.tracking===tracking);
        if (!rec) return alert('Registro não encontrado');
        const s = shipments[tracking] || {};
        const html = `
            ${tracking}\nCliente: ${rec.cliente||s.name||'-'}\nEndereço: ${rec.endereco||s.address||'-'}\nTelefone: ${rec.telefone||s.phone||'-'}\nUsuário: ${rec.user}\nData: ${formatDateTime(rec.date)}
        `;
        if (confirm(`Detalhes:\n\n${html}\n\nDar baixa (marcar como ENTREGUE)?`)) {
            scanRecords = scanRecords.map(r => r.tracking===tracking ? ({...r, status:'Entregue'}) : r);
            shipments[tracking] = shipments[tracking] || {}; shipments[tracking].status = 'Entregue';
            saveScans(); saveShipments();
            renderDashboard();
            showSwal('success', 'Baixa Concluída', 'Marcado como ENTREGUE.', 1500);
        }
    };

    window.editShipmentLocal = function(tracking){
        const s = shipments[tracking] || {tracking, name:'', address:'', phone:'', previsao_entrega:''};
        const name = prompt('Nome do cliente:', s.name||'');
        if (name===null) return;
        const address = prompt('Endereço:', s.address||'');
        if (address===null) return;
        const phone = prompt('Telefone:', s.phone||'');
        if (phone===null) return;
        const previsao = prompt('Previsão (YYYY-MM-DD hh:mm) opcional:', s.previsao_entrega||'');
        s.name=name; s.address=address; s.phone=phone; s.previsao_entrega=previsao||s.previsao_entrega;
        shipments[tracking]=s;
        scanRecords = scanRecords.map(r=> r.tracking===tracking ? ({...r, cliente:s.name, endereco:s.address, telefone:s.phone}) : r);
        saveShipments(); saveScans();
        renderDashboard();
        showSwal('info', 'Dados Atualizados', 'Informações da remessa salvas localmente.', 1500);
    };

    /* ---------- Scanner integration (jsQR) ---------- */

    async function enumerateCameras(){
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video:true });
            stream.getTracks().forEach(t=>t.stop());
        } catch(e){}
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d=>d.kind==='videoinput');
            cameraSelect.innerHTML = '';
            if (videoDevices.length===0) { cameraSelect.innerHTML='<option>Nenhuma câmera</option>'; return; }
            videoDevices.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.deviceId;
                opt.text = d.label || `Câmera ${cameraSelect.length+1}`;
                cameraSelect.appendChild(opt);
            });
            // Tenta selecionar a câmera traseira
            const preferred = videoDevices.find(d => d.label.toLowerCase().includes('environment') || d.label.toLowerCase().includes('back'));
            if (preferred) cameraSelect.value = preferred.deviceId;

        } catch(e){ cameraSelect.innerHTML = '<option>Erro</option>'; console.warn(e); }
    }

    async function startScanner(deviceId=null){
        if (scanning) return;
        try {
            const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: { facingMode: 'environment' } };
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoEl.srcObject = videoStream;
            await videoEl.play();
            scanning = true;
            currentDeviceId = deviceId || null;
            
            cameraView.classList.remove('hidden');
            cameraView.setAttribute('aria-hidden','false');
            feedbackShow('Aguardando QR...');
            scanLoop();
        } catch(err){
            console.error('Erro ao abrir câmera', err);
            showSwal('error', 'Erro Câmera', 'Erro ao abrir câmera: ' + (err && err.message ? err.message : 'Verifique permissões.'));
            stopScanner();
        }
    }

    function stopScanner(){
        scanning = false;
        if (videoStream) { videoStream.getTracks().forEach(t=>t.stop()); videoStream=null; }
        videoEl.srcObject = null;
        cameraView.classList.add('hidden');
        cameraView.setAttribute('aria-hidden','true');
        feedbackHide();
    }

    function feedbackShow(text){
        feedbackMsg.textContent = text; feedbackMsg.style.opacity = '1';
    }
    function feedbackHide(){ feedbackMsg.style.opacity='0'; }

    function scanLoop(){
        if (!scanning) return;
        if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

            // crop central square for better speed
            const size = Math.min(canvas.width, canvas.height) * 0.9;
            const sx = (canvas.width - size)/2, sy = (canvas.height - size)/2;
            const imageData = ctx.getImageData(sx, sy, size, size);

            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts:'attemptBoth' });
            if (code && code.data) {
                const now = Date.now();
                if (code.data !== lastScanned.code || (now - lastScanned.time) > 1500) {
                    lastScanned = { code: code.data, time: now };
                    handleScannedTracking(code.data.trim());
                    feedbackShow(`Lido: ${code.data.substring(0, 30)}...`);
                    // small vibration if supported
                    if (navigator.vibrate) navigator.vibrate(120);
                }
            }
        }
        requestAnimationFrame(scanLoop);
    }

    function handleScannedTracking(raw){
        const tracking = raw.split(/\s/)[0];
        const details = shipments[tracking] || {};
        const now = nowISO();
        
        // Simulação de coordenadas se não existirem
        const simLat = details.lat || DEFAULT_CENTER.lat + (Math.random() - 0.5) * 0.05;
        const simLon = details.lon || DEFAULT_CENTER.lon + (Math.random() - 0.5) * 0.05;

        const record = {
            id: tracking,
            tracking,
            date: now,
            user: displayUser.textContent || 'unknown',
            type: details.type || (raw.toLowerCase().includes('coleta') ? 'Coleta' : 'Entrega'),
            endereco: details.address || '',
            telefone: details.phone || '',
            cliente: details.name || '',
            lat: simLat,
            lon: simLon,
            raw: raw
        };
        
        // Se a remessa já existe, atualiza as coordenadas e o timestamp
        if (!shipments[tracking]) {
             shipments[tracking] = { ...record, name: record.cliente, address: record.endereco, phone: record.telefone, lat: simLat, lon: simLon };
             saveShipments();
        }

        // if exists, update timestamp; otherwise unshift
        const existsIndex = scanRecords.findIndex(r=>r.tracking===tracking);
        if (existsIndex >= 0) { scanRecords[existsIndex] = {...scanRecords[existsIndex], date: now, ...record}; }
        else scanRecords.unshift(record);
        saveScans();
        
        stopScanner();
        showSwal('success', 'Rastreio Salvo', `Código ${tracking} salvo com sucesso!`, 1500);
        renderDashboard();
    }

    /* ---------- Manual input handlers ---------- */
    btnToggleManualInput.addEventListener('click', ()=> {
        manualInputContainer.style.display = manualInputContainer.style.display === 'none' ? 'flex' : 'none';
        if (manualInputContainer.style.display === 'flex') manualInput.focus();
    });
    manualCancel.addEventListener('click', ()=> { manualInput.value=''; manualInputContainer.style.display='none'; });
    manualSave.addEventListener('click', ()=> {
        const v = manualInput.value.trim();
        if (!v) return alert('Digite o código');
        handleScannedTracking(v);
        manualInput.value=''; manualInputContainer.style.display='none';
    });

    /* ---------- Camera selection / events ---------- */
    cameraSelect.addEventListener('change', ()=> {
        const id = cameraSelect.value;
        if (!id) return;
        // restart scanner with chosen device
        stopScanner(); startScanner(id);
    });

    btnCloseScanner.addEventListener('click', ()=> {
        stopScanner();
        renderDashboard();
        setActiveMenu('btnDashboard');
    });

    // flash toggle (best-effort: applyConstraints advanced torch)
    btnToggleFlash.addEventListener('click', async ()=>{
        if (!videoStream) return showSwal('warning', 'Atenção', 'Abra a câmera primeiro');
        const track = videoStream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (!caps.torch) return showSwal('warning', 'Atenção', 'Flash/tocha não disponível neste dispositivo.');
        try {
            const settings = track.getSettings();
            // Apenas liga/desliga o torch
            await track.applyConstraints({ advanced:[{ torch: !(settings.torch) }] });
            showSwal('info', 'Flash', settings.torch ? 'Flash Desligado' : 'Flash Ligado', 500);
        } catch(e){ console.warn('torch err', e); showSwal('error', 'Erro', 'Não foi possível alternar o flash'); }
    });

    /* ---------- Scan records demo fallback & boot ---------- */
    function ensureDemoData(){
        const hasScanRecords = scanRecords.length > 0;
        const hasShipmentRecords = Object.keys(shipments).length > 0;
        
        if (!hasScanRecords || !hasShipmentRecords){
            const demo = [
                { id:'BR987654321', tracking:'BR987654321', date: new Date().toISOString(), user:'thon', status:'Em Rota', cliente:'João da Silva', endereco:'Av. Paulista, 1000', raw:'BR987654321', lat:-23.564, lon:-46.652 },
                { id:'BR112233445', tracking:'BR112233445', date: new Date(Date.now()-86400000).toISOString(), user:'maria', status:'Atrasada', cliente:'Ana Paula', endereco:'Rua da Consolação, 500', raw:'BR112233445', lat:-23.555, lon:-46.659 },
                { id:'BR556677889', tracking:'BR556677889', date: new Date(Date.now()-3600000).toISOString(), user:'joao', status:'Pendente', cliente:'Carlos Souza', endereco:'Rua Fictícia, 1', raw:'BR556677889', lat:-23.551, lon:-46.638 }
            ];
            if (!hasScanRecords) {
                scanRecords = demo.concat(scanRecords);
            }
            if (!hasShipmentRecords) {
                shipments['BR987654321'] = { tracking:'BR987654321', name:'João da Silva', address:'Av. Paulista, 1000', phone:'(11)99999-0000', previsao_entrega: new Date(Date.now()+3600000).toISOString(), lat:-23.564, lon:-46.652 };
                shipments['BR112233445'] = { tracking:'BR112233445', name:'Ana Paula', address:'Rua da Consolação, 500', phone:'(11)98888-1111', previsao_entrega: new Date(Date.now()+3600000*24).toISOString(), lat:-23.555, lon:-46.659 };
                shipments['BR556677889'] = { tracking:'BR556677889', name:'Carlos Souza', address:'Rua Fictícia, 1', phone:'(11)97777-2222', previsao_entrega: new Date(Date.now()+3600000*2).toISOString(), lat:-23.551, lon:-46.638 };
            }

            saveScans();
            saveShipments();
        }
    }

    /* ---------- Menu wiring ---------- */
    document.getElementById('btnDashboard').addEventListener('click', ()=> { setActiveMenu('btnDashboard'); closeMapOverlayIfOpen(); renderDashboard(); stopScanner(); });
    document.getElementById('btnDashboardMobile').addEventListener('click', ()=> { setActiveMenu('btnDashboard'); closeMapOverlayIfOpen(); renderDashboard(); stopScanner(); }); // Para o menu fixo
    document.getElementById('btnScanMode').addEventListener('click', ()=> { setActiveMenu('btnScanMode'); closeMapOverlayIfOpen(); openScannerUi(); });
    document.getElementById('btnMap').addEventListener('click', ()=> { setActiveMenu('btnMap'); stopScanner(); openMapOverlay(); });
    document.getElementById('btnRoutes').addEventListener('click', ()=> { setActiveMenu('btnRoutes'); stopScanner(); openMapOverlay(); });

    mapCloseBtn.addEventListener('click', ()=> { closeMapOverlay(); });

    // Menu Fixo (Comãr)
    if(btnOpenCameraModal) btnOpenCameraModal.addEventListener('click', openCameraModal);
    if(btnCloseCameraModal) btnCloseCameraModal.addEventListener('click', closeCameraModal);
    
    // Ações da Modal
    if(btnAbrirCameraParaComprovante) btnAbrirCameraParaComprovante.addEventListener('click', () => handleModalAction('abrirCameraParaComprovante'));
    if(btnAptsaischanComprovante) btnAptsaischanComprovante.addEventListener('click', () => handleModalAction('AptsaischanComprovante'));
    if(btnAfssranRota) btnAfssranRota.addEventListener('click', () => handleModalAction('AfssranRota'));
    if(btnMesranRota) btnMesranRota.addEventListener('click', () => handleModalAction('MesranRota'));
    if(btnCararIagas) btnCararIagas.addEventListener('click', () => handleModalAction('CararIagas'));


    function setActiveMenu(id){
        // Remove active da sidebar principal
        Array.from(document.querySelectorAll('#sidebar .menu-item')).forEach(el=>el.classList.remove('active'));
        // Remove active do menu fixo
        Array.from(document.querySelectorAll('#left-menu .left-menu-item')).forEach(el=>el.classList.remove('active'));
        
        const el = document.getElementById(id); 
        if (el) el.classList.add('active');

        // Se for um item do menu principal, ativa o botão correspondente no menu fixo (ex: Dashboard)
        if (id === 'btnDashboard' && document.getElementById('btnDashboardMobile')) {
             document.getElementById('btnDashboardMobile').classList.add('active');
        }
    }

    function closeMapOverlayIfOpen(){ if (mapOverlay.classList.contains('open')) closeMapOverlay(); }

    /* ---------- Scanner UI flow ---------- */
    async function openScannerUi(){
        // show camera UI and enumerate cameras
        await enumerateCameras();
        startScanner(cameraSelect.value || null);
    }

    /* ---------- Boot ---------- */
    function boot(){
        // displayUser.textContent = localStorage.getItem('pegazus_last_user') || 'thon'; // Mantemos a demo como thon
        ensureDemoData();
        renderDashboard();
        // expose debugging helpers
        window._Pegazus = { scanRecords, shipments, renderDashboard, openMapOverlay, closeMapOverlay, drawRoute, editShipmentLocal };
    }

    boot();

})();
