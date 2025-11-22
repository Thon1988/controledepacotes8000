// ============================================================
// PegazusLog - APP.JS (100% MOCK - SEM FIREBASE)
// Admin padrão: thon / 882010
// ============================================================

// STORAGE KEYS
const USERS_KEY = "pegazus_users_v1";
const SCANS_KEY = "pegazus_scans_v1";
const SESSION_KEY = "pegazus_session_v1";

function nowISO(){ return new Date().toISOString(); }
function uuid(){ return "id-" + Math.random().toString(36).slice(2,9) + "-" + Date.now().toString(36); }

function saveJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function loadJSON(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }

// SIMPLE HASH
async function hashPassword(password){
    const data = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hashBuffer)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

// ============================================================
// SEED (CRIA ADMIN SE NÃO EXISTIR NENHUM USUÁRIO)
// ============================================================
async function seedIfNeeded(){
    let users = loadJSON(USERS_KEY, []);
    if(users.length > 0) return users;

    const pass = await hashPassword("882010");

    const admin = {
        id: "user-thon",
        username: "thon",
        role: "admin",
        passwordHash: pass,
        createdBy: null,
        createdAt: nowISO(),
        updatedAt: nowISO()
    };

    saveJSON(USERS_KEY, [admin]);
    return [admin];
}

async function getAllUsers(){ await seedIfNeeded(); return loadJSON(USERS_KEY, []); }
async function findUserByUsername(username){ return (await getAllUsers()).find(u=>u.username===username) || null; }
async function findUserById(id){ return (await getAllUsers()).find(u=>u.id===id) || null; }

function saveSession(session){ saveJSON(SESSION_KEY, session); }
function loadSession(){ return loadJSON(SESSION_KEY, null); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
async function currentUser(){ const s = loadSession(); return s ? findUserById(s.userId) : null; }

// ============================================================
// LOGIN MOCK
// ============================================================
async function login(username, password){
    const user = await findUserByUsername(username);
    if(!user) throw new Error("Usuário não encontrado");

    const hash = await hashPassword(password);
    if(hash !== user.passwordHash) throw new Error("Senha incorreta");

    const session = { token: uuid(), userId: user.id, username: user.username, role: user.role, at: nowISO() };
    saveSession(session);
    return session;
}

function logout(){ clearSession(); location.reload(); }

function isAdmin(u){ return u && u.role === "admin"; }
function isGestor(u){ return u && u.role === "gestor"; }

// ============================================================
// CRUD DE USUÁRIOS (COM LIMITAÇÕES DE PERMISSÃO)
// ============================================================
async function createUser(actor, {username, password, role}){
    if(!actor) throw new Error("Não autorizado");
    if(!isAdmin(actor) && !isGestor(actor)) throw new Error("Apenas admin/gestor podem criar usuários");

    if(role === "admin" && !isAdmin(actor)) throw new Error("Apenas admin pode criar admin");

    if(!username || !password) throw new Error("Dados obrigatórios");

    let users = await getAllUsers();
    if(users.some(u=>u.username === username)) throw new Error("Usuário já existe");

    const hash = await hashPassword(password);

    const u = {
        id: uuid(),
        username,
        role,
        passwordHash: hash,
        createdBy: actor.id,
        createdAt: nowISO(),
        updatedAt: nowISO()
    };

    users.push(u);
    saveJSON(USERS_KEY, users);

    return sanitize(u);
}

async function editUser(actor, targetId, updates){
    let users = await getAllUsers();
    const idx = users.findIndex(u=>u.id === targetId);
    if(idx === -1) throw new Error("Usuário não encontrado");

    const target = users[idx];

    // Permissões
    if(target.id !== actor.id){
        if(isAdmin(actor)){
            // admin pode tudo
        } else if(isGestor(actor)){
            if(target.createdBy !== actor.id)
                throw new Error("Gestor só pode editar usuários que criou");
        } else throw new Error("Sem permissão");
    }

    // Atualiza username
    if(updates.username){
        if(users.some(u=>u.username===updates.username && u.id!==targetId))
            throw new Error("Username já em uso");
        target.username = updates.username;
    }

    // Atualiza role
    if(updates.role){
        if(updates.role === "admin" && !isAdmin(actor))
            throw new Error("Apenas admin pode atribuir admin");
        target.role = updates.role;
    }

    target.updatedAt = nowISO();
    users[idx] = target;
    saveJSON(USERS_KEY, users);

    return sanitize(target);
}

async function changePassword(actor, targetId, newPass){
    let users = await getAllUsers();
    const idx = users.findIndex(u=>u.id===targetId);
    if(idx === -1) throw new Error("Usuário não encontrado");

    const target = users[idx];

    if(target.id !== actor.id){
        if(isAdmin(actor)){
            // ok
        } else if(isGestor(actor)){
            if(target.createdBy !== actor.id)
                throw new Error("Gestor não pode alterar senha de quem não criou");
        } else throw new Error("Sem permissão");
    }

    target.passwordHash = await hashPassword(newPass);
    target.updatedAt = nowISO();

    users[idx] = target;
    saveJSON(USERS_KEY, users);

    return {success:true};
}

async function deleteUser(actor, targetId){
    let users = await getAllUsers();
    const idx = users.findIndex(u=>u.id===targetId);
    if(idx === -1) throw new Error("Usuário não encontrado");

    const target = users[idx];

    if(target.id === actor.id) throw new Error("Você não pode excluir seu próprio usuário");

    if(isAdmin(actor)){
        // pode excluir qualquer um
    } else if(isGestor(actor)){
        if(target.createdBy !== actor.id) throw new Error("Gestor só pode excluir usuários criados por ele");
    } else throw new Error("Sem permissão");

    users.splice(idx,1);
    saveJSON(USERS_KEY, users);

    return {success:true};
}

function sanitize(u){
    const r = {...u};
    delete r.passwordHash;
    return r;
}

// ============================================================
// REGISTRO DE ENTREGAS (MOCK)
// ============================================================
function loadScans(){ return loadJSON(SCANS_KEY, []); }
function saveScans(arr){ saveJSON(SCANS_KEY, arr); }
function addScan(scan){ const arr = loadScans(); arr.unshift(scan); saveScans(arr); }

async function registerScan(code, coords = null, type="entrega", address=""){
    const user = await currentUser();
    if(!user) return alert("Não logado");

    const scan = {
        id: uuid(),
        code,
        timestamp: nowISO(),
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        address,
        gestor: user.username
    };

    addScan(scan);
    beep();
    alert(`Entrega ${code} registrada!`);
    renderDeliveriesList();
    plotScansOnMap();
}

// ============================================================
// INTERFACE
// ============================================================

// ELEMENTOS
const loginBtn = document.getElementById("loginBtn");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const feedbackMessage = document.getElementById("feedbackMessage");

const appRoot = document.getElementById("app");

const btnManageUsers = document.getElementById("btnManageUsers");
const btnDeliveries = document.getElementById("btnDeliveries");
const btnMap = document.getElementById("btnMap");
const btnCamera = document.getElementById("btnCamera");
const btnRoute = document.getElementById("btnRoute");
const btnSair = document.getElementById("btnSair");

const userManagementView = document.getElementById("userManagementView");
const deliveriesList = document.getElementById("deliveriesList");
const cameraContainer = document.getElementById("cameraContainer");

const userTableBody = document.getElementById("userTableBody");

const newUsername = document.getElementById("newUsername");
const newPassword = document.getElementById("newPassword");
const newUserRole = document.getElementById("newUserRole");
const createUserBtn = document.getElementById("createUserBtn");

// ============================================================
// LOGIN BUTTON
// ============================================================

loginBtn.onclick = async ()=>{
    feedbackMessage.textContent = "Verificando...";

    try{
        const session = await login(loginUser.value.trim(), loginPass.value.trim());
        currentUserObj = await currentUser();

        document.querySelector(".login-container").style.display = "none";
        appRoot.style.display = "block";

        await loadAndRender();
    } catch(e){
        feedbackMessage.textContent = e.message;
    }
};

btnSair.onclick = logout;

// ============================================================
// NAVEGAÇÃO
// ============================================================

btnManageUsers.onclick = ()=> showView("users");
btnDeliveries.onclick = ()=> showView("list");
btnMap.onclick = ()=> showView("map");
btnCamera.onclick = ()=> showView("camera");
btnRoute.onclick = ()=> generateRoute();

function showView(view){
    userManagementView.style.display = "none";
    deliveriesList.style.display = "none";
    cameraContainer.style.display = "none";
    document.getElementById("map").style.display = "none";

    if(view==="users") userManagementView.style.display = "block";
    if(view==="list") deliveriesList.style.display = "block";
    if(view==="camera") cameraContainer.style.display = "flex";
    if(view==="map"){
        document.getElementById("map").style.display = "block";
        setTimeout(()=> map && map.invalidateSize(), 200);
    }
}

// ============================================================
// USERS UI
// ============================================================

createUserBtn.onclick = async ()=>{
    try{
        await createUser(await currentUser(), {
            username: newUsername.value.trim(),
            password: newPassword.value.trim(),
            role: newUserRole.value
        });
        alert("Usuário criado!");
        newUsername.value="";
        newPassword.value="";
        renderUserTable();
    }catch(e){
        alert(e.message);
    }
};

async function renderUserTable(){
    const users = await getAllUsers();
    const actor = await currentUser();

    userTableBody.innerHTML = "";

    users.forEach(user=>{
        const tr = document.createElement("tr");

        const creatorName = user.createdBy ? (users.find(x=>x.id===user.createdBy)?.username || "-") : "-";

        tr.innerHTML = `
            <td>${user.username}</td>
            <td>${user.role}</td>
            <td>${creatorName}</td>
            <td>
                <button class="btn-small btn-edit">Editar</button>
                <button class="btn-small btn-delete">Excluir</button>
                <button class="btn-small btn-pass">Senha</button>
            </td>
        `;

        const edit = tr.querySelector(".btn-edit");
        const del = tr.querySelector(".btn-delete");
        const pass = tr.querySelector(".btn-pass");

        // EDITAR
        edit.onclick = async ()=>{
            try{
                const newU = prompt("Novo username:", user.username);
                let newRole = user.role;

                if(isAdmin(actor)){
                    const r = prompt("Nova função (admin/gestor/colaborador):", user.role);
                    if(r && ["admin","gestor","colaborador"].includes(r)) newRole = r;
                }
                if(isGestor(actor) && user.createdBy === actor.id){
                    const r = prompt("Nova função (gestor/colaborador):", user.role);
                    if(r && ["gestor","colaborador"].includes(r)) newRole = r;
                }

                await editUser(actor, user.id, { username:newU, role:newRole });

                alert("Atualizado!");
                renderUserTable();

            }catch(e){ alert(e.message); }
        };

        // EXCLUIR
        del.onclick = async ()=>{
            if(!confirm("Excluir este usuário?")) return;
            try{
                await deleteUser(actor, user.id);
                alert("Excluído!");
                renderUserTable();
            }catch(e){ alert(e.message); }
        };

        // ALTERAR SENHA
        pass.onclick = async ()=>{
            const np = prompt("Nova senha:");
            if(!np) return;
            try{
                await changePassword(actor, user.id, np);
                alert("Senha alterada");
            }catch(e){ alert(e.message); }
        };

        // limitações de interface
        if(user.id === actor.id) del.disabled = true;
        if(isGestor(actor) && user.createdBy !== actor.id) del.disabled = true;
        if(!isAdmin(actor) && user.role === "admin"){
            del.disabled = true;
            edit.disabled = (user.id !== actor.id);
        }

        userTableBody.appendChild(tr);
    });
}

// ============================================================
// LISTA DE ENTREGAS
// ============================================================

function renderDeliveriesList(){
    const scans = loadScans();
    deliveriesList.innerHTML = "";

    if(scans.length === 0){
        deliveriesList.innerHTML = `<p style="padding:20px;color:#777">Nenhuma entrega registrada.</p>`;
        return;
    }

    scans.forEach(s=>{
        const div = document.createElement("div");
        div.className = "delivery-item";

        div.innerHTML = `
            <strong>${s.code}</strong>
            <div class="meta">Gestor: ${s.gestor} • ${new Date(s.timestamp).toLocaleString()}</div>
            <div style="margin-top:8px;">${s.address || ""}</div>
        `;

        deliveriesList.appendChild(div);
    });
}

// ============================================================
// MAPA & ROTAS
// ============================================================

let map = null;
let markersLayer = null;

function initMap(){
    if(map) return;

    map = L.map("map").setView([-23.55, -46.63], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
        .addTo(map);

    markersLayer = L.layerGroup().addTo(map);
}

function plotScansOnMap(){
    if(!map) initMap();
    markersLayer.clearLayers();

    const scans = loadScans();
    scans.forEach(s=>{
        if(s.lat && s.lng){
            L.marker([s.lat, s.lng]).addTo(markersLayer)
                .bindPopup(`<b>${s.code}</b><br>${s.address || ""}`);
        }
    });
}

function generateRoute(){
    const scans = loadScans().filter(s=>s.lat && s.lng);

    if(scans.length < 2){
        alert("Precisa de pelo menos 2 entregas com localização.");
        return;
    }

    showView("map");
    initMap();

    const coords = scans.map(s=>[s.lat, s.lng]);

    const layer = L.layerGroup().addTo(map);

    coords.forEach((c,i)=>{
        L.marker(c).addTo(layer).bindPopup(`#${i+1}`);
    });

    L.polyline(coords, {color: "blue"}).addTo(layer);

    map.fitBounds(coords);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function loadAndRender(){
    renderUserTable();
    renderDeliveriesList();
    initMap();
    plotScansOnMap();
    showView("list");
}

// ============================================================
// SONORIZAÇÃO
// ============================================================

function beep(){
    try{
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 900;
        gain.gain.value = 0.03;
        osc.start();
        setTimeout(()=>{ osc.stop(); ctx.close(); }, 120);
    }catch(e){}
}

// ============================================================
// EXPÕE MOCK PARA TESTE VIA CONSOLE
// ============================================================

window.MiniMock = {
    login, currentUser, findUserByUsername, findUserById,
    createUser, editUser, changePassword, deleteUser,
    loadScans, addScan, registerScan, getAllUsers, seedIfNeeded
};
