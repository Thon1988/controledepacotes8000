// app.js — PegazusLog v1.0 (Com Persistência Firebase Firestore)
// Este script depende do 'firebase-config.js' e das bibliotecas do Firebase carregadas no HTML.

// ======================// DADOS ESTÁTICOS E VARIÁVEIS // ======================
// Usuários Estáticos (Definidos no código, não gerenciáveis pelo CRUD)
const VALID_USERS = {
    "thon": {password:"882010", role:"admin"},
    "user1": {password:"123", role:"colaborador"}
};
// ALL_USERS será populado pela função loadUsers() do Firestore
let ALL_USERS = Object.assign({}, VALID_USERS); 

let currentUser = null;
let scans = []; // Populated by loadScans()
let map, routeLayer, userMarker; 
let rafId = null;
let currentStream = null;
let scanning = false;
let currentFilters = { gestor: "all", dateStart: null, dateEnd: null };
let filteredScans = [];

// Elementos DOM
const video = document.getElementById("videoElement");
const overlay = document.getElementById("overlay");
const deliveriesList = document.getElementById("deliveriesList");
const sidebar = document.getElementById("sidebar");
const camSelect = document.getElementById("cameraSelect");
let overlayCtx = overlay ? overlay.getContext("2d") : null; 

// ======================// FUNÇÕES DE PERSISTÊNCIA (FIREBASE) // ======================

/**
 * Carrega todos os usuários dinâmicos do Firestore e atualiza ALL_USERS.
 * @returns {Promise<boolean>} Retorna true se o carregamento for bem-sucedido.
 */
async function loadUsers() {
    try {
        const usersRef = db.collection("users");
        const snapshot = await usersRef.get();
        let dynamicUsersFromDB = {};
        
        // Mapeia os documentos do Firestore para um objeto de usuários
        snapshot.forEach(doc => {
            dynamicUsersFromDB[doc.id] = doc.data();
        });
        
        // Combina usuários estáticos com dinâmicos
        ALL_USERS = Object.assign({}, VALID_USERS, dynamicUsersFromDB);
        
        console.log(`[Firebase] Usuários carregados: ${Object.keys(ALL_USERS).length}`);
        return true;
        
    } catch (e) {
        console.error("[Firebase] Erro ao carregar usuários:", e);
        // Em caso de falha, mantém apenas os usuários estáticos
        ALL_USERS = Object.assign({}, VALID_USERS);
        return false;
    }
}

/**
 * Salva ou Atualiza um usuário no Firestore.
 * @param {string} username O nome de usuário (será o ID do documento).
 * @param {object} userData O objeto de dados do usuário ({password, role}).
 * @returns {Promise<boolean>} Retorna true se for salvo com sucesso.
 */
async function saveUser(username, userData) {
    try {
        // O ID do documento no Firestore é o próprio username
        await db.collection("users").doc(username).set(userData);
        // Atualiza ALL_USERS localmente imediatamente
        await loadUsers(); 
        return true;
    } catch (e) {
        console.error("[Firebase] Erro ao salvar usuário:", e);
        return false;
    }
}

/**
 * Deleta um usuário do Firestore.
 * @param {string} username O nome de usuário a ser deletado.
 * @returns {Promise<boolean>} Retorna true se for deletado com sucesso.
 */
async function deleteUserFromDB(username) {
    try {
        await db.collection("users").doc(username).delete();
        await loadUsers(); // Recarrega a lista após a exclusão
        return true;
    } catch (e) {
        console.error("[Firebase] Erro ao deletar usuário:", e);
        return false;
    }
}

/**
 * Carrega todas as Entregas (Scans) do Firestore.
 * @returns {Promise<boolean>} Retorna true se o carregamento for bem-sucedido.
 */
async function loadScans() {
    try {
        // Ordena por timestamp para mostrar os mais recentes primeiro
        const scansRef = db.collection("scans").orderBy("timestamp", "desc");
        const snapshot = await scansRef.get();
        scans = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Converte o Timestamp do Firestore para um objeto Date e depois para String ISO
            if (data.timestamp && typeof data.timestamp.toDate === 'function') {
                data.timestamp = data.timestamp.toDate().toISOString();
            } else {
                 data.timestamp = new Date().toISOString();
            }
            scans.push(data);
        });
        
        console.log(`[Firebase] Entregas carregadas: ${scans.length}`);
        return true;
    } catch (e) {
        console.error("[Firebase] Erro ao carregar entregas:", e);
        scans = [];
        return false;
    }
}

/**
 * Salva uma nova Entrega no Firestore.
 * @param {object} newScan O objeto de entrega (scan).
 * @returns {Promise<boolean>} Retorna true se for salvo com sucesso.
 */
async function saveScan(newScan) {
    try {
        // Usa o ID gerado pelo JS para o documento no Firestore
        await db.collection("scans").doc(newScan.id).set(newScan);
        
        // Atualiza a lista local para refletir a mudança
        await loadScans(); 
        updateFilteredScans();
        
        return true;
    } catch (e) {
        console.error("[Firebase] Erro ao salvar entrega:", e);
        return false;
    }
}

// ======================// LOGIN E SAIR // ======================

document.getElementById("loginBtn").onclick = async () => {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    const feedback = document.getElementById("feedbackMessage");
    
    feedback.textContent = "Verificando...";

    // 1. Garante que a lista ALL_USERS está atualizada (Lê do Firebase)
    await loadUsers(); 

    // 2. Tenta a validação
    if (ALL_USERS[username] && ALL_USERS[username].password === password) {
        currentUser = { username, role: ALL_USERS[username].role };
        // Armazena no localStorage apenas o nome de usuário (para persistência da sessão)
        localStorage.setItem("loggedUser", username); 
        document.body.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        initApp();
    } else {
        feedback.textContent = "Usuário ou senha incorretos";
    }
};

document.getElementById("btnSair").onclick = logout;
function logout() { 
    localStorage.removeItem("loggedUser");
    location.reload(); 
}

// ======================// INICIALIZAÇÃO // ======================
window.addEventListener('DOMContentLoaded', async () => {
    const loggedUser = localStorage.getItem("loggedUser");
    
    // 1. Garante que os usuários (incluindo o logado) sejam carregados antes de qualquer coisa
    await loadUsers();

    if (loggedUser && ALL_USERS[loggedUser]) {
        currentUser = { username: loggedUser, role: ALL_USERS[loggedUser].role };
        document.body.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        initApp();
    }
});

async function initApp() {
    initMap();
    initMenuEvents();
    
    // 2. Carrega as Entregas do Firebase
    await loadScans();
    
    // 3. Aplica restrições e exibe a view inicial
    applyUserLimitations(); 
    populateGestorFilter(); // Usa a lista ALL_USERS atualizada
    updateFilteredScans(); // Exibe a lista inicial
    showView('list'); 
}


// ======================// FUNÇÕES DE UTILIDADE E INTERFACE // ======================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function beep() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // Frequência A4
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);

    oscillator.start();
    // Para o som após 100ms
    setTimeout(() => oscillator.stop(), 100);
}

function showView(viewId) {
    document.querySelectorAll('.view-container > div').forEach(div => {
        div.style.display = 'none';
    });
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.style.display = 'block';
        if (viewId === 'map' && map) {
            map.invalidateSize();
        } else if (viewId === 'userManagementView') {
            renderUserManagementView();
        } else if (viewId === 'cameraContainer') {
            // Lógica para iniciar a câmera e o scanner
            initCamera();
        } else if (viewId === 'deliveriesList') {
            // Garante que a lista de entregas é renderizada/atualizada ao ser vista
             updateFilteredScans();
        }
    }
}

function initMenuEvents() {
    document.getElementById("btnCamera").onclick = () => showView('cameraContainer');
    document.getElementById("btnDeliveries").onclick = () => showView('deliveriesList');
    document.getElementById("btnMap").onclick = () => showView('map');
    document.getElementById("btnManageUsers").onclick = () => showView('userManagementView');
    document.getElementById("createUserBtn").onclick = createUser;
    document.getElementById("applyFilters").onclick = handleFilterChange;
    
    // Eventos de Exportação
    document.getElementById("btnExport").onclick = () => {
        const menu = document.getElementById("exportMenu");
        menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
    };
    document.querySelectorAll('.exportOption').forEach(btn => {
        btn.onclick = () => {
            const period = btn.getAttribute('data-period');
            exportFilteredScansToCSV(period);
        };
    });
}

function applyUserLimitations() {
    const manageUsersBtn = document.getElementById("btnManageUsers");
    const exportBtn = document.getElementById("exportContainer");
    
    // Apenas Administrador e Gestor podem ver a lista de entregas e exportar
    if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
        manageUsersBtn.style.display = (currentUser.role === 'admin') ? 'block' : 'none';
        exportBtn.style.display = 'block';
    } else {
        // Colaborador tem acesso apenas à câmera e mapa
        exportBtn.style.display = 'none';
    }
}

// ======================// FUNÇÕES DE GESTÃO DE USUÁRIOS (FIREBASE) //======================

function renderUserManagementView() {
    const userTableBody = document.getElementById("userTableBody");
    userTableBody.innerHTML = '';

    // Renderiza a tabela de USUÁRIOS DINÂMICOS (Filtrando os estáticos)
    Object.keys(ALL_USERS).forEach(username => {
        if (!VALID_USERS[username]) { // Garante que não é um usuário estático
            const user = ALL_USERS[username];
            const row = userTableBody.insertRow();
            row.innerHTML = `
                <td>${username}</td>
                <td>${user.role}</td>
                <td>
                    <button onclick="editUser('${username}')" class="edit-btn">Editar</button>
                    <button onclick="deleteUser('${username}')" class="delete-btn" 
                        ${currentUser.role !== 'admin' || user.role === 'admin' ? 'disabled' : ''}
                        >Excluir</button>
                </td>
            `;
        }
    });
    
    // Reseta o feedback
    document.getElementById("userFeedbackMessage").textContent = '';
}

async function createUser() {
    const username = document.getElementById("newUsername").value.trim();
    const password = document.getElementById("newPassword").value.trim();
    const role = document.getElementById("newUserRole").value;
    const feedback = document.getElementById("userFeedbackMessage");
    
    if (!username || !password || !role) {
        feedback.textContent = "Preencha todos os campos.";
        feedback.style.color = "red";
        return;
    }

    if (ALL_USERS[username]) {
        feedback.textContent = `Usuário "${username}" já existe.`;
        feedback.style.color = "red";
        return;
    }
    
    feedback.textContent = "Salvando no banco de dados...";
    feedback.style.color = "blue";
    
    // 1. SALVA NO FIREBASE
    const success = await saveUser(username, { password: password, role: role });

    if (success) {
        feedback.textContent = `✅ Usuário "${username}" (${role}) criado com sucesso e salvo.`;
        feedback.style.color = "green";
    
        renderUserManagementView(); 
        document.getElementById("newUsername").value = '';
        document.getElementById("newPassword").value = '';
    } else {
        feedback.textContent = "❌ Erro ao salvar usuário no Firebase.";
        feedback.style.color = "red";
    }
}

async function editUser(username) {
    const user = ALL_USERS[username];
    if (!user || VALID_USERS[username]) return alert("Usuário não encontrado ou é estático.");
    if (currentUser.role !== 'admin' && username !== currentUser.username) return alert("Você não tem permissão para editar este usuário.");

    const newPassword = prompt(`Editar Senha para ${username} (Deixe em branco para manter a senha atual):`);
    let newRole = user.role;
    let passwordUpdated = false;

    if (newPassword !== null) { 
        if (currentUser.role === 'admin') {
             newRole = prompt(`Editar Função para ${username} (admin, gestor, colaborador):`, user.role) || user.role;
             if (!['admin', 'gestor', 'colaborador'].includes(newRole)) {
                 alert("Função inválida. Manter a função anterior.");
                 newRole = user.role;
             }
        }
        
        if (newPassword.trim() !== '') {
            user.password = newPassword.trim();
            passwordUpdated = true;
        }
        
        if (passwordUpdated || newRole !== user.role) {
            const success = await saveUser(username, { password: user.password, role: newRole });
            if (success) {
                renderUserManagementView();
                alert(`Usuário ${username} atualizado com sucesso no Firebase!`);
                if (username === currentUser.username) {
                    // Se o próprio usuário logado for editado (ex: mudou a senha), força o logout
                    logout();
                }
            } else {
                alert("Falha ao atualizar o usuário no Firebase.");
            }
        }
    }
}

async function deleteUser(username) {
    const user = ALL_USERS[username];
    if (!user || VALID_USERS[username] || currentUser.role !== 'admin' || user.role === 'admin') return; 

    if (confirm(`Tem certeza que deseja EXCLUIR o usuário "${username}" (${user.role})? Essa exclusão é permanente no banco de dados.`)) {
        const success = await deleteUserFromDB(username);
        
        if (success) {
            renderUserManagementView();
            alert(`Usuário ${username} excluído permanentemente.`);
        } else {
             alert("Falha ao excluir o usuário no Firebase.");
        }
    }
}


// ======================// FUNÇÕES DE CÂMERA E SCANNER // ======================

function initCamera() {
    // Esconde o mapa/lista e mostra o container da câmera
    showView('cameraContainer'); 
    document.getElementById("manualEntryBtn").style.display = 'block';

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices()
            .then(devices => {
                const videoDevices = devices.filter(device => device.kind === 'videoinput');
                if (videoDevices.length > 0) {
                    populateCameraSelect(videoDevices);
                    camSelect.style.display = 'block';
                } else {
                    startCamera(null); // Inicia com a câmera padrão
                }
            });
    } else {
        startCamera(null);
    }
}

function populateCameraSelect(devices) {
    camSelect.innerHTML = '';
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Camera ${camSelect.options.length + 1}`;
        camSelect.appendChild(option);
    });

    camSelect.onchange = () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        startCamera(camSelect.value);
    };

    if (camSelect.options.length > 0) {
        camSelect.value = devices[0].deviceId;
        startCamera(devices[0].deviceId);
    }
}

function startCamera(deviceId) {
    if (scanning) return; // Previne múltiplas execuções
    
    // Define a restrição para a câmera traseira
    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: 'environment' // Prefere a câmera traseira em dispositivos móveis
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            currentStream = stream;
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                overlay.width = video.videoWidth;
                overlay.height = video.videoHeight;
                scanning = true;
                document.getElementById("scanLine").style.display = 'block';
                scanLoop();
            };
        })
        .catch(err => {
            console.error("Erro ao acessar a câmera: ", err);
            scanning = false;
            document.getElementById("scanLine").style.display = 'none';
            alert("Não foi possível acessar a câmera. Verifique as permissões.");
        });
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    scanning = false;
    document.getElementById("scanLine").style.display = 'none';
    document.getElementById("manualEntryBtn").style.display = 'none';
}

function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Redimensiona o canvas para o tamanho do vídeo para processamento
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        
        // Desenha o frame do vídeo no canvas
        overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
        
        // Obtém os dados da imagem do canvas
        const imageData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
        
        // Tenta decodificar o QR Code
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code) {
            // Desenha a caixa delimitadora do QR Code (opcional)
            drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#FF3B58");
            drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#FF3B58");
            drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#FF3B58");
            drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#FF3B58");

            // QR Code detectado!
            handleScanResult(code.data);
            return; // Sai do loop após o sucesso
        }
    }
    
    // Continua o loop de scan
    if (scanning) {
        rafId = requestAnimationFrame(scanLoop);
    }
}

function drawLine(begin, end, color) {
    overlayCtx.beginPath();
    overlayCtx.moveTo(begin.x, begin.y);
    overlayCtx.lineTo(end.x, end.y);
    overlayCtx.lineWidth = 4;
    overlayCtx.strokeStyle = color;
    overlayCtx.stroke();
}

// Handler de Resultado (Atualizado para ser assíncrono)
async function handleScanResult(code) {
    stopCamera(); 
    
    // 1. Obtém a localização atual
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
            // Simulação de geocodificação
            const address = `Endereço simulado perto de Lat:${coords.lat.toFixed(4)}`;
            
            const type = prompt("Tipo de Entrega (Ex: 'Coleta' ou 'Entrega'):", "Entrega");
            if (type) {
                // 2. Registra e salva no Firebase
                await registerScan(code, coords, type, address);
            }
            
            // 3. Volta para a lista de entregas
            showView('deliveriesList');
            
        }, (error) => {
            console.error("Erro de Geolocalização: ", error);
            alert("Não foi possível obter a localização. O scan foi abortado.");
            showView('deliveriesList'); // Volta para a lista mesmo com erro
        });
    } else {
        alert("Geolocalização não suportada. Scan abortado.");
        showView('deliveriesList');
    }
}

// Botão de Entrada Manual
document.getElementById("manualEntryBtn").onclick = () => {
    stopCamera();
    
    const code = prompt("Digite o código da entrega:");
    const type = prompt("Tipo de Entrega (Ex: 'Coleta' ou 'Entrega'):", "Entrega");
    
    if (code && type) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
                const address = `Endereço Manual perto de Lat:${coords.lat.toFixed(4)}`;
                
                // Registra e salva no Firebase
                await registerScan(code, coords, type, address);
                
                showView('deliveriesList');
            }, (error) => {
                console.error("Erro de Geolocalização: ", error);
                alert("Não foi possível obter a localização. Registro manual abortado.");
                showView('deliveriesList');
            });
        } else {
            alert("Geolocalização não suportada. Registro manual abortado.");
            showView('deliveriesList');
        }
    } else {
        showView('deliveriesList');
    }
};

// Registro Assíncrono da Entrega (Salva no Firebase)
async function registerScan(code, coords, type, address) {
    if (!currentUser) return console.error("Erro: Usuário não logado ao registrar scan.");
    
    // Evita duplicatas em um curto espaço de tempo (5 segundos)
    if (scans.some(s => s.code === code && new Date() - new Date(s.timestamp) < 5000)) {
        console.log("Scan recente ignorado.");
        alert("Este código foi escaneado recentemente.");
        return;
    }

    const newScan = {
        id: generateId(),
        code: code,
        lat: coords.lat,
        lng: coords.lng,
        timestamp: new Date(), // Envia como objeto Date para o Firestore
        type: type, 
        address: address,
        gestor: currentUser.username
    };
    
    // SALVA NO FIREBASE
    const success = await saveScan(newScan);
    
    if (success) {
        alert(`Entrega ${code} registrada por ${currentUser.username} e salva no Firebase!`);
        beep();
    } else {
        alert("Falha ao registrar a entrega no Firebase.");
    }
}

// ======================// FUNÇÕES DE FILTRO E LISTA // ======================

function populateGestorFilter() {
    const select = document.getElementById("filterGestor");
    select.innerHTML = '';
    select.innerHTML += `<option value="all">Todos os Gestores</option>`;
    
    const gestorUsernames = Object.keys(ALL_USERS).filter(u => ALL_USERS[u].role === 'gestor' || ALL_USERS[u].role === 'admin');
    
    // Adiciona o usuário logado se ele for colaborador e não gestor/admin
    if (currentUser && currentUser.role === 'colaborador' && !gestorUsernames.includes(currentUser.username)) {
         gestorUsernames.push(currentUser.username);
    }
    
    gestorUsernames.forEach(username => {
        const option = document.createElement('option');
        option.value = username;
        option.text = username;
        select.appendChild(option);
    });
}

function handleFilterChange() {
    // Coleta os novos valores de filtro
    currentFilters.gestor = document.getElementById("filterGestor").value;
    currentFilters.dateStart = document.getElementById("filterDateStart").value;
    currentFilters.dateEnd = document.getElementById("filterDateEnd").value;
    
    updateFilteredScans();
}

function updateFilteredScans() {
    let tempScans = scans;

    // Filtro por Gestor
    if (currentFilters.gestor !== 'all') {
        tempScans = tempScans.filter(s => s.gestor === currentFilters.gestor);
    } else if (currentUser.role === 'colaborador') {
        // Colaborador só vê o que ele mesmo fez
        tempScans = tempScans.filter(s => s.gestor === currentUser.username);
    }
    
    // Filtro por Data (Início)
    if (currentFilters.dateStart) {
        const start = new Date(currentFilters.dateStart);
        // Adiciona 1 dia para garantir que inclui scans feitos no dia de início
        start.setDate(start.getDate()); 
        tempScans = tempScans.filter(s => new Date(s.timestamp) >= start);
    }

    // Filtro por Data (Fim)
    if (currentFilters.dateEnd) {
        const end = new Date(currentFilters.dateEnd);
        // Garante que inclui scans feitos até o final do dia
        end.setDate(end.getDate() + 1); 
        tempScans = tempScans.filter(s => new Date(s.timestamp) < end);
    }
    
    filteredScans = tempScans;
    renderDeliveriesList();
    document.getElementById("btnDeliveries").textContent = `📦 Entregas (${filteredScans.length})`;
}


function renderDeliveriesList() {
    deliveriesList.innerHTML = '';
    
    if (filteredScans.length === 0) {
        deliveriesList.innerHTML = '<p style="text-align: center; margin-top: 50px; color: var(--secondary-color);">Nenhuma entrega encontrada com os filtros atuais.</p>';
        return;
    }

    filteredScans.forEach(scan => {
        const date = new Date(scan.timestamp).toLocaleString();
        const item = document.createElement('div');
        item.className = 'delivery-item';
        item.innerHTML = `
            <strong>${scan.code} <span class="id-label">(${scan.type})</span></strong>
            <p class="address">${scan.address}</p>
            <div class="metadata">
                Registrado por: ${scan.gestor} | Data/Hora: ${date}
            </div>
        `;
        deliveriesList.appendChild(item);
    });
}

// ======================// FUNÇÕES DE MAPA E ROTA // ======================

function initMap() {
    if (!map) {
        map = L.map('map').setView([-23.55052, -46.633309], 13); // Centrado em São Paulo
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        routeLayer = L.layerGroup().addTo(map);
    }
}

document.getElementById("btnRoute").onclick = generateRoute;

function generateRoute() {
    if (filteredScans.length === 0) {
        alert("Não há entregas filtradas para gerar uma rota.");
        return;
    }
    
    showView('map');
    routeLayer.clearLayers();

    const coordinates = filteredScans.map(s => [s.lat, s.lng]);
    const locations = filteredScans.map(s => ({
        lat: s.lat, 
        lng: s.lng, 
        code: s.code, 
        type: s.type, 
        gestor: s.gestor
    }));
    
    if (locations.length > 0) {
        // Adiciona marcadores e calcula a rota mais simples (traçado em ordem de registro)
        let latlngs = [];
        locations.forEach((loc, index) => {
            latlngs.push([loc.lat, loc.lng]);
            L.marker([loc.lat, loc.lng])
                .addTo(routeLayer)
                .bindPopup(`<b>${index + 1}. Código: ${loc.code}</b><br>Tipo: ${loc.type}<br>Gestor: ${loc.gestor}`);
        });

        if (latlngs.length > 1) {
            // Desenha a polilinha conectando os pontos
            L.polyline(latlngs, {color: 'blue'}).addTo(routeLayer);
        }
        
        // Ajusta a visualização do mapa para incluir todos os marcadores
        map.fitBounds(L.latLngBounds(latlngs));
    }
    
    map.invalidateSize();
}

// ======================// FUNÇÕES DE EXPORTAÇÃO CSV // ======================

function exportFilteredScansToCSV(period) {
    if (filteredScans.length === 0) {
        alert("Não há dados para exportar com os filtros atuais.");
        return;
    }

    const headers = ["ID", "Código", "Tipo", "Latitude", "Longitude", "Gestor", "Data/Hora", "Endereço"];
    let csvContent = headers.join(",") + "\n";

    filteredScans.forEach(scan => {
        const row = [
            scan.id,
            scan.code,
            scan.type,
            scan.lat,
            scan.lng,
            scan.gestor,
            new Date(scan.timestamp).toISOString(),
            scan.address.replace(/,/g, ";") // Substitui vírgulas por ponto e vírgula no endereço para evitar quebras de CSV
        ].map(item => `"${item}"`).join(","); // Envolve todos os itens com aspas para lidar com vírgulas

        csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    
    const start = currentFilters.dateStart || 'Inicio';
    const end = currentFilters.dateEnd || 'Fim';
    const filename = `PegazusLog_Export_${period}_${start}_a_${end}.csv`;
    
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`Exportação ${period.toUpperCase()} concluída: ${filteredScans.length} registros.`);
}