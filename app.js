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

    // Referências DOM
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

    /* ========================================================= */
    /* II. STORES E ADAPTADORES (CAMADA DE DADOS ISOLADA)        */
    /* ========================================================= */
    
    /**
     * Adaptador LocalStore: Lida diretamente com o localStorage.
     */
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
                    if(window.innerWidth > 768) { dom.sidebar.classList.add('hidden'); } else { dom.sidebar.classList.remove('active'); }
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
            
            if (window.innerWidth > 768) { 
                dom.sidebar.classList.remove('hidden'); 
                // Garante o layout com a sidebar visível
                dom.appContainer.style.gridTemplateColumns = '392px 1fr'; 
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
            
            let users = DeliveryStore.getUsers().filter(u => u.id !== id);
            DeliveryStore.updateUsers(users);
            return { success: true, message: 'Usuário excluído com sucesso.' };
        }
    };

    /**
     * Views: Funções de renderização de interface.
     */
    const Views = {
        renderDashboard: function() {
            AppController.showContent();
            
            if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
                dom.adminMenuOptions.classList.remove('hidden');
            } else {
                dom.adminMenuOptions.classList.add('hidden');
            }
            
            const records = DeliveryStore.getDeliveries(); 
            
            const html = `
                <h2>📦 Entregas Realizadas (${records.length} total)</h2>
                <p style="color:var(--content-text-dark)">Clique em um item para ver os detalhes da entrega.</p>
                <div style="display:grid; gap:10px; margin-top:20px;">
                    ${records.map(r => {
                        let statusColor;
                        if (r.status === 'delivered') statusColor = Utils.varCss('--success');
                        else if (r.status.startsWith('Occurrence') || r.status === 'Canceled') statusColor = Utils.varCss('--danger');
                        else statusColor = Utils.varCss('--accent'); 
                        
                        const actionText = r.status.toUpperCase();
                        
                        return `
                            <div onclick="AppController.navigateTo('details', '${r.id}')" 
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
        },

        renderSingleDetails: function(recordId) {
            AppController.showContent();
            const record = DeliveryStore.getDeliveryById(recordId); 
            if (!record) { dom.contentArea.innerHTML = `<h2>Erro</h2><p>Registro de entrega não encontrado.</p>`; return; }

            const relatedRecords = DeliveryStore.getRecordsByLocation(recordId);
            const pendingRecords = relatedRecords.filter(r => r.status === 'pending');
            
            if (pendingRecords.length > 1 && record.status === 'pending') {
                Swal.fire({
                    title: '📍 Múltiplas Entregas no Local',
                    html: `<p>Foram encontradas **${relatedRecords.length}** entregas neste endereço, sendo **${pendingRecords.length}** ainda pendentes. Deseja dar baixa simultânea?</p>`,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: `✅ Sim, Baixa Múltpla (${pendingRecords.length})`,
                    cancelButtonText: 'Não, Ver Detalhes Deste Item'
                }).then((result) => {
                    if (result.isConfirmed) {
                        const pendingIds = pendingRecords.map(r => r.id);
                        AppController.navigateTo('multipleDelivery', pendingIds);
                    } else {
                        Views.renderSingleDetailsContent(record, recordId);
                    }
                });
                return; 
            }
            Views.renderSingleDetailsContent(record, recordId);
        },
        
        renderSingleDetailsContent: function(record, recordId) {
            const allRecords = DeliveryStore.getDeliveries().map(r => r.id);
            const currentIndex = allRecords.indexOf(recordId);
            const prevId = currentIndex > 0 ? allRecords[currentIndex - 1] : null;
            const nextId = currentIndex < allRecords.length - 1 ? allRecords[currentIndex + 1] : null;
            const isPending = record.status === 'pending';
            
            let statusColor;
            if (record.status === 'delivered') statusColor = Utils.varCss('--success');
            else if (record.status.startsWith('Occurrence') || record.status === 'Canceled') statusColor = Utils.varCss('--danger');
            else statusColor = Utils.varCss('--accent'); 

            dom.contentArea.innerHTML = `
                <h2>Detalhes da Entrega</h2>
                <div class="user-form-card" style="padding: 20px;">
                    <div id="detailMapObj" style="height:250px; border-radius:12px; margin-bottom:15px;"></div>

                    <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom: 20px;">
                        <button onclick="${prevId ? `AppController.navigateTo('details', '${prevId}')` : ''}" style="flex:1; padding:15px; background:${prevId ? Utils.varCss('--accent') : '#ccc'}; color:${prevId ? Utils.varCss('--content-text-dark') : '#666'}; border-radius:10px; box-shadow:none;" ${!prevId ? 'disabled' : ''}>
                            ⬅️ Anterior
                        </button>
                        <button onclick="${nextId ? `AppController.navigateTo('details', '${nextId}')` : ''}" style="flex:1; padding:15px; background:${nextId ? Utils.varCss('--accent') : '#ccc'}; color:${nextId ? Utils.varCss('--content-text-dark') : '#666'}; border-radius:10px; box-shadow:none;" ${!nextId ? 'disabled' : ''}>
                            Próximo ➡️
                        </button>
                    </div>

                    <div style="margin-bottom: 20px; padding:15px; border:1px solid #ddd; border-radius:10px; background:var(--content-bg-light); color:var(--content-text-dark);">
                        <div style="font-weight:bold; font-size:18px; margin-bottom:5px;">${record.id} - ${record.clientName}</div>
                        <div style="font-size:16px;">${record.clientAddress}</div>
                        <div style="font-size:14px; color:#6b7280; margin-top:5px;">
                            Tipo: ${record.type} • Status: <span style="font-weight:bold; color:${statusColor};">${record.status.toUpperCase()}</span>
                            ${record.receivedBy ? `(Recebido por: ${record.receivedBy})` : ''}
                        </div>
                    </div>

                    <button onclick="Utils.openContactOptions('${record.clientPhone}', '${record.id}')" 
                            style="width:100%; padding:15px; background:var(--success); color:white; font-size:16px; font-weight:bold; border-radius:10px; margin-bottom:15px; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.3);">
                        📞 Toque para ligar / WhatsApp: ${record.clientPhone}
                    </button>
                    
                    <div style="margin-top: 15px; padding:15px; border:1px solid #ddd; border-radius:10px;">
                        <p style="font-weight:bold; margin-bottom:10px; color:var(--content-text-dark);">Ação de Transferência/Reajuste</p>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="transferTarget" placeholder="ID do Entregador para Transferir" style="flex:1; margin-bottom:0; padding:10px; border-radius:8px; border:1px solid #ccc;">
                            <button onclick="Swal.fire('Transferir', 'Entrega ${recordId} transferida para ID: ' + document.getElementById('transferTarget').value, 'info')" 
                                    style="background:var(--accent); color:var(--content-text-dark); padding:10px 15px; border-radius:8px; font-weight:bold; box-shadow:none;">
                                Transferir
                            </button>
                        </div>
                    </div>

                    ${isPending ? `
                    <div style="display:flex; justify-content:space-between; gap:10px; margin-top: 20px;">
                        <button onclick="AppController.handleRegisterOccurrence('${recordId}')" style="flex:1; padding:15px; background:rgba(239, 68, 68, 0.2); color:var(--danger); font-weight:bold; border-radius:10px; box-shadow:none;">
                            ⚠️ Ocorrência / Cancelar
                        </button>
                        <button onclick="AppController.handleMarkAsDelivered('${recordId}')" style="flex:1; padding:15px; background:var(--success); color:white; font-weight:bold; border-radius:10px; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.3);">
                            ✅ Entregar
                        </button>
                    </div>
                    ` : `
                    <p style="text-align:center; color:${statusColor}; font-weight:bold; margin-top:20px; padding:15px; border:1px solid #ddd; border-radius:10px;">
                        Status: ${record.status.toUpperCase()} ${record.receivedBy ? `(Recebedor: ${record.receivedBy})` : ''}
                    </p>
                    `}
                </div>
            `;
            Views.initializeDetailMap(record);
        },

        initializeDetailMap: function(record) {
            if (mapInstance) mapInstance.remove();
            
            const latLng = [record.lat, record.lon];
            mapInstance = L.map('detailMapObj').setView(latLng, 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(mapInstance);
            
            L.marker(latLng).addTo(mapInstance)
                .bindPopup(`**${record.clientAddress}**`).openPopup();
            
            setTimeout(() => { 
                mapInstance.invalidateSize(); 
                mapInstance.setView(latLng, 15);
            }, 300);
        },

        renderMultipleDeliveryForm: function(recordIds) {
            AppController.showContent();
            
            const recordsToDeliver = recordIds.map(id => DeliveryStore.getDeliveryById(id)).filter(r => r && r.status === 'pending');
            
            if (recordsToDeliver.length === 0) {
                const primaryId = recordIds.find(id => DeliveryStore.getDeliveryById(id));
                const targetView = primaryId ? 'details' : 'dashboard';
                const targetParam = primaryId ? primaryId : null;

                dom.contentArea.innerHTML = `<h2>Aviso</h2><p>Nenhuma entrega pendente para dar baixa neste local.</p>`;
                setTimeout(() => AppController.navigateTo(targetView, targetParam), 1500);
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
                                <div style="font-size:14px; color:var(--content-text-dark); margin-bottom:10px;">
                                    Destinatário: **${record.clientName}**
                                </div>
                                <label for="recebedor_${record.id}" style="font-size:14px;">Nome do Recebedor:</label>
                                <input type="text" id="recebedor_${record.id}" name="recebedor_${record.id}" required 
                                       placeholder="Nome do Cliente, Porteiro, etc." style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc;">
                            </div>
                        `).join('')}

                        <button type="submit" class="btn-primary" style="width:100%; padding:15px; background:var(--success); font-size:18px; font-weight:bold; margin-top:20px; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.3);">
                            Finalizar Baixa de ${recordsToDeliver.length} Pacotes
                        </button>
                    </form>
                </div>
            `;
            
            document.getElementById('multipleDeliveryForm').addEventListener('submit', (e) => {
                e.preventDefault();
                AppController.handleMultipleDeliverySubmission(recordIds);
            });
        },

        /* --- MAPAS - Implementação Completa --- */
        renderMap: function() {
            AppController.showContent();
            
            dom.contentArea.innerHTML = `
                <h2>🗺️ Mapa de Entregas Pendentes</h2>
                <div id="mapContainer" style="height: 500px; border-radius: 12px; margin-bottom: 20px;"></div>
                <div id="mapStats" class="user-form-card" style="padding:15px;">
                    <p>Visualização de todos os pontos de entrega pendentes.</p>
                    <div id="mapLegend" style="display:flex; gap:20px; font-size:14px; margin-top:10px;">
                        <span style="color:${Utils.varCss('--accent')}; font-weight:bold;">● Entregas Pendentes</span>
                        <span style="color:#333; font-weight:bold;">⚫ CD / Sua Localização</span>
                    </div>
                </div>
            `;
            Views.initializeFullMap(false); // false = modo mapa
        },
        
        renderRoutes: function() {
            AppController.showContent();
            
            dom.contentArea.innerHTML = `
                <h2>🧭 Rota Otimizada</h2>
                <div id="mapContainer" style="height: 500px; border-radius: 12px; margin-bottom: 20px;"></div>
                
                <div id="routeDetails" class="user-form-card" style="padding:15px; border-left: 5px solid ${Utils.varCss('--accent')};">
                     <h3>Detalhes da Rota (Partida: CD)</h3>
                     <div id="routeList" style="width:100%;">
                         <p style="text-align:center; color:var(--muted)">Calculando rota...</p>
                     </div>
                </div>
            `;
            Views.initializeFullMap(true); // true = modo rotas
        },

        initializeFullMap: function(isRouteMode) {
            if (mapInstance) mapInstance.remove();
            
            const pendingDeliveries = DeliveryStore.getDeliveries().filter(r => r.status === 'pending');
            const mapDiv = document.getElementById('mapContainer');
            
            if (!mapDiv) return;

            const startPoint = isRouteMode ? CD_LOCATION : userLocation || CD_LOCATION;
            const startLatLng = [startPoint.lat, startPoint.lon];

            mapInstance = L.map('mapContainer').setView(startLatLng, 13);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            }).addTo(mapInstance);

            // Marcador do CD / Usuário
            locationMarker = L.marker(startLatLng, {
                icon: L.divIcon({
                    className: 'custom-start-icon',
                    html: `<div style="background-color: black; color: white; border-radius: 50%; width: 30px; height: 30px; text-align: center; line-height: 30px; font-weight: bold;">${isRouteMode ? 'CD' : '🚚'}</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 30]
                })
            }).addTo(mapInstance)
              .bindPopup(isRouteMode ? 'Centro de Distribuição' : 'Sua Localização Atual')
              .openPopup();

            if (isRouteMode) {
                // Modo Rotas: Usar Leaflet Routing Machine
                const optimizedOrder = Views.optimizeRoute(pendingDeliveries, CD_LOCATION);
                
                if (optimizedOrder.length === 0) {
                     document.getElementById('routeList').innerHTML = `<p style="text-align:center;">Nenhuma entrega pendente para otimizar.</p>`;
                     mapInstance.setView(startLatLng, 13);
                     return;
                }

                const waypoints = [
                    L.latLng(CD_LOCATION.lat, CD_LOCATION.lon), // Ponto de Partida
                    ...optimizedOrder.map(r => L.latLng(r.lat, r.lon))
                ];

                L.Routing.control({
                    waypoints: waypoints,
                    routeWhileDragging: false,
                    altLineOptions: { extendSegmentGradients: true, suppressReplacement: false },
                    showAlternatives: false,
                    lineOptions: {
                        styles: [{ color: Utils.varCss('--accent'), opacity: 0.8, weight: 6 }]
                    },
                    createMarker: function(i, waypoint, n) {
                        const isStart = i === 0;
                        
                        if (isStart) {
                            return locationMarker;
                        }

                        const record = optimizedOrder[i - 1]; 
                        const iconNumber = i;

                        return L.marker(waypoint.latLng, {
                            icon: L.divIcon({
                                className: 'custom-route-icon',
                                html: `<div style="background-color: ${Utils.varCss('--accent')}; color: white; border-radius: 50%; width: 25px; height: 25px; text-align: center; line-height: 25px; font-weight: bold;">${iconNumber}</div>`,
                                iconSize: [25, 25],
                                iconAnchor: [12, 25]
                            })
                        }).bindPopup(`<strong>Parada ${iconNumber}:</strong> ${record.clientName}<br>ID: ${record.id}<br><button onclick="AppController.navigateTo('details', '${record.id}')">Ver Detalhes</button>`);
                    }
                }).on('routesfound', (e) => {
                    Views.updateRouteList(e.routes[0].coordinates, optimizedOrder);
                }).addTo(mapInstance);

            } else {
                // Modo Mapa: Plota todos os pendentes
                pendingDeliveries.forEach(record => {
                    L.marker([record.lat, record.lon]).addTo(mapInstance)
                        .bindPopup(`<strong>${record.clientName}</strong><br>ID: ${record.id}<br><button onclick="AppController.navigateTo('details', '${record.id}')">Ver Detalhes</button>`);
                });
                
                const allPoints = pendingDeliveries.map(r => [r.lat, r.lon]);
                if (allPoints.length > 0) {
                     const bounds = L.latLngBounds([startLatLng, ...allPoints]);
                     mapInstance.fitBounds(bounds, { padding: [50, 50] });
                }
            }
            
            setTimeout(() => { mapInstance.invalidateSize(); }, 50);
        },
        
        updateMapLocation: function() {
            if (!mapInstance || !locationMarker || !userLocation) return;
            const latlng = [userLocation.lat, userLocation.lon];
            locationMarker.setLatLng(latlng);
            if (dom.contentArea.innerHTML.includes('Mapa de Entregas Pendentes')) {
                 locationMarker.setPopupContent('Sua Localização Atual').openPopup();
            }
        },
        
        // Heurística de Vizinho Mais Próximo para Otimização (Simulação)
        optimizeRoute: function(deliveries, startLocation) {
             if (deliveries.length === 0) return [];

             const distance = (loc1, loc2) => {
                 return Math.sqrt(
                     Math.pow(loc1.lat - loc2.lat, 2) + 
                     Math.pow(loc1.lon - loc2.lon, 2)
                 );
             };

             let currentLoc = startLocation;
             let unvisited = [...deliveries];
             let optimized = [];

             while (unvisited.length > 0) {
                 let nearestIndex = -1;
                 let minDistance = Infinity;

                 unvisited.forEach((delivery, index) => {
                     const dist = distance(currentLoc, delivery);
                     if (dist < minDistance) {
                         minDistance = dist;
                         nearestIndex = index;
                     }
                 });

                 if (nearestIndex !== -1) {
                     const nextDelivery = unvisited[nearestIndex];
                     optimized.push(nextDelivery);
                     currentLoc = nextDelivery;
                     unvisited.splice(nearestIndex, 1);
                 }
             }
             return optimized;
        },
        
        updateRouteList: function(routeCoordinates, optimizedOrder) {
            const routeListElement = document.getElementById('routeList');
            if (routeListElement) {
                 routeListElement.innerHTML = `
                    <div class="route-details-card" style="border-left-color: black;"><strong>Início:</strong> Centro de Distribuição</div>
                    ${optimizedOrder.map((record, index) => `
                        <div class="route-details-card" style="border-left-color: ${Utils.varCss('--accent')};" data-delivery-id="${record.id}">
                            <strong>${index + 1}. ${record.clientName}</strong>
                            <p style="margin: 5px 0 0 0; font-size: 14px;">Endereço: ${record.clientAddress}</p>
                            <p style="margin: 0; font-size: 12px; color: var(--muted);">ID: ${record.id}</p>
                        </div>
                    `).join('')}
                    <div class="route-details-card" style="border-left-color: black;"><strong>Fim:</strong> Rota Concluída!</div>
                `;
                
                 document.querySelectorAll('.route-details-card[data-delivery-id]').forEach(card => {
                    card.style.cursor = 'pointer';
                    card.addEventListener('click', (e) => {
                        const id = card.dataset.deliveryId;
                        if (id) AppController.navigateTo('details', id);
                    });
                });
            }
        },
        
        /* --- CRUD de Usuários - Implementação Completa --- */
        renderUsers: function() {
            AppController.showContent();
            if (currentUser.role !== 'admin' && currentUser.role !== 'gestor') {
                 dom.contentArea.innerHTML = `<h2>🚫 Acesso Negado</h2><p>Você não tem permissão para acessar esta área.</p>`;
                 return;
            }
            
            const users = DeliveryStore.getUsers();
            
             dom.contentArea.innerHTML = `
                <h2>👥 Gerenciamento de Usuários</h2>
                <p style="color:var(--content-text-dark);">Apenas Admin/Gestor podem gerenciar usuários. Admin pode deletar.</p>
                <button id="btnAddUser" class="btn-primary" style="margin-bottom: 20px;">+ Adicionar Novo Usuário</button>

                <div id="userList" style="display:grid; gap:10px; margin-top:20px;">
                    ${users.map(u => `
                        <div class="user-form-card" data-user-id="${u.id}" style="border-left:4px solid ${u.role === 'admin' ? Utils.varCss('--danger') : (u.role === 'gestor' ? Utils.varCss('--accent') : Utils.varCss('--success'))}; padding:15px; cursor:pointer;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                 <div style="font-weight:bold; font-size:16px">${u.username} <span style="font-size:12px; font-weight:normal; color:#6b7280;">(${u.id})</span></div>
                                 <div style="font-weight:bold; color:${u.role === 'admin' ? Utils.varCss('--danger') : Utils.varCss('--accent')};">${u.role.toUpperCase()}</div>
                            </div>
                            <div style="margin-top:10px; text-align:right;">
                                 <button onclick="Views.showEditUserModal('${u.id}')" class="btn-secondary" style="margin-right:5px; padding:5px 10px;">✏️ Editar</button>
                                 ${(currentUser.role === 'admin' && u.id !== currentUser.id) ? 
                                 `<button onclick="Views.showDeleteUserConfirm('${u.id}')" class="btn-danger" style="padding:5px 10px; background-color:var(--danger); color:white;">🗑️ Deletar</button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
            document.getElementById('btnAddUser').addEventListener('click', Views.showCreateUserModal);
        },
        
        showCreateUserModal: function() {
            const users = DeliveryStore.getUsers();
            Swal.fire({
                title: 'Novo Usuário',
                html: Views.getUserFormHtml(null),
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Criar Usuário',
                preConfirm: () => {
                    const username = document.getElementById('swal-user').value.trim();
                    const password = document.getElementById('swal-pass').value.trim();
                    const role = document.getElementById('swal-role').value;
                    if (!username || !password) {
                        Swal.showValidationMessage('Preencha Usuário e Senha');
                        return false;
                    }
                    const result = AppController.handleCreateUser(username, password, role);
                    if (!result.success) {
                         Swal.showValidationMessage(result.message);
                         return false;
                    }
                    return true;
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    Views.renderUsers();
                    Utils.showDashboardFeedback('Usuário criado com sucesso!');
                }
            });
        },

        showEditUserModal: function(userId) {
            const user = DeliveryStore.getUsers().find(u => u.id === userId);
            if (!user) return;

            Swal.fire({
                title: `Editar Usuário: ${user.username}`,
                html: Views.getUserFormHtml(user),
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Salvar Alterações',
                preConfirm: () => {
                    const username = document.getElementById('swal-user').value.trim();
                    const password = document.getElementById('swal-pass').value.trim();
                    const role = document.getElementById('swal-role').value;
                    
                    if (!username) {
                        Swal.showValidationMessage('O nome de usuário não pode ser vazio.');
                        return false;
                    }

                    if (user.role !== role && currentUser.role !== 'admin' && user.id !== currentUser.id) {
                         Swal.showValidationMessage('Você não tem permissão para alterar o cargo deste usuário.');
                         return false;
                    }

                    const result = AppController.handleUpdateUser(userId, username, password, role);
                    if (!result.success) {
                         Swal.showValidationMessage(result.message);
                         return false;
                    }
                    return true;
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    Views.renderUsers();
                    Utils.showDashboardFeedback('Usuário atualizado!');
                    if (userId === currentUser.id) {
                        document.getElementById('displayUser').textContent = DeliveryStore.getUsers().find(u => u.id === userId).username + ` (${user.role})`;
                    }
                }
            });
        },

        showDeleteUserConfirm: function(userId) {
            Swal.fire({
                title: 'Tem certeza?',
                text: "Você não poderá reverter esta ação!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: Utils.varCss('--danger'),
                cancelButtonColor: Utils.varCss('--accent'),
                confirmButtonText: 'Sim, deletar!',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    const deleteResult = AppController.handleDeleteUser(userId);
                    if (deleteResult.success) {
                        Views.renderUsers();
                        Utils.showDashboardFeedback(deleteResult.message);
                    } else {
                        Swal.fire('Erro', deleteResult.message, 'error');
                    }
                }
            });
        },

        getUserFormHtml: function(user) {
            const isAdmin = currentUser.role === 'admin';
            const isSelf = user && user.id === currentUser.id;
            const currentRole = user ? user.role : 'colaborador';

            return `
                <input id="swal-user" class="swal2-input" placeholder="Usuário" value="${user ? user.username : ''}">
                <input id="swal-pass" type="password" class="swal2-input" placeholder="${user ? 'Deixe vazio para manter a senha' : 'Senha obrigatória'}" style="margin-bottom:10px;">
                <select id="swal-role" class="swal2-input" style="width: 85%; margin: 10px 0;" ${!(isAdmin || isSelf) ? 'disabled' : ''}>
                    <option value="colaborador" ${currentRole === 'colaborador' ? 'selected' : ''}>Colaborador</option>
                    <option value="gestor" ${currentRole === 'gestor' ? 'selected' : ''}>Gestor</option>
                    ${isAdmin ? `<option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Admin</option>` : ''}
                </select>
            `;
        }
    };

    /* ========================================================= */
    /* IV. UTILS: Funções auxiliares                             */
    /* ========================================================= */

    /**
     * Utils: Funções auxiliares (Beep, Feedback, Parsing).
     */
    const Utils = {
        showFeedback: function(message, color) {
            dom.feedback.textContent = message;
            dom.feedback.style.backgroundColor = color;
            dom.feedback.style.color = 'white'; 
            dom.feedback.style.opacity = '1';

            if (this.feedbackTimeout) clearTimeout(this.feedbackTimeout);
            this.feedbackTimeout = setTimeout(() => {
                dom.feedback.style.opacity = '0';
            }, 3000);
        },
        
        showDashboardFeedback: function(message) {
            Swal.fire({
                icon: 'success',
                title: 'Ação Realizada!',
                text: message,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
        },

        beep: function() {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.type = 'square'; 
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); 
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); 
            
            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
            }, 100); 
        },

        parsePayload: function(payload, location, user) {
            const isComplex = payload.includes('|'); 
            const deliveryId = isComplex ? payload.split('|')[0] : payload;
            
            const nameSeed = deliveryId.length > 5 ? deliveryId.substring(deliveryId.length - 5) : 'XXXXX';
            const randomLatOffset = (Math.random() - 0.5) * 0.005; // 500m
            const randomLonOffset = (Math.random() - 0.5) * 0.005;
            
            return {
                id: deliveryId,
                type: isComplex ? 'Package-Complex' : 'Package-Simple',
                date: Date.now(),
                user: user.username,
                lat: location ? location.lat : CD_LOCATION.lat + randomLatOffset,
                lon: location ? location.lon : CD_LOCATION.lon + randomLonOffset,
                raw: payload,
                status: 'pending',
                clientName: `Cliente ${nameSeed.toUpperCase()}`,
                clientAddress: `Rua Simulação, ${Math.floor(Math.random() * 900) + 100}`,
                clientPhone: `(11) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`
            };
        },
        
        openContactOptions: function(phone, id) {
            const whatsappUrl = `https://wa.me/55${phone.replace(/\D/g, '')}?text=Olá!%20Sou%20o%20entregador%20e%20estou%20com%20a%20sua%20entrega%20${id}.%20Poderia%20confirmar%20se%20está%20no%20local?`;

            Swal.fire({
                title: 'Opções de Contato',
                html: `<p>Como deseja entrar em contato com o cliente?</p>`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Abrir WhatsApp',
                cancelButtonText: 'Ligar',
                showDenyButton: true,
                denyButtonText: 'Voltar'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.open(whatsappUrl, '_blank');
                } else if (result.dismiss === Swal.DismissReason.cancel) {
                    window.location.href = `tel:${phone}`;
                }
            });
        },

        varCss: function(name) {
            return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        }
    };

    /* ========================================================= */
    /* V. INICIALIZAÇÃO E EXPOSIÇÃO GLOBAL                       */
    /* ========================================================= */

    // Expõe a função para que os botões de menu móvel funcionem
    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');
    
    // Inicia a aplicação após o carregamento do DOM
    AppController.init();
    
    // Garante que o estado inicial seja a tela de Login
    Views.renderLoginScreen = function() {
        dom.loginSection.classList.remove('hidden');
        dom.appContainer.classList.add('hidden');
        dom.mobileMenuBtn.classList.add('hidden');
    };
    Views.renderLoginScreen();
    
    // Inicia a tela principal se as credenciais de exemplo estiverem preenchidas
    const initialUser = document.getElementById('loginUser').value;
    const initialPass = document.getElementById('loginPass').value;
    if (initialUser && initialPass) {
        AppController.handleLogin();
    }
});
