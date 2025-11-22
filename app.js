// ============================================================
// app.js - PegazusLog (MOCK) + html5-qrcode scanner
// Hierarquia + filtros por data + relatório por colaborador
// ============================================================

// STORAGE KEYS
const USERS_KEY = "pegazus_users_v1";
const SCANS_KEY = "pegazus_scans_v1";
const SESSION_KEY = "pegazus_session_v1";

function nowISO(){ return new Date().toISOString(); }
function uuid(){ return "id-"+Math.random().toString(36).slice(2,9)+"-"+Date.now().toString(36).slice(-6); }
function saveJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function loadJSON(k,def){ try{ const r = localStorage.getItem(k); return r?JSON.parse(r):def; }catch{ return def; } }

async function hashPassword(p){
  const data = new TextEncoder().encode(p);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ---------------- SEED ---------------- */
async function seedIfNeeded(){
  let users = loadJSON(USERS_KEY, []);
  if(users && users.length) return users;
  const ph = await hashPassword('882010');
  const admin = { id:'user-thon', username:'thon', role:'admin', passwordHash:ph, createdBy:null, createdAt:nowISO(), updatedAt:nowISO() };
  users = [admin];
  saveJSON(USERS_KEY, users);
  return users;
}

async function getAllUsers(){ await seedIfNeeded(); return loadJSON(USERS_KEY, []); }
async function findUserByUsername(username){ const u = (await getAllUsers()).find(x=>x.username===username); return u||null; }
async function findUserById(id){ const u = (await getAllUsers()).find(x=>x.id===id); return u||null; }

function saveSession(sess){ saveJSON(SESSION_KEY, sess); }
function loadSession(){ return loadJSON(SESSION_KEY, null); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
async function currentUser(){ const s = loadSession(); return s ? await findUserById(s.userId) : null; }

/* ---------------- SCANS ---------------- */
function loadScans(){ return loadJSON(SCANS_KEY, []); }
function saveScans(arr){ saveJSON(SCANS_KEY, arr); }
function addScan(scan){ const arr = loadScans(); arr.unshift(scan); saveScans(arr); }

/* ---------------- AUTH ---------------- */
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

function isAdmin(u){ return u && u.role === 'admin'; }
function isGestor(u){ return u && u.role === 'gestor'; }
function isColaborador(u){ return u && u.role === 'colaborador'; }

/* ---------------- USERS CRUD ---------------- */
async function createUser(actor, {username, password, role='gestor'}){
  if(!actor) throw new Error('Faça login primeiro');
  if(!isAdmin(actor) && !isGestor(actor)) throw new Error('Apenas admin/gestor podem criar usuários');
  if(isGestor(actor) && role !== 'colaborador') throw new Error('Gestor só pode criar colaboradores');
  if(role === 'admin' && !isAdmin(actor)) throw new Error('Apenas admin pode criar admin');
  if(!username || !password) throw new Error('Dados obrigatórios');
  const users = await getAllUsers();
  if(users.find(u=>u.username===username)) throw new Error('Usuário já existe');
  const ph = await hashPassword(password);
  const u = { id: uuid(), username, role, passwordHash: ph, createdBy: actor.id, createdAt: nowISO(), updatedAt: nowISO() };
  users.push(u); saveJSON(USERS_KEY, users); return sanitize(u);
}

async function editUser(actor, id, updates){
  const users = await getAllUsers();
  const idx = users.findIndex(u=>u.id===id); if(idx === -1) throw new Error('Usuário não encontrado');
  const target = users[idx];
  if(actor.id !== target.id){
    if(isAdmin(actor)){} else if(isGestor(actor)){
      if(target.createdBy !== actor.id) throw new Error('Gestor só pode editar usuários que criou');
    } else throw new Error('Sem permissão para editar este usuário');
  }
  if(updates.username){
    if(users.find(u=>u.username===updates.username && u.id !== id)) throw new Error('Username já em uso');
    target.username = updates.username;
  }
  if(updates.role){
    if(updates.role === 'admin' && !isAdmin(actor)) throw new Error('Apenas admin pode atribuir admin');
    if(isGestor(actor) && updates.role !== 'colaborador') throw new Error('Gestor não pode alterar role para este valor');
    target.role = updates.role;
  }
  target.updatedAt = nowISO(); users[idx] = target; saveJSON(USERS_KEY, users); return sanitize(target);
}

async function changePassword(actor, id, newPass){
  const users = await getAllUsers();
  const idx = users.findIndex(u=>u.id===id); if(idx === -1) throw new Error('Usuário não encontrado');
  const target = users[idx];
  if(actor.id === target.id || isAdmin(actor) || (isGestor(actor) && target.createdBy === actor.id)){
    target.passwordHash = await hashPassword(newPass);
    target.updatedAt = nowISO(); users[idx] = target; saveJSON(USERS_KEY, users); return {success:true};
  } else throw new Error('Permissão negada para alterar senha');
}

async function deleteUser(actor, id){
  const users = await getAllUsers();
  const idx = users.findIndex(u=>u.id===id); if(idx === -1) throw new Error('Usuário não encontrado');
  const target = users[idx];
  if(actor.id === target.id) throw new Error('Não é permitido excluir o próprio usuário');
  if(isAdmin(actor)){} else if(isGestor(actor)){
    if(target.createdBy !== actor.id) throw new Error('Gestor só pode excluir usuários que criou');
  } else throw new Error('Permissão negada');
  users.splice(idx,1); saveJSON(USERS_KEY, users); return {success:true};
}

function sanitize(u){ if(!u) return null; const {passwordHash, ...rest} = u; return rest; }

/* ---------------- UI binding ---------------- */
const loginBtn = document.getElementById('loginBtn');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const feedbackMessage = document.getElementById('feedbackMessage');
const loginBox = document.getElementById('loginBox');

const sidebar = document.getElementById('sidebar');
const btnBack = document.getElementById('btnBack');
const appRoot = document.getElementById('app');

const btnManageUsers = document.getElementById('btnManageUsers');
const btnDeliveries = document.getElementById('btnDeliveries');
const btnCamera = document.getElementById('btnCamera');
const btnMap = document.getElementById('btnMap');
const btnRoute = document.getElementById('btnRoute');
const btnSair = document.getElementById('btnSair');

const userManagementView = document.getElementById('userManagementView');
const deliveriesList = document.getElementById('deliveriesList');
const cameraContainer = document.getElementById('cameraContainer');
const mapEl = document.getElementById('map');
const qrReaderEl = document.getElementById('qr-reader');

const userTableBody = document.getElementById('userTableBody');
const newUsername = document.getElementById('newUsername');
const newPassword = document.getElementById('newPassword');
const newUserRole = document.getElementById('newUserRole');
const createUserBtn = document.getElementById('createUserBtn');

const btnExportCSV = document.getElementById('btnExportCSV');
const exportDaily = document.getElementById('exportDaily');
const exportQuinzenal = document.getElementById('exportQuinzenal');
const exportMensal = document.getElementById('exportMensal');
const deliveriesCount = document.getElementById('deliveriesCount');

const filterButtons = document.querySelectorAll('.filter-btn');
const btnFilterCustom = document.getElementById('btnFilterCustom');
const btnClearFilter = document.getElementById('btnClearFilter');

const reportSection = document.getElementById('reportColaboradorSection');
const reportUserSelect = document.getElementById('reportUserSelect');
const btnReportUser = document.getElementById('btnReportUser');

let currentUserObj = null;
let map = null;
let markersLayer = null;

/* ---------------- sidebar mobile handling ---------------- */
function openScreenHideMenu(){ sidebar.style.display = 'none'; btnBack.style.display = 'inline-block'; }
function backToMenu(){ sidebar.style.display = 'flex'; btnBack.style.display = 'none'; hideAllViews(); showView('list'); }
btnBack.addEventListener('click', ()=>{ backToMenu(); });

/* ---------------- login flow ---------------- */
loginBtn.addEventListener('click', async ()=>{
  feedbackMessage.textContent = 'Verificando...';
  try{
    const sess = await login(loginUser.value.trim(), loginPass.value.trim());
    currentUserObj = await findUserById(sess.userId);
    loginBox.style.display = 'none';
    appRoot.style.display = 'block';
    // CORREÇÃO: Mostra a sidebar após o login
    sidebar.style.display = 'flex'; 
    await loadAndRender();
  }catch(e){
    feedbackMessage.textContent = e.message;
  }
});
btnSair.addEventListener('click', ()=>{ logout(); });

/* ---------------- navigation ---------------- */
btnManageUsers.addEventListener('click', ()=>{ openScreenHideMenu(); showView('users'); });
btnDeliveries.addEventListener('click', ()=>{ openScreenHideMenu(); showView('list'); });
btnCamera.addEventListener('click', ()=>{ openScreenHideMenu(); showView('camera'); startScanner(); });
btnMap.addEventListener('click', ()=>{ openScreenHideMenu(); showView('map'); setTimeout(()=> map && map.invalidateSize(),200); });
btnRoute.addEventListener('click', ()=>{ openScreenHideMenu(); generateRoute(); });

/* ---------------- view helpers ---------------- */
function hideAllViews(){
  userManagementView.style.display = 'none';
  deliveriesList.style.display = 'none';
  cameraContainer.style.display = 'none';
  mapEl.style.display = 'none';
}
function showView(name){
  hideAllViews();
  if(name==='users') userManagementView.style.display = 'block';
  if(name==='list') deliveriesList.style.display = 'block';
  if(name==='camera') cameraContainer.style.display = 'flex';
  if(name==='map') mapEl.style.display = 'block';
}

/* ---------------- users UI ---------------- */
createUserBtn.addEventListener('click', async ()=>{
  try{
    await createUser(currentUserObj, { username: newUsername.value.trim(), password: newPassword.value.trim(), role: newUserRole.value });
    newUsername.value=''; newPassword.value=''; renderUserTable();
    alert('Usuário criado');
  }catch(e){
    alert(e.message);
  }
});

async function renderUserTable(){
  const users = await getAllUsers();
  userTableBody.innerHTML = '';
  users.forEach(u=>{
    const creator = u.createdBy ? (users.find(x=>x.id===u.createdBy)?.username || '-') : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.username}</td><td>${u.role}</td><td>${creator}</td><td>
      <button class="btn-small btn-edit">Editar</button>
      <button class="btn-small btn-delete">Excluir</button>
      <button class="btn-small btn-pass">Senha</button>
    </td>`;
    const edit = tr.querySelector('.btn-edit');
    const del = tr.querySelector('.btn-delete');
    const pass = tr.querySelector('.btn-pass');

    edit.onclick = async ()=>{
      try{
        const newU = prompt('Novo username:', u.username);
        let newRole = u.role;
        if(isAdmin(currentUserObj)){
          const r = prompt('Nova função (admin/gestor/colaborador):', u.role);
          if(r && ['admin','gestor','colaborador'].includes(r)) newRole = r;
        } else if(isGestor(currentUserObj) && u.createdBy === currentUserObj.id){
          const r = prompt('Nova função (gestor/colaborador):', u.role);
          if(r && ['gestor','colaborador'].includes(r)) newRole = r;
        }
        await editUser(currentUserObj, u.id, { username: newU? newU.trim(): undefined, role: newRole });
        alert('Atualizado');
        renderUserTable();
      }catch(e){ alert(e.message); }
    };

    del.onclick = async ()=>{ if(!confirm('Excluir usuário?')) return; try{ await deleteUser(currentUserObj, u.id); alert('Excluído'); renderUserTable(); }catch(e){ alert(e.message); } };
    pass.onclick = async ()=>{ const np = prompt('Nova senha:'); if(!np) return; try{ await changePassword(currentUserObj, u.id, np); alert('Senha alterada'); }catch(e){ alert(e.message); } };

    if(u.id === currentUserObj.id) del.disabled = true;
    if(isGestor(currentUserObj) && u.createdBy !== currentUserObj.id){ edit.disabled = true; del.disabled = true; }

    userTableBody.appendChild(tr);
  });
}

/* ---------------- deliveries UI (with filters and hierarchy) ---------------- */
async function getTeamUsernames(gestorUser){
  const users = await getAllUsers();
  const team = users.filter(u => u.createdBy === gestorUser.id).map(u => u.username);
  team.unshift(gestorUser.username);
  return team;
}

function applyActiveFilter(list){
  const f = window.activeFilter;
  if(!f) return list;
  if(typeof f === 'string'){
    const now = new Date();
    if(f === 'today') return list.filter(s=> new Date(s.timestamp).toDateString() === now.toDateString());
    if(f === 'yesterday'){ const y = new Date(Date.now()-86400000); return list.filter(s=> new Date(s.timestamp).toDateString() === y.toDateString()); }
    if(f === '7d') return list.filter(s=> new Date(s.timestamp).getTime() >= Date.now()-7*86400000);
    if(f === '30d') return list.filter(s=> new Date(s.timestamp).getTime() >= Date.now()-30*86400000);
    return list;
  } else if(typeof f === 'object' && f.start && f.end){
    const st = new Date(f.start); const en = new Date(f.end); en.setHours(23,59,59,999);
    return list.filter(s=>{ const t = new Date(s.timestamp); return t >= st && t <= en; });
  }
  return list;
}

async function renderDeliveriesList(){
  const scans = loadScans();
  deliveriesList.innerHTML = '';
  if(!currentUserObj){ deliveriesList.innerHTML = '<p style="padding:12px;color:var(--muted)">Faça login para ver entregas.</p>'; return; }

  let visible = [];
  if(isAdmin(currentUserObj)){ visible = scans; }
  else if(isGestor(currentUserObj)){ const team = await getTeamUsernames(currentUserObj); visible = scans.filter(s=> team.includes(s.gestor)); }
  else { visible = scans.filter(s=> s.gestor === currentUserObj.username); }

  visible = applyActiveFilter(visible);

  if(visible.length === 0){ deliveriesList.innerHTML = '<p style="padding:12px;color:var(--muted)">Nenhuma entrega registrada.</p>'; deliveriesCount.textContent = 'Entregas: 0'; return; }

  visible.forEach(s=>{
    const div = document.createElement('div'); div.className = 'delivery-item';
    div.innerHTML = `<strong>${s.code}</strong><div class="meta">Gestor: ${s.gestor} • ${new Date(s.timestamp).toLocaleString()}</div><div style="margin-top:8px">${s.address||''}</div>`;
    deliveriesList.appendChild(div);
  });
  deliveriesCount.textContent = 'Entregas: '+visible.length;
}

/* ---------------- map & route ---------------- */
function initMap(){ if(map) return; map = L.map('map').setView([-23.55,-46.63],12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map); markersLayer = L.layerGroup().addTo(map); }
function plotScansOnMap(){ if(!map) initMap(); markersLayer.clearLayers(); const scans = loadScans(); scans.forEach(s=>{ if(s.lat && s.lng) L.marker([s.lat,s.lng]).addTo(markersLayer).bindPopup(`<b>${s.code}</b><br>${s.address||''}`); }); }
function generateRoute(){ const scans = loadScans().filter(s=>s.lat && s.lng); if(scans.length < 2){ alert('Nenhuma rota possível (>=2 entregas geolocalizadas)'); return; } showView('map'); initMap(); const coords = scans.map(s=>[s.lat,s.lng]); const layer = L.layerGroup().addTo(map); coords.forEach((c,i)=>L.marker(c).addTo(layer).bindPopup(`#${i+1}`)); L.polyline(coords,{color:'blue'}).addTo(layer); map.fitBounds(coords); }

/* ---------------- scanner (html5-qrcode) ---------------- */
let html5Scanner = null; let scanning = false;
async function startScanner(){
  if(scanning) return;
  if(!currentUserObj){ alert('Faça login antes de usar o scanner'); return; }
  scanning = true;
  if(html5Scanner) try{ await html5Scanner.stop(); html5Scanner.clear(); }catch(e){}
  html5Scanner = new Html5Qrcode('qr-reader');
  const cams = await Html5Qrcode.getCameras().catch(()=>[]);
  let camId = cams[0]?.id || null;
  for(const c of (cams||[])){ if(/back|rear|environment/i.test(c.label)) { camId = c.id; break; } }
  html5Scanner.start(camId, { fps:10, qrbox:280 }, qrCodeMessage=>{
    const last = loadScans()[0];
    if(last && last.code === qrCodeMessage && (Date.now() - new Date(last.timestamp)) < 1500) return;
    const scan = { id: uuid(), code: qrCodeMessage, timestamp: nowISO(), lat:null, lng:null, address:'', gestor: currentUserObj.username };
    addScan(scan); renderDeliveriesList(); plotScansOnMap(); try{ beep(); }catch(e){}; 
  }, err=>{}).catch(err=>{
    scanning = false; console.error('scanner error', err); alert('Não foi possível abrir a câmera. Verifique permissões e https/localhost.');
  });
}
async function stopScanner(){ if(!html5Scanner) return; try{ await html5Scanner.stop(); html5Scanner.clear(); }catch(e){} html5Scanner=null; scanning=false; }

/* ---------------- manual register helper ---------------- */
async function registerScanManual(code){ const user = currentUserObj || await currentUser(); if(!user) return alert('Faça login'); const s = { id: uuid(), code, timestamp: nowISO(), lat:null, lng:null, address:'', gestor: user.username }; addScan(s); renderDeliveriesList(); plotScansOnMap(); beep(); alert('Entrega registrada: '+code); }

/* ---------------- CSV export functions ---------------- */
function exportCSVList(list, filename){
  if(!list || !list.length){ alert('Nenhuma entrega para exportar'); return; }
  let csv = 'codigo,gestor,data,lat,lng,endereco\\n';
  list.forEach(s=>{ csv += `"${s.code}","${s.gestor}","${s.timestamp}",${s.lat||''},${s.lng||''},"${(s.address||'').replace(/"/g,'""')}"\\n`; });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

document.getElementById('exportDaily').addEventListener('click', ()=>{ exportCSVFor(1); });
document.getElementById('exportQuinzenal').addEventListener('click', ()=>{ exportCSVFor(15); });
document.getElementById('exportMensal').addEventListener('click', ()=>{ exportCSVFor(30); });

function exportCSVFor(days){
  const all = loadScans();
  let list = all;
  if(days) list = all.filter(s=> new Date(s.timestamp).getTime() >= Date.now() - days*86400000);
  // apply hierarchy filter
  if(!currentUserObj) return alert('Faça login');
  if(isAdmin(currentUserObj)){}
  else if(isGestor(currentUserObj)){
    // only team
    getTeamUsernames(currentUserObj).then(team=>{
      const filtered = list.filter(s=> team.includes(s.gestor));
      exportCSVList(filtered, `entregas_${days}d.csv`);
    });
    return;
  } else {
    list = list.filter(s=> s.gestor === currentUserObj.username);
  }
  exportCSVList(list, `entregas_${days}d.csv`);
}

/* ---------------- filters UI binding ---------------- */
const filterButtonsNodeList = document.querySelectorAll('.filter-btn');
filterButtonsNodeList.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    window.activeFilter = btn.dataset.filter;
    renderDeliveriesList();
  });
});
btnFilterCustom.addEventListener('click', ()=>{
  const s = document.getElementById('filterStart').value;
  const e = document.getElementById('filterEnd').value;
  if(!s || !e){ alert('Selecione o intervalo'); return; }
  window.activeFilter = { start: s, end: e };
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  renderDeliveriesList();
});
btnClearFilter.addEventListener('click', ()=>{
  window.activeFilter = null;
  document.getElementById('filterStart').value=''; document.getElementById('filterEnd').value='';
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  renderDeliveriesList();
});

/* ---------------- report by collaborator ---------------- */
async function loadReportUsers(){
  const users = await getAllUsers();
  reportUserSelect.innerHTML = '';
  if(isAdmin(currentUserObj)){
    users.forEach(u=>{
      if(u.role !== 'admin'){
        const opt = document.createElement('option'); opt.value = u.username; opt.textContent = `${u.username} (${u.role})`; reportUserSelect.appendChild(opt);
      }
    });
  } else if(isGestor(currentUserObj)){
    users.forEach(u=>{
      if(u.createdBy === currentUserObj.id){
        const opt = document.createElement('option'); opt.value = u.username; opt.textContent = u.username; reportUserSelect.appendChild(opt);
      }
    });
  }
  if(reportUserSelect.children.length > 0) reportSection.style.display = 'block'; else reportSection.style.display = 'none';
}

btnReportUser.addEventListener('click', ()=>{
  const user = reportUserSelect.value;
  if(!user) return alert('Selecione um colaborador');
  const all = loadScans();
  const filtered = all.filter(x => x.gestor === user);
  if(!filtered.length) return alert('Nenhuma entrega encontrada para esse colaborador.');
  exportCSVList(filtered, `relatorio_${user}.csv`);
});

/* ---------------- load & render ---------------- */
async function loadAndRender(){
  await seedIfNeeded();
  currentUserObj = await currentUser();
  renderUserTable();
  await renderDeliveriesList();
  initMap();
  plotScansOnMap();
  // show report users if permitted
  if(isAdmin(currentUserObj) || isGestor(currentUserObj)) { await loadReportUsers(); }
  showView('list');
}

/* ---------------- beep ---------------- */
function beep(){ try{ const ctx = new (window.AudioContext||window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type='sine'; o.frequency.value=900; g.gain.value=0.02; o.start(); setTimeout(()=>{ o.stop(); ctx.close(); },120); }catch(e){} }

/* ---------------- initial session restore ---------------- */
window.addEventListener('DOMContentLoaded', async ()=>{
  await seedIfNeeded();
  const sess = loadSession();
  
  if(sess){
    currentUserObj = await findUserById(sess.userId);
    if(currentUserObj){
      loginBox.style.display = 'none';
      appRoot.style.display = 'block';
      // CORREÇÃO: Mostra a sidebar se a sessão for válida
      sidebar.style.display = 'flex'; 
      await loadAndRender();
    } else {
      // Se a sessão existir, mas o usuário não for encontrado (ex: excluído), limpa e mostra login
      clearSession();
      loginBox.style.display = 'block';
      appRoot.style.display = 'none';
      sidebar.style.display = 'none';
    }
  } else {
    // CORREÇÃO: Mostra o loginBox e esconde o resto
    loginBox.style.display = 'block';
    appRoot.style.display = 'none';
    sidebar.style.display = 'none';
  }
});

/* ---------------- expose for console ---------------- */
window.MiniMock = { seedIfNeeded, getAllUsers, findUserByUsername, findUserById, login, logout, currentUser, createUser, editUser, changePassword, deleteUser, loadScans, addScan, registerScanManual: registerScanManual };
