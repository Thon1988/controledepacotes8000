// =========================================================
//                  CONFIGURAÇÃO E UTILIDADES
// =========================================================

// Função de utilidade para simular um ID único
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

// Dados de Usuários (Simulação de um "banco de dados")
const usersDB = {
    'thon': { pass: '123', isAdmin: true, name: 'Thon (Admin)' },
    'joao': { pass: '456', isAdmin: false, name: 'João (Motorista)' },
    'maria': { pass: '789', isAdmin: false, name: 'Maria (Motorista)' }
};

// Dados Simples de Entregas (Simulação)
let deliveries = [];

// Estado da Aplicação
let appState = {
    isAuthenticated: false,
    currentUser: null,
    currentView: 'dashboard',
    stream: null, // Stream de vídeo da câmera
    rafId: null, // Request Animation Frame ID para o loop do scanner
    lastScan: { code: '', time: 0 },
    SCAN_DELAY: 1500, // 1.5 segundo de delay
    hasTorch: false,
    torchOn: false,
    videoDevices: [],
    currentDeviceId: null
};

// Mapeamento de Elementos DOM
const elements = {
    loginSection: document.getElementById('loginSection'),
    appContainer: document.querySelector('.app'),
    loginUser: document.getElementById('loginUser'),
    loginPass: document.getElementById('loginPass'),
    btnLogin: document.getElementById('btnLogin'),
    loginError: document.getElementById('loginError'),
    displayUser: document.getElementById('displayUser'),
    sidebar: document.getElementById('sidebar'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),

    contentArea: document.getElementById('contentArea'),
    feedbackMsg: document.getElementById('feedbackMsg'),

    // Menu Buttons
    btnScanMode: document.getElementById('btnScanMode'),
    btnDashboard: document.getElementById('btnDashboard'),
    btnMap: document.getElementById('btnMap'),
    btnRoutes: document.getElementById('btnRoutes'),
    btnExport: document.getElementById('btnExport'),
    exportOptions: document.getElementById('exportOptions'),
    btnExportDaily: document.getElementById('btnExportDaily'),
    btnExportWeekly: document.getElementById('btnExportWeekly'),
    btnExportMonthly: document.getElementById('btnExportMonthly'),
    btnExportAll: document.getElementById('btnExportAll'),
    userFilterSelect: document.getElementById('userFilterSelect'),
    adminMenuOptions: document.getElementById('adminMenuOptions'),
    btnUsers: document.getElementById('btnUsers'),
    btnLogout: document.getElementById('btnLogout'),
    
    // Camera Elements
    cameraView: document.getElementById('cameraView'),
    videoElement: document.getElementById('videoElement'),
    canvasElement: document.getElementById('canvasElement'), // Adicionado
    scanOverlay: document.querySelector('.scan-overlay'),
    scanLine: document.querySelector('.scan-line'),
    btnTorch: document.getElementById('btnTorch'),
    cameraSelect: document.getElementById('cameraSelect'),
    btnBackCamera: document.getElementById('btnBackCamera')
};

// Mapa
let leafletMap = null;

// =========================================================
//                  GERENCIAMENTO DE VISUALIZAÇÃO/LAYOUT
// =========================================================

/** Alterna a visibilidade da sidebar em mobile. */
window.toggleSidebar = function() {
    elements.sidebar.classList.toggle('active');
};

/** Renderiza uma visualização na área de conteúdo principal. */
function renderView(viewName, data = null) {
    if (elements.sidebar.classList.contains('active')) {
        toggleSidebar(); // Fecha a sidebar no mobile após a seleção
    }
    appState.currentView = viewName;
    elements.contentArea.innerHTML = '';
    
    // Remove a classe 'active' de todos os botões de navegação
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--muted)';
    });

    let activeBtn = document.getElementById(`btn${capitalize(viewName)}`);
    if (activeBtn) {
        activeBtn.style.background = 'rgba(56, 189, 248, 0.2)';
        activeBtn.style.color = 'var(--accent)';
    }

    // Lógica para fechar a câmera se estiver aberta
    if (elements.cameraView.classList.contains('active')) {
        stopCamera();
    }
    elements.cameraView.classList.add('hidden');
    elements.appContainer.classList.remove('hidden');

    switch (viewName) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'map':
            renderMap();
            break;
        case 'routes':
            renderRoutes();
            break;
        case 'users':
            if (appState.currentUser.isAdmin) renderUsers();
            break;
        default:
            elements.contentArea.innerHTML = '<h2>Página Não Encontrada</h2>';
    }
}

/** Exibe um feedback (toast) temporário na tela. */
function showFeedback(message, type = 'success') {
    elements.feedbackMsg.textContent = message;
    elements.feedbackMsg.style.background = type === 'success' ? 'var(--success)' : 'var(--danger)';
    elements.feedbackMsg.classList.remove('hidden');
    elements.feedbackMsg.style.display = 'block';

    setTimeout(() => {
        elements.feedbackMsg.classList.add('hidden');
        elements.feedbackMsg.style.display = 'none';
    }, 4000);
}

// =========================================================
//                  AUTENTICAÇÃO E INICIALIZAÇÃO
// =========================================================

/** Lógica de login. */
function handleLogin() {
    const user = elements.loginUser.value.toLowerCase().trim();
    const pass = elements.loginPass.value;

    const userData = usersDB[user];

    if (userData && userData.pass === pass) {
        appState.isAuthenticated = true;
        appState.currentUser = { 
            username: user, 
            name: userData.name, 
            isAdmin: userData.isAdmin 
        };
        elements.loginError.textContent = '';
        initializeApp();
    } else {
        elements.loginError.textContent = 'Usuário ou senha inválidos.';
    }
}

/** Lógica de logout. */
function handleLogout() {
    stopCamera();
    appState.isAuthenticated = false;
    appState.currentUser = null;
    elements.appContainer.classList.add('hidden');
    elements.mobileMenuBtn.classList.add('hidden');
    elements.loginSection.style.display = 'flex';
    elements.loginPass.value = '';
}

/** Inicializa a interface após o login. */
function initializeApp() {
    elements.loginSection.style.display = 'none';
    elements.appContainer.classList.remove('hidden');
    elements.mobileMenuBtn.classList.remove('hidden');
    elements.displayUser.textContent = appState.currentUser.name;

    // Configura menu de Administrador
    if (appState.currentUser.isAdmin) {
        elements.adminMenuOptions.classList.remove('hidden');
        elements.userFilterSelect.classList.remove('hidden');
        
        // Popula o filtro de usuários
        const allUsers = Object.keys(usersDB);
        elements.userFilterSelect.innerHTML = `<option value="all">Todos os Motoristas</option>`;
        allUsers.forEach(user => {
            if (!usersDB[user].isAdmin) {
                 elements.userFilterSelect.innerHTML += `<option value="${user}">${usersDB[user].name}</option>`;
            }
        });
    } else {
        elements.adminMenuOptions.classList.add('hidden');
        elements.userFilterSelect.classList.add('hidden');
    }

    renderView('dashboard');
}

// =========================================================
//                  CÂMERA E SCANNER QR CODE
// =========================================================

/** Beep sound for successful scan */
function beep(freq = 1200, duration = 100, vol = 0.1) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = freq;
        gain.gain.value = vol;
        osc.start();
        setTimeout(() => { 
            osc.stop(); 
            audioCtx.close(); 
        }, duration);
    } catch (e) {}
}

/** Encontra todos os dispositivos de vídeo disponíveis. */
async function enumerateDevices() {
    try {
        // Pede permissão para garantir que as labels estejam disponíveis
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); 
        
        const devs = await navigator.mediaDevices.enumerateDevices();
        appState.videoDevices = devs.filter(d => d.kind === 'videoinput');
        
        // Popula o <select> de câmeras
        elements.cameraSelect.innerHTML = appState.videoDevices.map(
            (d, i) => `<option value="${d.deviceId}">${d.label || `Câmera ${i + 1}`}</option>`
        ).join('');

        if (appState.videoDevices.length > 0) {
             elements.cameraSelect.classList.remove('hidden');
             // Tenta selecionar a câmera traseira (environment) automaticamente
             const backCamera = appState.videoDevices.find(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('environment') || 
                d.label.toLowerCase().includes('traseira')
             );
             appState.currentDeviceId = backCamera ? backCamera.deviceId : appState.videoDevices[0].deviceId;
             elements.cameraSelect.value = appState.currentDeviceId;
        } else {
             elements.cameraSelect.classList.add('hidden');
        }

    } catch (e) {
        console.error("Erro ao enumerar dispositivos: ", e);
    }
}

/** Inicia o stream da câmera e o loop de escaneamento. */
async function startCamera(deviceId = appState.currentDeviceId) {
    stopCamera(); // Garante que qualquer stream anterior seja parado

    elements.appContainer.classList.add('hidden');
    elements.cameraView.classList.remove('hidden');

    try {
        const isMobile = window.innerWidth <= 768;
        
        let constraints = {
            video: deviceId 
                ? { deviceId: { exact: deviceId } }
                : { 
                    facingMode: isMobile ? 'environment' : 'user', 
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 } 
                  },
            audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        appState.stream = stream;

        elements.videoElement.srcObject = stream;
        elements.videoElement.setAttribute('playsinline', 'true');
        await elements.videoElement.play();

        // Verifica o Flash/Torch
        const track = stream.getVideoTracks()[0];
        if (track) {
            try {
                const caps = track.getCapabilities();
                appState.hasTorch = caps && caps.torch;
                elements.btnTorch.classList.toggle('hidden', !appState.hasTorch);
            } catch (e) {
                appState.hasTorch = false;
                elements.btnTorch.classList.add('hidden');
            }
        }
        
        appState.currentDeviceId = deviceId;
        elements.cameraSelect.value = deviceId;

        appState.rafId = requestAnimationFrame(scanLoop);

    } catch (err) {
        console.error('Camera error:', err);
        showFeedback('Erro ao iniciar câmera: ' + err.name, 'danger');
        elements.cameraView.classList.add('hidden');
        elements.appContainer.classList.remove('hidden');
    }
}

/** Para o stream da câmera e o loop de escaneamento. */
function stopCamera() {
    if (appState.rafId) {
        cancelAnimationFrame(appState.rafId);
        appState.rafId = null;
    }
    if (appState.stream) {
        appState.stream.getTracks().forEach(track => track.stop());
        appState.stream = null;
    }
    elements.videoElement.srcObject = null;
    appState.torchOn = false;
    elements.btnTorch.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    appState.lastScan = { code: '', time: 0 };
}

/** Loop principal de escaneamento (chamado via requestAnimationFrame). */
function scanLoop() {
    const video = elements.videoElement;
    const canvas = elements.canvasElement;
    
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        appState.rafId = requestAnimationFrame(scanLoop);
        return;
    }

    const ctx = canvas.getContext('2d');
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!vw || !vh) {
        appState.rafId = requestAnimationFrame(scanLoop);
        return;
    }

    // Oculta o canvas, mas usa suas dimensões
    canvas.width = vw;
    canvas.height = vh;
    ctx.drawImage(video, 0, 0, vw, vh);

    // Scan center 90% area for better QR detection
    const size = Math.min(vw, vh) * 0.9;
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;
    const imageData = ctx.getImageData(sx, sy, size, size);

    // jsQR é carregado no index.html (defer)
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
    });

    if (code && code.data) {
        handleQRDetected(code.data.trim());
        // Desenha a linha verde na área de scan
        elements.scanLine.style.background = 'var(--success)'; 
    } else {
        // Volta a linha para a cor de acento
        elements.scanLine.style.background = 'var(--accent)'; 
    }

    appState.rafId = requestAnimationFrame(scanLoop);
}

/** Processa o QR Code detectado. */
function handleQRDetected(qrData) {
    const now = Date.now();
    
    // Prevenção de duplicatas com delay
    if (qrData === appState.lastScan.code && (now - appState.lastScan.time) < appState.SCAN_DELAY) {
        return;
    }

    // Prepara o feedback
    beep(1000, 80);
    if (navigator.vibrate) navigator.vibrate(80);
    showFeedback(`📦 Etiqueta: ${qrData.substring(0, 25)}...`, 'success');

    appState.lastScan = { code: qrData, time: now };
    
    // --- LÓGICA DE NEGÓCIO: SALVAR ENTREGA ---
    saveDelivery(qrData);

    // Simula a captura de foto (opcional: para processamento de AI)
    // captureFrameAndSend(qrData); 
}

/** Salva a entrega na lista simulada. */
function saveDelivery(qrData) {
    const newDelivery = {
        id: generateId(),
        code: qrData,
        timestamp: new Date().toISOString(),
        user: appState.currentUser.username,
        userName: appState.currentUser.name,
        status: 'Scanned',
        location: { lat: -23.5505, lng: -46.6333 } // Simula localização de SP
    };
    deliveries.unshift(newDelivery); // Adiciona no início
    
    // Atualiza a dashboard se estiver aberta
    if (appState.currentView === 'dashboard') {
        renderDashboard();
    }
}

/** Alterna o flash/torch. */
async function toggleTorch() {
    if (!appState.stream || !appState.hasTorch) return;

    const track = appState.stream.getVideoTracks()[0];
    if (!track) return;

    try {
        const newTorchState = !appState.torchOn;
        await track.applyConstraints({
            advanced: [{ torch: newTorchState }]
        });
        appState.torchOn = newTorchState;
        elements.btnTorch.style.backgroundColor = newTorchState ? 'var(--accent)' : 'rgba(255, 255, 255, 0.2)';
    } catch (e) {
        console.warn('Torch toggle failed:', e);
        showFeedback('Falha ao ligar/desligar o flash.', 'danger');
    }
}

// =========================================================
//                  GERENCIAMENTO DE CONTEÚDO
// =========================================================

/** Renderiza a visualização principal de Entregas. */
function renderDashboard() {
    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; color:var(--content-text-dark)">
            <h2>📦 Entregas Recentes</h2>
            <span style="font-size:14px; color:var(--muted)">Últimas ${deliveries.length} leituras</span>
        </div>
        <div id="deliveriesList" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:15px;">
    `;

    if (deliveries.length === 0) {
        html += `<div style="grid-column:1/-1; text-align:center; padding:50px; color:var(--muted)">Nenhuma entrega escaneada ainda.</div>`;
    } else {
        deliveries.forEach(d => {
            html += `
                <div class="user-form-card" style="border-left: 4px solid var(--accent); padding: 15px;">
                    <div style="font-size:12px; color:var(--muted)">Motorista: ${d.userName}</div>
                    <strong style="display:block; margin-bottom:5px; font-size:16px; color:var(--content-text-dark)">${d.code.substring(0, 30)}...</strong>
                    <div style="font-size:14px; color:var(--muted)">Status: <span style="color:var(--success)">${d.status}</span></div>
                    <div style="font-size:14px; color:var(--muted)">Data: ${new Date(d.timestamp).toLocaleString('pt-BR')}</div>
                </div>
            `;
        });
    }

    html += `</div>`;
    elements.contentArea.innerHTML = html;
}

/** Renderiza a visualização do Mapa. */
function renderMap() {
    elements.contentArea.innerHTML = `
        <h2 style="color:var(--content-text-dark); margin-bottom:15px">🗺️ Rastreamento de Entregas</h2>
        <div id="mapContainer" style="height: 600px; width: 100%; border-radius: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
    `;

    // Inicializa ou atualiza o mapa
    if (leafletMap) {
        leafletMap.remove();
    }
    
    // Coordenada central (se houver entregas, usa a primeira, senão usa SP)
    const center = deliveries.length > 0 
        ? [deliveries[0].location.lat, deliveries[0].location.lng] 
        : [-23.5505, -46.6333]; 

    leafletMap = L.map('mapContainer').setView(center, 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(leafletMap);
    
    deliveries.forEach(d => {
        L.marker([d.location.lat, d.location.lng])
            .addTo(leafletMap)
            .bindPopup(`<b>${d.code.substring(0, 15)}...</b><br>Motorista: ${d.userName}`);
    });
}

/** Renderiza a visualização de Geração de Rotas (Mockup). */
function renderRoutes() {
    elements.contentArea.innerHTML = `
        <h2 style="color:var(--content-text-dark); margin-bottom:15px">🧭 Gerar Rotas Otimizadas</h2>
        <div class="user-form-card">
            <p style="color:var(--content-text-dark); margin-bottom:15px">Funcionalidade de Otimização de Rotas (A ser implementada).</p>
            <label style="display:block; margin-bottom:5px; font-size:14px; color:var(--content-text-dark)">Ponto de Partida</label>
            <input type="text" placeholder="Endereço ou Coordenadas" class="main-input" style="margin-bottom:15px">
            
            <label style="display:block; margin-bottom:5px; font-size:14px; color:var(--content-text-dark)">Entregas a Otimizar</label>
            <select style="margin-bottom:15px">
                <option>Entregas de Hoje (${deliveries.length})</option>
                <option>Entregas do Motorista A</option>
            </select>
            
            <button class="btn-primary" style="width:100%">Calcular Melhor Rota</button>
        </div>
    `;
}

/** Renderiza o CRUD de Usuários (Admin). */
function renderUsers() {
    let html = `
        <h2 style="color:var(--content-text-dark); margin-bottom:15px">👥 Gerenciamento de Usuários</h2>
        <div id="addUserForm" class="user-form-card" style="margin-bottom: 25px;">
            <h3 style="margin-top:0; color:var(--content-text-dark)">+ Adicionar Novo Usuário</h3>
            <input type="text" id="newUsername" placeholder="Usuário (login)" class="main-input">
            <input type="text" id="newName" placeholder="Nome Completo" class="main-input">
            <input type="password" id="newPassword" placeholder="Senha" class="main-input">
            <select id="newIsAdmin" class="main-input">
                <option value="false">Motorista</option>
                <option value="true">Administrador</option>
            </select>
            <button class="btn-primary" id="btnSaveUser" style="width:100%; margin-top:10px;">Salvar Usuário</button>
        </div>
        <div id="usersList">
            ${renderUsersList()}
        </div>
    `;
    elements.contentArea.innerHTML = html;
    
    // Adiciona evento ao botão Salvar
    document.getElementById('btnSaveUser').onclick = handleSaveUser;
    
    // Adiciona eventos aos botões de edição/exclusão após a renderização
    document.querySelectorAll('.edit-user-btn').forEach(btn => btn.onclick = handleEditUser);
    document.querySelectorAll('.delete-user-btn').forEach(btn => btn.onclick = handleDeleteUser);
}

/** Helper para renderizar a lista de usuários. */
function renderUsersList() {
    let listHtml = '';
    for (const username in usersDB) {
        const user = usersDB[username];
        listHtml += `
            <div class="user-form-card" data-username="${username}" style="display:flex; justify-content:space-between; align-items:center; padding: 15px;">
                <div>
                    <strong style="display:block; font-size:16px; color:var(--content-text-dark)">${user.name}</strong>
                    <div style="font-size:14px; color:var(--muted)">Login: ${username} | Tipo: ${user.isAdmin ? 'Admin' : 'Motorista'}</div>
                </div>
                <div>
                    <button class="edit-user-btn" data-username="${username}" style="background:rgba(56, 189, 248, 0.2); color:var(--accent); padding:8px 12px; margin-right:5px">✏️ Editar</button>
                    <button class="delete-user-btn" data-username="${username}" style="background:rgba(239, 68, 68, 0.2); color:var(--danger); padding:8px 12px;">🗑️ Excluir</button>
                </div>
            </div>
        `;
    }
    return listHtml;
}

/** Lógica para salvar/atualizar usuário. */
function handleSaveUser() {
    const username = document.getElementById('newUsername').value.trim().toLowerCase();
    const name = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const isAdmin = document.getElementById('newIsAdmin').value === 'true';
    
    if (!username || !name || !password) {
        showFeedback('Preencha todos os campos.', 'danger');
        return;
    }

    if (usersDB[username]) {
        showFeedback('Usuário de login já existe.', 'danger');
        return;
    }

    usersDB[username] = { pass: password, isAdmin: isAdmin, name: name };
    showFeedback(`Usuário ${name} adicionado com sucesso!`);
    
    // Limpa o formulário e re-renderiza a lista
    document.getElementById('newUsername').value = '';
    document.getElementById('newName').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('usersList').innerHTML = renderUsersList();
}

/** Lógica para excluir usuário. */
function handleDeleteUser(event) {
    const usernameToDelete = event.currentTarget.dataset.username;
    
    if (usernameToDelete === appState.currentUser.username) {
        showFeedback('Você não pode excluir seu próprio usuário.', 'danger');
        return;
    }
    
    if (confirm(`Tem certeza que deseja excluir o usuário ${usersDB[usernameToDelete].name}?`)) {
        delete usersDB[usernameToDelete];
        showFeedback(`Usuário ${usernameToDelete} excluído.`);
        document.getElementById('usersList').innerHTML = renderUsersList();
    }
}

/** Lógica de Exportação (Simulação de CSV). */
function handleExport() {
    elements.exportOptions.style.display = elements.exportOptions.style.display === 'flex' ? 'none' : 'flex';
}

function createCSV(data, filename) {
    if (data.length === 0) {
        showFeedback('Nenhum dado para exportar.', 'danger');
        return;
    }
    
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).map(v => `"${v}"`).join(',')).join('\n');
    
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(headers + '\n' + rows);
    
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showFeedback(`Exportação ${filename} concluída!`, 'success');
}

function handleExportFilter(period) {
    let filteredData = deliveries;
    const now = new Date();
    
    if (period === 'daily') {
        filteredData = deliveries.filter(d => {
            const deliveryDate = new Date(d.timestamp);
            return deliveryDate.toDateString() === now.toDateString();
        });
    } else if (period === 'weekly') {
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        filteredData = deliveries.filter(d => new Date(d.timestamp) >= startOfWeek);
    } else if (period === 'monthly') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        filteredData = deliveries.filter(d => new Date(d.timestamp) >= startOfMonth);
    }
    
    createCSV(filteredData, `pegazus_entregas_${period}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
}


// =========================================================
//                  EVENT LISTENERS
// =========================================================

// Função auxiliar para capitalizar a primeira letra
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializa os dispositivos da câmera (precisa de permissão do usuário)
    await enumerateDevices(); 

    // 2. Eventos de Autenticação
    elements.btnLogin.addEventListener('click', handleLogin);
    elements.loginPass.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    elements.btnLogout.addEventListener('click', handleLogout);

    // 3. Eventos de Navegação
    elements.btnDashboard.addEventListener('click', () => renderView('dashboard'));
    elements.btnMap.addEventListener('click', () => renderView('map'));
    elements.btnRoutes.addEventListener('click', () => renderView('routes'));
    elements.btnUsers.addEventListener('click', () => renderView('users'));
    elements.btnScanMode.addEventListener('click', startCamera);
    elements.btnBackCamera.addEventListener('click', () => renderView('dashboard'));

    // 4. Eventos do Scanner
    elements.btnTorch.addEventListener('click', toggleTorch);
    elements.cameraSelect.addEventListener('change', (e) => {
        appState.currentDeviceId = e.target.value;
        startCamera(appState.currentDeviceId);
    });

    // 5. Eventos de Exportação
    elements.btnExport.addEventListener('click', handleExport);
    elements.btnExportDaily.addEventListener('click', () => handleExportFilter('daily'));
    elements.btnExportWeekly.addEventListener('click', () => handleExportFilter('weekly'));
    elements.btnExportMonthly.addEventListener('click', () => handleExportFilter('monthly'));
    elements.btnExportAll.addEventListener('click', () => handleExportFilter('all'));
});

// Garante que o estado inicial esteja correto (apenas login visível)
elements.appContainer.classList.add('hidden');
elements.cameraView.classList.add('hidden');
elements.loginSection.style.display = 'flex';
