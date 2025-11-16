// app.js — PegazusLog v0.9 (Login Corrigido)

// ======================// LOGIN E UTILS // ======================
const VALID_USERS = {
    "thon": {password:"882010", role:"admin"},
    "manager1": {password:"123", role:"gestor"},
    "user1": {password:"123", role:"colaborador"}
};

// Carrega usuários dinâmicos e combina com os estáticos (Estado inicial)
let DYNAMIC_USERS = JSON.parse(localStorage.getItem("pegazus_users") || "{}");
let ALL_USERS = Object.assign({}, VALID_USERS, DYNAMIC_USERS);

let currentUser = null;
let scans = JSON.parse(localStorage.getItem("pegazus_scans") || "[]");
let map, routeLayer, userMarker; 
let rafId = null;
let currentStream = null;
let scanning = false;
let currentFilters = { gestor: "all", dateStart: null, dateEnd: null };
let filteredScans = [];

const video = document.getElementById("videoElement");
const overlay = document.getElementById("overlay");
const deliveriesList = document.getElementById("deliveriesList");
const sidebar = document.getElementById("sidebar");
const camSelect = document.getElementById("cameraSelect");
let overlayCtx = overlay ? overlay.getContext("2d") : null; 

// Geração de ID simples
const generateId = () => Math.random().toString(36).substring(2, 9);

function beep() {
    try {
        const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
        audio.play();
    } catch (e) { console.warn("Falha ao emitir beep."); }
}

function buzz() {
    try {
        const audio = new Audio("data:audio/wav;base64,UklGRqIAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YR4AAABoZGhkaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGg==");
        audio.play();
    } catch (e) { console.warn("Falha ao emitir buzz."); }
}

function updateDeliveriesCount() {
    const total = scans.length;
    const filtered = filteredScans.length;
    document.getElementById("btnDeliveries").textContent = `📦 Entregas (${filtered} de ${total})`;
}

// ======================// GERENCIAMENTO DE VISUALIZAÇÃO E FUNÇÕES // ======================

function applyUserLimitations() {
    const btnManageUsers = document.getElementById("btnManageUsers");
    const btnRoute = document.getElementById("btnRoute");
    
    // 1. Visibilidade do Gerenciamento de Usuários (Admin/Gestor)
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'gestor')) {
        btnManageUsers.style.display = 'block';
    } else {
        btnManageUsers.style.display = 'none';
    }
    
    // 2. Limitação de Funções (Ex: Colaborador não pode gerar Rota)
    if (currentUser && currentUser.role === 'colaborador') {
        btnRoute.style.display = 'none'; 
    } else {
        btnRoute.style.display = 'block'; 
    }
}

function showView(viewId) {
    document.getElementById("map").style.display = "none";
    document.getElementById("deliveriesList").style.display = "none";
    document.getElementById("cameraContainer").style.display = "none";
    document.getElementById("userManagementView").style.display = "none"; 
    stopScanner(); 

    const scanLine = document.getElementById("scanLine");
    if(scanLine) scanLine.style.display = "none";
    const manualEntryBtn = document.getElementById("manualEntryBtn");
    if(manualEntryBtn) manualEntryBtn.style.display = "none"; 
    const voltarBtn = document.getElementById("btnVoltarCamera");
    if (voltarBtn) voltarBtn.style.display = "none";

    sidebar.style.display = "flex";
    document.getElementById("exportMenu").style.display = "none";
    document.querySelector(".view-container").style.left = "240px"; 


    switch (viewId) {
        case 'list':
            document.getElementById("deliveriesList").style.display = "block";
            updateFilteredScans(); 
            break;
        case 'map':
            document.getElementById("map").style.display = "block";
            if (map) map.invalidateSize(); 
            break;
        case 'camera':
            sidebar.style.display = "none"; 
            document.querySelector(".view-container").style.left = "0"; 
            
            if (voltarBtn) voltarBtn.style.display = "block";
            if(manualEntryBtn) manualEntryBtn.style.display = "block"; 
            if(scanLine) scanLine.style.display = "block"; 
            
            document.getElementById("cameraContainer").style.display = "flex";
            startScanner(); 
            break;
        case 'user-management':
            document.getElementById("userManagementView").style.display = "block";
            renderUserManagementView(); 
            break;
    }
}

// ======================// LOGIN E SAIR // ======================
document.getElementById("loginBtn").onclick = () => {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    
    // CORREÇÃO CRÍTICA: Força a re-leitura do localStorage para garantir novos usuários
    const currentDynamicUsers = JSON.parse(localStorage.getItem("pegazus_users") || "{}");
    const currentAllUsers = Object.assign({}, VALID_USERS, currentDynamicUsers);

    // Usa a lista recém-calculada para validação
    if (currentAllUsers[username] && currentAllUsers[username].password === password) {
        currentUser = { username, role: currentAllUsers[username].role };
        localStorage.setItem("loggedUser", username); 
        document.body.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        initApp();
    } else {
        document.getElementById("feedbackMessage").textContent = "Usuário ou senha incorretos";
    }
};

document.getElementById("btnSair").onclick = logout;
function logout() { 
    localStorage.removeItem("loggedUser");
    // O reload garante que o estado inicial das variáveis seja carregado
    location.reload(); 
}

// ======================// INICIALIZAÇÃO // ======================
window.addEventListener('DOMContentLoaded', () => {
    const loggedUser = localStorage.getItem("loggedUser");
    
    // Usa ALL_USERS inicial, que é a combinação na carga da página
    if (loggedUser && ALL_USERS[loggedUser]) {
        currentUser = { username: loggedUser, role: ALL_USERS[loggedUser].role };
        document.body.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        initApp();
    }
});

function initApp() {
    initMap();
    
    // Cria botão Voltar
    const voltarBtn = document.createElement('button');
    voltarBtn.id = "btnVoltarCamera";
    voltarBtn.textContent = "🔙 Voltar ao Início"; 
    
    voltarBtn.style.cssText = `
        position: fixed; 
        bottom: 10px; 
        left: 50%; 
        transform: translateX(-50%); 
        z-index: 1000; 
        display: none; 
        padding: 10px; 
        border: none; 
        border-radius: 6px; 
        cursor: pointer; 
        background: #dc3545; 
        color: white; 
        font-weight: bold; 
        width: 180px;
    `;
    voltarBtn.onclick = () => showView('list');
    document.getElementById("app").appendChild(voltarBtn);

    applyUserLimitations(); 
    showView('list'); 
    
    initMenuEvents();
    populateGestorFilter(); 
}

function initMenuEvents() {
    document.getElementById("btnMap").onclick = () => { showView('map'); };
    document.getElementById("btnDeliveries").onclick = () => { showView('list'); };
    document.getElementById("btnRoute").onclick = generateOptimizedRoute;
    document.getElementById("btnCamera").onclick = () => showView('camera');

    document.getElementById("applyFilters").onclick = () => {
        currentFilters.gestor = document.getElementById("filterGestor").value;
        currentFilters.dateStart = document.getElementById("filterDateStart").value;
        currentFilters.dateEnd = document.getElementById("filterDateEnd").value;
        updateFilteredScans();
    };

    const exportBtn = document.getElementById("btnExport");
    const exportMenu = document.getElementById("exportMenu");

    exportBtn.onclick = () => {
        if (exportMenu) exportMenu.style.display = exportMenu.style.display === "flex" ? "none" : "flex";
    };

    document.querySelectorAll(".exportOption").forEach(btn => {
      btn.onclick = () => {
        if (exportMenu) exportMenu.style.display = "none";
        exportCSV(btn.dataset.period);
      };
    });

    const btnManageUsers = document.getElementById("btnManageUsers");
    if (btnManageUsers) {
        btnManageUsers.onclick = () => { 
            showView('user-management'); 
            renderUserManagementView(); 
        };
    }

    const manualEntryBtn = document.getElementById("manualEntryBtn");
    if (manualEntryBtn) {
        manualEntryBtn.onclick = handleManualEntry;
    }

    const createUserBtn = document.getElementById("createUserBtn");
    if (createUserBtn) {
        createUserBtn.onclick = createUser;
    }
}

// ======================// ENTRADA MANUAL E SCANNER // ======================

function handleManualEntry() {
    const data = prompt("Digite o código de rastreio/endereço manualmente:");
    if (data) {
        registerManualEntry(data);
    }
}

function registerManualEntry(code) {
    if (!code) return;
    
    const address = prompt("Digite o endereço completo para este código de rastreio:", "Rua Exemplo, 100, São Paulo");
    if (!address) return;

    // Simula a geocodificação
    geocodeAddress(address).then(coords => {
        if (coords) {
            registerScan(code, coords, 'manual', address);
        } else {
            alert("Não foi possível geocodificar o endereço. Entrega registrada sem coordenadas.");
            registerScan(code, { lat: null, lng: null }, 'manual', address);
        }
    }).catch(error => {
        console.error("Erro ao geocodificar:", error);
        registerScan(code, { lat: null, lng: null }, 'manual', address);
    });
}

function initMap() {
    if (map) return;
    map = L.map('map').setView([-23.5505, -46.6333], 12); // São Paulo
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    routeLayer = L.layerGroup().addTo(map);
    userMarker = L.marker([-23.5505, -46.6333]).addTo(map)
        .bindPopup("Sua Localização").openPopup();
    
    // Simula a localização do usuário a cada 5 segundos
    setInterval(() => {
        if (userMarker) {
             const randomLat = -23.5505 + (Math.random() - 0.5) * 0.05;
             const randomLng = -46.6333 + (Math.random() - 0.5) * 0.05;
             userMarker.setLatLng([randomLat, randomLng]);
        }
    }, 5000);
}

function updateMapMarkers() {
    if (!map) return;
    
    // Remove marcadores antigos
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== userMarker) {
            map.removeLayer(layer);
        }
    });

    // Adiciona novos marcadores
    filteredScans.forEach(scan => {
        if (scan.lat && scan.lng) {
            L.marker([scan.lat, scan.lng]).addTo(map)
                .bindPopup(`ID: ${scan.code}<br>Endereço: ${scan.address}<br>Gestor: ${scan.gestor}`);
        }
    });
}

function startScanner() {
    if (scanning) return;
    scanning = true;

    navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        if (videoDevices.length > 0) {
            // Exibe o seletor se houver mais de uma câmera
            if (videoDevices.length > 1) {
                camSelect.style.display = 'block';
                camSelect.innerHTML = videoDevices.map(device => 
                    `<option value="${device.deviceId}">${device.label || `Câmera ${device.deviceId}`}</option>`
                ).join('');
            } else {
                camSelect.style.display = 'none';
            }
            
            // Inicializa a câmera
            const constraints = {
                video: { deviceId: videoDevices[0].deviceId } 
            };
            if (camSelect.value) { // Se o usuário selecionou, usa o deviceId
                constraints.video.deviceId = camSelect.value;
            }
            
            navigator.mediaDevices.getUserMedia(constraints)
                .then(stream => {
                    currentStream = stream;
                    video.srcObject = stream;
                    video.play();
                    
                    video.onloadedmetadata = () => {
                        overlay.width = video.videoWidth;
                        overlay.height = video.videoHeight;
                        scanLoop();
                    };
                })
                .catch(err => {
                    console.error("Erro ao acessar a câmera:", err);
                    alert("Não foi possível acessar a câmera. Verifique as permissões.");
                    scanning = false;
                });
        } else {
            alert("Nenhuma câmera encontrada.");
            scanning = false;
        }
    }).catch(err => {
        console.error("Erro ao enumerar dispositivos:", err);
        alert("Erro ao acessar a câmera.");
        scanning = false;
    });

    // Evento para trocar de câmera
    camSelect.onchange = () => {
        stopScanner(); // Para o scanner atual
        startScanner(); // Reinicia com a nova câmera
    };
}

function stopScanner() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    scanning = false;
}

function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
        const imageData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
            buzz();
            console.log("QR Code encontrado:", code.data);
            registerScan(code.data, { 
                lat: userMarker.getLatLng().lat, 
                lng: userMarker.getLatLng().lng 
            }, 'scanner', 'Endereço Indefinido (via QR Code)'); // Endereço real deve vir do dado do QR
            
            // Desenha a caixa de detecção (feedback visual)
            overlayCtx.strokeStyle = "green";
            overlayCtx.lineWidth = 4;
            overlayCtx.beginPath();
            overlayCtx.moveTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
            overlayCtx.lineTo(code.location.topRightCorner.x, code.location.topRightCorner.y);
            overlayCtx.lineTo(code.location.bottomRightCorner.x, code.location.bottomRightCorner.y);
            overlayCtx.lineTo(code.location.bottomLeftCorner.x, code.location.bottomLeftCorner.y);
            overlayCtx.lineTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
            overlayCtx.stroke();

            // Pausa a verificação por um momento após o sucesso
            setTimeout(() => {
                if (scanning) rafId = requestAnimationFrame(scanLoop);
            }, 2000); 

        } else {
            rafId = requestAnimationFrame(scanLoop);
        }
    } else {
        rafId = requestAnimationFrame(scanLoop);
    }
}

async function geocodeAddress(address) {
    // Usando Nominatim (serviço gratuito)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
    } catch (e) {
        console.error("Erro na geocodificação: ", e);
    }
    return null;
}

function registerScan(code, coords, type, address) {
    if (!currentUser) return alert("Erro: Usuário não logado.");
    
    // Evita duplicatas em um curto espaço de tempo
    if (scans.some(s => s.code === code && new Date() - new Date(s.timestamp) < 5000)) {
        console.log("Scan recente ignorado.");
        return;
    }

    const newScan = {
        id: generateId(),
        code: code,
        lat: coords.lat,
        lng: coords.lng,
        timestamp: new Date().toISOString(),
        type: type, // 'scanner' ou 'manual'
        address: address,
        gestor: currentUser.username // Armazena o usuário que registrou
    };
    
    scans.unshift(newScan); // Adiciona no início
    localStorage.setItem("pegazus_scans", JSON.stringify(scans));
    
    // Atualiza a visualização da lista e mapa
    updateFilteredScans(); 
    updateMapMarkers();
    
    alert(`Entrega ${code} registrada por ${currentUser.username}!`);
    beep();
}

// ======================// FILTROS E LISTAGEM // ======================

function populateGestorFilter() {
    const filterSelect = document.getElementById("filterGestor");
    filterSelect.innerHTML = '<option value="all">Todos os Gestores/Usuários</option>';
    
    // Coleta todos os usuários que podem registrar (todos, exceto admin se necessário, mas aqui usaremos todos)
    const gestores = Object.keys(ALL_USERS);
    
    gestores.forEach(username => {
        const option = document.createElement('option');
        option.value = username;
        option.textContent = username.charAt(0).toUpperCase() + username.slice(1);
        filterSelect.appendChild(option);
    });
    
    // Aplica o filtro atual se houver
    filterSelect.value = currentFilters.gestor;
}

function parseStoredDate(dateStr) {
    // Função utilitária para garantir que a comparação de datas funcione corretamente
    const date = new Date(dateStr);
    return date.getTime();
}

function updateFilteredScans() {
    filteredScans = scans.filter(scan => {
        // 1. Filtro por Gestor
        const gestorMatch = currentFilters.gestor === 'all' || scan.gestor === currentFilters.gestor;

        // 2. Filtro por Data
        const scanDate = new Date(scan.timestamp);
        let dateMatch = true;

        if (currentFilters.dateStart) {
            const startDate = new Date(currentFilters.dateStart);
            // Define o início do dia
            startDate.setHours(0, 0, 0, 0); 
            if (scanDate.getTime() < startDate.getTime()) {
                dateMatch = false;
            }
        }

        if (dateMatch && currentFilters.dateEnd) {
            const endDate = new Date(currentFilters.dateEnd);
            // Define o fim do dia
            endDate.setHours(23, 59, 59, 999); 
            if (scanDate.getTime() > endDate.getTime()) {
                dateMatch = false;
            }
        }

        return gestorMatch && dateMatch;
    });

    renderDeliveriesList(filteredScans);
    updateDeliveriesCount();
    updateMapMarkers();
}


function renderDeliveriesList(list) {
    deliveriesList.innerHTML = list.length === 0 ? '<p style="text-align:center; margin-top: 20px;">Nenhuma entrega encontrada com os filtros atuais.</p>' : '';
    
    list.forEach(scan => {
        const item = document.createElement('div');
        item.className = 'delivery-item';
        
        const date = new Date(scan.timestamp);
        const formattedDate = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR');
        
        item.innerHTML = `
            <strong>📦 Código: ${scan.code} <span class="id-label">(ID Interno: ${scan.id})</span></strong>
            <div class="address">${scan.address || 'Localização não informada'}</div>
            <div class="metadata">
                Registrado por: ${scan.gestor} | 
                Em: ${formattedDate} | 
                Tipo: ${scan.type === 'scanner' ? 'QR/Código' : 'Manual'}
            </div>
        `;
        deliveriesList.appendChild(item);
    });
}

// ======================// ROTA E EXPORTAÇÃO // ======================

function generateOptimizedRoute() {
    if (!filteredScans || filteredScans.length < 2) {
        return alert("Necessário pelo menos 2 entregas filtradas com coordenadas válidas para gerar a rota.");
    }
    
    const waypoints = filteredScans
        .filter(s => s.lat && s.lng)
        .map(s => [s.lat, s.lng]);
        
    if (waypoints.length < 2) {
        return alert("Entregas filtradas não possuem coordenadas válidas para gerar a rota.");
    }

    // Adiciona o ponto de partida do usuário (simulado)
    const startPoint = userMarker ? [userMarker.getLatLng().lat, userMarker.getLatLng().lng] : null;
    if (startPoint) {
        waypoints.unshift(startPoint);
    }
    
    // Simplificação: Apenas desenha uma linha conectando os pontos
    routeLayer.clearLayers();
    L.polyline(waypoints, { color: 'red', weight: 5, dashArray: '10, 10' }).addTo(routeLayer);
    
    if (map) {
        const bounds = L.latLngBounds(waypoints);
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    alert(`Rota para ${waypoints.length - (startPoint ? 1 : 0)} pontos gerada com sucesso (Simulação)!`);
    showView('map');
}

function exportCSV(period) {
    if (filteredScans.length === 0) {
        return alert("Nenhuma entrega para exportar com os filtros atuais.");
    }
    
    // Define o nome do arquivo
    const fileName = `pegazus_entregas_${period}_${new Date().toISOString().slice(0, 10)}.csv`;

    // Cabeçalho do CSV
    const headers = ["ID", "Código", "Endereço", "Latitude", "Longitude", "Data/Hora", "Tipo", "Gestor"];
    let csvContent = headers.join(";") + "\n";

    // Adiciona os dados filtrados
    filteredScans.forEach(scan => {
        const row = [
            scan.id,
            scan.code,
            `"${scan.address.replace(/"/g, '""')}"`, // Garante que aspas e vírgulas em endereços funcionem
            scan.lat || '',
            scan.lng || '',
            new Date(scan.timestamp).toLocaleString('pt-BR'),
            scan.type,
            scan.gestor
        ];
        csvContent += row.join(";") + "\n";
    });

    // Cria e baixa o arquivo
    const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert(`Exportação ${period} de ${filteredScans.length} entregas concluída!`);
    } else {
        alert("Seu navegador não suporta download automático. Tente copiar o conteúdo.");
    }
}

// ======================// GERENCIAMENTO DE USUÁRIOS (CRUD) //======================

function saveUsers() {
    localStorage.setItem("pegazus_users", JSON.stringify(DYNAMIC_USERS));
    // CRÍTICO: Atualiza ALL_USERS na memória imediatamente para uso em tempo real na app (e.g., filtros)
    ALL_USERS = Object.assign({}, VALID_USERS, DYNAMIC_USERS); 
    applyUserLimitations(); 
    populateGestorFilter(); // Atualiza a lista de gestores no filtro
}

function renderUserManagementView() {
    const roleSelect = document.getElementById("newUserRole");
    const feedback = document.getElementById("userFeedbackMessage");
    const userTableBody = document.getElementById("userTableBody");
    
    if (!roleSelect || !currentUser) return;
    
    roleSelect.innerHTML = '';
    feedback.textContent = '';
    userTableBody.innerHTML = '';

    const roles = [];
    if (currentUser.role === 'admin') {
        roles.push('gestor', 'colaborador');
    } else if (currentUser.role === 'gestor') {
        roles.push('colaborador');
    }
    
    roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        roleSelect.appendChild(option);
    });
    
    // Renderiza a tabela de USUÁRIOS DINÂMICOS
    Object.keys(DYNAMIC_USERS).forEach(username => {
        const user = DYNAMIC_USERS[username];
        const row = userTableBody.insertRow();
        row.innerHTML = `
            <td>${username}</td>
            <td>${user.role}</td>
            <td>
                <button onclick="editUser('${username}')" class="edit-btn">Editar</button>
                <button onclick="deleteUser('${username}')" class="delete-btn" 
                    ${currentUser.role === 'gestor' && user.role === 'gestor' ? 'disabled' : ''}
                    ${user.role === 'admin' || user.role === 'gestor' && currentUser.role === 'gestor' ? 'disabled' : ''}
                    >Excluir</button>
            </td>
        `;
    });
    
    document.getElementById("newUsername").value = '';
    document.getElementById("newPassword").value = '';
}

function createUser() {
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
        feedback.textContent = `Usuário "${username}" já existe (Estático ou Dinâmico).`;
        feedback.style.color = "red";
        return;
    }

    DYNAMIC_USERS[username] = { password: password, role: role };
    
    // Salva no localStorage e atualiza ALL_USERS (correção 1)
    saveUsers(); 

    feedback.textContent = `✅ Usuário "${username}" (${role}) criado com sucesso. Autorizado para Login.`;
    feedback.style.color = "green";
    
    renderUserManagementView(); 
    document.getElementById("newUsername").value = '';
    document.getElementById("newPassword").value = '';
}

function editUser(username) {
    const user = DYNAMIC_USERS[username];
    if (!user) return alert("Usuário não encontrado.");
    
    if (currentUser.role === 'gestor' && (user.role === 'gestor' || user.role === 'admin')) {
        return alert("Você não tem permissão para editar este tipo de usuário.");
    }
    
    const newPassword = prompt(`Editar Senha para ${username} (Deixe em branco para manter a senha atual):`);
    
    if (newPassword !== null) { 
        const newRole = prompt(`Editar Função para ${username} (Atual: ${user.role}). Digite 'gestor' ou 'colaborador':`);
        
        if (newRole && (newRole === 'gestor' || newRole === 'colaborador')) {
            if (currentUser.role === 'gestor' && newRole === 'gestor' && user.role !== 'gestor') {
                 alert("Gestores só podem gerenciar colaboradores.");
                 return;
            }
            user.role = newRole;
        } else if (newRole !== null && newRole !== '') {
            alert("Função inválida. Nenhuma alteração de função foi feita.");
        }
        
        if (newPassword.trim() !== '') {
            user.password = newPassword.trim();
        }
        
        saveUsers();
        renderUserManagementView();
        alert(`Usuário ${username} atualizado com sucesso!`);
    }
}

function deleteUser(username) {
    const user = DYNAMIC_USERS[username];
    if (!user) return;
    
    if (user.role === 'admin') {
        return alert("ERRO: Usuários Admin não podem ser excluídos.");
    }
    if (currentUser.role === 'gestor' && user.role === 'gestor') {
        return alert("ERRO: Gestores não podem excluir outros Gestores.");
    }

    if (confirm(`Tem certeza que deseja EXCLUIR o usuário "${username}" (${user.role})?`)) {
        delete DYNAMIC_USERS[username];
        saveUsers();
        renderUserManagementView();
        alert(`Usuário ${username} excluído.`);
    }
}
