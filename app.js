// Importações de Bibliotecas
// Importa QuaggaJS dinamicamente para leitura de código de barras/QR (não está no HTML, mas é essencial para o scanner)
// Nota: QuaggaJS precisa ser importado. Se não estiver usando um bundler, adicione a tag <script src="https://unpkg.com/quagga@0.12.1/dist/quagga.min.js"></script> no HTML, antes do script.js
// Para este exemplo, vou simular as funções de scanner sem a biblioteca real.

// --- Variáveis de Estado Global ---
let mapInstance = null;
let currentView = 'dashboard';
let userRole = 'entregador'; // 'entregador' ou 'admin'
let scannerRunning = false;
let videoStream = null; // Para armazenar o stream de vídeo da câmera

// Simulação de Dados de Usuários
const USERS = {
    "thon": { pass: "882010", role: "entregador" },
    "admin": { pass: "admin123", role: "admin" }
};

// Simulação de Dados de Rastreio (Geolocalização e Status)
const RASTREIOS = {
    "BR123456789": { 
        status: "Em Rota de Entrega", 
        destinatario: "Alice Silva",
        coordenadas: [-23.55052, -46.63330], // São Paulo
        historico: ["Coleta Realizada", "Em Trânsito", "Em Rota de Entrega"]
    },
    "BR987654321": { 
        status: "Coletado", 
        destinatario: "Bruno Costa",
        coordenadas: [-15.7801, -47.9292], // Brasília
        historico: ["Coleta Realizada"]
    }
};

// --- Funções de Utilitário ---

/**
 * Função para mostrar notificações usando SweetAlert2
 * @param {string} title Título da notificação
 * @param {string} text Conteúdo da notificação
 * @param {('success'|'error'|'warning'|'info'|'question')} icon Ícone
 */
const showAlert = (title, text, icon) => {
    Swal.fire({
        title,
        text,
        icon,
        confirmButtonColor: '#3b82f6',
        timer: icon === 'success' ? 3000 : null
    });
};

/**
 * Altera a seção visível da aplicação (Dashboard, Mapa, Scanner, Usuários)
 * @param {string} viewName Nome da view (dashboard, scan, map, routes, users)
 */
const switchView = (viewName) => {
    if (viewName === currentView) return;

    // Desliga o scanner se estiver ativo
    if (scannerRunning && currentView === 'scan') {
        stopScanner();
    }
    
    // Esconde o botão mobile se não for a view principal
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (viewName === 'scan') {
        mobileMenuBtn.classList.add('hidden');
    } else {
        mobileMenuBtn.classList.remove('hidden');
    }

    // Gerencia a classe 'active' do menu
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });

    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = ''; // Limpa o conteúdo
    currentView = viewName;
    
    // Lógica para cada view
    switch (viewName) {
        case 'dashboard':
            document.getElementById('btnDashboard').classList.add('active');
            renderDashboard();
            break;
        case 'scan':
            document.getElementById('btnScanMode').classList.add('active');
            startScanner();
            break;
        case 'map':
            document.getElementById('btnMap').classList.add('active');
            renderMap();
            break;
        case 'routes':
            document.getElementById('btnRoutes').classList.add('active');
            renderRoutes();
            break;
        case 'users':
            document.getElementById('btnUsers').classList.add('active');
            renderUserManagement();
            break;
        default:
            renderDashboard();
    }
    
    // Esconde a sidebar em mobile após a troca de view
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
};

/**
 * Renderiza o Dashboard principal
 */
const renderDashboard = () => {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2 style="color: var(--primary);">Olá, ${document.getElementById('displayUser').textContent}!</h2>
        <p>Bem-vindo(a) ao sistema de gestão Pegazus Logística.</p>
        
        <div style="display:flex; gap: 20px; flex-wrap: wrap; margin-top: 20px;">
            <div class="user-form-card" style="width: 300px; text-align: center;">
                <h3 style="color: var(--accent);">Entregas Pendentes</h3>
                <p style="font-size: 48px; font-weight: bold; color: var(--danger);">5</p>
            </div>
            <div class="user-form-card" style="width: 300px; text-align: center;">
                <h3 style="color: var(--success);">Entregas Concluídas Hoje</h3>
                <p style="font-size: 48px; font-weight: bold; color: var(--success);">12</p>
            </div>
            <div class="user-form-card" style="width: 300px; text-align: center;">
                <h3 style="color: var(--primary);">Próximo Destino</h3>
                <p style="font-size: 18px; font-weight: 600;">BR123456789 - Alice Silva</p>
            </div>
        </div>
    `;
};

/**
 * Renderiza a tela de gestão de rotas
 */
const renderRoutes = () => {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2 style="color: var(--primary);">🧭 Minhas Rotas de Hoje</h2>
        <p>Lista de encomendas para entrega/coleta no seu itinerário.</p>
        
        <div class="user-form-card">
            <h4 style="color: var(--accent);">Rota 1: 08:00 - 12:00 (5 Entregas)</h4>
            <ul style="list-style: none; padding: 0;">
                <li style="padding: 5px 0; border-bottom: 1px dashed #eee;">BR123456789 - Alice S. (Status: Em Rota)</li>
                <li style="padding: 5px 0; border-bottom: 1px dashed #eee;">BR101010101 - João P. (Status: Pendente)</li>
                <li style="padding: 5px 0;">BR202020202 - Maria G. (Status: Pendente)</li>
            </ul>
        </div>
        
        <button class="btn-primary" style="margin-top: 15px;">Otimizar Próxima Rota</button>
    `;
};

/**
 * Renderiza o mapa de entregas usando Leaflet
 */
const renderMap = () => {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2 style="color: var(--primary);">🗺️ Mapa de Entregas Ativas</h2>
        <div id="mapid" style="height: 600px; width: 100%; border-radius: 10px; box-shadow: var(--shadow); margin-top: 20px;"></div>
    `;

    // Inicializa o mapa (precisa ser feito APÓS o elemento 'mapid' estar no DOM)
    if (mapInstance) {
        mapInstance.remove(); // Limpa a instância anterior, se houver
    }
    
    // Centraliza em uma localização padrão (Ex: São Paulo)
    mapInstance = L.map('mapid').setView([-23.5505, -46.6333], 10);

    // Adiciona o Tile Layer (Mapa base)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);

    // Adiciona marcadores (Mock Data)
    Object.keys(RASTREIOS).forEach(id => {
        const item = RASTREIOS[id];
        const marker = L.marker(item.coordenadas).addTo(mapInstance)
            .bindPopup(`<b>${id}</b><br>${item.destinatario}<br>Status: ${item.status}`);
        
        // Exemplo de ícone personalizado (simples)
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: item.status === 'Em Rota de Entrega' ? 
                `<span style="font-size: 24px; color: var(--accent);">📍</span>` : 
                `<span style="font-size: 24px; color: var(--success);">✅</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        marker.setIcon(customIcon);
    });

    // Ajusta o zoom para caber todos os marcadores, se houver
    if (Object.keys(RASTREIOS).length > 0) {
        const bounds = Object.values(RASTREIOS).map(item => item.coordenadas);
        mapInstance.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
    }
};

/**
 * Renderiza a tela de gerenciamento de usuários (apenas para Admin)
 */
const renderUserManagement = () => {
    if (userRole !== 'admin') {
        contentArea.innerHTML = `<h2 style="color: var(--danger);">🛑 Acesso Negado</h2><p>Você não tem permissão para acessar esta área.</p>`;
        return;
    }
    
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2 style="color: var(--primary);">👥 Gerenciar Usuários</h2>
        <p>Criação e edição de contas de entregadores e administradores.</p>
        
        <div class="user-form-card" style="margin-top: 20px;">
            <h4 style="color: var(--accent);">Criar Novo Usuário</h4>
            <input type="text" id="newUserUsername" placeholder="Nome de Usuário">
            <input type="password" id="newUserPassword" placeholder="Senha">
            <select id="newUserRole">
                <option value="entregador">Entregador</option>
                <option value="admin">Admin</option>
            </select>
            <button id="btnCreateUser" class="btn-primary" style="background: var(--success);">Criar Usuário</button>
        </div>
        
        <div class="user-form-card" style="margin-top: 20px;">
            <h4 style="color: var(--primary);">Usuários Existentes</h4>
            <ul id="userList" style="list-style: none; padding: 0;">
                </ul>
        </div>
    `;
    
    // Popula a lista de usuários (apenas os nomes)
    const userList = document.getElementById('userList');
    Object.keys(USERS).forEach(username => {
        const role = USERS[username].role;
        const listItem = document.createElement('li');
        listItem.style.padding = '5px 0';
        listItem.style.borderBottom = '1px dashed #eee';
        listItem.innerHTML = `<strong>${username}</strong> - ${role}`;
        userList.appendChild(listItem);
    });
    
    // Adiciona o evento de criação (simulado)
    document.getElementById('btnCreateUser').addEventListener('click', () => {
        const username = document.getElementById('newUserUsername').value;
        const password = document.getElementById('newUserPassword').value;
        const role = document.getElementById('newUserRole').value;
        
        if (username && password) {
            USERS[username] = { pass: password, role: role };
            showAlert('Sucesso', `Usuário ${username} (${role}) criado!`, 'success');
            renderUserManagement(); // Recarrega a lista
        } else {
            showAlert('Erro', 'Preencha todos os campos.', 'error');
        }
    });
};

// --- Funções de Scanner e Câmera ---

/**
 * Inicia a visualização da câmera e o scanner (simulação QuaggaJS)
 */
const startScanner = async () => {
    const cameraView = document.getElementById('cameraView');
    cameraView.style.display = 'flex';
    scannerRunning = true;
    document.getElementById('feedbackMsg').style.opacity = '1';

    try {
        // Solicita acesso à câmera
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "environment" // Preferência pela câmera traseira em mobile
            } 
        });
        
        const videoElement = document.getElementById('videoElement');
        videoElement.srcObject = videoStream;
        videoElement.play();
        
        // Atualiza a lista de câmeras disponíveis
        await updateCameraList();
        
        // --- INICIALIZAÇÃO DO QUAGGAJS (SIMULADA) ---
        // Aqui é onde o QuaggaJS seria realmente inicializado.
        // Como o QuaggaJS não está incluído no script, vamos simular a leitura
        
        showAlert('Câmera Ativa', 'Aponte para o QR Code ou use a Entrada Manual.', 'info');
        
        // SIMULAÇÃO: Após 5 segundos, simula a leitura de um código
        setTimeout(() => {
            if (scannerRunning) { // Verifica se ainda está ativo
                const simulatedCode = "BR123456789";
                handleScanResult(simulatedCode);
            }
        }, 5000); 

    } catch (err) {
        showAlert('Erro de Câmera', 'Não foi possível acessar a câmera. Certifique-se de que o acesso foi permitido.', 'error');
        console.error("Erro ao acessar a câmera: ", err);
        stopScanner();
    }
};

/**
 * Para a visualização da câmera e o scanner
 */
const stopScanner = () => {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('cameraView').style.display = 'none';
    document.getElementById('feedbackMsg').style.opacity = '0';
    document.getElementById('manualInputContainer').style.opacity = '0';
    document.getElementById('manualInputContainer').style.pointerEvents = 'none';
    scannerRunning = false;
};

/**
 * Trata o resultado da leitura de um código
 * @param {string} code Código lido/digitado (ex: ID da entrega)
 */
const handleScanResult = (code) => {
    stopScanner(); // Para o scanner imediatamente após a leitura
    
    const rastreio = RASTREIOS[code];
    
    if (rastreio) {
        // Encontrou o rastreio
        showAlert('Código Encontrado!', `ID: ${code}\nDestinatário: ${rastreio.destinatario}\nStatus: ${rastreio.status}`, 'success');
        
        // Abre a tela de rota/mapa e centraliza no item
        switchView('map'); 
        // Em um sistema real, você adicionaria o marcador específico ou abriria um modal de detalhes
        // Exemplo: mapInstance.setView(rastreio.coordenadas, 15);
        
    } else {
        // Não encontrou o rastreio
        showAlert('Rastreio Não Encontrado', `O código ${code} não está registrado em nosso sistema.`, 'error');
        // Volta para o dashboard
        switchView('dashboard');
    }
};

/**
 * Preenche o select de câmeras disponíveis
 */
const updateCameraList = async () => {
    const select = document.getElementById('cameraSelect');
    select.innerHTML = '<option value="">Câmera Padrão</option>';
    
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Câmera ${index + 1}`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error("Erro ao listar dispositivos de vídeo: ", err);
    }
};

// --- Funções de Login ---

/**
 * Tenta realizar o login
 */
const performLogin = () => {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const errorMsg = document.getElementById('loginError');

    if (USERS[user] && USERS[user].pass === pass) {
        const userInfo = USERS[user];
        userRole = userInfo.role;
        
        // Esconde a tela de login
        document.getElementById('loginSection').classList.add('hidden');
        
        // Mostra o container principal do App
        const appContainer = document.getElementById('appContainer');
        appContainer.classList.remove('hidden');

        // Mostra o botão do menu em mobile
        if (window.innerWidth <= 768) {
            document.getElementById('mobileMenuBtn').classList.remove('hidden');
        }

        // Atualiza o nome de usuário no sidebar
        document.getElementById('displayUser').textContent = user;
        
        // Mostra/Esconde opções de Admin
        const adminOptions = document.getElementById('adminMenuOptions');
        if (userRole === 'admin') {
            adminOptions.classList.remove('hidden');
        } else {
            adminOptions.classList.add('hidden');
        }

        // Vai para o dashboard
        switchView('dashboard');
        
        showAlert('Sucesso', `Bem-vindo, ${user}!`, 'success');

    } else {
        errorMsg.textContent = "Usuário ou senha inválidos.";
        showAlert('Erro de Login', 'Usuário ou senha inválidos.', 'error');
    }
};

/**
 * Realiza o logout
 */
const performLogout = () => {
    userRole = 'entregador'; // Reset para o padrão
    
    // Esconde o app e mostra a tela de login
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('mobileMenuBtn').classList.add('hidden');
    
    // Limpa campos de login
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').textContent = '';
    
    // Para o scanner, se estiver rodando
    if (scannerRunning) {
        stopScanner();
    }
    
    showAlert('Logout', 'Você foi desconectado com sucesso.', 'info');
};

// --- Funções de Exportação (Simuladas) ---

/**
 * Simula a exportação de dados
 * @param {string} periodo O período de exportação (Diário, Semanal, etc.)
 */
const simulateExport = (periodo) => {
    if (userRole !== 'admin') {
        showAlert('Acesso Negado', 'Apenas administradores podem exportar dados.', 'error');
        return;
    }
    
    const dataCount = Math.floor(Math.random() * 500) + 50;
    showAlert('Exportação Iniciada', `Exportando ${dataCount} registros para o período ${periodo}.`, 'info');
    
    // Simulação de delay para a exportação
    setTimeout(() => {
        showAlert('Exportação Concluída', `O arquivo de exportação (${periodo}) está pronto para download.`, 'success');
    }, 2000);
};

// --- Configuração de Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    // 🚪 Login Events
    document.getElementById('btnLogin').addEventListener('click', performLogin);
    // Permite login ao pressionar Enter nos campos de senha
    document.getElementById('loginPass').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performLogin();
        }
    });

    // 🧭 Sidebar Menu Events
    document.getElementById('btnDashboard').addEventListener('click', () => switchView('dashboard'));
    document.getElementById('btnScanMode').addEventListener('click', () => switchView('scan'));
    document.getElementById('btnMap').addEventListener('click', () => switchView('map'));
    document.getElementById('btnRoutes').addEventListener('click', () => switchView('routes'));
    document.getElementById('btnUsers').addEventListener('click', () => switchView('users')); // Admin

    // 📤 Export Toggle Event (Admin)
    const btnExport = document.getElementById('btnExport');
    const exportOptions = document.getElementById('exportOptions');
    btnExport.addEventListener('click', () => {
        if (userRole === 'admin') {
            exportOptions.style.display = exportOptions.style.display === 'flex' ? 'none' : 'flex';
            btnExport.classList.toggle('active'); // Destaca o botão pai
        } else {
            showAlert('Acesso Negado', 'Apenas administradores podem ver opções de exportação.', 'error');
        }
    });
    
    // Export Option Clicks
    document.getElementById('btnExportDaily').addEventListener('click', () => simulateExport('Diário'));
    document.getElementById('btnExportWeekly').addEventListener('click', () => simulateExport('Semanal'));
    document.getElementById('btnExportMonthly').addEventListener('click', () => simulateExport('Mensal'));
    document.getElementById('btnExportAll').addEventListener('click', () => simulateExport('Completo'));
    
    // 🚪 Logout Event
    document.getElementById('btnLogout').addEventListener('click', performLogout);
    
    // 📱 Mobile Menu Toggle
    document.getElementById('mobileMenuBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });

    // 📸 Scanner - Entrada Manual Toggle
    document.getElementById('btnToggleManualInput').addEventListener('click', () => {
        const manualContainer = document.getElementById('manualInputContainer');
        const isVisible = manualContainer.style.opacity === '1';
        
        manualContainer.style.opacity = isVisible ? '0' : '1';
        manualContainer.style.pointerEvents = isVisible ? 'none' : 'auto';
        
        document.getElementById('btnToggleManualInput').textContent = isVisible ? '✏️ Entrada Manual' : 'X Fechar';
        
        // Foca no input quando abre
        if (!isVisible) {
            document.getElementById('manualDeliveryId').focus();
        }
    });
    
    // 📸 Scanner - Confirmar Entrada Manual
    document.getElementById('btnManualConfirm').addEventListener('click', () => {
        const code = document.getElementById('manualDeliveryId').value.trim().toUpperCase();
        if (code) {
            handleScanResult(code);
        } else {
            showAlert('Atenção', 'Digite o ID da entrega/coleta.', 'warning');
        }
    });
});
