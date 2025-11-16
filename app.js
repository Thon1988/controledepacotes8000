// app.js — PegazusLog v0.8 (Gerenciamento de Usuários com correção de Login)

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
        // Bloqueia a visualização da rota
        btnRoute.style.display = 'none'; 
    } else {
        btnRoute.style.display = 'block'; 
    }
}

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
    
    // Usa ALL_USERS, que é atualizado após a criação de um novo usuário.
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
    
    if (loggedUser && ALL_USERS[loggedUser]) {
        currentUser = { username: loggedUser, role: ALL_USERS[loggedUser].role };
        document.body.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        initApp();
    }
});

function initApp() {
    initMap();
    
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

// ======================// ENTRADA MANUAL E SCANNER (Omitido o código interno para manter o foco nas alterações do prompt) // ======================
/*
    A lógica de handleManualEntry, registerManualEntry, initMap, updateMapMarkers, 
    startScanner, stopScanner, scanLoop, geocodeAddress e registerScan permanece inalterada
    em relação às versões anteriores.
*/


// ======================// GERENCIAMENTO DE USUÁRIOS (CRUD) //======================

function saveUsers() {
    localStorage.setItem("pegazus_users", JSON.stringify(DYNAMIC_USERS));
    // CRÍTICO: Atualiza ALL_USERS na memória imediatamente
    ALL_USERS = Object.assign({}, VALID_USERS, DYNAMIC_USERS); 
    applyUserLimitations(); 
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
                    ${user.role === 'admin' ? 'disabled' : ''}
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

    // Adiciona ao objeto dinâmico
    DYNAMIC_USERS[username] = { password: password, role: role };
    
    // Salva no localStorage E ATUALIZA ALL_USERS na memória imediatamente.
    // ISTO É A CORREÇÃO para o login imediato.
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


// ======================// FILTROS, LISTAGEM, ROTA, EXPORTAÇÃO (Omitido o código interno para manter o foco nas alterações do prompt) // ======================
/*
    As funções populateGestorFilter, parseStoredDate, updateFilteredScans, renderDeliveriesList,
    generateOptimizedRoute e exportCSV permanecem inalteradas.
*/

// Funções stub para garantir que o JS compile se você não tiver as versões completas
function handleManualEntry() { alert("Funcionalidade Entrada Manual."); }
function registerScan(data) { alert("Funcionalidade Registrar Scan."); }
function initMap() { /* L.map('map').setView([-23.5505, -46.6333], 12); */ }
function generateOptimizedRoute() { alert("Funcionalidade Rota Otimizada."); }
function exportCSV(period) { alert("Funcionalidade Exportar CSV."); }
function updateFilteredScans() { /* renderDeliveriesList([]); */ }
