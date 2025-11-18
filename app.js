// app.js - PegazusLog Mock LocalStorage

function nowISO() { return new Date().toISOString(); }
function uuid() { return 'id-' + Math.random().toString(36).substring(2,9) + '-' + Date.now(); }

function saveJSON(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function loadJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
}

async function hashPassword(p) {
    const data = new TextEncoder().encode(p);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

const USERS_KEY = "pegazus_users_v1";
const SCANS_KEY = "pegazus_scans_v1";
const SESSION_KEY = "pegazus_session_v1";

async function seedIfNeeded() {
    let list = loadJSON(USERS_KEY, []);
    if (list.length) return list;

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

    list = [admin];
    saveJSON(USERS_KEY, list);
    return list;
}

async function getAllUsers() {
    await seedIfNeeded();
    return loadJSON(USERS_KEY, []);
}

async function findUser(username) {
    const list = await getAllUsers();
    return list.find(u => u.username === username) || null;
}

async function loginUser(username, pass) {
    const u = await findUser(username);
    if (!u) throw new Error("Usuário não encontrado");

    const hp = await hashPassword(pass);
    if (hp !== u.passwordHash) throw new Error("Senha incorreta");

    saveJSON(SESSION_KEY, { userId: u.id, token: uuid(), at: nowISO() });
}

function getSession() { return loadJSON(SESSION_KEY, null); }

async function getCurrentUser() {
    const s = getSession();
    if (!s) return null;
    const list = await getAllUsers();
    return list.find(u => u.id === s.userId) || null;
}

function logout() {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
}

async function createUser(actor, username, password, role) {
    if (!actor) throw new Error("Sem permissão");
    if (role === "admin" && actor.role !== "admin") throw new Error("Somente admin cria admin");

    const list = await getAllUsers();
    if (list.find(u => u.username === username)) throw new Error("Usuário já existe");

    const hashed = await hashPassword(password);
    list.push({
        id: uuid(),
        username,
        role,
        passwordHash: hashed,
        createdBy: actor.id,
        createdAt: nowISO(),
        updatedAt: nowISO()
    });

    saveJSON(USERS_KEY, list);
}

async function deleteUser(actor, userId) {
    if (actor.id === userId) throw new Error("Não pode excluir a si mesmo");

    const list = await getAllUsers();
    const target = list.find(u => u.id === userId);
    if (!target) throw new Error("Usuário não encontrado");

    if (actor.role === "gestor" && target.createdBy !== actor.id)
        throw new Error("Gestor só exclui usuários criados por ele");

    saveJSON(USERS_KEY, list.filter(u => u.id !== userId));
}

async function changePassword(actor, targetId, newPass) {
    const list = await getAllUsers();
    const t = list.find(u => u.id === targetId);
    if (!t) throw new Error("Usuário não encontrado");

    if (actor.role !== "admin" && actor.id !== targetId)
        throw new Error("Sem permissão");

    t.passwordHash = await hashPassword(newPass);
    t.updatedAt = nowISO();
    saveJSON(USERS_KEY, list);
}

function loadScans() { return loadJSON(SCANS_KEY, []); }
function saveScans(x) { saveJSON(SCANS_KEY, x); }

function addScan(data) {
    const list = loadScans();
    list.push({ id: uuid(), ...data, createdAt: nowISO() });
    saveScans(list);
}

// ---------------- UI ------------------

document.getElementById("loginBtn").onclick = async () => {
    const u = loginUser.value.trim();
    const p = loginPass.value;
    const msg = feedbackMessage;

    try {
        await loginUser(u, p);
        document.querySelector(".login-container").style.display = "none";
        app.style.display = "block";

        refreshUsers();
        refreshDeliveries();
    } catch (e) {
        msg.textContent = e.message;
    }
};

document.getElementById("resetMockBtn").onclick = () => {
    localStorage.removeItem(USERS_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SCANS_KEY);
    alert("Mock resetado! Admin recriado: thon / 882010");
    location.reload();
};

async function refreshUsers() {
    const actor = await getCurrentUser();
    const list = await getAllUsers();
    const body = document.getElementById("userTableBody");
    body.innerHTML = "";

    list.forEach(u => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${u.username}</td>
            <td>${u.role}</td>
            <td>${u.createdBy || "—"}</td>
            <td>
                <button onclick="uiChangePass('${u.id}')">Senha</button>
                <button onclick="uiDeleteUser('${u.id}')" style="color:red;">Excluir</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

async function uiDeleteUser(id) {
    const actor = await getCurrentUser();

    try {
        await deleteUser(actor, id);
        refreshUsers();
    } catch (e) {
        alert(e.message);
    }
}

async function uiChangePass(id) {
    const np = prompt("Nova senha:");
    if (!np) return;

    const actor = await getCurrentUser();

    try {
        await changePassword(actor, id, np);
        alert("Senha alterada!");
    } catch (e) {
        alert(e.message);
    }
}

document.getElementById("createUserBtn").onclick = async () => {
    const actor = await getCurrentUser();

    const u = newUsername.value.trim();
    const p = newPassword.value;
    const r = newUserRole.value;

    try {
        await createUser(actor, u, p, r);
        newUsername.value = "";
        newPassword.value = "";
        userFeedbackMessage.textContent = "Usuário criado!";
        refreshUsers();
    } catch (e) {
        userFeedbackMessage.textContent = e.message;
    }
};

function refreshDeliveries() {
    const list = loadScans();
    btnDeliveries.innerText = `📦 Entregas (${list.length})`;
    deliveriesList.innerHTML = "";

    list.forEach(d => {
        const div = document.createElement("div");
        div.className = "delivery-item";
        div.innerHTML = `<strong>${d.codigo}</strong><br>${d.endereco}<br><small>${d.createdAt}</small>`;
        deliveriesList.appendChild(div);
    });
}

// -------- Views -------
function hideAll() {
    map.style.display = "none";
    deliveriesList.style.display = "none";
    userManagementView.style.display = "none";
    cameraContainer.style.display = "none";
}

btnDeliveries.onclick = () => { hideAll(); deliveriesList.style.display = "block"; };
btnManageUsers.onclick = () => { hideAll(); userManagementView.style.display = "block"; };
btnCamera.onclick = () => { hideAll(); cameraContainer.style.display = "block"; };
btnSair.onclick = logout;

// MAPA
let mapObj = null;
btnMap.onclick = () => {
    hideAll();
    map.style.display = "block";

    if (!mapObj) {
        mapObj = L.map('map').setView([-23.55, -46.63], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapObj);
    }
};
