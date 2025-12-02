/**
 * Pegazus Logística - app.js
 * Lógica de Autenticação, Navegação, Scanner (jsQR) e Mapa (Leaflet).
 */

// --- Variáveis Globais ---
const userCredentials = [
    { user: "thon", pass: "882010", role: "deliverer" },
    { user: "admin", pass: "4321", role: "admin" }
];

let currentUser = null;
let currentCameraStream = null;
let mapInstance = null;
let tileLayer = null;
const mapMarkers = {}; // Para armazenar marcadores das entregas

// Elementos HTML principais
const loginSection = document.getElementById('loginSection');
const appContainer = document.getElementById('appContainer');
const cameraView = document.getElementById('cameraView');
const videoElement = document.getElementById('videoElement');
const contentArea = document.getElementById('contentArea');
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const cameraSelect = document.getElementById('cameraSelect');
const feedbackMsg = document.getElementById('feedbackMsg');
const manualInputContainer = document.getElementById('manualInputContainer');

// Botões
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const menuItems = document.querySelectorAll('.menu-item');

// --- Funções de Utilitários ---

/** Exibe uma mensagem de feedback temporariamente. */
function showFeedback(message, type = 'info', duration = 3000) {
    feedbackMsg.textContent = message;
    feedbackMsg.style.opacity = '1';
    
    // Altera a cor com base no tipo
    if (type === 'success') {
        feedbackMsg.style.backgroundColor = 'var(--success)';
    } else if (type === 'error') {
        feedbackMsg.style.backgroundColor = 'var(--danger)';
    } else {
        feedbackMsg.style.backgroundColor = 'var(--accent)';
    }

    setTimeout(() => {
        feedbackMsg.style.opacity = '0';
        feedbackMsg.style.backgroundColor = 'var(--accent)'; // Volta ao padrão
    }, duration);
}

/** Exibe um SweetAlert2 para confirmações e notificações. */
function showAlert(title, text, icon = 'info') {
    Swal.fire({
        title: title,
        text: text,
        icon: icon,
        confirmButtonText: 'Entendi',
        customClass: {
            confirmButton: 'btn-primary'
        }
    });
}

/** Simula a obtenção de dados de entrega. */
function getDeliveryData(id) {
    // Simula dados reais
    const data = {
        'BR123456789': { status: 'Aguardando Coleta', location: 'Centro de Distribuição A', coords: [-23.5505, -46.6333], type: 'Coleta' },
        'BR987654321': { status: 'Em Rota de Entrega', location: 'Av. Paulista, 1000', coords: [-23.5613, -46.6566], type: 'Entrega', recipient: 'João Silva' },
        'BR555555555': { status: 'Entrega Concluída', location: 'Rua do Teste, 50', coords: [-23.585, -46.687], type: 'Entrega', recipient: 'Maria Santos' }
    };
    return data[id];
}

// --- Funções de Navegação e Layout ---

/** Alterna a visibilidade da barra lateral em dispositivos móveis. */
function toggleSidebar() {
    sidebar.classList.toggle('active');
}

/** Alterna entre modos de tela cheia (Mapa/Scanner) e modo Dashboard. */
function toggleFullScreenMode(enable) {
    // No layout de Flexbox/Block, o modo tela cheia é menos sobre alterar o container
    // e mais sobre garantir que o elemento (mapa/scanner) ocupe a viewport
    if (window.innerWidth <= 768) {
        // Em mobile, a barra lateral deve ser fechada
        sidebar.classList.remove('active');
    }
}

/** Atualiza a interface (Menu e Rótulos) após o login. */
function updateUI(user) {
    document.getElementById('displayUser').textContent = user.user.toUpperCase();
    document.getElementById('adminMenuOptions').classList.toggle('hidden', user.role !== 'admin');
    
    // Exibe o botão de menu mobile
    mobileMenuBtn.classList.remove('hidden');
}

/** Renderiza o conteúdo da seção selecionada. */
function renderContent(sectionId) {
    // Remove a classe 'active' de todos os itens do menu
    menuItems.forEach(item => item.classList.remove('active'));
    // Adiciona a classe 'active' ao item selecionado
    document.getElementById(`btn${sectionId}`).classList.add('active');
    
    // Oculta a view da câmera e o app container, por padrão
    cameraView.style.display = 'none';
    appContainer.classList.remove('hidden');
    
    // Fecha o menu lateral em mobile após seleção
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
    
    // Zera o conteúdo da área principal
    contentArea.innerHTML = '';

    // Lógica para carregar o conteúdo
    switch (sectionId) {
        case 'Dashboard':
            toggleFullScreenMode(false);
            stopCamera();
            loadDashboard();
            break;
        case 'ScanMode':
            // Oculta o appContainer para exibir o scanner em tela cheia
            appContainer.classList.add('hidden');
            startCamera();
            break;
        case 'Map':
            toggleFullScreenMode(true);
            stopCamera();
            loadMap();
            break;
        case 'Routes':
            toggleFullScreenMode(false);
            stopCamera();
            loadRoutes();
            break;
        case 'Users':
            toggleFullScreenMode(false);
            stopCamera();
            loadUsersManagement();
            break;
        case 'Export':
            toggleFullScreenMode(false);
            stopCamera();
            loadExport();
            break;
        default:
            contentArea.innerHTML = '<h2>Bem-vindo! Selecione uma opção no menu.</h2>';
    }
}

// --- Funções Específicas de Conteúdo ---

function loadDashboard() {
    // Simula dados do dashboard
    const stats = [
        { title: "Entregas Pendentes", value: 12, icon: '📦', color: '#f59e0b' },
        { title: "Coletas de Hoje", value: 5, icon: '📥', color: '#3b82f6' },
        { title: "Total Concluído", value: 45, icon: '✅', color: '#22c55e' },
    ];

    let html = `
        <h2 style="color:var(--primary);">📊 Dashboard do Entregador</h2>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px;">
    `;
    
    stats.forEach(stat => {
        html += `
            <div class="user-form-card" style="border-left: 5px solid ${stat.color};">
                <p style="font-size: 14px; color: #6b7280;">${stat.title}</p>
                <h3 style="font-size: 32px; font-weight: 700; color:var(--primary);">${stat.icon} ${stat.value}</h3>
            </div>
        `;
    });
    
    html += `</div>
        <h3 style="color:var(--primary); margin-top: 30px;">Próximas Entregas (Amostra)</h3>
        <table style="width:100%; border-collapse: collapse; margin-top: 15px;">
            <thead>
                <tr style="background-color: var(--secondary); color: white;">
                    <th style="padding: 10px; text-align: left;">ID</th>
                    <th style="padding: 10px; text-align: left;">Destino</th>
                    <th style="padding: 10px; text-align: left;">Status</th>
                </tr>
            </thead>
            <tbody>
                <tr style="background-color: var(--content-bg);">
                    <td style="padding: 10px;">BR987654321</td>
                    <td style="padding: 10px;">Av. Paulista, 1000</td>
                    <td style="padding: 10px; color: #f59e0b;">Em Rota</td>
                </tr>
                <tr style="background-color: var(--content-bg-light);">
                    <td style="padding: 10px;">BR112233445</td>
                    <td style="padding: 10px;">Rua da Consolação, 500</td>
                    <td style="padding: 10px; color: #3b82f6;">Atrasada</td>
                </tr>
            </tbody>
        </table>
    `;
    
    contentArea.innerHTML = html;
}

// --- Funções de Mapa (Leaflet) ---

function loadMap() {
    contentArea.innerHTML = `
        <h2 style="color:var(--primary);">🗺️ Mapa de Entregas</h2>
        <div id="deliveryMap" style="height: 600px; width: 100%; margin-top: 20px; border-radius: 10px; box-shadow: var(--shadow);"></div>
    `;

    // Inicializa o mapa apenas uma vez
    if (!mapInstance) {
        // Coordenadas iniciais (São Paulo, Brasil)
        mapInstance = L.map('deliveryMap').setView([-23.5505, -46.6333], 12);

        // Adiciona a camada de mapa (OpenStreetMap)
        tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(mapInstance);
    } else {
        // Se já existir, apenas reatribui ao novo container
        mapInstance.setView([-23.5505, -46.6333], 12);
        mapInstance.invalidateSize(); // Corrige problemas de renderização após mudar a view
    }
    
    // Simula a adição de marcadores
    addDeliveryMarkers();
}

function addDeliveryMarkers() {
    // Dados simulados (os mesmos do getDeliveryData)
    const deliveries = [
        { id: 'BR123456789', status: 'Coleta Pendente', location: 'CD A', coords: [-23.5505, -46.6333], color: 'red' },
        { id: 'BR987654321', status: 'Em Rota', location: 'Av. Paulista', coords: [-23.5613, -46.6566], color: 'blue' },
        { id: 'BR555555555', status: 'Concluída', location: 'Rua do Teste', coords: [-23.585, -46.687], color: 'green' }
    ];

    Object.values(mapMarkers).forEach(marker => mapInstance.removeLayer(marker));
    mapMarkers = {};

    deliveries.forEach(del => {
        // Ícones simples baseados no status
        const markerIcon = L.divIcon({
            className: `custom-marker ${del.color}`,
            html: `<div style="background-color:${del.color}; width:20px; height:20px; border-radius:50%; border: 3px solid white;"></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });

        const marker = L.marker(del.coords, { icon: markerIcon })
            .bindPopup(`<b>ID: ${del.id}</b><br>Local: ${del.location}<br>Status: ${del.status}`)
            .addTo(mapInstance);
            
        mapMarkers[del.id] = marker;
    });
}

function loadRoutes() {
    contentArea.innerHTML = `
        <h2 style="color:var(--primary);">🧭 Rotas Otimizadas</h2>
        <div class="user-form-card">
            <p>Esta seção simularia a otimização de rotas usando um algoritmo. Aqui, você veria a ordem ideal de paradas.</p>
            <ol>
                <li>Coleta BR123456789 (CD A)</li>
                <li>Entrega BR112233445 (Consolação)</li>
                <li>Entrega BR987654321 (Av. Paulista)</li>
            </ol>
            <button class="btn-primary" style="margin-top: 15px;">Iniciar Navegação</button>
        </div>
    `;
}

function loadUsersManagement() {
     if (currentUser.role !== 'admin') {
        contentArea.innerHTML = '<h2 style="color:var(--danger);">🚫 Acesso Negado</h2><p>Você não tem permissão para acessar esta seção.</p>';
        return;
    }
    
    // Simula a listagem de usuários
    const usersHtml = userCredentials.map(u => `
        <div class="user-form-card" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Usuário: <strong>${u.user}</strong> (Função: ${u.role.toUpperCase()})</span>
            <button class="btn-primary" style="background:var(--danger); padding: 8px 12px; font-size:14px; box-shadow:none;" onclick="showAlert('Simulação','Ação: Excluir ${u.user}','warning')">Excluir</button>
        </div>
    `).join('');

    contentArea.innerHTML = `
        <h2 style="color:var(--primary);">👥 Gerenciar Usuários</h2>
        <div style="margin-bottom: 20px;">
            <input type="text" placeholder="Novo Usuário">
            <input type="password" placeholder="Nova Senha">
            <select>
                <option value="deliverer">Entregador</option>
                <option value="admin">Administrador</option>
            </select>
            <button class="btn-primary" style="width:100%;" onclick="showAlert('Simulação','Novo usuário adicionado','success')">Adicionar Novo</button>
        </div>
        ${usersHtml}
    `;
}

function loadExport() {
    // Apenas garante que os botões de exportação sejam visíveis na sidebar
    // A lógica de exportação real estaria no backend ou seria um download de CSV
    contentArea.innerHTML = `
        <h2 style="color:var(--primary);">📤 Exportar Dados</h2>
        <p>Use o menu lateral esquerdo (Exportar Dados) para selecionar o período de exportação (Diário, Semanal, Mensal, Todos). O arquivo CSV será gerado e baixado.</p>
        <div class="user-form-card">
            <p style="font-weight: bold;">Funcionalidade de Exportação (Simulação)</p>
            <button class="btn-primary" onclick="showAlert('Sucesso','Simulando exportação de todos os dados... Download iniciado.','success')" style="background:#6b7280;">Simular Exportação Completa</button>
        </div>
    `;
}

// --- Funções do Scanner (jsQR) ---

/** Inicia a câmera e o loop de escaneamento. */
async function startCamera(deviceId = null) {
    // 1. Oculta o conteúdo principal e mostra a view da câmera
    cameraView.style.display = 'flex';

    // 2. Busca dispositivos de câmera (se for a primeira vez)
    if (cameraSelect.options.length <= 1) {
        await enumerateDevices();
    }
    
    // 3. Para qualquer stream anterior
    stopCamera();

    // 4. Inicia novo stream
    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: 'environment' // Preferir a câmera traseira em mobile
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentCameraStream = stream;
        videoElement.srcObject = stream;
        videoElement.play();
        
        // 5. Inicia o loop de escaneamento após a câmera carregar
        videoElement.onloadedmetadata = () => {
            requestAnimationFrame(tick);
        };
        showFeedback('Aguardando código de barras/QR...', 'info');

    } catch (err) {
        console.error("Erro ao acessar a câmera:", err);
        showFeedback('Erro: Câmera indisponível ou permissão negada.', 'error');
        cameraView.style.display = 'none';
        appContainer.classList.remove('hidden');
    }
}

/** Para a câmera e o stream. */
function stopCamera() {
    if (currentCameraStream) {
        currentCameraStream.getTracks().forEach(track => track.stop());
        currentCameraStream = null;
    }
}

/** Enumera as câmeras disponíveis e preenche o select. */
async function enumerateDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    cameraSelect.innerHTML = '';
    if (videoDevices.length === 0) {
        cameraSelect.innerHTML = '<option value="">Nenhuma Câmera Encontrada</option>';
        return;
    }

    videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Câmera ${index + 1}`;
        cameraSelect.appendChild(option);
    });
}

/** Loop principal de escaneamento de QR Code. */
function tick() {
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        // Cria um canvas para processar o frame do vídeo
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = videoElement.videoHeight;
        canvas.width = videoElement.videoWidth;
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Usa jsQR para escanear o código
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code) {
            // Código encontrado
            handleScanResult(code.data);
            return; // Sai do loop para não escanear o mesmo código repetidamente
        }
    }

    // Continua o loop se a câmera ainda estiver ativa
    if (currentCameraStream) {
        requestAnimationFrame(tick);
    }
}

/** Processa o resultado do scan/entrada manual. */
function handleScanResult(deliveryId) {
    stopCamera();
    
    const data = getDeliveryData(deliveryId);

    if (data) {
        showFeedback(`ID de Entrega Encontrado: ${deliveryId}`, 'success', 5000);
        
        const actionButton = data.status === 'Entrega Concluída' ? 
            `<button class="btn-primary" style="background:var(--secondary); width:100%; margin-top:10px;" disabled>Entrega Concluída</button>` :
            `<button class="btn-primary" style="background:var(--success); width:100%; margin-top:10px;" onclick="confirmDelivery('${deliveryId}')">Confirmar ${data.type}</button>`;
            
        showAlert(
            `${data.type} Encontrada!`,
            `
            <div style="text-align:left; font-size:16px;">
                <p><b>ID:</b> ${deliveryId}</p>
                <p><b>Status:</b> ${data.status}</p>
                <p><b>Local:</b> ${data.location}</p>
                ${data.recipient ? `<p><b>Recebedor:</b> ${data.recipient}</p>` : ''}
                ${actionButton}
            </div>
            `,
            'success'
        ).then(() => {
            // Volta para o dashboard após fechar o alerta
            renderContent('Dashboard');
        });

    } else {
        showFeedback(`ID de Entrega Inválido: ${deliveryId}`, 'error', 5000);
        // Volta a escanear
        setTimeout(() => startCamera(cameraSelect.value), 3000); 
    }
}

/** Simula a confirmação de uma entrega/coleta. */
function confirmDelivery(deliveryId) {
    Swal.fire({
        title: 'Confirmar Ação',
        text: `Você tem certeza que deseja confirmar a entrega/coleta do ID ${deliveryId}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, Confirmar!',
        cancelButtonText: 'Cancelar',
        customClass: {
            confirmButton: 'btn-primary',
            cancelButton: 'btn-primary'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            showAlert('Sucesso!', `ID ${deliveryId} confirmado com sucesso.`, 'success');
            // Simulação: Atualizaria o status no backend aqui
            renderContent('Dashboard');
        } else {
            // Volta para o dashboard se cancelar
            renderContent('Dashboard');
        }
    });
}

// --- Funções de Eventos ---

// 1. Login
btnLogin.addEventListener('click', () => {
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;
    const errorMsg = document.getElementById('loginError');

    const matchedUser = userCredentials.find(c => c.user === user && c.pass === pass);

    if (matchedUser) {
        currentUser = matchedUser;
        errorMsg.textContent = '';
        loginSection.classList.add('hidden');
        appContainer.classList.remove('hidden');
        updateUI(currentUser);
        renderContent('Dashboard'); // Inicia no Dashboard
    } else {
        errorMsg.textContent = 'Usuário ou senha inválidos.';
    }
});

// 2. Logout
btnLogout.addEventListener('click', () => {
    stopCamera();
    currentUser = null;
    appContainer.classList.add('hidden');
    loginSection.classList.remove('hidden');
    mobileMenuBtn.classList.add('hidden');
    document.getElementById('loginPass').value = ''; // Limpa a senha
    showAlert('Desconectado', 'Você saiu do sistema com sucesso.', 'info');
});

// 3. Navegação
menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
        const id = e.currentTarget.id.replace('btn', '');
        if (id === 'Export') {
            // Lógica especial para Exportar: exibe sub-botões
            const exportOptions = document.getElementById('exportOptions');
            const isVisible = exportOptions.style.display === 'flex';
            exportOptions.style.display = isVisible ? 'none' : 'flex';
            
            // Se for Administrador, renderiza o painel de exportação.
            if (currentUser.role === 'admin' && !isVisible) {
                 renderContent(id);
            }
            // Não renderiza conteúdo se for apenas para abrir/fechar o menu
            return; 
        }
        
        // Se for Users, verifica permissão
        if (id === 'Users' && currentUser.role !== 'admin') {
            showAlert('Acesso Negado', 'Apenas administradores podem gerenciar usuários.', 'error');
            return;
        }

        renderContent(id);
    });
});

// 4. Exportação (Sub-botões)
document.getElementById('btnExportDaily').addEventListener('click', () => showAlert('Sucesso', 'Simulando exportação diária...', 'success'));
document.getElementById('btnExportWeekly').addEventListener('click', () => showAlert('Sucesso', 'Simulando exportação semanal...', 'success'));
document.getElementById('btnExportMonthly').addEventListener('click', () => showAlert('Sucesso', 'Simulando exportação mensal...', 'success'));
document.getElementById('btnExportAll').addEventListener('click', () => showAlert('Sucesso', 'Simulando exportação de todos os dados...', 'success'));


// 5. Troca de Câmera
cameraSelect.addEventListener('change', (e) => {
    stopCamera();
    startCamera(e.target.value);
});

// 6. Entrada Manual do Scanner
document.getElementById('btnToggleManualInput').addEventListener('click', () => {
    const isVisible = manualInputContainer.style.opacity === '1';
    if (isVisible) {
        manualInputContainer.style.opacity = '0';
        manualInputContainer.style.pointerEvents = 'none';
    } else {
        manualInputContainer.style.opacity = '1';
        manualInputContainer.style.pointerEvents = 'auto';
        document.getElementById('manualDeliveryId').focus();
    }
});

document.getElementById('btnManualConfirm').addEventListener('click', () => {
    const id = document.getElementById('manualDeliveryId').value.trim();
    if (id) {
        manualInputContainer.style.opacity = '0';
        manualInputContainer.style.pointerEvents = 'none';
        handleScanResult(id);
    } else {
        showFeedback('Por favor, insira um ID.', 'error');
    }
});

// --- Inicialização ---

/** Verifica se há algum usuário logado ao carregar (para fins de desenvolvimento). */
function initialize() {
    // Configura o evento do botão de menu mobile
    mobileMenuBtn.onclick = toggleSidebar;
    
    // Configura o formulário de login para enviar com Enter
    document.getElementById('loginPass').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnLogin.click();
        }
    });

    // Tenta simular o login automático para agilizar o desenvolvimento
    // Remova este bloco em produção
    const autoLogin = userCredentials[0];
    document.getElementById('loginUser').value = autoLogin.user;
    document.getElementById('loginPass').value = autoLogin.pass;
    btnLogin.click();
}

// Inicia a aplicação
initialize();
