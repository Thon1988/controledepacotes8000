document.addEventListener('DOMContentLoaded', () => {

    /* ========================================================= */
    /* I. CONFIGURAÇÕES E REFERÊNCIAS DOM                        */
    /* ========================================================= */

    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 }; 
    const STORAGE_KEY_USERS = 'pegazus_users_v5';
    const STORAGE_KEY_SCANS = 'pegazus_scans_v5';
    
    // Usuários Padrão (Agora gerenciados pelo LocalStore)
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
     * Esta é a camada que será trocada na migração (Fase 2).
     */
    const LocalStore = {
        loadDeliveries: function() {
            let records = JSON.parse(localStorage.getItem(STORAGE_KEY_SCANS) || '[]');
            // Inicialização de dados simulados (adicionada aqui para isolar)
            records.forEach(r => {
                if (!r.status) r.status = 'pending';
                if (!r.clientName) r.clientName = "Cliente Simulado " + r.id.slice(-4);
                if (!r.clientAddress) r.clientAddress = `Rua Fictícia, ${Math.floor(Math.random() * 50)} - Condomínio A`;
                if (!r.clientPhone) r.clientPhone = `(11) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;
                if (!r.lat) r.lat = CD_LOCATION.lat + (Math.random() - 0.5) * 0.01;
                if (!r.lon) r.lon = CD_LOCATION.lon + (Math.random() - 0.5) * 0.01;
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
            }
            return users;
        },

        saveUsers: function(data) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(data));
        }
    };
    
    // Define o adaptador de dados atual (Fase 1: LocalStore)
    const DataAdapter = LocalStore; 

    /**
     * DeliveryStore: Gerencia o estado da aplicação e as regras de negócio.
     * Ele chama o DataAdapter (LocalStore ou ExternalStore) para persistência.
     */
    const DeliveryStore = {
        // Estado inicial
        scanRecords: DataAdapter.loadDeliveries(),
        users: DataAdapter.loadUsers(),
        
        // Métodos de Entregas
        getDeliveries: function() { return this.scanRecords; },
        
        getDeliveryById: function(id) {
            return this.scanRecords.find(r => r.id === id);
        },
        
        // Novo: Adiciona uma entrega e salva
        addDelivery: function(record) {
            this.scanRecords.unshift(record);
            DataAdapter.saveDeliveries(this.scanRecords);
        },

        // Novo: Altera status e salva
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
        
        // Antiga lógica de agrupamento (Regra de Negócio)
        getRecordsByLocation: function(recordId) {
            const primaryRecord = this.getDeliveryById(recordId);
            if (!primaryRecord) return [];
            
            return this.scanRecords.filter(r => 
                r.clientAddress === primaryRecord.clientAddress
            );
        },

        // Métodos de Usuários
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
     * Todas as funções globais (window.*) que controlam a navegação serão movidas para cá.
     */
    const AppController = {
        init: function() {
            // Inicialização de Eventos
            document.getElementById('btnLogin').addEventListener('click', this.handleLogin);
            document.getElementById('btnLogout').addEventListener('click', this.handleLogout);
            document.getElementById('btnDashboard').addEventListener('click', () => this.navigateTo('dashboard'));
            document.getElementById('btnScanMode').addEventListener('click', () => this.navigateTo('scanner'));
            document.getElementById('btnMap').addEventListener('click', () => this.navigateTo('map'));
            document.getElementById('btnRoutes').addEventListener('click', () => this.navigateTo('routes'));
            document.getElementById('btnUsers').addEventListener('click', () => this.navigateTo('users'));
            dom.cameraSelect.addEventListener('change', (e) => { if(isScanning) this.startScanner(e.target.value); });
            dom.btnToggleManualInput.addEventListener('click', this.toggleManualInput);
            dom.btnManualConfirm.addEventListener('click', this.handleManualConfirm);
            
            // Exportação
            document.getElementById('btnExport').addEventListener('click', this.toggleExportOptions);
            document.getElementById('btnExportDaily').addEventListener('click', () => this.handleExport('daily'));
            document.getElementById('btnExportWeekly').addEventListener('click', () => this.handleExport('weekly'));
            document.getElementById('btnExportMonthly').addEventListener('click', () => this.handleExport('monthly'));
            document.getElementById('btnExportAll').addEventListener('click', () => this.handleExport('all'));
            
            // Inicialização da Geolocalização
            this.startGeolocation();
        },
        
        handleLogin: function() {
            const u = document.getElementById('loginUser').value.trim();
            const p = document.getElementById('loginPass').value.trim();
            const user = DeliveryStore.getUserByCredentials(u, p);
            
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

                AppController.navigateTo('dashboard');
                document.getElementById('loginError').textContent = '';
            } else {
                document.getElementById('loginError').textContent = 'Credenciais inválidas';
            }
        },

        handleLogout: function() {
            currentUser = null;
            AppController.stopScanner();
            dom.appContainer.classList.add('hidden');
            dom.loginSection.classList.remove('hidden'); 
            dom.mobileMenuBtn.classList.add('hidden');
            dom.contentArea.innerHTML = `<div style="text-align:center;margin-top:20vh;opacity:0.5; color:var(--content-text-dark)"><h2>Até logo</h2></div>`;
        },

        navigateTo: function(viewName, params = null) {
            // Lógica de limpar e parar scanner
            AppController.showContent();

            // Lógica de roteamento
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
                    Views.renderDeliveryDetails(params);
                    break;
                case 'multipleDelivery':
                    Views.renderMultipleDeliveryForm(params);
                    break;
                case 'users':
                    Views.renderUsers();
                    break;
                case 'map':
                    // **NOVO:** Garante o modo tela cheia para o mapa
                    dom.contentArea.style.display = 'block';
                    dom.cameraView.style.display = 'none'; 
                    dom.appContainer.style.display = 'grid'; 
                    dom.appContainer.style.gridTemplateColumns = '1fr'; // Ocupa 100%
                    dom.sidebar.classList.add('hidden'); // Esconde a barra lateral
                    Views.renderMap();
                    break;
                case 'routes':
                    Views.renderRoutes();
                    break;
                default:
                    Views.renderDashboard();
            }
            // Atualiza o menu ativo
            document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
            const btn = document.getElementById('btn' + viewName.charAt(0).toUpperCase() + viewName.slice(1));
            if(btn) btn.classList.add('active');
        },
        
        // --- Controle do Scanner ---
        startScanner: async function(deviceId = null) { 
            // Implementação da inicialização do scanner (igual a antes)
            // ... (código startScanner anterior) ...
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
            // Implementação da parada do scanner (igual a antes)
            isScanning = false;
            if (videoStream) {
                videoStream.getTracks().forEach(t => t.stop());
                videoStream = null;
            }
            dom.video.srcObject = null;
        },

        tick: function() {
            // Implementação da leitura do QR code (igual a antes)
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
            requestAnimationFrame(AppController.tick); // Chama o método do objeto
        },

        handleScan: function(data) {
            const now = Date.now();
            if (data === lastScanCode && (now - lastScanTime) < SCAN_DELAY) return;
            
            lastScanCode = data;
            lastScanTime = now;

            Utils.beep();
            Utils.showFeedback(`Leitura Confirmada: ${data.substring(0, 30)}...`, 'var(--accent)'); 

            const record = Utils.parsePayload(data, userLocation, currentUser);
            // Chama o Store para persistência
            DeliveryStore.addDelivery(record);
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
                Utils.showFeedback('ID de entrega vazio!', 'var(--danger)');
                return;
            }
            
            const record = Utils.parsePayload(id, userLocation, currentUser);
            
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
                    DeliveryStore.addDelivery(record); // Persistência via Store
                    Utils.showFeedback(`Registro Manual ${record.id} Salvo!`, 'var(--success)');
                    dom.manualDeliveryId.value = '';
                } else {
                    Utils.showFeedback(`Registro Manual ${record.id} Cancelado!`, 'var(--danger)');
                }
                dom.manualInputContainer.style.opacity = '0';
                dom.manualInputContainer.style.pointerEvents = 'none';
            });
        },


        // --- Ações Globais ---
        showContent: function() {
            // Implementação da exibição de conteúdo (igual a antes)
            dom.cameraView.style.display = 'none';
            dom.contentArea.style.display = 'block';
            
            dom.appContainer.style.display = 'grid'; 
            
            if (window.innerWidth > 768) { 
                dom.sidebar.classList.remove('hidden'); 
                dom.appContainer.style.gridTemplateColumns = '392px 1fr';
            } else {
                dom.sidebar.classList.remove('active');
            }
            
            this.stopScanner();
            if (dom.exportOptions.style.display === 'flex') {
                dom.exportOptions.style.display = 'none'; 
            }
            dom.feedback.style.opacity = '0'; 
            
            // Só esconde a entrada manual se estivermos saindo do scanner
            if (dom.contentArea.style.display !== 'none') {
                dom.manualInputContainer.style.opacity = '0';
                dom.manualInputContainer.style.pointerEvents = 'none';
            }
        },

        // --- Geolocalização ---
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

        // --- Exportação ---
        toggleExportOptions: function() {
            dom.exportOptions.style.display = dom.exportOptions.style.display === 'flex' ? 'none' : 'flex';
        },
        
        handleExport: function(filter) {
            // Lógica de exportação (igual a antes, mas pega dados do Store)
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
            
            // ... (Restante da lógica de geração de CSV) ...
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
        }
    };
    
    /**
     * Views: Funções de renderização de interface.
     * Elas pegam dados do Store e chamam o Controller para ações.
     */
    const Views = {
        renderDashboard: function() {
            AppController.showContent();
            
            if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
                dom.adminMenuOptions.classList.remove('hidden');
            } else {
                dom.adminMenuOptions.classList.add('hidden');
            }
            
            const records = DeliveryStore.getDeliveries(); // Pega os dados do Store
            
            const html = `
                <h2>📦 Entregas Realizadas</h2>
                <p style="color:var(--content-text-dark)">Clique em um item para ver os detalhes da entrega.</p>
                <div style="display:grid; gap:10px; margin-top:20px;">
                    ${records.map(r => {
                        const statusColor = r.status === 'delivered' ? 'var(--success)' : 'var(--danger)';
                        const actionText = r.status === 'delivered' ? 'ENTREGUE ✅' : 'PENDENTE';
                        
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

        renderDeliveryDetails: function(recordId) {
            AppController.showContent();
            const record = DeliveryStore.getDeliveryById(recordId); 
            if (!record) { dom.contentArea.innerHTML = `<h2>Erro</h2><p>Registro de entrega não encontrado.</p>`; return; }

            // Lógica de Agrupamento
            const relatedRecords = DeliveryStore.getRecordsByLocation(recordId);
            if (relatedRecords.length > 1) {
                const pendingCount = relatedRecords.filter(r => r.status === 'pending').length;
                
                if (pendingCount > 0) {
                     Swal.fire({
                        title: '📍 Múltiplas Entregas no Local',
                        html: `<p>Foram encontradas **${relatedRecords.length}** entregas neste endereço, sendo **${pendingCount}** ainda pendentes. Deseja dar baixa simultânea?</p>`,
                        icon: 'info',
                        showCancelButton: true,
                        confirmButtonText: `✅ Sim, Baixa Múltpla (${pendingCount})`,
                        cancelButtonText: 'Não, Ver Detalhes Deste Item'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            const pendingIds = relatedRecords.filter(r => r.status === 'pending').map(r => r.id);
                            AppController.navigateTo('multipleDelivery', pendingIds);
                        } else {
                            Views.renderSingleDetails(record, recordId);
                        }
                    });
                    return; 
                }
            }
            Views.renderSingleDetails(record, recordId);
        },

        renderSingleDetails: function(record, recordId) {
            // Implementação da tela de detalhes de uma única entrega (igual a antes)
            const allRecords = DeliveryStore.getDeliveries().map(r => r.id);
            const currentIndex = allRecords.indexOf(recordId);
            const prevId = currentIndex > 0 ? allRecords[currentIndex - 1] : null;
            const nextId = currentIndex < allRecords.length - 1 ? allRecords[currentIndex + 1] : null;
            
            dom.contentArea.innerHTML = `
                <h2>Detalhes da Entrega</h2>
                <div class="user-form-card" style="padding: 20px;">
                    <div id="detailMapObj" style="height:250px; border-radius:12px; margin-bottom:15px;"></div>

                    <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom: 20px;">
                        <button onclick="${prevId ? `AppController.navigateTo('details', '${prevId}')` : ''}" style="flex:1; padding:15px; background:${prevId ? 'var(--accent)' : '#ccc'}; color:${prevId ? 'var(--content-text-dark)' : '#666'}; border-radius:10px; box-shadow:none;" ${!prevId ? 'disabled' : ''}>
                            ⬅️ Anterior
                        </button>
                        <button onclick="${nextId ? `AppController.navigateTo('details', '${nextId}')` : ''}" style="flex:1; padding:15px; background:${nextId ? 'var(--accent)' : '#ccc'}; color:${nextId ? 'var(--content-text-dark)' : '#666'}; border-radius:10px; box-shadow:none;" ${!nextId ? 'disabled' : ''}>
                            Próximo ➡️
                        </button>
                    </div>

                    <div style="margin-bottom: 20px; padding:15px; border:1px solid #ddd; border-radius:10px; background:var(--content-bg-light); color:var(--content-text-dark);">
                        <div style="font-weight:bold; font-size:18px; margin-bottom:5px;">${record.id} - ${record.clientName}</div>
                        <div style="font-size:16px;">${record.clientAddress}</div>
                        <div style="font-size:14px; color:#6b7280; margin-top:5px;">Tipo: ${record.type} • Status: ${record.status.toUpperCase()} ${record.receivedBy ? `(Recebido por: ${record.receivedBy})` : ''}</div>
                    </div>

                    <button onclick="Utils.openContactOptions('${record.clientPhone}', '${record.id}')" 
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
                        <button onclick="Utils.handleMarkAsDelivered('${recordId}')" style="flex:1; padding:15px; background:var(--success); color:white; font-weight:bold; border-radius:10px; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.3);">
                            ✅ Entregar
                        </button>
                    </div>

                </div>
            `;
            // Inicialização do mapa no detalhe (mantida na View/DOM)
            setTimeout(() => {
                let detailMap = L.map('detailMapObj').setView([record.lat, record.lon], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(detailMap);

                L.marker([record.lat, record.lon]).addTo(detailMap)
                    .bindPopup(`<b>${record.id}</b><br>${record.clientAddress}`).openPopup();
                
                detailMap.setView([record.lat, record.lon], 15);
            }, 100);
        },

        renderMultipleDeliveryForm: function(recordIds) {
            AppController.showContent();
            
            // Pega APENAS os registros PENDENTES do Store
            const recordsToDeliver = recordIds.map(id => DeliveryStore.getDeliveryById(id)).filter(r => r && r.status === 'pending');
            
            if (recordsToDeliver.length === 0) {
                dom.contentArea.innerHTML = `<h2>Aviso</h2><p>Nenhuma entrega pendente para dar baixa neste local.</p><button onclick="AppController.navigateTo('dashboard')" class="btn-primary">Voltar</button>`;
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
                        
                        <button type="button" onclick="AppController.navigateTo('dashboard')" style="width:100%; background:#ccc; color:#333; padding:10px; border-radius:10px; margin-top:10px; box-shadow:none;">
                            Cancelar e Voltar
                        </button>
                    </form>
                </div>
            `;
            
            // Listener para o formulário (Lógica de Ação na View)
            document.getElementById('multipleDeliveryForm').addEventListener('submit', (e) => {
                e.preventDefault();
                
                const form = e.target;
                const allRecordsDelivered = [];
                let allValid = true;

                recordsToDeliver.forEach(record => {
                    const recebedorInput = form.querySelector(`#recebedor_${record.id}`);
                    const recebedor = recebedorInput ? recebedorInput.value.trim() : '';
                    
                    if (!recebedor) { allValid = false; recebedorInput.style.border = '2px solid var(--danger)'; recebedorInput.focus(); return; }
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
                                // Ação de persistência no Store
                                DeliveryStore.updateDeliveryStatus(item.id, 'delivered', item.recebedor);
                            });
                            Utils.showDashboardFeedback(`Baixa simultânea concluída para ${allRecordsDelivered.length} pacotes!`);
                            AppController.navigateTo('dashboard'); // Volta ao Controller
                        }
                    });
                } else {
                    Swal.fire('Atenção', 'Preencha o nome do recebedor para todos os pacotes antes de finalizar.', 'warning');
                }
            });
        },

        renderUsers: function() {
            // Lógica de listagem e CRUD de usuários (igual a antes, mas usando DeliveryStore.getUsers())
            AppController.showContent();
            const users = DeliveryStore.getUsers();
            
            let userListHtml = `
                <h2>👥 Gerenciamento de Usuários</h2>
                <div style="margin-bottom: 20px;">
                    <button class="btn-primary" onclick="Utils.editUser(null)">+ Novo Usuário</button>
                </div>
                <div id="userListContainer">
            `;
            
            const filteredUsers = users.filter(u => {
                if (currentUser.role === 'admin') return true;
                if (currentUser.role === 'gestor') { return u.creatorId === currentUser.id || u.id === currentUser.id; }
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
                            ${canEdit ? `<button onclick="Utils.editUser('${u.id}')" style="background:rgba(56, 189, 248, 0.2); color:var(--accent); padding:5px 10px; margin-right:5px; font-size:14px; box-shadow:none;" title="Editar">✏️</button>` : ''}
                            ${canDelete ? `<button onclick="Utils.deleteUser('${u.id}')" style="background:rgba(239, 68, 68, 0.2); color:var(--danger); padding:5px 10px; font-size:14px; box-shadow:none;">Excluir</button>` : ''}
                        </div>
                    </div>
                `;
            });
            
            userListHtml += `</div><div id="userFormArea"></div>`;
            dom.contentArea.innerHTML = userListHtml;
        },

        renderMap: function() {
            AppController.showContent();
            mapInstance = null;
            // **MODIFICAÇÃO:** Removido o botão de tela cheia, pois o mapa já abre em tela cheia na navegação
            dom.contentArea.innerHTML = `
                <h2>🗺️ Mapa de Entregas</h2>
                <p style="color:var(--content-text-dark)">Você está aqui: <span id="currentLoc">Carregando...</span></p>
                <div id="mapObj" style="height:90vh; border-radius:12px; margin-top:10px"></div>`;
            
            setTimeout(() => {
                const records = DeliveryStore.getDeliveries();
                const initialLat = userLocation ? userLocation.lat : CD_LOCATION.lat;
                const initialLon = userLocation ? userLocation.lon : CD_LOCATION.lon;

                mapInstance = L.map('mapObj').setView([initialLat, initialLon], 14);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(mapInstance);

                // **MODIFICAÇÃO:** Atualização do Popup para incluir Detalhes e Baixa
                records.forEach(r => {
                    const popupContent = `
                        <b>${r.id}</b><br>${r.clientAddress}<br>
                        <hr style="border-color: rgba(0,0,0,0.1); margin: 5px 0;">
                        <a href="#" onclick="AppController.navigateTo('details', '${r.id}'); return false;" style="margin-right:5px; color:var(--accent);">Ver Detalhes</a> |
                        <a href="#" onclick="Utils.handleMarkAsDelivered('${r.id}'); return false;" style="color:var(--success); font-weight:bold;">Baixar Entrega</a>
                    `;
                    L.marker([r.lat, r.lon]).addTo(mapInstance)
                        .bindPopup(popupContent);
                });

                Views.updateMapLocation();
                
                // O código de toggle fullscreen foi removido daqui e transferido para AppController.navigateTo('map')
            }, 100);
        },

        updateMapLocation: function() {
            // Lógica de atualização de localização (igual a antes)
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
        },

        renderRoutes: function() {
            // Lógica de rotas (igual a antes, usando DeliveryStore)
            AppController.showContent();
            const deliveryPoints = DeliveryStore.getDeliveries().map(r => ({ lat: r.lat, lon: r.lon, id: r.id }));
            
            if (deliveryPoints.length < 2) {
                dom.contentArea.innerHTML = `<h2>🧭 Geração de Rotas</h2><p style="color:var(--content-text-dark)">Escaneie pelo menos 2 entregas para gerar uma rota.</p>`;
                return;
            }

            const simplifiedRoute = deliveryPoints
                .slice(0, 10) 
                .sort(() => Math.random() - 0.5); 
            
            // ... (Restante do HTML de Rotas) ...
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

            // ... (Inicialização do mapa de rotas) ...
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
                        if (map) { setTimeout(() => { map.invalidateSize(); }, 350); }
                    });
                }

            }, 100);
        }
    };

    /**
     * Utils: Funções auxiliares (Parser, Beep, Feedback, etc.)
     * Essas funções não têm estado nem controlam o fluxo principal.
     */
    const Utils = {
        parsePayload: function(raw, location, user) {
            let id = raw;
            let type = 'Genérico';
            if (raw.includes('shopee')) { type = 'Shopee'; } else if (raw.includes('mercadoli')) { type = 'Mercado Livre'; }
            
            const numMatch = raw.match(/(\d{8,})/);
            if (numMatch) id = numMatch[1];
            
            const clientName = "Cliente " + id.slice(-5).toUpperCase();
            const clientAddress = `Rua Fictícia, ${Math.floor(Math.random() * 50)} - Condomínio A`; 
            const clientPhone = `(11) 9${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 9000) + 1000}`;

            const scanLat = location ? location.lat : (CD_LOCATION.lat + (Math.random() - 0.5) * 0.01);
            const scanLon = location ? location.lon : (CD_LOCATION.lon + (Math.random() - 0.5) * 0.01);

            return {
                id: id, raw: raw, type: type, user: user.username,
                date: new Date().toISOString(), lat: scanLat, lon: scanLon,
                status: 'pending', clientName: clientName, clientAddress: clientAddress,
                clientPhone: clientPhone, receivedBy: null
            };
        },

        beep: function() { /* ... (Implementação do beep) ... */
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
        },

        showFeedback: function(text, color = 'var(--accent)') { /* ... (Implementação do feedback) ... */
            dom.feedback.textContent = text;
            dom.feedback.style.background = color;
            dom.feedback.style.opacity = '1';
            setTimeout(() => { dom.feedback.style.opacity = '0'; }, 3000); 
            
            const overlay = document.querySelector('.scan-overlay');
            overlay.style.borderColor = color;
            setTimeout(() => overlay.style.borderColor = 'rgba(255,255,255,0.5)', 300);
        },

        showDashboardFeedback: function(text) {
             const feedbackDiv = document.createElement('div');
            feedbackDiv.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); padding:20px 40px; background:var(--success); color:white; border-radius:12px; z-index:10000; box-shadow:0 10px 20px rgba(0,0,0,0.2); opacity:0; transition:opacity 0.3s; font-family: 'Inter', sans-serif;";
            feedbackDiv.innerHTML = `<h3>${text}</h3>`;
            document.body.appendChild(feedbackDiv);
            
            setTimeout(() => { feedbackDiv.style.opacity = '1'; }, 50);
            setTimeout(() => { 
                feedbackDiv.style.opacity = '0'; 
                setTimeout(() => { 
                    document.body.removeChild(feedbackDiv); 
                }, 300);
            }, 1500);
        },
        
        handleMarkAsDelivered: function(recordId) {
             const record = DeliveryStore.getDeliveryById(recordId); 
            
            if (record) {
                if (record.status === 'delivered') {
                    Swal.fire({
                        title: 'Entrega Já Confirmada', text: `A entrega ${recordId} já foi marcada como entregue. Deseja reverter o status para "Pendente"?`, icon: 'warning',
                        showCancelButton: true, confirmButtonText: 'Sim, Reverter', cancelButtonText: 'Não, Manter'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            DeliveryStore.updateDeliveryStatus(recordId, 'pending', null);
                            Utils.showDashboardFeedback(`Status da entrega ${recordId} revertido para PENDENTE.`);
                            AppController.navigateTo('dashboard'); // Volta para a dashboard após a ação
                        }
                    });
                } else {
                    Swal.fire({
                        title: `Recebedor da Entrega ${recordId}`, input: 'text', inputLabel: 'Nome completo do recebedor:',
                        inputPlaceholder: 'Digite o nome aqui', showCancelButton: true, confirmButtonText: 'Confirmar Entrega',
                        cancelButtonText: 'Cancelar',
                        inputValidator: (value) => { if (!value) { return 'Você precisa digitar o nome do recebedor!' } }
                    }).then((result) => {
                        if (result.isConfirmed) {
                            // Persistência no Store
                            DeliveryStore.updateDeliveryStatus(recordId, 'delivered', result.value);
                            Utils.showDashboardFeedback(`Entrega ${recordId} confirmada como entregue! Recebedor: ${result.value}`);
                            AppController.navigateTo('dashboard'); // Volta para a dashboard após a ação
                        }
                    });
                }
            } else { Swal.fire({ icon: 'error', title: 'Sem Permissão', text: 'Registro não encontrado ou você não tem permissão para alterar o status desta entrega.', confirmButtonText: 'Ok' }); }
        },
        
        openContactOptions: function(phone, id) {
            const phoneDigits = phone.replace(/\D/g, ''); 
            const waLink = `https://wa.me/55${phoneDigits}`; 

            Swal.fire({
                title: `Contato da Entrega ${id}`, text: `Como você deseja contatar o cliente ${phone}?`, icon: 'question',
                showCancelButton: true, showDenyButton: true, confirmButtonText: '📞 Ligar', denyButtonText: '💬 WhatsApp', cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) { window.open(`tel:${phone}`); } 
                else if (result.isDenied) { window.open(waLink, '_blank'); }
            });
        },
        
        editUser: function(userId) {
            // Lógica de edição de usuário (igual a antes, usando DeliveryStore)
             const users = DeliveryStore.getUsers();
             const userToEdit = userId ? users.find(u => u.id === userId) : null;
            
            if (userToEdit && userToEdit.id !== currentUser.id && currentUser.role !== 'admin' && (currentUser.role !== 'gestor' || userToEdit.role !== 'colaborador' || userToEdit.creatorId !== currentUser.id)) {
                Swal.fire({ icon: 'error', title: 'Acesso Negado', text: 'Você não tem permissão para editar este usuário.' }); return;
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
                        <button class="btn-primary" onclick="Utils.saveUser('${userId || ''}')" style="flex:1">Salvar</button>
                        <button onclick="AppController.navigateTo('users')" style="background:#e5e7eb; color:var(--content-text-dark); box-shadow:none;">Cancelar</button>
                    </div>
                    ${!isAdmin && !isSelf ? `<p style="color:var(--danger); font-size:12px; margin-top:10px;">Apenas Admins/Você podem alterar o Nível de Acesso.</p>` : ''}
                </div>
            `;
            document.getElementById('userFormArea').innerHTML = formHtml;
            document.getElementById('userFormArea').scrollIntoView({ behavior: 'smooth' });
        },
        
        saveUser: function(userId) {
            const users = DeliveryStore.getUsers();
            const username = document.getElementById('formUsername').value.trim();
            const password = document.getElementById('formPassword').value.trim();
            const role = document.getElementById('formRole').value;
            const isNew = !userId;

            if (!username) { Swal.fire('Erro', 'Usuário é obrigatório.', 'error'); return; }
            if (isNew && !password) { Swal.fire('Erro', 'Senha é obrigatória para novo usuário.', 'error'); return; }

            let userIndex = -1;
            if (userId) userIndex = users.findIndex(u => u.id === userId);

            if (isNew && users.some(u => u.username === username)) { Swal.fire('Erro', 'Nome de usuário já existe.', 'error'); return; }
            
            let updatedUser;
            if (isNew) {
                updatedUser = {
                    id: 'u' + Date.now(),
                    username, password,
                    role: currentUser.role === 'gestor' && role !== 'colaborador' ? 'colaborador' : role, 
                    creatorId: currentUser.id
                };
                users.push(updatedUser);
            } else {
                updatedUser = users[userIndex]; 
                if (password) updatedUser.password = password;
                if (currentUser.role === 'admin' || currentUser.id === userId) { updatedUser.role = role; }
            }

            DeliveryStore.updateUsers(users); // Persistência no Store
            document.getElementById('userFormArea').innerHTML = '';
            AppController.navigateTo('users');
            Swal.fire('Sucesso', 'Usuário salvo com sucesso!', 'success');
        },

        deleteUser: function(userId) {
            if (userId === currentUser.id) { Swal.fire('Erro', 'Você não pode excluir seu próprio perfil enquanto estiver logado.', 'error'); return; }
            Swal.fire({
                title: 'Tem certeza?', text: "Você não poderá reverter isso!", icon: 'warning',
                showCancelButton: true, confirmButtonColor: 'var(--danger)', cancelButtonColor: '#aaa',
                confirmButtonText: 'Sim, excluir!'
            }).then((result) => {
                if (result.isConfirmed) {
                    let users = DeliveryStore.getUsers().filter(u => u.id !== userId);
                    DeliveryStore.updateUsers(users); // Persistência no Store
                    AppController.navigateTo('users');
                    Swal.fire('Excluído!', 'O usuário foi excluído.', 'success');
                }
            });
        }
    };
    
    // --- Funções de Escopo Global (para chamadas inline no HTML) ---
    window.AppController = AppController;
    window.toggleSidebar = () => dom.sidebar.classList.toggle('active');
    
    // Exportando funções Utils necessárias no HTML (como markAsDelivered, editUser, etc.)
    window.Utils = Utils;
    window.renderDashboard = () => AppController.navigateTo('dashboard');
    window.renderDeliveryDetails = (id) => AppController.navigateTo('details', id);


    // Inicia a aplicação
    AppController.init();
});
