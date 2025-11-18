// app.js - PegazusLog MOCK (LocalStorage)
// Substitui o uso do Firebase por persistência local (LocalStorage).
// --------------------------- CONFIG ---------------------------
const USERS_KEY = "pegazus_users_v1";
const SESS_KEY = "pegazus_session_v1";
const SCANS_KEY = "pegazus_scans_v1";

// --------------------------- HELPERS ---------------------------
function nowISO(){ return new Date().toISOString(); }
function uuid(){ return 'id-' + Math.random().toString(36).slice(2,9) + '-' + Date.now().toString(36).slice(-6); }
async function hashPassword(password){
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
}
function loadJSON(key, fallback){ try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e){ return fallback; } }
function saveJSON(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }

// --------------------------- SEED / USERS ---------------------------
async function seedIfNeeded(){
    let users = loadJSON(USERS_KEY, []);
    if (users.length) return users;
    // senha inicial: admin123 / gestor123 (apenas mock)
    const adminPass = await hashPassword('admin123');
    const gestorPass = await hashPassword('gestor123');
    const admin = { id: 'user-admin-1', username: 'admin', role: 'admin', passwordHash: adminPass, createdBy: null, createdAt: nowISO(), updatedAt: nowISO() };
    const gestor = { id: 'user-gestor-1', username: 'gestor', role: 'gestor', passwordHash: gestorPass, createdBy: admin.id, createdAt: nowISO(), updatedAt: nowISO() };
    users = [admin, gestor];
    saveJSON(USERS_KEY, users);
    return users;
}
async function getAllUsers(){ await seedIfNeeded(); return loadJSON(USERS_KEY, []); }
async function findUserByUsername(username){ const users = await getAllUsers(); return users.find(u => u.username === username) || null; }
async function findUserById(id){ const users = await getAllUsers(); return users.find(u => u.id === id) || null; }

// --------------------------- SESSÃO ---------------------------
function saveSession(session){ saveJSON(SESS_KEY, session); }
function loadSession(){ return loadJSON(SESS_KEY, null); }
function clearSession(){ localStorage.removeItem(SESS_KEY); }
async function currentUser(){ const sess = loadSession(); if (!sess) return null; return await findUserById(sess.userId); }

// --------------------------- SCANS (ENTREGAS) ---------------------------
function loadScans(){ return loadJSON(SCANS_KEY, []); }
function saveScans(scans){ saveJSON(SCANS_KEY, scans); }
function addScan(scan){ const arr = loadScans(); arr.unshift(scan); saveScans(arr); }

// --------------------------- AUTENTICAÇÃO ---------------------------
async function login(username, password){
    const user = await findUserByUsername(username);
    if (!user) throw new Error('Usuário não encontrado');
    const ph = await hashPassword(password);
    if (ph !== user.passwordHash) throw new Error('Senha incorreta');
    const session = { token: uuid(), userId: user.id, username: user.username, role: user.role, createdAt: nowISO() };
    saveSession(session);
    return session;
}
function logout(){
    clearSession();
    location.reload();
}

// --------------------------- AUTORIZAÇÃO ---------------------------
function isAdmin(user){ return user && user.role === 'admin'; }
function isGestor(user){ return user && user.role === 'gestor'; }

// --------------------------- CRUD USUÁRIOS ---------------------------
async function createUser(actor, { username, password, role='gestor' }){
    if (!actor) throw new Error('Faça login primeiro');
    if (!isAdmin(actor) && !isGestor(actor)) throw new Error('Apenas admin ou gestor podem criar usuários');
    if (role === 'admin' && !isAdmin(actor)) throw new Error('Apenas admin pode criar outro admin');
    if (!username || !password) throw new Error('username e password obrigatórios');
    const exists = await findUserByUsername(username);
    if (exists) throw new Error('Usuário já existe');
    const hashed = await hashPassword(password);
    const users = await getAllUsers();
    const u = { id: uuid(), username, role, passwordHash: hashed, createdBy: actor.id, createdAt: nowISO(), updatedAt: nowISO() };
    users.push(u);
    saveJSON(USERS_KEY, users);
    return sanitize(u);
}
async function editUser(actor, targetId, updates = {}){
    if (!actor) throw new Error('Faça login primeiro');
    const users = await getAllUsers();
    const idx = users.findIndex(u => u.id === targetId);
    if (idx === -1) throw new Error('Usuário não encontrado');
    const target = users[idx];
    // Permissões
    if (actor.id === target.id) {
        // permite editar username (não role) e usar changePassword para senha
    } else if (isAdmin(actor)) {
        // ok
    } else if (isGestor(actor) && target.createdBy === actor.id) {
        // ok
    } else {
        throw new Error('Permissão negada para editar este usuário');
    }
    if (updates.username){
        const other = users.find(u => u.username === updates.username && u.id !== target.id);
        if (other) throw new Error('Outro usuário já usa esse username');
        target.username = updates.username;
    }
    if (updates.role){
        if (updates.role === 'admin' && !isAdmin(actor)) throw new Error('Apenas admin pode atribuir papel admin');
        target.role = updates.role;
    }
    target.updatedAt = nowISO();
    users[idx] = target;
    saveJSON(USERS_KEY, users);
    return sanitize(target);
}
async function changePassword(actor, targetId, newPassword){
    if (!actor) throw new Error('Faça login primeiro');
    if (!newPassword) throw new Error('Nova senha requerida');
    const users = await getAllUsers();
    const idx = users.findIndex(u => u.id === targetId);
    if (idx === -1) throw new Error('Usuário alvo não encontrado');
    const target = users[idx];
    if (actor.id === target.id || isAdmin(actor) || (isGestor(actor) && target.createdBy === actor.id)) {
        target.passwordHash = await hashPassword(newPassword);
        target.updatedAt = nowISO();
        users[idx] = target;
        saveJSON(USERS_KEY, users);
        return { success: true };
    } else {
        throw new Error('Permissão negada para alterar senha');
    }
}
async function deleteUser(actor, targetId){
    if (!actor) throw new Error('Faça login primeiro');
    const users = await getAllUsers();
    const idx = users.findIndex(u => u.id === targetId);
    if (idx === -1) throw new Error('Usuário alvo não encontrado');
    const target = users[idx];
    if (actor.id === target.id) throw new Error('Não é permitido excluir o próprio usuário');
    if (isAdmin(actor)){
        // admin pode excluir qualquer usuário exceto próprio (já bloqueado)
    } else if (isGestor(actor)){
        if (target.createdBy !== actor.id) throw new Error('Gestor só pode excluir usuários que ele criou');
    } else throw new Error('Permissão negada para excluir usuários');
    users.splice(idx,1);
    saveJSON(USERS_KEY, users);
    return { success: true };
}
function sanitize(u){ if (!u) return null; const { passwordHash, ...rest } = u; return rest; }
async function listUsers(actor){ if (!actor) throw new Error('Faça login primeiro'); const users = await getAllUsers(); return users.map(sanitize); }

// --------------------------- UI / INTEGRAÇÃO ---------------------------
// Elementos
const loginBtn = document.getElementById("loginBtn");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const feedbackMessage = document.getElementById("feedbackMessage");
const appRoot = document.getElementById("app");
const loginContainer = document.querySelector(".login-container");
const btnSair = document.getElementById("btnSair");
const btnManageUsers = document.getElementById("btnManageUsers");
const btnDeliveries = document.getElementById("btnDeliveries");
const btnMap = document.getElementById("btnMap");
const btnCamera = document.getElementById("btnCamera");
const btnRoute = document.getElementById("btnRoute");
const userManagementView = document.getElementById("userManagementView");
const deliveriesList = document.getElementById("deliveriesList");
const mapEl = document.getElementById("map");
const createUserBtn = document.getElementById("createUserBtn");
const newUsername = document.getElementById("newUsername");
const newPassword = document.getElementById("newPassword");
const newUserRole = document.getElementById("newUserRole");
const userTableBody = document.getElementById("userTableBody");
const userFeedbackMessage = document.getElementById("userFeedbackMessage");
const filterGestor = document.getElementById("filterGestor");
const applyFiltersBtn = document.getElementById("applyFilters");
const filterDateStart = document.getElementById("filterDateStart");
const filterDateEnd = document.getElementById("filterDateEnd");

// estado local
let currentUserObj = null;
let map = null;
let markersLayer = null;

// --------------------------- Inicialização ---------------------------
window.addEventListener('DOMContentLoaded', async () => {
    await seedIfNeeded();
    bindUIActions();
    // restaura sessão se existir
    const sess = loadSession();
    if (sess) {
        const u = await findUserById(sess.userId);
        if (u) {
            currentUserObj = u;
            showAppForUser();
            await loadAndRenderData();
            return;
        } else {
            clearSession();
        }
    }
});

function bindUIActions(){
    loginBtn.onclick = async () => {
        feedbackMessage.textContent = "Verificando...";
        const username = loginUser.value.trim();
        const password = loginPass.value.trim();
        try {
            const sess = await login(username, password);
            currentUserObj = await findUserById(sess.userId);
            showAppForUser();
            await loadAndRenderData();
        } catch (e) {
            feedbackMessage.textContent = e.message;
        }
    };
    btnSair.onclick = logout;
    btnManageUsers.onclick = () => showView('users');
    btnDeliveries.onclick = () => showView('list');
    btnMap.onclick = () => showView('map');
    btnCamera.onclick = () => showView('camera');
    createUserBtn.onclick = async () => {
        userFeedbackMessage.style.color = 'blue';
        userFeedbackMessage.textContent = 'Criando...';
        try {
            await createUser(currentUserObj, { username: newUsername.value.trim(), password: newPassword.value, role: newUserRole.value });
            userFeedbackMessage.style.color = 'green';
            userFeedbackMessage.textContent = 'Usuário criado com sucesso.';
            newUsername.value = ''; newPassword.value = '';
            renderUserTable();
            populateGestorFilter();
        } catch (err) {
            userFeedbackMessage.style.color = 'red';
            userFeedbackMessage.textContent = err.message;
        }
    };
    applyFiltersBtn.onclick = updateFilteredScansUI;
}

// --------------------------- VIEWS ---------------------------
function showAppForUser(){
    loginContainer.style.display = 'none';
    appRoot.style.display = 'block';
    applyUserLimitations();
}
function showView(name){
    // hide all
    mapEl.style.display = 'none';
    deliveriesList.style.display = 'none';
    userManagementView.style.display = 'none';
    document.getElementById("cameraContainer").style.display = 'none';
    if (name === 'map') {
        mapEl.style.display = 'block';
        setTimeout(() => { if (map) map.invalidateSize(); }, 200);
    } else if (name === 'list') {
        deliveriesList.style.display = 'block';
        renderDeliveriesList();
    } else if (name === 'users') {
        userManagementView.style.display = 'block';
        renderUserTable();
    } else if (name === 'camera') {
        document.getElementById("cameraContainer").style.display = 'flex';
    }
}

// --------------------------- REGRAS DE PERMISSÃO / UI ---------------------------
function applyUserLimitations(){
    if (!currentUserObj) return;
    // mostrar botão Gerenciar Usuários apenas para gestores e admins
    if (isAdmin(currentUserObj) || isGestor(currentUserObj)) {
        btnManageUsers.style.display = 'block';
    } else btnManageUsers.style.display = 'none';
    // atualizar texto do botão entregas
    updateDeliveriesCount();
}

// --------------------------- USUÁRIOS: RENDER / AÇÕES ---------------------------
async function renderUserTable(){
    const users = await getAllUsers();
    userTableBody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        const createdByUser = u.createdBy ? (users.find(x=>x.id===u.createdBy)?.username || u.createdBy) : '-';
        tr.innerHTML = `
            <td style="padding:10px;border:1px solid #ccc;">${u.username}</td>
            <td style="padding:10px;border:1px solid #ccc;">${u.role}</td>
            <td style="padding:10px;border:1px solid #ccc;">${createdByUser}</td>
            <td style="padding:10px;border:1px solid #ccc;">
                <button class="edit-btn">Editar</button>
                <button class="delete-btn">Excluir</button>
                <button class="change-pass-btn">Alterar Senha</button>
            </td>
        `;
        const editBtn = tr.querySelector('.edit-btn');
        const delBtn = tr.querySelector('.delete-btn');
        const cpBtn = tr.querySelector('.change-pass-btn');

        editBtn.onclick = async () => {
            // Permissões conforme regras
            try {
                const newUsername = prompt('Novo username (deixe em branco para manter):', u.username);
                let newRole = u.role;
                if (isAdmin(currentUserObj)) {
                    const r = prompt('Nova role (admin/gestor/colaborador) — deixe em branco para manter:', u.role);
                    if (r && (r==='admin' || r==='gestor' || r==='colaborador')) newRole = r;
                } else if (currentUserObj.id === u.id) {
                    // usuario pode mudar apenas username
                } else if (isGestor(currentUserObj) && u.createdBy === currentUserObj.id) {
                    // allowed
                    const r = prompt('Nova role (gestor/colaborador) — deixe em branco para manter:', u.role);
                    if (r && (r==='gestor' || r==='colaborador')) newRole = r;
                } else throw new Error('Permissão negada para editar este usuário.');
                await editUser(currentUserObj, u.id, { username: newUsername ? newUsername.trim() : undefined, role: newRole });
                alert('Usuário atualizado.');
                renderUserTable();
                populateGestorFilter();
            } catch (err) { alert(err.message); }
        };

        delBtn.onclick = async () => {
            try {
                if (!confirm(`Excluir usuário ${u.username}?`)) return;
                await deleteUser(currentUserObj, u.id);
                alert('Usuário excluído.');
                renderUserTable();
                populateGestorFilter();
            } catch (err) { alert(err.message); }
        };

        cpBtn.onclick = async () => {
            try {
                const np = prompt(`Nova senha para ${u.username}:`);
                if (np === null) return;
                if (np.trim().length < 4) return alert('Senha precisa ter ao menos 4 caracteres.');
                await changePassword(currentUserObj, u.id, np.trim());
                alert('Senha alterada com sucesso.');
            } catch (err) { alert(err.message); }
        };

        // Desabilitar botões conforme regras (ex.: admin não consegue se auto-deletar)
        if (u.id === currentUserObj.id) {
            // não pode excluir a si mesmo
            tr.querySelector('.delete-btn').disabled = true;
        }
        // gestor não pode excluir usuários que não criou
        if (isGestor(currentUserObj) && u.createdBy !== currentUserObj.id) {
            tr.querySelector('.delete-btn').disabled = true;
        }
        // não permitir excluir admins por gestores
        if (!isAdmin(currentUserObj) && u.role === 'admin') {
            tr.querySelector('.delete-btn').disabled = true;
            tr.querySelector('.edit-btn').disabled = ! (u.id === currentUserObj.id); // só editar se for ele mesmo
        }

        userTableBody.appendChild(tr);
    });
}

// --------------------------- SCANS / ENTREGAS: RENDER ---------------------------
function renderDeliveriesList(){
    const scans = loadScans();
    deliveriesList.innerHTML = '';
    if (!scans.length) {
        deliveriesList.innerHTML = '<p style="padding:20px;">Nenhuma entrega registrada.</p>';
        updateDeliveriesCount();
        return;
    }
    scans.forEach(s => {
        const div = document.createElement('div');
        div.className = 'delivery-item';
        const ts = new Date(s.timestamp).toLocaleString();
        div.innerHTML = `
            <strong>${s.code} <span class="id-label">(${s.id})</span></strong>
            <div class="address">${s.address || 'Sem endereço'}</div>
            <div class="metadata">Gestor: ${s.gestor} • ${ts}</div>
        `;
        deliveriesList.appendChild(div);
    });
    updateDeliveriesCount();
}
function updateDeliveriesCount(){
    const c = loadScans().length;
    btnDeliveries.textContent = `📦 Entregas (${c})`;
}

// --------------------------- FILTROS / EXPORT (simples) ---------------------------
async function populateGestorFilter(){
    const users = await getAllUsers();
    filterGestor.innerHTML = '<option value="all">Todos</option>';
    users.forEach(u => {
        if (u.role === 'gestor' || u.role === 'admin') {
            const opt = document.createElement('option');
            opt.value = u.username;
            opt.textContent = u.username;
            filterGestor.appendChild(opt);
        }
    });
}
function updateFilteredScansUI(){
    // filtro simples por gestor e por datas
    const gestor = filterGestor.value;
    const start = filterDateStart.value ? new Date(filterDateStart.value) : null;
    const end = filterDateEnd.value ? new Date(filterDateEnd.value) : null;
    let scans = loadScans();
    if (gestor && gestor !== 'all') scans = scans.filter(s => s.gestor === gestor);
    if (start) scans = scans.filter(s => new Date(s.timestamp) >= start);
    if (end) {
        const endd = new Date(end); endd.setHours(23,59,59,999);
        scans = scans.filter(s => new Date(s.timestamp) <= endd);
    }
    deliveriesList.innerHTML = '';
    if (!scans.length) { deliveriesList.innerHTML = '<p style="padding:20px;">Nenhuma entrega encontrada para os filtros.</p>'; return; }
    scans.forEach(s => {
        const div = document.createElement('div');
        div.className = 'delivery-item';
        const ts = new Date(s.timestamp).toLocaleString();
        div.innerHTML = `<strong>${s.code}</strong><div class="address">${s.address || ''}</div><div class="metadata">Gestor: ${s.gestor} • ${ts}</div>`;
        deliveriesList.appendChild(div);
    });
}

// --------------------------- MAPA (simples com Leaflet) ---------------------------
function initMap(){
    if (!mapEl) return;
    map = L.map('map').setView([-23.5489, -46.6388], 12); // São Paulo por default
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
}
function plotScansOnMap(){
    if (!map) initMap();
    markersLayer.clearLayers();
    const scans = loadScans();
    scans.forEach(s => {
        if (s.lat && s.lng) {
            const m = L.marker([s.lat, s.lng]).bindPopup(`<b>${s.code}</b><br>${s.address || ''}`);
            markersLayer.addLayer(m);
        }
    });
    if (scans.length) {
        const first = scans[0];
        if (first.lat && first.lng) map.setView([first.lat, first.lng], 13);
    }
}

// --------------------------- REGISTRAR SCAN (mock) ---------------------------
async function registerScan(code, coords = null, type = 'entrega', address = ''){
    if (!currentUserObj) return alert('Usuário não logado');
    // evita duplicatas imediatas
    const scans = loadScans();
    if (scans.some(s => s.code === code && (Date.now() - new Date(s.timestamp)) < 3000)) return;
    const newScan = {
        id: uuid(),
        code,
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        timestamp: new Date().toISOString(),
        type,
        address,
        gestor: currentUserObj.username
    };
    addScan(newScan);
    updateDeliveriesCount();
    renderDeliveriesList();
    plotScansOnMap();
    // sinal sonoro (beep) — simples:
    try { beep(); } catch(e){}
    alert(`Entrega ${code} registrada por ${currentUserObj.username}`);
}

// --------------------------- util beep ---------------------------
function beep(){
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 800;
    g.gain.value = 0.02;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); ctx.close(); }, 100);
}

// --------------------------- Dados iniciais e render ---------------------------
async function loadAndRenderData(){
    await populateGestorFilter();
    await renderUserTable();
    renderDeliveriesList();
    initMap();
    plotScansOnMap();
    showView('list');
}

// --------------------------- Export CSV (simples) ---------------------------
function exportCSV(period = 'mensal'){
    const scans = loadScans();
    if (!scans.length) return alert('Nenhuma entrega para exportar.');
    const rows = [['id','code','lat','lng','timestamp','gestor','address','type']];
    scans.forEach(s => rows.push([s.id, s.code, s.lat, s.lng, s.timestamp, s.gestor, (s.address||''), s.type]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pegazus_scans_${period}_${(new Date()).toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// adiciona função global para test manual via console
window.MiniMock = {
    seedIfNeeded,
    getAllUsers,
    findUserByUsername,
    findUserById,
    login,
    logout,
    currentUser,
    createUser,
    editUser,
    changePassword,
    deleteUser,
    listUsers,
    loadScans,
    addScan,
    registerScan,
    exportCSV
};
