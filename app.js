// app.js - PegazusLog beta v1.0 (MOCK LocalStorage)
// ---------------------------------------------------
// Regras implementadas:
// - Usuário admin inicial: thon / 882010
// - Admin: pode tudo, exceto excluir a si mesmo
// - Gestor: pode criar usuários e excluir somente os criados por ele
// - Todos podem mudar sua própria senha
// - ENTREGAS e USUÁRIOS armazenados em LocalStorage
// ---------------------------------------------------

// -------------------- HELPERS GERAIS --------------------
function nowISO() { return new Date().toISOString(); }
function uuid() {
    return 'id-' + Math.random().toString(36).substring(2,10) + '-' + Date.now();
}
function saveJSON(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function loadJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
}
async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// -------------------- CONSTANTES --------------------
const USERS_KEY = "pegazus_users_v1";
const SCANS_KEY = "pegazus_scans_v1";
const SESSION_KEY = "pegazus_session_v1";

// -------------------- USUÁRIOS - MOCK --------------------
async function seedIfNeeded() {
    let users = loadJSON(USERS_KEY, []);
    if (users.length) return users;
    const adminPass = await hashPassword("882010");
    const admin = {
        id: "user-thon",
        username: "thon",
        role: "admin",
        passwordHash: adminPass,
        createdBy: null,
        createdAt: nowISO(),
        updatedAt: nowISO()
    };
    users = [admin];
    saveJSON(USERS_KEY, users);
    return users;
}
async function getAllUsers() {
    await seedIfNeeded();
    return loadJSON(USERS_KEY, []);
}
async function findUser(username) {
    const list = await getAllUsers();
    return list.find(u => u.username === username) || null;
}
async function findUserById(id) {
    const list = await getAllUsers();
    return list.find(u => u.id === id) || null;
}
async function loginUser(username, password) {
    const u = await findUser(username);
    if (!u) throw new Error("Usuário não encontrado");
    const hp = await hashPassword(password);
    if (hp !== u.passwordHash) throw new Error("Senha incorreta");

    const session = { userId: u.id, token: uuid(), loginAt: nowISO() };
    saveJSON(SESSION_KEY, session);
    return session;
}
function getSession() {
    return loadJSON(SESSION_KEY, null);
}
async function getCurrentUser() {
    const s = getSession();
    if (!s) return null;
    return await findUserById(s.userId);
}
function logout() {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
}

async function createUser(actor, username, password, role) {
    if (!actor) throw new Error("Login necessário");
    if (role === "admin" && actor.role !== "admin") throw new Error("Somente admin pode criar admin");

    const list = await getAllUsers();
    if (list.find(u => u.username === username)) throw new Error("Usuário já existe");

    const hashed = await hashPassword(password);
    const u = {
        id: uuid(),
        username,
        role,
        passwordHash: hashed,
        createdBy: actor.id,
        createdAt: nowISO(),
        updatedAt: nowISO()
    };
    list.push(u);
    saveJSON(USERS_KEY, list);
}
async function deleteUser(actor, userId) {
    if (!actor) throw new Error("Login necessário");
    if (actor.id === userId) throw new Error("Não pode excluir a si mesmo");

    const list = await getAllUsers();
    const target = list.find(u => u.id === userId);
    if (!target) throw new Error("Usuário não encontrado");

    if (actor.role === "gestor" && target.createdBy !== actor.id)
        throw new Error("Gestor só pode excluir usuários criados por ele");

    const updated = list.filter(u => u.id !== userId);
    saveJSON(USERS_KEY, updated);
}
async function changePassword(actor, targetId, newPass) {
    const list = await getAllUsers();
    const idx = list.findIndex(u => u.id === targetId);
    if (idx === -1) throw new Error("Usuário não encontrado");
    const target = list[idx];

    if (actor.id !== targetId && actor.role !== "admin") {
        if (actor.role === "gestor" && target.createdBy !== actor.id)
            throw new Error("Gestor só pode alterar senha de usuários criados por ele");
    }

    target.passwordHash = await hashPassword(newPass);
    target.updatedAt = nowISO();
    list[idx] = target;
    saveJSON(USERS_KEY, list);
}

// -------------------- SCANS / ENTREGAS --------------------
function loadScans() { return loadJSON(SCANS_KEY, []); }
function saveScans(list) { saveJSON(SCANS_KEY, list); }
function addScan(data) {
    const scans = loadScans();
    scans.push({ id: uuid(), ...data, createdAt: nowISO() });
    saveScans(scans);
}

// -------------------- LOGIN UI --------------------
const loginBtn = document.getElementById("loginBtn");
loginBtn.onclick = async () => {
    const u = document.getElementById("loginUser").value.trim();
    const p = document.getElementById("loginPass").value;
    const msg = document.getElementById("feedbackMessage");
    msg.textContent = "";
    try {
        await loginUser(u, p);
        document.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        refreshUsers();
        refreshDeliveries();
    } catch (e) {
        msg.textContent = e.message;
    }
};

// -------------------- USERS UI --------------------
async function refreshUsers() {
    const actor = await getCurrentUser();
    if (!actor) return;
    const list = await getAllUsers();
    const body = document.getElementById("userTableBody");
    body.innerHTML = "";

    list.forEach(u => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${u.username}</td>
            <td>${u.role}</td>
            <td>${u.createdBy || "—"}</td>
            <td>
                <button class='change-pass-btn' onclick="uiChangePass('${u.id}')">Senha</button>
                <button class='delete-btn' onclick="uiDeleteUser('${u.id}')">Excluir</button>
            </td>
        `;
        body.appendChild(row);
    });
}
async function uiDeleteUser(id) {
    const actor = await getCurrentUser();
    try {
        await deleteUser(actor, id);
        refreshUsers();
    } catch (e) { alert(e.message); }
}
async function uiChangePass(id) {
    const np = prompt("Nova senha:");
    if (!np) return;
    const actor = await getCurrentUser();
    try {
        await changePassword(actor, id, np);
        alert("Senha alterada!");
    } catch (e) { alert(e.message); }
}

document.getElementById("createUserBtn").onclick = async () => {
    const actor = await getCurrentUser();
    const u = document.getElementById("newUsername").value.trim();
    const p = document.getElementById("newPassword").value;
    const r = document.getElementById("newUserRole").value;
    const msg = document.getElementById("userFeedbackMessage");
    msg.textContent = "";
    try {
        await createUser(actor, u, p, r);
        msg.textContent = "Usuário criado!";
        refreshUsers();
    } catch (e) { msg.textContent = e.message; }
};

// -------------------- DELIVERIES --------------------
function refreshDeliveries() {
    const list = loadScans();
    document.getElementById("btnDeliveries").innerText = `📦 Entregas (${list.length})`;
    const box = document.getElementById("deliveriesList");
    box.innerHTML = "";
    list.forEach(d => {
        const div = document.createElement("div");
        div.className = "delivery-item";
        div.innerHTML = `<strong>${d.codigo}</strong>${d.endereco} <br><small>${d.createdAt}</small>`;
        box.appendChild(div);
    });
}

// -------------------- VIEW SWITCHING --------------------
function hideAllViews() {
    document.getElementById("map").style.display = "none";
    document.getElementById("deliveriesList").style.display = "none";
    document.getElementById("userManagementView").style.display = "none";
    document.getElementById("cameraContainer").style.display = "none";
}

document.getElementById("btnDeliveries").onclick = () => {
    hideAllViews();
    document.getElementById("deliveriesList").style.display = "block";
};
document.getElementById("btnManageUsers").onclick = () => {
    hideAllViews();
    document.getElementById("userManagementView").style.display = "block";
};
document.getElementById("btnCamera").onclick = () => {
    hideAllViews();
    document.getElementById("cameraContainer").style.display = "flex";
};
document.getElementById("btnSair").onclick = logout;

// -------------------- MAPA --------------------
let map;
document.getElementById("btnMap").onclick = () => {
    hideAllViews();
    document.getElementById("map").style.display = "block";
    if (!map) {
        map = L.map('map').setView([-23.55, -46.63], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
};
