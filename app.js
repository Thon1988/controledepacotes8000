// app.js - PegazusLog (FULL MOCK LocalStorage)
// Admin inicial: thon / 882010
// Regras implementadas in-script comments

const USERS_KEY = "pegazus_users_v1";
const SCANS_KEY = "pegazus_scans_v1";
const SESSION_KEY = "pegazus_session_v1";

function nowISO(){ return new Date().toISOString(); }
function uuid(){ return 'id-'+Math.random().toString(36).slice(2,9)+'-'+Date.now().toString(36).slice(-6); }
function saveJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function loadJSON(k,def){ try{ const r = localStorage.getItem(k); return r?JSON.parse(r):def; } catch { return def; } }

async function hashPassword(p){
  const data = new TextEncoder().encode(p);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ---------- seed (create default admin if none) ---------- */
async function seedIfNeeded(){
  let users = loadJSON(USERS_KEY, []);
  if(users && users.length) return users;
  const passHash = await hashPassword('882010');
  const admin = { id: 'user-thon', username: 'thon', role: 'admin', passwordHash: passHash, createdBy: null, createdAt: nowISO(), updatedAt: nowISO() };
  users = [admin];
  saveJSON(USERS_KEY, users);
  return users;
}

/* ---------- user helpers ---------- */
async function getAllUsers(){ await seedIfNeeded(); return loadJSON(USERS_KEY, []); }
async function findUserByUsername(username){ const users = await getAllUsers(); return users.find(u=>u.username===username) || null; }
async function findUserById(id){ const users = await getAllUsers(); return users.find(u=>u.id===id) || null; }

function saveSession(sess){ saveJSON(SESSION_KEY, sess); }
function loadSession(){ return loadJSON(SESSION_KEY, null); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
async function currentUser(){ const s = loadSession(); if(!s) return null; return await findUserById(s.userId); }

/* ---------- scans ---------- */
function loadScans(){ return loadJSON(SCANS_KEY, []); }
function saveScans(arr){ saveJSON(SCANS_KEY, arr); }
function addScan(scan){ const arr = loadScans(); arr.unshift(scan); saveScans(arr); }

/* ---------- auth ---------- */
async function login(username, password){
  const u = await findUserByUsername(username);
  if(!u) throw new Error('Usuário não encontrado');
  const ph = await hashPassword(password);
  if(ph !== u.passwordHash) throw new Error('Senha incorreta');
  const sess = { token: uuid(), userId: u.id, username: u.username, role: u.role, at: nowISO() };
  saveSession(sess);
  return sess;
}
function logout(){ clearSession(); location.reload(); }

/* ---------- authorization utils ---------- */
function isAdmin(u){ return u && u.role === 'admin'; }
function isGestor(u){ return u && u.role === 'gestor'; }

/* ---------- user CRUD ---------- */
async function createUser(actor, { username, password, role = 'gestor' }){
  if(!actor) throw new Error('Faça login primeiro');
  if(!isAdmin(actor) && !isGestor(actor)) throw new Error('Apenas admin ou gestor podem criar usuários');
  if(role === 'admin' && !isAdmin(actor)) throw new Error('Apenas admin pode criar admin');
  if(!username || !password) throw new Error('username e password obrigatórios');
  const exists = await findUserByUsername(username);
  if(exists) throw new Error('Usuário já existe');
  const users = await getAllUsers();
  const hashed = await hashPassword(password);
  const u = { id: uuid(), username, role, passwordHash: hashed, createdBy: actor.id, createdAt: nowISO(), updatedAt: nowISO() };
  users.push(u);
  saveJSON(USERS_KEY, users);
  return sanitize(u);
}

async function editUser(actor, targetId, updates = {}){
  if(!actor) throw new Error('Faça login primeiro');
  const users = await getAllUsers();
  const idx = users.findIndex(x=>x.id===targetId);
  if(idx === -1) throw new Error('Usuário não encontrado');
  const target = users[idx];

  if(actor.id === target.id) {
    // allowed (own username)
  } else if(isAdmin(actor)) {
    // allowed
  } else if(isGestor(actor) && target.createdBy === actor.id) {
    // allowed
  } else throw new Error('Permissão negada para editar este usuário');

  if(updates.username){
    const other = users.find(u=>u.username===updates.username && u.id !== target.id);
    if(other) throw new Error('Username já em uso');
    target.username = updates.username;
  }
  if(updates.role){
    if(updates.role === 'admin' && !isAdmin(actor)) throw new Error('Apenas admin pode atribuir admin');
    target.role = updates.role;
  }
  target.updatedAt = nowISO();
  users[idx] = target;
  saveJSON(USERS_KEY, users);
  return sanitize(target);
}

async function changePassword(actor, targetId, newPassword){
  if(!actor) throw new Error('Faça login primeiro');
  if(!newPassword) throw new Error('Nova senha requerida');
  const users = await getAllUsers();
  const idx = users.findIndex(u=>u.id===targetId);
  if(idx === -1) throw new Error('Usuário não encontrado');
  const target = users[idx];

  if(actor.id === target.id || isAdmin(actor) || (isGestor(actor) && target.createdBy === actor.id)){
    const ph = await hashPassword(newPassword);
    target.passwordHash = ph;
    target.updatedAt = nowISO();
    users[idx] = target;
    saveJSON(USERS_KEY, users);
    return { success:true };
  } else throw new Error('Permissão negada para alterar senha');
}

async function deleteUser(actor, targetId){
  if(!actor) throw new Error('Faça login primeiro');
  const users = await getAllUsers();
  const idx = users.findIndex(u=>u.id===targetId);
  if(idx === -1) throw new Error('Usuário alvo não encontrado');
  const target = users[idx];
  if(actor.id === target.id) throw new Error('Não é permitido excluir o próprio usuário');
  if(isAdmin(actor)){
    // allowed
  } else if(isGestor(actor)){
    if(target.createdBy !== actor.id) throw new Error('Gestor só pode excluir usuários que ele criou');
  } else throw new Error('Permissão negada');
  users.splice(idx,1);
  saveJSON(USERS_KEY, users);
  return { success:true };
}

function sanitize(u){ if(!u) return null; const { passwordHash, ...rest } = u; return rest; }
async function listUsers(actor){ if(!actor) throw new Error('Faça login primeiro'); const users = await getAllUsers(); return users.map(sanitize); }

/* ---------- UI binding ---------- */
const loginBtn = document.getElementById('loginBtn');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const feedbackMessage = document.getElementById('feedbackMessage');
const loginContainer = document.querySelector('.login-container');
const appRoot = document.getElementById('app');
const btnSair = document.getElementById('btnSair');
const btnManageUsers = document.getElementById('btnManageUsers');
const btnDeliveries = document.getElementById('btnDeliveries');
const btnMap = document.getElementById('btnMap');
const btnCamera = document.getElementById('btnCamera');
const btnRoute = document.getElementById('btnRoute');
const userManagementView = document.getElementById('userManagementView');
const deliveriesList = document.getElementById('deliveriesList');
const mapEl = document.getElementById('map');
const createUserBtn = document.getElementById('createUserBtn');
const newUsername = document.getElementById('newUsername');
const newPassword = document.getElementById('newPassword');
const newUserRole = document.getElementById('newUserRole');
const userTableBody = document.getElementById('userTableBody');
const userFeedbackMessage = document.getElementById('userFeedbackMessage');

let currentUserObj = null;
let map = null;
let markersLayer = null;

/* ---------- initialization ---------- */
window.addEventListener('DOMContentLoaded', async ()=>{
  await seedIfNeeded();
  bindUI();
  const sess = loadSession();
  if(sess){
    const u = await findUserById(sess.userId);
    if(u){
      currentUserObj = u;
      showApp();
      await loadAndRender();
      return;
    } else {
      clearSession();
    }
  }
});

function bindUI(){
  loginBtn.onclick = async ()=>{
    feedbackMessage.textContent = 'Verificando...';
    try{
      const sess = await login(loginUser.value.trim(), loginPass.value);
      currentUserObj = await findUserById(sess.userId);
      showApp();
      await loadAndRender();
    }catch(e){
      feedbackMessage.textContent = e.message;
    }
  };
  btnSair.onclick = logout;
  btnManageUsers.onclick = ()=> showView('users');
  btnDeliveries.onclick = ()=> showView('list');
  btnMap.onclick = ()=> showView('map');
  btnCamera.onclick = ()=> showView('camera');
  btnRoute.onclick = generateRoute;
  createUserBtn.onclick = async ()=>{
    userFeedbackMessage.style.color='blue';
    userFeedbackMessage.textContent='Criando...';
    try{
      await createUser(currentUserObj, { username: newUsername.value.trim(), password: newPassword.value, role: newUserRole.value });
      userFeedbackMessage.style.color='green';
      userFeedbackMessage.textContent='Usuário criado.';
      newUsername.value=''; newPassword.value='';
      renderUserTable();
    }catch(err){
      userFeedbackMessage.style.color='red';
      userFeedbackMessage.textContent=err.message;
    }
  };
}

function showApp(){
  document.querySelector('.login-container').style.display = 'none';
  appRoot.style.display = 'block';
  applyUserLimitations();
}

function showView(name){
  mapEl.style.display = 'none';
  deliveriesList.style.display = 'none';
  userManagementView.style.display = 'none';
  document.getElementById('cameraContainer').style.display = 'none';
  if(name==='map'){ mapEl.style.display='block'; setTimeout(()=> map && map.invalidateSize(),200); }
  else if(name==='list'){ deliveriesList.style.display='block'; renderDeliveriesList(); }
  else if(name==='users'){ userManagementView.style.display='block'; renderUserTable(); }
  else if(name==='camera'){ document.getElementById('cameraContainer').style.display='flex'; }
}

function applyUserLimitations(){
  if(!currentUserObj) return;
  if(isAdmin(currentUserObj) || isGestor(currentUserObj)) btnManageUsers.style.display = 'block'; else btnManageUsers.style.display = 'none';
  updateDeliveriesCount();
}

/* ---------- users UI ---------- */
async function renderUserTable(){
  const users = await getAllUsers();
  userTableBody.innerHTML = '';
  users.forEach(u=>{
    const tr = document.createElement('tr');
    const createdByUser = u.createdBy ? (users.find(x=>x.id===u.createdBy)?.username || u.createdBy) : '-';
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td>${createdByUser}</td>
      <td>
        <button class="btn-small btn-edit">Editar</button>
        <button class="btn-small btn-delete">Excluir</button>
        <button class="btn-small btn-pass">Senha</button>
      </td>
    `;
    const editBtn = tr.querySelector('.btn-edit');
    const delBtn = tr.querySelector('.btn-delete');
    const passBtn = tr.querySelector('.btn-pass');

    editBtn.onclick = async ()=>{
      try{
        const newU = prompt('Novo username (deixe em branco para manter):', u.username);
        let newRole = u.role;
        if(isAdmin(currentUserObj)){
          const r = prompt('Nova role (admin/gestor/colaborador) — deixe em branco para manter:', u.role);
          if(r && ['admin','gestor','colaborador'].includes(r)) newRole = r;
        } else if(currentUserObj.id === u.id){
          // self only username change
        } else if(isGestor(currentUserObj) && u.createdBy === currentUserObj.id){
          const r = prompt('Nova role (gestor/colaborador) — deixe em branco para manter:', u.role);
          if(r && ['gestor','colaborador'].includes(r)) newRole = r;
        } else throw new Error('Permissão negada para editar este usuário');

        await editUser(currentUserObj, u.id, { username: newU? newU.trim(): undefined, role: newRole });
        alert('Usuário atualizado');
        renderUserTable();
      }catch(e){ alert(e.message); }
    };

    delBtn.onclick = async ()=>{
      try{
        if(!confirm(`Excluir ${u.username}?`)) return;
        await deleteUser(currentUserObj, u.id);
        alert('Usuário excluído');
        renderUserTable();
      }catch(e){ alert(e.message); }
    };

    passBtn.onclick = async ()=>{
      try{
        const np = prompt(`Nova senha para ${u.username}:`);
        if(np === null) return;
        if(np.trim().length < 4) return alert('Senha precisa ter ao menos 4 caracteres.');
        await changePassword(currentUserObj, u.id, np.trim());
        alert('Senha alterada.');
      }catch(e){ alert(e.message); }
    };

    if(u.id === currentUserObj.id) delBtn.disabled = true;
    if(isGestor(currentUserObj) && u.createdBy !== currentUserObj.id) delBtn.disabled = true;
    if(!isAdmin(currentUserObj) && u.role === 'admin'){ delBtn.disabled = true; editBtn.disabled = (u.id !== currentUserObj.id); }

    userTableBody.appendChild(tr);
  });
}

/* ---------- deliveries UI ---------- */
function renderDeliveriesList(){
  const scans = loadScans();
  deliveriesList.innerHTML = '';
  if(!scans.length) { deliveriesList.innerHTML = '<p style="padding:20px;color:var(--muted)">Nenhuma entrega registrada.</p>'; updateDeliveriesCount(); return; }
  scans.forEach(s=>{
    const div = document.createElement('div');
    div.className = 'delivery-item';
    const ts = new Date(s.timestamp).toLocaleString();
    div.innerHTML = `<strong>${s.code}</strong><div class="meta">Gestor: ${s.gestor} • ${ts}</div><div style="margin-top:8px;color:#444">${s.address||''}</div>`;
    deliveriesList.appendChild(div);
  });
  updateDeliveriesCount();
}
function updateDeliveriesCount(){ btnDeliveries.textContent = `📦 Entregas (${ loadScans().length })`; }

/* ---------- map & route ---------- */
function initMap(){
  if(map) return;
  map = L.map('map').setView([-23.55052, -46.633309], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}
function plotScansOnMap(){
  if(!map) initMap();
  markersLayer.clearLayers();
  const scans = loadScans();
  scans.forEach(s=>{
    if(s.lat && s.lng){
      L.marker([s.lat, s.lng]).addTo(markersLayer).bindPopup(`<b>${s.code}</b><br>${s.address||''}`);
    }
  });
  if(scans.length && scans[0].lat && scans[0].lng) map.setView([scans[0].lat, scans[0].lng],13);
}

/* ---------- register scan (mock) ---------- */
async function registerScan(code, coords=null, type='entrega', address=''){
  if(!currentUserObj) return alert('Usuário não logado');
  const scans = loadScans();
  if(scans.some(s => s.code === code && (Date.now() - new Date(s.timestamp)) < 3000)) return;
  const newScan = { id: uuid(), code, lat: coords?coords.lat:null, lng: coords?coords.lng:null, timestamp: new Date().toISOString(), type, address, gestor: currentUserObj.username };
  addScan(newScan);
  renderDeliveriesList();
  plotScansOnMap();
  try { beep(); } catch(e){}
  alert(`Entrega ${code} registrada por ${currentUserObj.username}`);
}

/* ---------- utilities ---------- */
function beep(){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type='sine'; o.frequency.value=900; g.gain.value=0.02;
    o.start(); setTimeout(()=>{o.stop();ctx.close();},120);
  }catch(e){}
}
function generateRoute(){
  const scans = loadScans();
  if(!scans.length){ alert('Nenhuma entrega para gerar rota'); return; }
  showView('map');
  initMap();
  const coords = scans.filter(s=>s.lat && s.lng).map(s=>[s.lat,s.lng]);
  if(coords.length===0) return alert('Nenhuma entrega geolocalizada');
  const layer = L.layerGroup().addTo(map);
  coords.forEach((c,i)=> L.marker(c).addTo(layer).bindPopup(`#${i+1}`));
  if(coords.length>1) L.polyline(coords,{color:'blue'}).addTo(layer);
  map.fitBounds(L.latLngBounds(coords));
}

/* ---------- load & render ---------- */
async function loadAndRender(){
  await seedIfNeeded();
  renderUserTable();
  renderDeliveriesList();
  initMap();
  plotScansOnMap();
  showView('list');
}

/* ---------- expose for console ---------- */
window.MiniMock = {
  seedIfNeeded, getAllUsers, findUserByUsername, findUserById, login, logout, currentUser,
  createUser, editUser, changePassword, deleteUser, listUsers,
  loadScans, addScan, registerScan, exportScans: ()=>{ console.log(loadScans()); }
};
