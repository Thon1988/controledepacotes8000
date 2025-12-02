document.addEventListener('DOMContentLoaded', () => {
    
    /* --- Configurações e Estado --- */
    const STORAGE_KEY_USERS = 'pegazus_users_v4';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v4';
    const DEFAULT_USERS = [
        { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
        { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
        { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
    ]; 
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 }; // Localização simulada do CD
    
    let currentUser = null;
    let scanRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
    // Garante que registros antigos tenham um status padrão e adicione dados simulados
    scanRecords.forEach(r => {
        if (!r.status) r.status = 'pending';
        // Adicionando dados simulados (nome, endereço, telefone)
        if (!r.clientName) r.clientName = "Cliente Simulado " + r.id.slice(-4);
        // Usamos um endereço mais simples para simular o agrupamento de condomínio/local
        if (!r.clientAddress) r.clientAddress = `Rua Fictícia, ${Math.floor(Math.random() * 50)} - Condomínio A`;
        if (!r.clientPhone) r.clientPhone = `(11) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;
        if (!r.lat) r.lat = CD_LOCATION.lat + (Math.random() - 0.5) * 0.01;
        if (!r.lon) r.lon = CD_LOCATION.lon + (Math.random() - 0.5) * 0.01;
    });

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

    /* --- Referências DOM --- */
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
        manualInputContainer: document.getElementById('manualInputContainer'),
        manualDeliveryId: document.getElementById('manualDeliveryId'),
        btnToggleManualInput: document.getElementById('btnToggleManualInput'),
        btnManualConfirm: document.getElementById('btnManualConfirm'),
    };

    /* --- Inicialização e Storage --- */
    function loadUsers() {
        const raw = localStorage.getItem(STORAGE_KEY_USERS);
        if(!raw) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(DEFAULT_USERS));
            return DEFAULT_USERS;
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

    /* --- Geolocalização (Localização do Usuário) --- */
    function startGeolocation() {
        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    if (mapInstance) updateMapLocation();
                },
                (error) => {
                    console.warn('Geolocation error:', error.message);
                    userLocation = null;
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            console.warn("Geolocation não está disponível no navegador.");
        }
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
            dom.appContainer.classList.remove('hidden'); 
            
            if(window.innerWidth <= 768) dom.mobileMenuBtn.classList.remove('hidden');
            
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

    /* --- Navegação e Eventos --- */
    function showContent() {
        dom.cameraView.style.display = 'none';
        dom.contentArea.style.display = 'block';
        
        dom.appContainer.style.display = 'grid'; 
        
        if (window.innerWidth > 768) { 
            dom.sidebar.classList.remove('hidden'); 
            dom.appContainer.style.gridTemplateColumns = '392px 1fr';
        } else {
            dom.sidebar.classList.remove('active');
        }
        
        stopScanner();
        if (dom.exportOptions.style.display === 'flex') {
            dom.exportOptions.style.display = 'none'; 
        }
        dom.feedback.style.opacity = '0'; 
        
        dom.manualInputContainer.style.opacity = '0';
        dom.manualInputContainer.style.pointerEvents = 'none';
    }

    
    document.getElementById('btnScanMode').addEventListener('click', () => {
        dom.contentArea.style.display = 'none';
        dom.cameraView.style.display = 'flex'; 
        
        dom.appContainer.style.display = 'none';
        
        if(window.innerWidth > 768) {
            dom.sidebar.classList.add('hidden'); 
        } else {
            dom.sidebar.classList.remove('active');
        }
        startScanner();
    });

    window.renderDashboard = () => {
        dom.appContainer.style.display = 'grid'; 
        renderDashboard();
    }
    
    document.getElementById('btnDashboard').addEventListener('click', window.renderDashboard); 
    document.getElementById('btnUsers').addEventListener('click', renderUsers);
    document.getElementById('btnMap').addEventListener('click', renderMap);
    document.getElementById('btnRoutes').addEventListener('click', renderRoutes);

    document.getElementById('btnExport').addEventListener('click', () => {
        dom.exportOptions.style.display = dom.exportOptions.style.display === 'flex' ? 'none' : 'flex';
    });

    document.getElementById('btnExportDaily').addEventListener('click', () => generateCSV('daily'));
    document.getElementById('btnExportWeekly').addEventListener('click', () => generateCSV('weekly'));
    document.getElementById('btnExportMonthly').addEventListener('click', () => generateCSV('monthly'));
    document.getElementById('btnExportAll').addEventListener('click', () => generateCSV('all'));

    dom.cameraSelect.addEventListener('change', (e) => {
        if(isScanning) startScanner(e.target.value);
    });

    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');
    
    dom.btnToggleManualInput.addEventListener('click', () => {
        const isVisible = dom.manualInputContainer.style.opacity === '1';
        dom.manualInputContainer.style.opacity = isVisible ? '0' : '1';
        dom.manualInputContainer.style.pointerEvents = isVisible ? 'none' : 'auto';
        if (!isVisible) {
            dom.manualDeliveryId.focus();
        }
    });

    dom.btnManualConfirm.addEventListener('click', () => {
        const id = dom.manualDeliveryId.value.trim();
        if (id) {
            handleScanManual(id);
        } else {
            showFeedback('ID de entrega vazio!', 'var(--danger)');
        }
    });
    
    /* --- Lógica do Scanner --- */
    
    async function enumerateDevices() { 
        try {
            const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
            initialStream.getTracks().forEach(track => track.stop());
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            dom.cameraSelect.innerHTML = '';
            
            if (videoDevices.length > 1) { 
                videoDevices.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Câmera ${dom.cameraSelect.length + 1}`;
                    dom.cameraSelect.appendChild(opt);
                });
                dom.cameraSelect.classList.remove('hidden');
            } else {
                dom.cameraSelect.classList.add('hidden'); 
            }
        } catch (err) {
            console.error("Erro ao enumerar dispositivos:", err);
        }
    }
    
    async function startScanner(deviceId = null) {
        if (isScanning && !deviceId) return;
        stopScanner(); 
        
        await enumerateDevices(); 

        const videoDevices = Array.from(dom.cameraSelect.options);
        
        let targetDeviceId = deviceId;
        
        if (!targetDeviceId && videoDevices.length > 0) {
            const preferredCamera = videoDevices.find(opt => 
                opt.text.toLowerCase().includes('environment') || 
                opt.text.toLowerCase().includes('back') || 
                opt.text.toLowerCase().includes('traseira')
            );
            
            if (preferredCamera) {
                targetDeviceId = preferredCamera.value;
            } else {
                targetDeviceId = videoDevices[0].value;
            }
        }

        if (!targetDeviceId && dom.cameraSelect.value) {
            targetDeviceId = dom.cameraSelect.value;
        }

        const constraints = {
            video: targetDeviceId
                ? { deviceId: { exact: targetDeviceId } } 
                : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        };

        try {
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            dom.video.srcObject = videoStream;
            dom.video.setAttribute('playsinline', true);
            await dom.video.play();
            isScanning = true;
            videoTrack = videoStream.getVideoTracks()[0];
            
            if (targetDeviceId && dom.cameraSelect.value !== targetDeviceId) {
                dom.cameraSelect.value = targetDeviceId;
            }

            requestAnimationFrame(tick);
        } catch (err) {
            console.error(err);
             Swal.fire({
                icon: 'error',
                title: 'Erro ao Acessar Câmera',
                text: 'Certifique-se de que a câmera está conectada e as permissões foram concedidas.' + (err.message ? ` Mensagem: ${err.message}` : ''),
                confirmButtonText: 'Voltar ao Dashboard'
            }).then(() => {
                window.renderDashboard(); 
            });
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
        if (data === lastScanCode && (now - lastScanTime) < SCAN_DELAY) return;
        
        lastScanCode = data;
        lastScanTime = now;

        beep();
        showFeedback(`Leitura Confirmada: ${data.substring(0, 30)}...`, 'var(--accent)'); 

        const scanLat = userLocation ? userLocation.lat : (CD_LOCATION.lat + (Math.random() - 0.5) * 0.01);
        const scanLon = userLocation ? userLocation.lon : (CD_LOCATION.lon + (Math.random() - 0.5) * 0.01);

        const record = parsePayload(data, scanLat, scanLon);
        scanRecords.unshift(record);
        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
    }
    
    function handleScanManual(data) {
        const id = data.trim();
        if (!id) return;
        
        const scanLat = userLocation ? userLocation.lat : (CD_LOCATION.lat + (Math.random() - 0.5) * 0.01);
        const scanLon = userLocation ? userLocation.lon : (CD_LOCATION.lon + (Math.random() - 0.5) * 0.01);

        const record = parsePayload(id, scanLat, scanLon);
        
        Swal.fire({
            title: '✅ ID Digitado Confirmado',
            html: `
                <div style="text-align: left; color:var(--content-text-dark);">
                    <p><strong>ID:</strong> ${record.id}</p>
                    <p><strong>Tipo:</strong> ${record.type}</p>
                    <p><strong>Status:</strong> Pendente</p>
                    <hr style="border-color: rgba(0,0,0,0.1)">
                    <h4>Dados do Destino (Simulação)</h4>
                    <p><strong>Nome:</strong> ${record.clientName}</p>
                    <p><strong>Endereço:</strong> ${record.clientAddress}</p>
                    <p><strong>Telefone:</strong> ${record.clientPhone}</p>
                </div>
            `,
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Confirmar e Salvar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                scanRecords.unshift(record);
                localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
                showFeedback(`Registro Manual ${record.id} Salvo!`, 'var(--success)');
                dom.manualDeliveryId.value = '';
            } else {
                showFeedback(`Registro Manual ${record.id} Cancelado!`, 'var(--danger)');
            }
            dom.manualInputContainer.style.opacity = '0';
            dom.manualInputContainer.style.pointerEvents = 'none';
        });
    }


    /* --- Parsers e Helpers --- */
    function parsePayload(raw, lat, lon) {
        let id = raw;
        let type = 'Genérico';
        if (raw.includes('shopee')) { type = 'Shopee'; }
        else if (raw.includes('mercadoli')) { type = 'Mercado Livre'; }
        
        const numMatch = raw.match(/(\d{8,})/);
        if (numMatch) id = numMatch[1];
        
        const clientName = "Cliente " + id.slice(-5).toUpperCase();
        // Simulação de endereço com Condomínio A para facilitar o agrupamento
        const clientAddress = `Rua Fictícia, ${Math.floor(Math.random() * 50)} - Condomínio A`; 
        const clientPhone = `(11) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;

        return {
            id: id,
            raw: raw,
            type: type,
            user: currentUser.username,
            date: new Date().toISOString(),
            lat: lat,
            lon: lon,
            status: 'pending',
            clientName: clientName,
            clientAddress: clientAddress,
            clientPhone: clientPhone,
            receivedBy: null // Novo campo para o recebedor
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

    function showFeedback(text, color = 'var(--accent)') {
        dom.feedback.textContent = text;
        dom.feedback.style.background = color;
        dom.feedback.style.opacity = '1';
        setTimeout(() => { dom.feedback.style.opacity = '0'; }, 3000); 
        
        const overlay = document.querySelector('.scan-overlay');
        overlay.style.borderColor = color;
        setTimeout(() => overlay.style.borderColor = 'rgba(255,255,255,0.5)', 300);
    }
    
    function showDashboardFeedback(text) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); padding:20px 40px; background:var(--success); color:white; border-radius:12px; z-index:10000; box-shadow:0 10px 20px rgba(0,0,0,0.2); opacity:0; transition:opacity 0.3s; font-family: 'Inter', sans-serif;";
        feedbackDiv.innerHTML = `<h3>${text}</h3>`;
        document.body.appendChild(feedbackDiv);
        
        setTimeout(() => { feedbackDiv.style.opacity = '1'; }, 50);
        setTimeout(() => { 
            feedbackDiv.style.opacity = '0'; 
            setTimeout(() => { document.body.removeChild(feedbackDiv); }, 300);
            renderDashboard();
        }, 1500);
    }

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
    
    // Função para dar baixa no registro (clicável no dashboard)
    window.markAsDelivered = (recordId) => {
        const record = scanRecords.find(r => r.id === recordId && r.user === currentUser.username); 
        
        if (record) {
            if (record.status === 'delivered') {
                Swal.fire({
                    title: 'Entrega Já Confirmada',
                    text: `A entrega ${recordId} já foi marcada como entregue. Deseja reverter o status para "Pendente"?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sim, Reverter',
                    cancelButtonText: 'Não, Manter'
                }).then((result) => {
                    if (result.isConfirmed) {
                        record.status = 'pending';
                        record.receivedBy = null;
                        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
                        showDashboardFeedback(`Status da entrega ${recordId} revertido para PENDENTE.`);
                    }
                });
            } else {
                
                // Solicita o nome do recebedor antes de dar baixa
                Swal.fire({
                    title: `Recebedor da Entrega ${recordId}`,
                    input: 'text',
                    inputLabel: 'Nome completo do recebedor:',
                    inputPlaceholder: 'Digite o nome aqui',
                    showCancelButton: true,
                    confirmButtonText: 'Confirmar Entrega',
                    cancelButtonText: 'Cancelar',
                    inputValidator: (value) => {
                        if (!value) {
                            return 'Você precisa digitar o nome do recebedor!'
                        }
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        record.status = 'delivered';
                        record.receivedBy = result.value;
                        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
                        showDashboardFeedback(`Entrega ${recordId} confirmada como entregue! Recebedor: ${result.value}`);
                    }
                });
            }
        } else {
             Swal.fire({
                icon: 'error',
                title: 'Sem Permissão',
                text: 'Registro não encontrado ou você não tem permissão para alterar o status desta entrega.',
                confirmButtonText: 'Ok'
            });
        }
    };
    
    // FUNÇÃO: Abre opções de contato (Ligação ou WhatsApp)
    window.openContactOptions = (phone, id) => {
        const phoneDigits = phone.replace(/\D/g, ''); // Remove caracteres (11) 9xxxx-xxxx
        const waLink = `https://wa.me/55${phoneDigits}`; // Assumindo código de país 55 (Brasil)

        Swal.fire({
            title: `Contato da Entrega ${id}`,
            text: `Como você deseja contatar o cliente ${phone}?`,
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: '📞 Ligar',
            denyButtonText: '💬 WhatsApp',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                // Opção de Ligação
                window.open(`tel:${phone}`);
            } else if (result.isDenied) {
                // Opção de WhatsApp (Abre em nova aba)
                window.open(waLink, '_blank');
            }
        });
    };
    
    // FUNÇÃO AUXILIAR: Agrupa registros por endereço (simulação)
    function getRecordsByLocation(recordId) {
        const primaryRecord = scanRecords.find(r => r.id === recordId);
        if (!primaryRecord) return [];

        // Agrupa por endereço exato para simular condomínio
        const relatedRecords = scanRecords.filter(r => 
            r.clientAddress === primaryRecord.clientAddress
        );
        
        return relatedRecords;
    }

    // NOVA FUNÇÃO: Renderiza a tela de baixa simultânea
    window.renderMultipleDeliveryForm = (recordIds) => {
        showContent();
        
        const recordsToDeliver = recordIds.map(id => scanRecords.find(r => r.id === id)).filter(r => r && r.status === 'pending');
        
        if (recordsToDeliver.length === 0) {
            dom.contentArea.innerHTML = `<h2>Aviso</h2><p>Nenhuma entrega pendente para dar baixa neste local.</p><button onclick="window.renderDashboard()" class="btn-primary">Voltar</button>`;
            return;
        }

        const primaryAddress = recordsToDeliver[0].clientAddress;

        dom.contentArea.innerHTML = `
            <h2>Baixa Simultânea</h2>
            <div class="user-form-card" style="padding: 20px;">
                <p style="font-weight:bold; font-size:18px; margin-bottom:15px; color:var(--accent);">📍 Endereço: ${primaryAddress}</p>
                
                <form id="multipleDeliveryForm">
                    ${recordsToDeliver.map((record, index) => `
                        <div style="padding:15px; border:1px solid #ddd; border-radius:10px; margin-bottom:15px; background:var(--content-bg-light);">
                            <div style="font-weight:bold; font-size:16px; margin-bottom:5px;">${index + 1}. ID: ${record.id}</div>
                            <div style="font-size:14px; color:var(--content-text-dark); margin-bottom:10px;">Cliente: ${record.clientName}</div>
                            
                            <input type="text" 
                                id="recebedor_${record.id}" 
                                placeholder="Nome do Recebedor (Obrigatório)" 
                                required 
                                style="margin-bottom: 0;">
                        </div>
                    `).join('')}
                    
                    <button type="submit" class="btn-primary" style="width:100%; padding:15px; margin-top:20px;">
                        Finalizar ${recordsToDeliver.length} Entregas
                    </button>
                    
                    <button type="button" onclick="window.renderDashboard()" style="width:100%; background:#ccc; color:#333; padding:10px; border-radius:10px; margin-top:10px; box-shadow:none;">
                        Cancelar e Voltar
                    </button>
                </form>
            </div>
        `;
        
        // Adiciona o listener para o formulário
        document.getElementById('multipleDeliveryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const form = e.target;
            const allRecordsDelivered = [];
            let allValid = true;

            recordsToDeliver.forEach(record => {
                const recebedorInput = form.querySelector(`#recebedor_${record.id}`);
                const recebedor = recebedorInput ? recebedorInput.value.trim() : '';
                
                if (!recebedor) {
                    allValid = false;
                    recebedorInput.style.border = '2px solid var(--danger)';
                    recebedorInput.focus();
                    return;
                }
                
                allRecordsDelivered.push({ id: record.id, recebedor: recebedor });
            });
            
            if (allValid) {
                Swal.fire({
                    title: 'Confirmar Entregas?',
                    text: `Você irá confirmar a entrega de ${allRecordsDelivered.length} pacotes.`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sim, Confirmar Todos',
                    cancelButtonText: 'Voltar e Corrigir'
                }).then((result) => {
                    if (result.isConfirmed) {
                        allRecordsDelivered.forEach(item => {
                            const record = scanRecords.find(r => r.id === item.id);
                            if (record) {
                                record.status = 'delivered';
                                record.receivedBy = item.recebedor; 
                            }
                        });
                        localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(scanRecords));
                        showDashboardFeedback(`Baixa simultânea concluída para ${allRecordsDelivered.length} pacotes!`);
                    }
                });
            } else {
                Swal.fire('Atenção', 'Preencha o nome do recebedor para todos os pacotes antes de finalizar.', 'warning');
            }
        });
    };


    /* --- Views (Renderização) --- */
    
    function renderDashboard() {
        showContent();
        
        if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
            dom.adminMenuOptions.classList.remove('hidden');
        } else {
            dom.adminMenuOptions.classList.add('hidden');
        }
        
        const html = `
            <h2>📦 Entregas Realizadas</h2>
            <p style="color:var(--content-text-dark)">Clique em um item para ver os detalhes da entrega.</p>
            <div style="display:grid; gap:10px; margin-top:20px;">
                ${scanRecords.map(r => {
                    const statusColor = r.status === 'delivered' ? 'var(--success)' : 'var(--danger)';
                    const actionText = r.status === 'delivered' ? 'ENTREGUE ✅' : 'PENDENTE';
                    
                    return `
                        <div onclick="window.renderDeliveryDetails('${r.id}')" 
                             style="background:var(--content-card-bg); padding:15px; border-radius:10px; border-left:4px solid ${statusColor}; cursor:pointer;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-weight:bold; font-size:16px">${r.id}</div>
                                <div style="font-size:12px; font-weight:bold; color:${statusColor};">${actionText}</div>
                            </div>
                            <div style="font-size:12px; color:#6b7280; margin-top:5px;">
                                ${r.type} • ${new Date(r.date).toLocaleString()} • User: ${r.user}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        dom.contentArea.innerHTML = html;
    }

    window.renderDeliveryDetails = (recordId) => {
        showContent();
        const record = scanRecords.find(r => r.id === recordId);
        if (!record) {
             dom.contentArea.innerHTML = `<h2>Erro</h2><p>Registro de entrega não encontrado.</p>`;
             return;
        }

        // --- LÓGICA DE AGRUPAMENTO (Baixa Simultânea) ---
        const relatedRecords = getRecordsByLocation(recordId);
        if (relatedRecords.length > 1) {
            const pendingCount = relatedRecords.filter(r => r.status === 'pending').length;
            
            if (pendingCount > 0) {
                 Swal.fire({
                    title: '📍 Múltiplas Entregas no Local',
                    html: `
                        <p style="color:var(--content-text-dark);">
                            Foram encontradas **${relatedRecords.length}** entregas neste endereço, sendo 
                            **${pendingCount}** ainda pendentes.
                        </p>
                        <p style="margin-top:10px;">Deseja dar baixa simultânea em todos os pacotes pendentes agora?</p>
                    `,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: `✅ Sim, Baixa Múltpla (${pendingCount})`,
                    cancelButtonText: 'Não, Ver Detalhes Deste Item'
                }).then((result) => {
                    if (result.isConfirmed) {
                        const pendingIds = relatedRecords.filter(r => r.status === 'pending').map(r => r.id);
                        window.renderMultipleDeliveryForm(pendingIds);
                    } else {
                        // Se clicar em "Não, Ver Detalhes", renderiza a tela normal
                        renderSingleDetails(record, recordId);
                    }
                });
                return; // Interrompe a execução para esperar a escolha no modal
            }
        }
        // --- FIM DA LÓGICA DE AGRUPAMENTO ---
        
        // Se não houver múltiplos ou o usuário escolheu ver os detalhes
        renderSingleDetails(record, recordId);

    };

    // Função separada para renderizar os detalhes de um único item (usada após o modal)
    function renderSingleDetails(record, recordId) {
        // Simulação de navegação (apenas para a interface, sem lógica real de rota)
        const allRecords = scanRecords.map(r => r.id);
        const currentIndex = allRecords.indexOf(recordId);
        const prevId = currentIndex > 0 ? allRecords[currentIndex - 1] : null;
        const nextId = currentIndex < allRecords.length - 1 ? allRecords[currentIndex + 1] : null;
        
        dom.contentArea.innerHTML = `
            <h2>Detalhes da Entrega</h2>
            <div class="user-form-card" style="padding: 20px;">
                
                <div id="detailMapObj" style="height:250px; border-radius:12px; margin-bottom:15px;"></div>

                <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom: 20px;">
                    <button onclick="${prevId ? `window.renderDeliveryDetails('${prevId}')` : ''}" style="flex:1; padding:15px; background:${prevId ? 'var(--accent)' : '#ccc'}; color:${prevId ? 'var(--content-text-dark)' : '#666'}; border-radius:10px; box-shadow:none;" ${!prevId ? 'disabled' : ''}>
                        ⬅️ Anterior
                    </button>
                    <button onclick="${nextId ? `window.renderDeliveryDetails('${nextId}')` : ''}" style="flex:1; padding:15px; background:${nextId ? 'var(--accent)' : '#ccc'}; color:${nextId ? 'var(--content-text-dark)' : '#666'}; border-radius:10px; box-shadow:none;" ${!nextId ? 'disabled' : ''}>
                        Próximo ➡️
                    </button>
                </div>

                <div style="margin-bottom: 20px; padding:15px; border:1px solid #ddd; border-radius:10px; background:var(--content-bg-light); color:var(--content-text-dark);">
                    <div style="font-weight:bold; font-size:18px; margin-bottom:5px;">${record.id} - ${record.clientName}</div>
                    <div style="font-size:16px;">${record.clientAddress}</div>
                    <div style="font-size:14px; color:#6b7280; margin-top:5px;">Tipo: ${record.type} • Status: ${record.status.toUpperCase()} ${record.receivedBy ? `(Recebido por: ${record.receivedBy})` : ''}</div>
                </div>

                <button onclick="window.openContactOptions('${record.clientPhone}', '${record.id}')" 
                        style="width:100%; padding:15px; background:var(--success); color:white; font-size:16px; font-weight:bold; border-radius:10px; margin-bottom:15px; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.3);">
                    📞 Toque para ligar / WhatsApp: ${record.clientPhone}
                </button>
                
                <div style="margin-top: 15px; padding:15px; border:1px solid #ddd; border-radius:10px;">
                    <p style="font-weight:bold; margin-bottom:10px; color:var(--content-text-dark);">Ação de Transferência/Reajuste</p>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="transferTarget" placeholder="ID do Entregador para Transferir" style="flex:1; margin-bottom:0;">
                        <button onclick="Swal.fire('Transferir', 'Entrega ${recordId} transferida para ID: ' + document.getElementById('transferTarget').value, 'info')" style="background:var(--accent); color:var(--content-text-dark); padding:10px 15px; border-radius:8px; font-weight:bold; box-shadow:none;">
                            Transferir
                        </button>
                    </div>
                </div>


                <div style="display:flex; justify-content:space-between; gap:10px; margin-top: 20px;">
                    <button onclick="Swal.fire('Ocorrência', 'Abrir registro de ocorrência para ${recordId}', 'warning')" style="flex:1; padding:15px; background:rgba(239, 68, 68, 0.2); color:var(--danger); font-weight:bold; border-radius:10px; box-shadow:none;">
                        ⚠️ Ocorrência
                    </button>
                    <button onclick="window.markAsDelivered('${recordId}')" style="flex:1; padding:15px; background:var(--success); color:white; font-weight:bold; border-radius:10px; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.3);">
                        ✅ Entregar
                    </button>
                </div>

            </div>
        `;

        setTimeout(() => {
            let detailMap = L.map('detailMapObj').setView([record.lat, record.lon], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(detailMap);

            L.marker([record.lat, record.lon]).addTo(detailMap)
                .bindPopup(`<b>${record.id}</b><br>${record.clientAddress}`).openPopup();
            
            detailMap.setView([record.lat, record.lon], 15);
        }, 100);
    }


    function renderRoutes() {
        showContent();
        const deliveryPoints = scanRecords.map(r => ({ lat: r.lat, lon: r.lon, id: r.id }));
        
        if (deliveryPoints.length < 2) {
            dom.contentArea.innerHTML = `<h2>🧭 Geração de Rotas</h2><p style="color:var(--content-text-dark)">Escaneie pelo menos 2 entregas para gerar uma rota.</p>`;
            return;
        }

        const simplifiedRoute = deliveryPoints
            .slice(0, 10) 
            .sort(() => Math.random() - 0.5); 

        const routeMapHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>🧭 Rota Otimizada (${simplifiedRoute.length} pontos)</h2>
                ${deliveryPoints.length >= 2 ? `
                    <button id="btnToggleRouteFullscreen" class="btn-primary" style="padding: 8px 12px; font-size: 14px; box-shadow:none;">
                        🖥️ Tela Cheia
                    </button>` : ''}
            </div>
            <p style="color:var(--content-text-dark)">Simulação baseada nas suas últimas entregas escaneadas. </p>
            <div id="routeMapObj" style="height:70vh; border-radius:12px; margin-top:10px"></div>
            <div style="margin-top:10px">
                ${simplifiedRoute.map((p, index) => 
                    `<div style="font-size:14px; margin-bottom:5px; color:var(--content-text-dark);">
                        ${index + 1}. ${p.id} 
                        (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})
                    </div>`
                ).join('')}
            </div>
        `;
        dom.contentArea.innerHTML = routeMapHtml;

        setTimeout(() => {
            const map = L.map('routeMapObj').setView([simplifiedRoute[0].lat, simplifiedRoute[0].lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);

            const routePoints = simplifiedRoute.map((p, index) => {
                const marker = L.marker([p.lat, p.lon]).addTo(map)
                    .bindPopup(`<b>Ponto ${index + 1}</b><br>${p.id}`);
                
                marker.setIcon(L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background:var(--accent); color:#000; border-radius:50%; width:24px; height:24px; text-align:center; font-weight:bold; line-height:24px;">${index + 1}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                }));
                return [p.lat, p.lon];
            });
            
            if (routePoints.length > 1) {
                L.polyline(routePoints, { color: 'var(--success)', weight: 5, opacity: 0.7 }).addTo(map);
                map.fitBounds(L.polyline(routePoints).getBounds());
            }

            if (deliveryPoints.length >= 2) {
                document.getElementById('btnToggleRouteFullscreen').addEventListener('click', () => {
                    const sidebar = document.getElementById('sidebar');
                    const appContainer = document.querySelector('.app');
                    const button = document.getElementById('btnToggleRouteFullscreen');

                    if (window.innerWidth > 768) { 
                        if (!sidebar.classList.contains('hidden')) {
                            sidebar.classList.add('hidden');
                            appContainer.style.gridTemplateColumns = '1fr';
                            button.innerHTML = '◀️ Voltar';
                        } else {
                            sidebar.classList.remove('hidden');
                            appContainer.style.gridTemplateColumns = '392px 1fr';
                            button.innerHTML = '🖥️ Tela Cheia';
                        }
                    }
                    
                    if (map) {
                        setTimeout(() => {
                            map.invalidateSize();
                        }, 350);
                    }
                });
            }

        }, 100);
    }

    function renderMap() {
        showContent();
        mapInstance = null;
        dom.contentArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2>🗺️ Mapa de Entregas</h2>
                <button id="btnToggleMapFullscreen" class="btn-primary" style="padding: 8px 12px; font-size: 14px; box-shadow:none;">
                    🖥️ Tela Cheia
                </button>
            </div>
            <p style="color:var(--content-text-dark)">Você está aqui: <span id="currentLoc">Carregando...</span></p>
            <div id="mapObj" style="height:70vh; border-radius:12px; margin-top:10px"></div>`;
        
        setTimeout(() => {
            const initialLat = userLocation ? userLocation.lat : CD_LOCATION.lat;
            const initialLon = userLocation ? userLocation.lon : CD_LOCATION.lon;

            mapInstance = L.map('mapObj').setView([initialLat, initialLon], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM'
            }).addTo(mapInstance);

            scanRecords.forEach(r => {
                L.marker([r.lat, r.lon]).addTo(mapInstance)
                    .bindPopup(`<b>${r.id}</b><br>${r.type}<br><a href="#" onclick="window.renderDeliveryDetails('${r.id}')">Ver Detalhes</a>`);
            });

            updateMapLocation();
            
            document.getElementById('btnToggleMapFullscreen').addEventListener('click', () => {
                const sidebar = document.getElementById('sidebar');
                const appContainer = document.querySelector('.app');
                const button = document.getElementById('btnToggleMapFullscreen');

                if (window.innerWidth > 768) { 
                    if (!sidebar.classList.contains('hidden')) {
                        sidebar.classList.add('hidden');
                        appContainer.style.gridTemplateColumns = '1fr';
                        button.innerHTML = '◀️ Voltar';
                    } else {
                        sidebar.classList.remove('hidden');
                        appContainer.style.gridTemplateColumns = '392px 1fr';
                        button.innerHTML = '🖥️ Tela Cheia';
                    }
                }
                
                if (mapInstance) {
                    setTimeout(() => {
                        mapInstance.invalidateSize();
                    }, 350);
                }
            });


        }, 100);
    }
    
    function updateMapLocation() {
        if (!mapInstance || !userLocation) return;

        const currentLocEl = document.getElementById('currentLoc');
        if (currentLocEl) {
            currentLocEl.textContent = `(${userLocation.lat.toFixed(6)}, ${userLocation.lon.toFixed(6)}) - ${userLocation ? 'Atual' : 'Simulada'}`;
        }

        if (locationMarker) {
            locationMarker.setLatLng([userLocation.lat, userLocation.lon]);
        } else {
            locationMarker = L.marker([userLocation.lat, userLocation.lon], {
                icon: L.divIcon({
                    className: 'current-location-marker',
                    html: '<div style="background:var(--danger); border:3px solid white; border-radius:50%; width:18px; height:18px;"></div>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9]
                })
            }).addTo(mapInstance)
            .bindPopup("Sua Localização Atual");
        }
    }


    /* --- Gerenciamento de Usuários (CRUD com Permissões) --- */
    function renderUsers() {
        showContent();
        
        let userListHtml = `
            <h2>👥 Gerenciamento de Usuários</h2>
            <div style="margin-bottom: 20px;">
                <button class="btn-primary" onclick="window.editUser(null)">+ Novo Usuário</button>
            </div>
            <div id="userListContainer">
        `;
        
        const filteredUsers = users.filter(u => {
            if (currentUser.role === 'admin') return true;
            if (currentUser.role === 'gestor') {
                return u.creatorId === currentUser.id || u.id === currentUser.id;
            }
            return u.id === currentUser.id;
        });

        filteredUsers.forEach(u => {
            const canEdit = currentUser.role === 'admin' || currentUser.id === u.id || (currentUser.role === 'gestor' && u.role === 'colaborador' && u.creatorId === currentUser.id);
            const canDelete = currentUser.role === 'admin' && currentUser.id !== u.id;
            
            userListHtml += `
                <div class="user-form-card" style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${u.username}</strong> 
                        <span style="color:var(--accent); font-size:12px">(${u.role})</span>
                    </div>
                    <div>
                        ${canEdit ? `<button onclick="window.editUser('${u.id}')" style="background:rgba(56, 189, 248, 0.2); color:var(--accent); padding:5px 10px; margin-right:5px; font-size:14px; box-shadow:none;" title="Editar">✏️</button>` : ''}
                        ${canDelete ? `<button onclick="window.deleteUser('${u.id}')" style="background:rgba(239, 68, 68, 0.2); color:var(--danger); padding:5px 10px; font-size:14px; box-shadow:none;">Excluir</button>` : ''}
                    </div>
                </div>
            `;
        });
        
        userListHtml += `</div><div id="userFormArea"></div>`;
        dom.contentArea.innerHTML = userListHtml;
    }

    window.editUser = (userId) => {
        const userToEdit = userId ? users.find(u => u.id === userId) : null;
        
        if (userToEdit && userToEdit.id !== currentUser.id && currentUser.role !== 'admin' && (currentUser.role !== 'gestor' || userToEdit.role !== 'colaborador' || userToEdit.creatorId !== currentUser.id)) {
            Swal.fire({
                icon: 'error',
                title: 'Acesso Negado',
                text: 'Você não tem permissão para editar este usuário.'
            });
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
        document.getElementById('userFormArea').innerHTML = formHtml;
        document.getElementById('userFormArea').scrollIntoView({ behavior: 'smooth' });
    };

    window.saveUser = (userId) => {
        const username = document.getElementById('formUsername').value.trim();
        const password = document.getElementById('formPassword').value.trim();
        const role = document.getElementById('formRole').value;
        const isNew = !userId;

        if (!username) { Swal.fire('Erro', 'Usuário é obrigatório.', 'error'); return; }
        if (isNew && !password) { Swal.fire('Erro', 'Senha é obrigatória para novo usuário.', 'error'); return; }

        let userIndex = -1;
        if (userId) userIndex = users.findIndex(u => u.id === userId);

        if (isNew && users.some(u => u.username === username)) {
            Swal.fire('Erro', 'Nome de usuário já existe.', 'error');
            return;
        }
        
        let updatedUser;
        if (isNew) {
            updatedUser = {
                id: 'u' + Date.now(),
                username,
                password,
                role: currentUser.role === 'gestor' && role !== 'colaborador' ? 'colaborador' : role, 
                creatorId: currentUser.id
            };
            users.push(updatedUser);
        } else {
            updatedUser = users[userIndex]; 

            if (password) updatedUser.password = password;

            if (currentUser.role === 'admin' || currentUser.id === userId) {
                updatedUser.role = role; 
            }
        }

        saveUsers();
        document.getElementById('userFormArea').innerHTML = '';
        renderUsers();
        Swal.fire('Sucesso', 'Usuário salvo com sucesso!', 'success');
    };

    window.deleteUser = (userId) => {
        if (userId === currentUser.id) {
            Swal.fire('Erro', 'Você não pode excluir seu próprio perfil enquanto estiver logado.', 'error');
            return;
        }
        Swal.fire({
            title: 'Tem certeza?',
            text: "Você não poderá reverter isso!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: 'var(--danger)',
            cancelButtonColor: '#aaa',
            confirmButtonText: 'Sim, excluir!'
        }).then((result) => {
            if (result.isConfirmed) {
                users = users.filter(u => u.id !== userId);
                saveUsers();
                renderUsers();
                Swal.fire('Excluído!', 'O usuário foi excluído.', 'success');
            }
        });
    };


    /* --- Exportação CSV com Filtros de Data --- */
    function generateCSV(filter) {
        let filteredRecords = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (filter === 'daily') {
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= today);
        } else if (filter === 'weekly') {
            const oneWeekAgo = new Date(today);
            oneWeekAgo.setDate(today.getDate() - 7);
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= oneWeekAgo);
        } else if (filter === 'monthly') {
            const oneMonthAgo = new Date(today);
            oneMonthAgo.setMonth(today.getMonth() - 1);
            filteredRecords = scanRecords.filter(r => new Date(r.date) >= oneMonthAgo);
        } else {
            filteredRecords = scanRecords;
        }

        if(!filteredRecords.length) return Swal.fire('Aviso', `Nenhum dado encontrado para o filtro: ${filter}.`, 'warning');
        
        let csv = 'ID,TIPO,DATA,HORA,USUARIO,LAT,LON,RAW,STATUS,NOME_CLIENTE,ENDERECO_CLIENTE,TELEFONE_CLIENTE,RECEBEDOR\n'; 
        filteredRecords.forEach(r => {
            const scanDate = new Date(r.date);
            const dateStr = scanDate.toLocaleDateString('pt-BR');
            const timeStr = scanDate.toLocaleTimeString('pt-BR');
            // Escapa as vírgulas e aspas duplas nos campos textuais
            const escape = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
            
            csv += `${r.id},${r.type},${dateStr},${timeStr},${r.user},${r.lat.toFixed(6)},${r.lon.toFixed(6)},${escape(r.raw)},${r.status || 'pending'},${escape(r.clientName)},${escape(r.clientAddress)},${escape(r.clientPhone)},${escape(r.receivedBy)}\n`;
        });
        
        const filename = `relatorio_pegazus_${filter}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        dom.exportOptions.style.display = 'none';
        Swal.fire('Sucesso', 'Exportação CSV concluída!', 'success');
    }
});
