// app.js — PegazusLog v0.6 (FINAL) | Inclui novo Design, Usuários e Parsing de QR Code por Linha

// ======================// LOGIN E UTILS // ======================
const VALID_USERS = {
    "thon": {password:"882010", role:"admin"},
    "manager1": {password:"123", role:"gestor"},
    "user1": {password:"123", role:"colaborador"}
};

// Carrega usuários dinâmicos e combina com os estáticos
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
        // Som Simples de Sucesso (Curto, Frequência Alta)
        const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
        audio.play();
    } catch (e) { console.warn("Falha ao emitir beep."); }
}

function buzz() {
    try {
        // Som Simples de Erro (Mais longo, Frequência Baixa)
        const audio = new Audio("data:audio/wav;base64,UklGRqIAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YR4AAABoZGhkaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGg==");
        audio.play();
    } catch (e) { console.warn("Falha ao emitir buzz."); }
}

function updateDeliveriesCount() {
    const total = scans.length;
    const filtered = filteredScans.length;
    document.getElementById("btnDeliveries").textContent = `📦 Entregas (${filtered} de ${total})`;
}

// ======================// GERENCIAMENTO DE VISUALIZAÇÃO // ======================

function showView(viewId) {
    // Esconde todas as visualizações principais
    document.getElementById("map").style.display = "none";
    document.getElementById("deliveriesList").style.display = "none";
    document.getElementById("cameraContainer").style.display = "none";
    document.getElementById("userManagementView").style.display = "none"; 
    stopScanner(); 

    // Oculta elementos flutuantes
    const scanLine = document.getElementById("scanLine");
    if(scanLine) scanLine.style.display = "none";
    const manualEntryBtn = document.getElementById("manualEntryBtn");
    if(manualEntryBtn) manualEntryBtn.style.display = "none"; 
    const voltarBtn = document.getElementById("btnVoltarCamera");
    if (voltarBtn) voltarBtn.style.display = "none";

    sidebar.style.display = "flex";
    document.getElementById("exportMenu").style.display = "none";
    document.querySelector(".view-container").style.left = "240px"; // Ajustado para 240px


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
            break;
    }
}

// ======================// LOGIN E SAIR // ======================
document.getElementById("loginBtn").onclick = () => {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    
    // Usa ALL_USERS para verificar credenciais
    if (ALL_USERS[username] && ALL_USERS[username].password === password) {
        currentUser = { username, role: ALL_USERS[username].role };
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
    location.reload(); 
}

// ======================// INICIALIZAÇÃO // ======================
window.addEventListener('DOMContentLoaded', () => {
    const loggedUser = localStorage.getItem("loggedUser");
    
    // Usa ALL_USERS para verificar login
    if (loggedUser && ALL_USERS[loggedUser]) {
        currentUser = { username: loggedUser, role: ALL_USERS[loggedUser].role };
        document.body.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        initApp();
    }
});

function initApp() {
    initMap();
    
    // Cria e configura o botão "Voltar" (FIXO NA PARTE INFERIOR CENTRALIZADA)
    const voltarBtn = document.createElement('button');
    voltarBtn.id = "btnVoltarCamera";
    voltarBtn.textContent = "🔙 Voltar ao Início"; 
    
    // CSS para posicionar no rodapé e centralizar horizontalmente
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

    showView('list'); 
    
    initMenuEvents();
    populateGestorFilter(); 

    // Visibilidade do Gerenciamento de Usuários
    const btnManageUsers = document.getElementById("btnManageUsers");
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'gestor')) {
        btnManageUsers.style.display = 'block';
    } else {
        btnManageUsers.style.display = 'none';
    }
}

function initMenuEvents() {
    document.getElementById("btnMap").onclick = () => { showView('map'); };
    document.getElementById("btnDeliveries").onclick = () => { showView('list'); };
    document.getElementById("btnRoute").onclick = generateOptimizedRoute;
    document.getElementById("btnCamera").onclick = () => showView('camera');

    // Evento para o Calendário Interativo
    document.getElementById("applyFilters").onclick = () => {
        currentFilters.gestor = document.getElementById("filterGestor").value;
        currentFilters.dateStart = document.getElementById("filterDateStart").value;
        currentFilters.dateEnd = document.getElementById("filterDateEnd").value;
        updateFilteredScans();
    };

    // Eventos de Exportação
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

    // Evento para Gerenciar Usuários
    const btnManageUsers = document.getElementById("btnManageUsers");
    if (btnManageUsers) {
        btnManageUsers.onclick = () => { 
            showView('user-management'); 
            renderUserManagementView(); 
        };
    }

    // Evento para Entrada Manual
    const manualEntryBtn = document.getElementById("manualEntryBtn");
    if (manualEntryBtn) {
        manualEntryBtn.onclick = handleManualEntry;
    }

    // Evento para Criar Usuário
    const createUserBtn = document.getElementById("createUserBtn");
    if (createUserBtn) {
        createUserBtn.onclick = createUser;
    }
}

// ======================// ENTRADA MANUAL CORRIGIDA // ======================

function handleManualEntry() {
    stopScanner();
    
    const manualId = prompt("✏️ 1/4 Digite o ID da Entrega (código principal):");
    
    if (manualId === null || manualId.trim() === "") {
        buzz(); // Som de erro para ID inválido
        alert("ID inválido ou cancelado.");
        showView('list');
        return;
    }

    const nome = prompt("✏️ 2/4 Digite o Nome do Cliente:");
    const endereco = prompt("✏️ 3/4 Digite o Endereço completo (Rua, Número, Bairro, Cidade):");
    const telefone = prompt("✏️ 4/4 Digite o Telefone do Cliente:");
    
    // Chamamos registerManualEntry, passando os dados estruturados.
    registerManualEntry({
        rawId: manualId.trim(),
        nome: nome ? nome.trim() : "Nome Não Informado",
        endereco: endereco ? endereco.trim() : "",
        telefone: telefone ? telefone.trim() : "",
        cep: "" // CEP não capturado
    });
}

async function registerManualEntry(manualData) {
    if (scans.find(s => s.rawId === manualData.rawId)) {
        stopScanner();
        buzz();
        alert("ID de Entrega já registrado!");
        showView('list');
        return;
    }

    const scanObj = {
        id: generateId(), 
        rawId: manualData.rawId, 
        nome: manualData.nome, 
        endereco: manualData.endereco,
        cep: manualData.cep,
        telefone: manualData.telefone,
        gestor: currentUser ? currentUser.username : "Desconhecido",
        date: new Date().toLocaleString('pt-BR')
    };
    
    // Tenta obter coordenadas geográficas
    await geocodeAddress(scanObj);

    // Salva o novo registro
    scans.unshift(scanObj);
    localStorage.setItem("pegazus_scans", JSON.stringify(scans));
    
    stopScanner();
    beep(); // Som de sucesso
    
    // Confirmação para o usuário
    alert(`✅ Registro Manual Concluído!\nCliente: ${scanObj.nome}\nEndereço: ${scanObj.endereco || 'Não Encontrado'}`); 
    
    updateFilteredScans(); 
    showView('list');
}


// ======================// GERENCIAMENTO DE USUÁRIOS //======================

function renderUserManagementView() {
    const roleSelect = document.getElementById("newUserRole");
    const feedback = document.getElementById("userFeedbackMessage");
    
    if (!roleSelect || !currentUser) return;
    
    roleSelect.innerHTML = '';
    feedback.textContent = '';
    
    const roles = [];
    
    // Admin pode criar gestor e colaborador
    if (currentUser.role === 'admin') {
        roles.push('gestor', 'colaborador');
    } 
    // Gestor pode criar colaborador
    else if (currentUser.role === 'gestor') {
        roles.push('colaborador');
    }
    
    roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        roleSelect.appendChild(option);
    });
    
    // Limpa campos
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
        feedback.textContent = `Usuário "${username}" já existe.`;
        feedback.style.color = "red";
        return;
    }

    // Adiciona ao objeto dinâmico e persiste
    const newUser = { password: password, role: role };
    DYNAMIC_USERS[username] = newUser;
    
    // Atualiza ALL_USERS (combina estáticos + dinâmicos)
    ALL_USERS = Object.assign({}, VALID_USERS, DYNAMIC_USERS); 
    
    localStorage.setItem("pegazus_users", JSON.stringify(DYNAMIC_USERS));

    feedback.textContent = `✅ Usuário "${username}" (${role}) criado com sucesso.`;
    feedback.style.color = "green";
    
    // Limpa formulário após sucesso
    document.getElementById("newUsername").value = '';
    document.getElementById("newPassword").value = '';
}

// ======================// MAPA LEAFLET // ======================
function initMap() {
    const mapElement = document.getElementById("map");
    if (mapElement.gmap) return;
    
    map = L.map('map').setView([-23.5505, -46.6333], 12); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    mapElement.gmap = map;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const userPos = [pos.coords.latitude, pos.coords.longitude];
            map.setView(userPos, 14);
            userMarker = L.marker(userPos).addTo(map).bindPopup("Você está aqui").openPopup();
        });
    }
}

function updateMapMarkers(listToRender) {
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== userMarker) {
            map.removeLayer(layer);
        }
    });

    listToRender.forEach(scanObj => {
        if (scanObj.lat && scanObj.lng) {
            L.marker([scanObj.lat, scanObj.lng]).addTo(map)
                .bindPopup(`<b>${scanObj.nome}</b><br>${scanObj.endereco}`);
        }
    });
}

// ======================// SCANNER AVANÇADO (Câmera Robusta) // ======================

async function startScanner(deviceId) {
    try {
        if (!video || !overlayCtx) throw new Error("Elementos do scanner não encontrados.");
        if(currentStream) stopScanner();

        let constraints;
        let successful = false;

        // TENTATIVA 1: Prioriza a câmera traseira padrão ("environment")
        if (!deviceId) {
             constraints = { video: { facingMode: { exact: "environment" } } };
             try {
                 currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                 successful = true;
             } catch (e) {
                 console.warn("Falha 1 (environment). Tentando TENTATIVA 2 (principal).", e);
             }
        }
        
        // TENTATIVA 2: Busca pela câmera principal (resolução alta)
        if (!successful && !deviceId) {
            constraints = { video: { 
                width: { min: 1280 }, 
                height: { min: 720 }, 
                facingMode: { exact: "environment" }
            }};
            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                successful = true;
            } catch (e) {
                console.warn("Falha 2 (resolução alta). Tentando TENTATIVA 3 (frontal).", e);
            }
        }
        
        // TENTATIVA 3: Fallback para a câmera frontal ('user')
        if (!successful && !deviceId) {
            constraints = { video: { facingMode: { exact: "user" } } };
            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                successful = true;
            } catch (e) {
                console.warn("Falha 3 (user). Recorrendo ao seletor manual. Erro:", e);
            }
        }
        
        // TENTATIVA ESPECÍFICA (via seletor manual)
        if (deviceId) {
             constraints = { video: { deviceId: { exact: deviceId } } };
             currentStream = await navigator.mediaDevices.getUserMedia(constraints);
             successful = true;
        }


        if (successful) {
            video.srcObject = currentStream;
            await video.play();
            scanning = true;
            video.onloadedmetadata = () => { 
                overlay.width = video.videoWidth; 
                overlay.height = video.videoHeight; 
                scanLoop(); 
            };
            camSelect.style.display = "none";
            return; // Sucesso
        }
        
        // 4. ÚLTIMO RECURSO: Mostra o seletor manual
        await showCameraSelector();


    } catch (e) {
        console.error("Erro fatal na inicialização da câmera:", e);
        await showCameraSelector();
    }
}

async function showCameraSelector() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        camSelect.innerHTML = '<option value="">Selecione a Câmera</option>';
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Câmera ${camSelect.options.length}`; 
            camSelect.appendChild(option);
        });

        if (videoDevices.length > 0) {
            camSelect.style.display = "block"; 
        } else {
             alert("Nenhuma câmera detectada.");
             showView('list');
        }

    } catch (e) {
        alert("Erro fatal ao listar câmeras: " + e.message);
        showView('list');
    }
}

camSelect.onchange = (e) => {
    const deviceId = e.target.value;
    if (deviceId) {
        startScanner(deviceId); // Chama startScanner com o ID escolhido
    }
};

function stopScanner() {
    scanning = false;
    if (currentStream) { 
        currentStream.getTracks().forEach(t => t.stop()); 
        currentStream = null;
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    if(camSelect) camSelect.style.display = "none";
    
    // Esconde a linha scanner e botão manual
    const scanLine = document.getElementById("scanLine");
    if(scanLine) scanLine.style.display = "none";
    const manualEntryBtn = document.getElementById("manualEntryBtn");
    if(manualEntryBtn) manualEntryBtn.style.display = "none";
}

function scanLoop() {
    if (!scanning || !video || !overlayCtx) return;
    
    // Desenha o vídeo no canvas para processamento
    overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
    const imgData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height);
    
    if (code) {
        // Desenha o retângulo de detecção do QR Code
        const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = code.location;
        overlayCtx.strokeStyle = "#00FF00"; overlayCtx.lineWidth = 4; overlayCtx.beginPath();
        overlayCtx.moveTo(topLeftCorner.x, topLeftCorner.y); overlayCtx.lineTo(topRightCorner.x, topRightCorner.y);
        overlayCtx.lineTo(bottomRightCorner.x, bottomRightCorner.y); overlayCtx.lineTo(bottomLeftCorner.x, bottomLeftCorner.y);
        overlayCtx.closePath(); overlayCtx.stroke();

        // O registro é feito aqui. O som de sucesso é emitido dentro de registerScan.
        registerScan(code.data);
    }
    rafId = requestAnimationFrame(scanLoop);
}

// ======================// REGISTRO E GEOCODIFICAÇÃO // ======================

async function geocodeAddress(scanObj) {
    if (!scanObj.endereco) return;
    // Usa CEP se disponível, senão usa apenas Endereço
    const query = encodeURIComponent(`${scanObj.endereco}${scanObj.cep ? ', ' + scanObj.cep : ''}, Brasil`);
    try {
        // Usa Nominatim (OpenStreetMap) para geocodificação
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
        const data = await resp.json();
        if (data.length > 0) {
            scanObj.lat = parseFloat(data[0].lat);
            scanObj.lng = parseFloat(data[0].lon);
        } else { scanObj.lat = scanObj.lng = null; }
    } catch (e) { scanObj.lat = scanObj.lng = null; console.error("Erro geocodificação:", e); }
}

async function registerScan(data) {
    if (scans.find(s => s.rawId === data)) {
        stopScanner();
        buzz(); // Som de erro para código já registrado
        alert("QR Code já registrado!");
        showView('list');
        return;
    }
    
    let nome = "ID/Desconhecido";
    let enderecoCompleto = "";
    let telefone = "";
    let cep = "";
    
    // Tentativa 1: Parsing baseado em Ordem (assumindo quebras de linha para Destinatário e Endereço)
    const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length >= 2) {
        // Assume que a primeira linha é o Destinatário
        nome = lines[0];
        // Assume que as linhas seguintes formam o endereço completo para geocodificação
        enderecoCompleto = lines.slice(1).join(', '); 
    } else {
        // Fallback: Usa o código bruto como nome
        nome = `ID: ${data.substring(0, 20).trim()}`;
    }
    
    // Tentativa 2: Fallback ou Complemento via Regex (para Telefone e CEP se estiverem marcados)
    const regex = (key) => {
        const match = data.match(new RegExp(`${key}:([^\n]*)`, 'i'));
        return match ? match[1].trim() : "";
    };

    // Tenta complementar o telefone e CEP, se o QR Code usar o formato CHAVE:VALOR para eles
    telefone = regex("TELEFONE");
    cep = regex("CEP");

    // Estruturação do objeto de registro
    const scanObj = {
        id: generateId(), 
        rawId: data, 
        nome: nome, 
        endereco: enderecoCompleto,
        cep: cep,
        telefone: telefone,
        gestor: currentUser ? currentUser.username : "Desconhecido",
        date: new Date().toLocaleString('pt-BR')
    };
    
    // Tenta obter coordenadas geográficas
    await geocodeAddress(scanObj);

    // Salva o novo registro
    scans.unshift(scanObj);
    localStorage.setItem("pegazus_scans", JSON.stringify(scans));
    
    stopScanner();
    beep(); // Som de sucesso
    
    // Confirmação para o usuário
    alert(`✅ Registro QR Code Concluído!\nComprador: ${scanObj.nome}\nEndereço: ${scanObj.endereco || 'Não Encontrado'}`); 
    
    updateFilteredScans(); 
    showView('list');
}

// ======================// FILTROS E LISTAGEM // ======================
function populateGestorFilter() {
    const select = document.getElementById("filterGestor");
    const uniqueGestores = [...new Set(scans.map(s => s.gestor).concat(Object.keys(ALL_USERS).filter(u => ALL_USERS[u].role !== 'colaborador')))]; 

    select.innerHTML = '<option value="all">Todos</option>';
    uniqueGestores.sort().forEach(gestor => {
        if(gestor === "Desconhecido") return;
        const option = document.createElement('option');
        option.value = gestor;
        option.textContent = gestor;
        select.appendChild(option);
    });
}

function parseStoredDate(s) {
    const parts = s.date.split(',')[0].trim().split('/');
    // Cria a data no formato YYYY, MM-1, DD
    return new Date(parts[2], parts[1] - 1, parts[0]); 
}

function updateFilteredScans() {
    filteredScans = [...scans];
    
    if (currentFilters.gestor !== "all") {
        filteredScans = filteredScans.filter(s => s.gestor === currentFilters.gestor);
    }
    
    if (currentFilters.dateStart || currentFilters.dateEnd) {
        const start = currentFilters.dateStart ? new Date(currentFilters.dateStart + 'T00:00:00') : null;
        const end = currentFilters.dateEnd ? new Date(currentFilters.dateEnd + 'T23:59:59') : null;

        filteredScans = filteredScans.filter(s => {
            const scanDate = parseStoredDate(s);
            
            let isAfterStart = start ? scanDate >= start : true;
            let isBeforeEnd = end ? scanDate <= end : true;
            
            return isAfterStart && isBeforeEnd;
        });
    }

    renderDeliveriesList(filteredScans);
    if(document.getElementById("map").style.display === "block") updateMapMarkers(filteredScans);
    updateDeliveriesCount();
}

function renderDeliveriesList(listToRender = filteredScans) {
    if (!deliveriesList) return;
    
    if (listToRender.length === 0) {
        deliveriesList.innerHTML = "<p style='text-align:center; padding: 20px;'>Nenhuma entrega encontrada.</p>";
    } else {
         deliveriesList.innerHTML = listToRender.map(s => 
            // Usa a nova classe CSS para o visual moderno (definida no index.html)
            `<div class="delivery-item">
                <strong>${s.nome} <span class="id-label">(ID: ${s.id})</span></strong>
                
                <div class="address">${s.endereco}</div>
                
                <div class="metadata">
                    📦 Registrado por: 
                    <span style="font-weight: 600;">${s.gestor}</span> em 
                    ${s.date.split(',')[0].trim()}
                </div>
            </div>`
        ).join("");
    }
}


// ======================// ROTA OTIMIZADA // ======================
function generateOptimizedRoute(){
    if(!map) return alert("Mapa não inicializado");
    if(routeLayer) map.removeLayer(routeLayer);

    const points=filteredScans.filter(s=>s.lat&&s.lng).map(s=>({lat:s.lat,lng:s.lng,nome:s.nome}));
    if(points.length<2) return alert("São necessários pelo menos 2 endereços com geolocalização.");

    // Implementação simplificada do Algoritmo do Vizinho Mais Próximo (Heurística)
    let visited=[], route=[points[0]]; visited.push(0);
    while(route.length<points.length){
        const last=route[route.length-1]; let nearestIdx=-1, nearestDist=Infinity;
        points.forEach((p,i)=>{
            if(!visited.includes(i)){
                // Calcula distância euclidiana simples (não é a distância real, mas serve como heurística)
                const dist=Math.hypot(last.lat-p.lat,last.lng-p.lng); 
                if(dist<nearestDist){ 
                    nearestDist=dist; 
                    nearestIdx=i;
                }
            }
        });
        if(nearestIdx !== -1) {
            route.push(points[nearestIdx]); 
            visited.push(nearestIdx);
        } else {
            break; 
        }
    }

    const latlngs=route.map(p=>[p.lat,p.lng]);
    routeLayer=L.polyline(latlngs,{color:'blue'}).addTo(map);
    map.fitBounds(routeLayer.getBounds());
    alert("Rota otimizada (Vizinho Mais Próximo) gerada no mapa.");
}


// ======================// EXPORTAÇÃO CSV POR PERÍODO // ======================

function exportCSV(period){
  if(scans.length===0){ alert("Nenhum registro!"); return; }

  const now = new Date();
  let filtered = [...scans];
  let filename = "entregas_geral";

  // Lógica de filtro por período
  if(period==="diario"){
    filtered=scans.filter(s=>parseStoredDate(s).toDateString()===now.toDateString());
    filename = "entregas_diario";
  } else if(period==="quinzenal"){
    const currentDayOfMonth = now.getDate();
    filtered=scans.filter(s=>{
      const d = parseStoredDate(s);
      const dDay = d.getDate();
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear() && 
             ((currentDayOfMonth >= 1 && currentDayOfMonth <= 15 && dDay >= 1 && dDay <= 15) || 
              (currentDayOfMonth > 15 && dDay > 15));
    });
    filename = "entregas_quinzenal";
  } else if(period==="mensal"){
    filtered=scans.filter(s=>{
      const d = parseStoredDate(s);
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    });
    filename = "entregas_mensal";
  }

  if(filtered.length===0){ alert(`Nenhum registro encontrado para o período ${period}.`); return; }
  
  // CSV HEADER: rawId (código completo) incluído
  const csvHeader = "id,rawId,nome,endereco,cep,telefone,gestor,data,latitude,longitude\n";
  
  // Mapeia os dados, garantindo que o rawId (código completo) e outros campos com vírgulas/aspas sejam tratados corretamente
  const csvData = filtered.map(s => {
      // Função para envolver o campo em aspas e duplicar aspas internas (padrão CSV)
      const escapeCsv = (data) => `"${String(data || '').replace(/"/g, '""')}"`;

      return `${s.id},${escapeCsv(s.rawId)},${escapeCsv(s.nome)},${escapeCsv(s.endereco)},${escapeCsv(s.cep)},${escapeCsv(s.telefone)},${escapeCsv(s.gestor)},${escapeCsv(s.date)},${s.lat || ''},${s.lng || ''}`;
  }).join("\n");
            
  // Adiciona BOM (Byte Order Mark) para garantir que caracteres especiais sejam lidos corretamente
  const bom = "\uFEFF"; 
  const csv = csvHeader + csvData;
  const blob = new Blob([bom + csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
