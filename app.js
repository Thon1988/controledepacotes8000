// app.js — PegazusLog v1.0 (Com Persistência Firebase)

// ATENÇÃO: Este script depende do 'firebase-config.js' e das bibliotecas do Firebase carregadas no HTML.

// ======================// DADOS ESTÁTICOS E VARIÁVEIS // ======================
// Usuários Estáticos (Definidos no código, não gerenciáveis pelo CRUD)
const VALID_USERS = {
    "thon": {password:"882010", role:"admin"},
    "user1": {password:"123", role:"colaborador"}
};
// DYNAMIC_USERS e ALL_USERS serão populados pela função loadUsers() do Firestore
let ALL_USERS = Object.assign({}, VALID_USERS); 

let currentUser = null;
let scans = []; // Populated by loadScans()
let map, routeLayer, userMarker; 
let rafId = null;
let currentStream = null;
let scanning = false;
let currentFilters = { gestor: "all", dateStart: null, dateEnd: null };
let filteredScans = [];

// ... (Restante das variáveis e DOM elements) ...
const video = document.getElementById("videoElement");
const overlay = document.getElementById("overlay");
const deliveriesList = document.getElementById("deliveriesList");
const sidebar = document.getElementById("sidebar");
const camSelect = document.getElementById("cameraSelect");
let overlayCtx = overlay ? overlay.getContext("2d") : null; 

// ======================// FUNÇÕES DE PERSISTÊNCIA (FIREBASE) // ======================

// Carrega usuários dinâmicos do Firestore
async function loadUsers() {
    try {
        const usersRef = db.collection("users");
        const snapshot = await usersRef.get();
        let dynamicUsersFromDB = {};
        
        snapshot.forEach(doc => {
            dynamicUsersFromDB[doc.id] = doc.data();
        });
        
        // Combina usuários estáticos com dinâmicos
        ALL_USERS = Object.assign({}, VALID_USERS, dynamicUsersFromDB);
        
        console.log(`Usuários carregados: ${Object.keys(ALL_USERS).length}`);
        return true;
        
    } catch (e) {
        console.error("Erro ao carregar usuários do Firestore:", e);
        // Em caso de falha, mantém apenas os usuários estáticos
        ALL_USERS = Object.assign({}, VALID_USERS);
        alert("Erro ao conectar ao banco de dados de usuários.");
        return false;
    }
}

// Salva/Atualiza um usuário no Firestore
async function saveUser(username, userData) {
    try {
        // O ID do documento no Firestore é o próprio username
        await db.collection("users").doc(username).set(userData);
        // Atualiza ALL_USERS localmente imediatamente
        await loadUsers(); 
        return true;
    } catch (e) {
        console.error("Erro ao salvar usuário:", e);
        return false;
    }
}

// Deleta um usuário no Firestore
async function deleteUserFromDB(username) {
    try {
        await db.collection("users").doc(username).delete();
        await loadUsers(); // Recarrega a lista após a exclusão
        return true;
    } catch (e) {
        console.error("Erro ao deletar usuário:", e);
        return false;
    }
}

// Carrega Entregas (Scans) do Firestore
async function loadScans() {
    try {
        const scansRef = db.collection("scans").orderBy("timestamp", "desc");
        const snapshot = await scansRef.get();
        scans = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Garante que o timestamp seja um objeto Date para manipulação
            data.timestamp = data.timestamp ? data.timestamp.toDate().toISOString() : new Date().toISOString();
            scans.push(data);
        });
        
        console.log(`Entregas carregadas: ${scans.length}`);
        return true;
    } catch (e) {
        console.error("Erro ao carregar entregas do Firestore:", e);
        scans = [];
        return false;
    }
}

// Salva uma nova Entrega no Firestore
async function saveScan(newScan) {
    try {
        // Usa o ID gerado pelo JS para o documento no Firestore
        await db.collection("scans").doc(newScan.id).set(newScan);
        
        // Atualiza a lista local para refletir a mudança
        await loadScans(); 
        updateFilteredScans();
        
        return true;
    } catch (e) {
        console.error("Erro ao salvar entrega:", e);
        return false;
    }
}


// ======================// LOGIN E SAIR // ======================

// O login deve ser assíncrono para esperar o carregamento dos usuários do Firestore
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
    showView('list'); 
}

// ... (O restante do código deve ser copiado do seu app.js, pois a lógica 
// de interface e manipulação local (exceto CRUD de usuários e Scans) não muda) ...
// Abaixo estão as funções CRUD de usuários atualizadas para o Firebase:

// ======================// FUNÇÕES DO CRUD DE USUÁRIOS (ATUALIZADAS) //======================

function renderUserManagementView() {
    // ... (Mantém a lógica de renderização) ...

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
                        ${currentUser.role === 'gestor' && user.role === 'gestor' ? 'disabled' : ''}
                        ${user.role === 'admin' || user.role === 'gestor' && currentUser.role === 'gestor' ? 'disabled' : ''}
                        >Excluir</button>
                </td>
            `;
        }
    });
    
    // ... (Mantém a lógica de limpeza de formulário) ...
}


async function createUser() {
    const username = document.getElementById("newUsername").value.trim();
    const password = document.getElementById("newPassword").value.trim();
    const role = document.getElementById("newUserRole").value;
    const feedback = document.getElementById("userFeedbackMessage");
    
    if (!username || !password || !role) {
        // ...
        return;
    }

    if (ALL_USERS[username]) {
        // ...
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
    if (!user) return alert("Usuário não encontrado.");
    
    // ... (Lógica de permissão mantida) ...
    
    const newPassword = prompt(`Editar Senha para ${username} (Deixe em branco para manter a senha atual):`);
    let newRole = user.role;
    let passwordUpdated = false;

    if (newPassword !== null) { 
        // ... (Lógica de prompt para nova função) ...
        
        if (newPassword.trim() !== '') {
            user.password = newPassword.trim();
            passwordUpdated = true;
        }
        
        if (passwordUpdated || newRole !== user.role) {
            const success = await saveUser(username, { password: user.password, role: newRole });
            if (success) {
                renderUserManagementView();
                alert(`Usuário ${username} atualizado com sucesso no Firebase!`);
            } else {
                alert("Falha ao atualizar o usuário no Firebase.");
            }
        }
    }
}

async function deleteUser(username) {
    const user = ALL_USERS[username];
    if (!user || VALID_USERS[username]) return; // Não permite deletar estáticos
    
    // ... (Lógica de permissão mantida) ...

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


// ... (O resto das funções de utilidade e interface, como generateId, initMap, etc., devem ser mantidas) ...

// ** IMPORTANTE: O registerScan também deve ser atualizado para usar saveScan(newScan) **

async function registerScan(code, coords, type, address) {
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
        timestamp: new Date(), // Envia como objeto Date para o Firestore
        type: type, 
        address: address,
        gestor: currentUser.username
    };
    
    // 1. SALVA NO FIREBASE
    const success = await saveScan(newScan);
    
    if (success) {
        alert(`Entrega ${code} registrada por ${currentUser.username} e salva no Firebase!`);
        beep();
    } else {
        alert("Falha ao registrar a entrega no Firebase.");
    }
}
