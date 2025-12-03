document.addEventListener('DOMContentLoaded', () => {

    /* ========================================================= */
    /* I. CONFIGURAÇÕES E REFERÊNCIAS DOM                        */
    /* ========================================================= */

    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 }; 
    const STORAGE_KEY_USERS = 'pegazus_users_v5';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v5';
    
    // Usuários Padrão para inicialização
    const DEFAULT_USERS = [
        { id: 'u1', username: 'thon', password: '882010', role: 'admin', creatorId: 'system' },
        { id: 'u2', username: 'maria', password: '123', role: 'gestor', creatorId: 'system' },
        { id: 'u3', username: 'joao', password: '123', role: 'colaborador', creatorId: 'u2' }
    ]; 
    
    // Variáveis de Estado
    let currentUser = null;
    let videoStream = null;
    let isScanning = false;
    let videoTrack = null;
    const SCAN_DELAY = 1000;
    let lastScanCode = '';
    let lastScanTime = 0;
    let userLocation = null;
    let mapInstance = null;
    let locationMarker = null;

    // Referências DOM - ADICIONADO: elementos da nova modal e menu fixo
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

        // NOVOS ELEMENTOS DA MODAL DE CÂMERA/FILTROS
        cameraModal: document.getElementById('cameraModal'),
        btnOpenCameraModal: document.getElementById('btnComar'), // Botão "Comãr" no menu fixo
        btnCloseCameraModal: document.querySelector('#cameraModal .close-btn'),
        btnAbrirCameraParaComprovante: document.getElementById('abrirCameraParaComprovante'),
        btnAptsaischanComprovante: document.getElementById('AptsaischanComprovante'),
        btnAfssranRota: document.getElementById('AfssranRota'),
        btnMesranRota: document.getElementById('MesranRota'),
        btnCararIagas: document.getElementById('CararIagas'),
    };

    /* ========================================================= */
    /* II. STORES E ADAPTADORES (CAMADA DE DADOS ISOLADA)        */
    /* ========================================================= */
    
    // As funções LocalStore e DeliveryStore permanecem as mesmas.
    // ... [CÓDIGO DE LocalStore E DeliveryStore AQUI] ...
    
    const LocalStore = {
        loadDeliveries: function() {
            let records = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
            // Inicialização de dados simulados
            records.forEach(r => {
                if (!r.status) r.status = 'pending';
                if (!r.clientName) r.clientName = "Cliente Simulado " + r.id.slice(-4);
                if (!r.clientAddress) r.clientAddress = `Rua Fictícia, ${Math.floor(Math.random() * 50)} - Condomínio A`;
                if (!r.clientPhone) r.clientPhone = `(11) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;
                if (!r.lat || !r.lon) { // Preenche lat/lon se faltar
                    r.lat = CD_LOCATION.lat + (Math.random() - 0.5) * 0.01;
                    r.lon = CD_LOCATION.lon + (Math.random() - 0.5) * 0.01;
                }
                if (!r.date) r.date = Date.now(); // Adiciona timestamp para filtro
                if (!r.user) r.user = 'system'; // Adiciona usuário
                if (!r.type) r.type = 'Package'; // Adiciona tipo
            });
            return records;
        },

        saveDeliveries: function(data) {
            localStorage.setItem(STORAGE_KEY_SCANS, JSON.stringify(data));
        },

        loadUsers: function() {
            let users = JSON.parse(localStorage.getItem(STORAGE_KEY_USERS));
            if (!users || users.length === 0) {
                users = DEFAULT_USERS;
                localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
            }
            // Garante que o usuário 'thon' de sistema esteja sempre presente.
            const thonExists = users.some(u => u.username === 'thon');
            if (!thonExists) {
                users.push(DEFAULT_USERS.find(u => u.username === 'thon'));
                localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
            }
            return users;
        },

        saveUsers: function(data) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(data));
        }
    };
    
    const DataAdapter = LocalStore; 

    /**
     * DeliveryStore: Gerencia o estado da aplicação e as regras de negócio.
     */
    const DeliveryStore = {
        scanRecords: DataAdapter.loadDeliveries(),
        users: DataAdapter.loadUsers(),
        
        getDeliveries: function() { return this.scanRecords; },
        
        getDeliveryById: function(id) {
            return this.scanRecords.find(r => r.id === id);
        },
        
        addDelivery: function(record) {
            // Adiciona se não existir
            const existing = this.scanRecords.find(r => r.id === record.id);
            if (!existing) {
                this.scanRecords.unshift(record);
                DataAdapter.saveDeliveries(this.scanRecords);
            }
        },

        updateDeliveryStatus: function(recordId, status, receivedBy = null) {
            const record = this.getDeliveryById(recordId);
            if (record) {
                record.status = status;
                record.receivedBy = receivedBy;
                DataAdapter.saveDeliveries(this.scanRecords);
                return true;
            }
            return false;
        },
        
        getRecordsByLocation: function(recordId) {
            const primaryRecord = this.getDeliveryById(recordId);
            if (!primaryRecord) return [];
            
            return this.scanRecords.filter(r => 
                r.clientAddress === primaryRecord.clientAddress
            );
        },

        getUsers: function() { return this.users; },
        getUserByCredentials: function(username, password) {
            return this.users.find(u => u.username === username && u.password === password);
        },
        
        updateUsers: function(newUsers) {
            this.users = newUsers;
            DataAdapter.saveUsers(this.users);
        },
    };

    /* ========================================================= */
    /* III. CONTROLLER E VIEWS (LÓGICA E INTERFACE)              */
    /* ========================================================= */
    
    /**
     * AppController: Gerencia o fluxo da aplicação e a interação entre Views e Stores.
     */
    const AppController = {
        init: function() {
            // Inicialização de Eventos
            document.getElementById('btnLogin').addEventListener('click', this.handleLogin);
            document.getElementById('btnLogout').addEventListener('click', this.handleLogout);
            document.getElementById('btnDashboard').addEventListener('click', () => this.navigateTo('dashboard'));
            document.getElementById('btnScanner').addEventListener('click', () => this.navigateTo('scanner'));
            document.getElementById('btnMap').addEventListener('click', () => this.navigateTo('map'));
            document.getElementById('btnRoutes').addEventListener('click', () => this.navigateTo('routes'));
            document.getElementById('btnUsers').addEventListener('click', () => this.navigateTo('users'));
            dom.cameraSelect.addEventListener('change', (e) => this.startScanner(e.target.value));
            dom.btnToggleManualInput.addEventListener('click', this.toggleManualInput);
            dom.btnManualConfirm.addEventListener('click', this.handleManualConfirm);
            
            // Exportação
            document.getElementById('btnExport').addEventListener('click', this.toggleExportOptions);
            document.getElementById('btnExportDaily').addEventListener('click', () => this.handleExport('daily'));
            document.getElementById('btnExportWeekly').addEventListener('click', () => this.handleExport('weekly'));
            document.getElementById('btnExportMonthly').addEventListener('click', () => this.handleExport('monthly'));
            document.getElementById('btnExportAll').addEventListener('click', () => this.handleExport('all'));
            
            // Evento global para fechar exportOptions se clicar fora
            document.addEventListener('click', (e) => {
                if (dom.exportOptions.style.display === 'flex' && 
                    !e.target.closest('.export-container')) {
                    dom.exportOptions.style.display = 'none';
                }
            });
            
            this.startGeolocation();
            window.addEventListener('resize', this.handleResize);

            // NOVOS EVENTOS DA MODAL DE CÂMERA/FILTROS
            if(dom.btnOpenCameraModal) dom.btnOpenCameraModal.addEventListener('click', this.openCameraModal);
            if(dom.btnCloseCameraModal) dom.btnCloseCameraModal.addEventListener('click', this.closeCameraModal);
            if(dom.btnAbrirCameraParaComprovante) dom.btnAbrirCameraParaComprovante.addEventListener('click', () => this.handleModalAction('abrirCameraParaComprovante'));
            if(dom.btnAptsaischanComprovante) dom.btnAptsaischanComprovante.addEventListener('click', () => this.handleModalAction('AptsaischanComprovante'));
            if(dom.btnAfssranRota) dom.btnAfssranRota.addEventListener('click', () => this.handleModalAction('AfssranRota'));
            if(dom.btnMesranRota) dom.btnMesranRota.addEventListener('click', () => this.handleModalAction('MesranRota'));
            if(dom.btnCararIagas) dom.btnCararIagas.addEventListener('click', () => this.handleModalAction('CararIagas'));
        },

        /* --- Métodos da Nova Modal --- */
        openCameraModal: function() {
            dom.cameraModal.style.display = 'flex';
        },

        closeCameraModal: function() {
            dom.cameraModal.style.display = 'none';
        },

        handleModalAction: function(action) {
            AppController.closeCameraModal();

            // Adicione a lógica específica para cada botão aqui.
            // Por enquanto, apenas exibe um feedback.
            Swal.fire({
                title: 'Ação Confirmada',
                text: `Executando a funcionalidade: ${action}`,
                icon: 'success',
                timer: 1500
            });

            // Exemplo de como você chamaria outras funções:
            if (action === 'abrirCameraParaComprovante') {
                AppController.navigateTo('scanner'); // Chama o scanner, talvez com um modo diferente.
            } else {
                AppController.navigateTo('dashboard');
            }
        },

        /* --- Autenticação e Navegação --- */
        handleLogin: function() {
            const u = document.getElementById('loginUser').value.trim();
            const p = document.getElementById('loginPass').value.trim();
            const user = DeliveryStore.getUserByCredentials(u, p);
            const errorElement = document.getElementById('loginError');
            
            if (user) {
                currentUser = user;
                document.getElementById('displayUser').textContent = user.username + ` (${user.role})`;
                
                dom.loginSection.classList.add('hidden');
                dom.appContainer.classList.remove('hidden'); 
                if(window.innerWidth <= 768) dom.mobileMenuBtn.classList.remove('hidden');
                
                if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
                    dom.adminMenuOptions.classList.remove('hidden');
                    document.getElementById('btnUsers').classList.remove('hidden');
                } else {
                    dom.adminMenuOptions.classList.add('hidden');
                    document.getElementById('btnUsers').classList.add('hidden');
                }

                AppController.navigateTo('dashboard');
                errorElement.textContent = '';
            } else {
                errorElement.textContent = 'Credenciais inválidas';
            }
        },

        handleLogout: function() {
            currentUser = null;
            AppController.stopScanner();
            if (mapInstance) mapInstance.remove();
            mapInstance = null;
            dom.appContainer.classList.add('hidden');
            dom.loginSection.classList.remove('hidden'); 
            dom.mobileMenuBtn.classList.add('hidden');
            dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.5; color:var(--content-text-dark)"><h2>Até logo</h2></div>`;
            window.removeEventListener('resize', AppController.handleResize);
        },

        navigateTo: function(viewName, params = null) {
            // Fecha a sidebar em mobile
            if (window.innerWidth <= 768 && dom.sidebar.classList.contains('active')) {
                window.toggleSidebar();
            }

            AppController.showContent();
            AppController.closeCameraModal(); // Garante que a modal feche ao navegar

            // Limpa o mapa se sair das views de mapa
            if (mapInstance && viewName !== 'map' && viewName !== 'routes' && !viewName.includes('details')) {
                 mapInstance.remove();
                 mapInstance = null;
            }

            switch(viewName) {
                case 'dashboard':
                    Views.renderDashboard();
                    break;
                case 'scanner':
                    dom.contentArea.style.display = 'none';
                    dom.cameraView.style.display = 'flex'; 
                    dom.appContainer.style.display = 'none';
                    // Esconde a sidebar e ajusta o layout para a câmera
                    if(window.innerWidth > 768) { dom.sidebar.classList.add('hidden'); } else { dom.sidebar.classList.remove('active'); }
                    document.getElementById('left-menu').classList.add('hidden'); // Esconde o menu fixo também para a câmera
                    
                    this.startScanner();
                    break;
                case 'details':
                    Views.renderSingleDetails(params);
                    break;
                case 'multipleDelivery':
                    Views.renderMultipleDeliveryForm(params);
                    break;
                case 'users':
                    Views.renderUsers();
                    break;
                case 'map':
                    Views.renderMap();
                    break;
                case 'routes':
                    Views.renderRoutes();
                    break;
                default:
                    Views.renderDashboard();
            }
            document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
            const btn = document.getElementById('btn' + viewName.charAt(0).toUpperCase() + viewName.slice(1));
            if(btn) btn.classList.add('active');
        },
        
        showContent: function() {
            dom.cameraView.style.display = 'none';
            dom.contentArea.style.display = 'block';
            
            dom.appContainer.style.display = 'grid'; 
            document.getElementById('left-menu').classList.remove('hidden'); // Mostra o menu fixo

            if (window.innerWidth > 768) { 
                dom.sidebar.classList.remove('hidden'); 
                // NOVO CÁLCULO: 60px (menu fixo) + 392px (sidebar principal) = 452px
                dom.appContainer.style.gridTemplateColumns = '452px 1fr'; 
            } else {
                dom.sidebar.classList.remove('active');
            }
            
            this.stopScanner();
            if (dom.exportOptions.style.display === 'flex') {
                dom.exportOptions.style.display = 'none'; 
            }
            dom.feedback.style.opacity = '0'; 
            
            dom.manualInputContainer.style.opacity = '0';
            dom.manualInputContainer.style.pointerEvents = 'none';
        },
        
        handleResize: function() {
            if (mapInstance) {
                mapInstance.invalidateSize();
            }
             // Reajusta o layout do grid no redimensionamento (desktop)
            if (window.innerWidth > 768 && dom.appContainer.style.display === 'grid') {
                const sidebarWidth = dom.sidebar.classList.contains('hidden') ? '0' : '392px';
                dom.appContainer.style.gridTemplateColumns = `calc(60px + ${sidebarWidth}) 1fr`;
            } else if (window.innerWidth <= 768) {
                dom.appContainer.style.gridTemplateColumns = '1fr';
            }
        },

        /* --- Geolocation --- */
        startGeolocation: function() {
            if ("geolocation" in navigator) {
                navigator.geolocation.watchPosition(
                    (position) => {
                        userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
                        if (mapInstance) Views.updateMapLocation();
                    },
                    (error) => { console.warn('Geolocation error:', error.message); userLocation = null; },
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            }
        },

        /* --- Controle do Scanner --- */
        // ... (As funções enumerateDevices, startScanner, stopScanner, tick e handleScan permanecem as mesmas) ...
        enumerateDevices: async function() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
            dom.cameraSelect.innerHTML = '';
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Câmera ${dom.cameraSelect.options.length + 1}`;
                dom.cameraSelect.appendChild(option);
            });
            dom.cameraSelect.style.display = videoDevices.length > 1 ? 'block' : 'none';
        },

        startScanner: async function(deviceId = null) { 
            if (isScanning && !deviceId) return;
            this.stopScanner(); 
            
            await this.enumerateDevices(); 

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

                requestAnimationFrame(this.tick);
            } catch (err) {
                 Swal.fire({
                    icon: 'error',
                    title: 'Erro ao Acessar Câmera',
                    text: 'Certifique-se de que a câmera está conectada e as permissões foram concedidas.' + (err.message ? ` Mensagem: ${err.message}` : ''),
                    confirmButtonText: 'Voltar ao Dashboard'
                }).then(() => {
                    this.navigateTo('dashboard'); 
                });
            }
        },
        
        stopScanner: function() { 
            isScanning = false;
            if (videoStream) {
                videoStream.getTracks().forEach(t => t.stop());
                videoStream = null;
                videoTrack = null;
            }
            dom.video.srcObject = null;
        },

        tick: function() {
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
                    AppController.handleScan(code.data);
                }
            }
            requestAnimationFrame(AppController.tick); 
        },

        handleScan: function(data) {
            const now = Date.now();
            if (data === lastScanCode && (now - lastScanTime) < SCAN_DELAY) return;
            
            lastScanCode = data;
            lastScanTime = now;

            Utils.beep();
            Utils.showFeedback(`Leitura Confirmada: ${data.substring(0, 30)}...`, Utils.varCss('--accent')); 

            const record = Utils.parsePayload(data, userLocation, currentUser);
            
            // Verifica se a entrega já foi registrada e navega para detalhes se for o caso
            const existing = DeliveryStore.getDeliveryById(record.id);
            if (existing) {
                AppController.stopScanner();
                AppController.navigateTo('details', record.id);
                return;
            }
            
            DeliveryStore.addDelivery(record);

            // Se o scan for novo, adiciona e volta pro dashboard
            AppController.stopScanner();
            Utils.showDashboardFeedback(`Novo item (${record.id}) adicionado.`);
            AppController.navigateTo('dashboard');
        },
        
        toggleManualInput: function() {
            const isVisible = dom.manualInputContainer.style.opacity === '1';
            dom.manualInputContainer.style.opacity = isVisible ? '0' : '1';
            dom.manualInputContainer.style.pointerEvents = isVisible ? 'none' : 'auto';
            if (!isVisible) {
                dom.manualDeliveryId.focus();
            }
        },

        handleManualConfirm: function() {
            const id = dom.manualDeliveryId.value.trim();
            if (!id) {
                Utils.showFeedback('ID de entrega vazio!', Utils.varCss('--danger'));
                return;
            }
            
            const record = Utils.parsePayload(id, userLocation, currentUser);
            
            Swal.fire({
                title: '✅ ID Digitado Confirmado',
                html: `
                    <div style="text-align: left; color:var(--content-text-dark);">
                        <p><strong>ID:</strong> ${record.id}</p>
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
                    DeliveryStore.addDelivery(record); 
                    Utils.showDashboardFeedback(`Registro Manual ${record.id} Salvo!`);
                    dom.manualDeliveryId.value = '';
                } else {
                    Utils.showFeedback(`Registro Manual ${record.id} Cancelado!`, Utils.varCss('--danger'));
                }
                dom.manualInputContainer.style.opacity = '0';
                dom.manualInputContainer.style.pointerEvents = 'none';
            });
        },
        
        handleMarkAsDelivered: function(recordId) {
            const record = DeliveryStore.getDeliveryById(recordId); 
            
            if (!record) { 
                Swal.fire({ icon: 'error', title: 'Erro', text: 'Registro não encontrado.' });
                return;
            }

            if (record.status !== 'pending') {
                 Swal.fire({
                    title: 'Entrega Já Confirmada', 
                    text: `A entrega ${recordId} já foi marcada como ${record.status.toUpperCase()}.`, 
                    icon: 'info',
                    confirmButtonText: 'OK'
                });
                return;
            }

            Swal.fire({
                title: `Recebedor da Entrega ${recordId}`, 
                input: 'text', 
                inputLabel: 'Nome completo do recebedor:',
                inputPlaceholder: 'Digite o nome aqui', 
                showCancelButton: true, 
                confirmButtonText: 'Confirmar Entrega',
                cancelButtonText: 'Cancelar',
                inputValidator: (value) => { if (!value) { return 'Você precisa digitar o nome do recebedor!' } }
            }).then((result) => {
                if (result.isConfirmed) {
                    DeliveryStore.updateDeliveryStatus(recordId, 'delivered', result.value);
                    Utils.showDashboardFeedback(`Entrega ${recordId} confirmada!`);
                    this.navigateTo('dashboard'); 
                }
            });
        },
        
        handleRegisterOccurrence: function(recordId) {
            Swal.fire({
                title: 'Tipo de Ocorrência',
                input: 'select',
                inputOptions: {
                    'occurrence': 'Ocorrência (Geral)',
                    'canceled': 'Cancelado',
                    'refused': 'Recusado pelo Cliente',
                    'address_error': 'Erro de Endereço',
                    'other': 'Outro Motivo'
                },
                inputPlaceholder: 'Selecione o Status',
                showCancelButton: true,
                confirmButtonText: 'Registrar',
                cancelButtonText: 'Voltar',
                inputValidator: (value) => {
                    if (!value) {
                        return 'Você precisa selecionar um status!';
                    }
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    const statusType = result.value;
                    let newStatus;
                    let recebedor = null; 
                    
                    if (statusType === 'canceled') {
                        newStatus = 'Canceled';
                    } else {
                        newStatus = `Occurrence: ${statusType}`;
                    }
                    
                    DeliveryStore.updateDeliveryStatus(recordId, newStatus, recebedor);
                    Utils.showDashboardFeedback(`Entrega ${recordId} marcada como ${newStatus}.`);
                    this.navigateTo('dashboard');
                }
            });
        },

        handleMultipleDeliverySubmission: function(recordIds) {
            const form = document.getElementById('multipleDeliveryForm');
            const allRecordsDelivered = [];
            let allValid = true;

            recordIds.forEach(recordId => {
                const recebedorInput = form.querySelector(`#recebedor_${recordId}`);
                const recebedor = recebedorInput ? recebedorInput.value.trim() : '';
                
                if (!recebedor) { 
                    allValid = false; 
                    recebedorInput.style.border = '2px solid var(--danger)'; 
                    recebedorInput.focus(); 
                    return; 
                }
                recebedorInput.style.border = '1px solid #ccc'; 
                allRecordsDelivered.push({ id: recordId, recebedor: recebedor });
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
                        let successCount = 0;
                        allRecordsDelivered.forEach(item => {
                            const success = DeliveryStore.updateDeliveryStatus(item.id, 'delivered', item.recebedor);
                            if (success) successCount++;
                        });
                        
                        Utils.showDashboardFeedback(`Baixa simultânea concluída para ${successCount} pacotes!`);
                        this.navigateTo('dashboard');
                    }
                });
            } else {
                Swal.fire('Atenção', 'Preencha o nome do recebedor para todos os pacotes antes de finalizar.', 'warning');
            }
        },
        
        // --- Exportação ---
        toggleExportOptions: function() {
            dom.exportOptions.style.display = dom.exportOptions.style.display === 'flex' ? 'none' : 'flex';
        },
        
        handleExport: function(filter) {
            const allRecords = DeliveryStore.getDeliveries();
            let filteredRecords = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (filter === 'daily') {
                filteredRecords = allRecords.filter(r => new Date(r.date) >= today);
            } else if (filter === 'weekly') {
                const oneWeekAgo = new Date(today);
                oneWeekAgo.setDate(today.getDate() - 7);
                filteredRecords = allRecords.filter(r => new Date(r.date) >= oneWeekAgo);
            } else if (filter === 'monthly') {
                const oneMonthAgo = new Date(today);
                oneMonthAgo.setMonth(today.getMonth() - 1);
                filteredRecords = allRecords.filter(r => new Date(r.date) >= oneMonthAgo);
            } else {
                filteredRecords = allRecords;
            }

            if(!filteredRecords.length) return Swal.fire('Aviso', `Nenhum dado encontrado para o filtro: ${filter}.`, 'warning');
            
            let csv = 'ID,TIPO,DATA,HORA,USUARIO,LAT,LON,RAW,STATUS,NOME_CLIENTE,ENDERECO_CLIENTE,TELEFONE_CLIENTE,RECEBEDOR\n'; 
            filteredRecords.forEach(r => {
                const scanDate = new Date(r.date);
                const dateStr = scanDate.toLocaleDateString('pt-BR');
                const timeStr = scanDate.toLocaleTimeString('pt-BR');
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
        },

        // --- CRUD de Usuários ---
        handleCreateUser: function(user, pass, role) {
            const users = DeliveryStore.getUsers();
            if (users.some(u => u.username === user)) {
                return { success: false, message: 'Usuário já existe.' };
            }
            
            const newId = 'u' + (users.length + 1);
            const newUser = { 
                id: newId, 
                username: user, 
                password: pass, 
                role: role,
                creatorId: currentUser.id
            };
            users.push(newUser);
            DeliveryStore.updateUsers(users);
            return { success: true, message: `Usuário ${user} criado com sucesso!` };
        },

        handleUpdateUser: function(id, newUsername, newPassword, newRole) {
            const users = DeliveryStore.getUsers();
            const index = users.findIndex(u => u.id === id);

            if (index === -1) {
                return { success: false, message: 'Usuário não encontrado.' };
            }

            const user = users[index];
            if (user.id !== currentUser.id && currentUser.role !== 'admin' && currentUser.role !== 'gestor') {
                return { success: false, message: 'Sem permissão para editar outros usuários.' };
            }

            user.username = newUsername;
            user.password = newPassword || user.password; 
            user.role = newRole; 

            DeliveryStore.updateUsers(users);
            return { success: true, message: `Usuário ${user.username} atualizado!` };
        },

        handleDeleteUser: function(id) {
            if (currentUser.role !== 'admin') {
                return { success: false, message: 'Apenas Administradores podem excluir usuários.' };
            }
            if (id === currentUser.id) {
                return { success: false, message: 'Você não pode excluir a si mesmo.' };
            }
            
            const users = DeliveryStore.getUsers().filter(u => u.id !== id);
            DeliveryStore.updateUsers(users);
            return { success: true, message: 'Usuário excluído com sucesso.' };
        },
    };
    
    // As funções Views e Utils teriam que ser definidas aqui ou importadas de outros arquivos
    // Para fins de demonstração, assumimos que elas existem e definimos o básico aqui.

    const Views = {
        renderDashboard: function() {
            // Lógica para renderizar o dashboard
            dom.contentArea.innerHTML = `<h2>Dashboard</h2><p>Exibindo um resumo das entregas e rotas...</p>`;
            // ... (código completo de renderização do dashboard aqui)
        },
        renderSingleDetails: function(recordId) {
            // Lógica para renderizar detalhes de uma única entrega
            dom.contentArea.innerHTML = `<h2>Detalhes da Entrega ${recordId}</h2><p>Informações detalhadas...</p>`;
        },
        renderMultipleDeliveryForm: function(records) {
             // Lógica para renderizar o formulário de baixa múltipla
             dom.contentArea.innerHTML = `<h2>Baixa Múltipla</h2><p>Formulário para baixa simultânea...</p>`;
        },
        renderUsers: function() {
             // Lógica para renderizar a gestão de usuários
             dom.contentArea.innerHTML = `<h2>Gestão de Usuários</h2><p>Tabela de usuários e formulário de cadastro...</p>`;
        },
        renderMap: function() {
             // Lógica para renderizar o mapa
             dom.contentArea.innerHTML = `<div id="map-content"><div id="map" style="height: 100%;"></div></div>`;
             // Lógica de inicialização do Leaflet aqui...
        },
        renderRoutes: function() {
             // Lógica para renderizar rotas
             dom.contentArea.innerHTML = `<h2>Otimização de Rotas</h2><p>Visualização e cálculo de rotas...</p>`;
        },
        updateMapLocation: function() {
             // Lógica para atualizar a posição no mapa
             if (mapInstance && userLocation && locationMarker) {
                 locationMarker.setLatLng([userLocation.lat, userLocation.lon]);
             }
        }
    };

    const Utils = {
        beep: function() {
            // Simula um som de beep
             console.log('BEEP!');
        },
        showFeedback: function(msg, color) {
            dom.feedback.textContent = msg;
            dom.feedback.style.backgroundColor = color;
            dom.feedback.style.opacity = '1';
            setTimeout(() => { dom.feedback.style.opacity = '0'; }, 3000);
        },
        showDashboardFeedback: function(msg) {
             const fb = document.getElementById('dashboardFeedback');
             fb.textContent = msg;
             fb.classList.remove('hidden');
             fb.classList.add('show');
             setTimeout(() => { fb.classList.remove('show'); fb.classList.add('hidden'); }, 4000);
        },
        varCss: function(name) {
             // Obtém o valor de uma variável CSS
             return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        },
        parsePayload: function(data, location, user) {
             // Simulação de parsing e enriquecimento de dados
             const idPart = data.substring(0, 10);
             const randomId = idPart + Math.random().toString(36).substring(2, 6);
             return {
                 id: randomId,
                 raw: data,
                 user: user ? user.username : 'unknown',
                 date: Date.now(),
                 lat: location ? location.lat : CD_LOCATION.lat,
                 lon: location ? location.lon : CD_LOCATION.lon,
                 status: 'pending',
                 // Dados simulados baseados no ID
                 clientName: `Cliente ${randomId.slice(-4)}`,
                 clientAddress: `Rua Simulação ${parseInt(randomId, 36) % 100}`,
                 clientPhone: `(11) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`,
                 type: 'Package'
             };
        }
    };

    // Inicializa a aplicação
    AppController.init();
    // Por padrão, a tela de login é a primeira a aparecer.
    // O AppController.handleLogin() se encarregará de chamar AppController.navigateTo('dashboard');
});
