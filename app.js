// ============================================================
// app.js - PegazusLog (2025 MOCK LOCAL)
// Scanner REAL // Hierarquia // CSV // Mapa // Sidebar Mobile
// ============================================================

// STORAGE KEYS
const USERS_KEY = "pegazus_users_v1";
const SCANS_KEY = "pegazus_scans_v1";
const SESSION_KEY = "pegazus_session_v1";

// ---------------------- HELPERS ----------------------
function nowISO(){ return new Date().toISOString(); }
function uuid(){ return "id-"+Math.random().toString(36).slice(2)+Date.now().toString(36); }
function saveJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function loadJSON(k,def){ try{ let r=localStorage.getItem(k); return r?JSON.parse(r):def; }catch{ return def; } }

async function hashPassword(p){
  const enc = new TextEncoder().encode(p);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

// ---------------------- SEED ADMIN ----------------------
async function seedIfNeeded(){
  let users = loadJSON(USERS_KEY, []);
  if(users.length > 0) return users;

  const ph = await hashPassword("882010");
  const admin = {
    id: "user-thon",
    username: "thon",
    role: "admin",
    passwordHash: ph,
    createdBy: null,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };

  users = [admin];
  saveJSON(USERS_KEY, users);
  return users;
}

async function getAllUsers(){
  await seedIfNeeded();
  return loadJSON(USERS_KEY, []);
}
async function findUserByUsername(u){
  return (await getAllUsers()).find(x=>x.username===u) || null;
}
async function findUserById(id){
  return (await getAllUsers()).find(x=>x.id===id) || null;
}

function saveSession(sess){ saveJSON(SESSION_KEY, sess); }
function loadSession(){ return loadJSON(SESSION_KEY, null); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
async function currentUser(){
  const s = loadSession();
  if(!s) return null;
  return await findUserById(s.userId);
}

// ---------------------- ROLES -------------------------
function isAdmin(u){ return u && u.role==="admin"; }
function isGestor(u){ return u && u.role==="gestor"; }
function isColab(u){ return u && u.role==="colaborador"; }

// ---------------------- SCANS -------------------------
function loadScans(){ return loadJSON(SCANS_KEY, []); }
function saveScans(a){ saveJSON(SCANS_KEY, a); }
function addScan(scan){
  const arr = loadScans();
  arr.unshift(scan);
  saveScans(arr);
}

// ---------------------- AUTH --------------------------
async function login(username, password){
  const u = await findUserByUsername(username);
  if(!u) throw new Error("Usuário não encontrado");

  const ph = await hashPassword(password);
  if(ph !== u.passwordHash) throw new Error("Senha incorreta");

  const sess = {
    token: uuid(),
    userId: u.id,
    username: u.username,
    role: u.role,
    at: nowISO()
  };
  saveSession(sess);
  return sess;
}
function logout(){ clearSession(); location.reload(); }

// ---------------------- USERS CRUD ---------------------
async function createUser(actor,{username,password,role="gestor"}){
  if(!actor) throw new Error("Não logado");
  if(!isAdmin(actor) && !isGestor(actor)) throw new Error("Sem permissão");

  if(isGestor(actor) && role!=="colaborador")
    throw new Error("Gestor só cria colaboradores");

  if(role==="admin" && !isAdmin(actor))
    throw new Error("Apenas admin cria admin");

  if(!username || !password)
    throw new Error("Dados obrigatórios");

  const users = await getAllUsers();
  if(users.find(u=>u.username===username))
    throw new Error("Usuário já existe");

  const ph = await hashPassword(password);
  const newU = {
    id: uuid(),
    username,
    role,
    passwordHash: ph,
    createdBy: actor.id,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };

  users.push(newU);
  saveJSON(USERS_KEY, users);
  return sanitize(newU);
}

async function editUser(actor,id,updates){
  const users = await getAllUsers();
  const idx = users.findIndex(x=>x.id===id);
  if(idx===-1) throw new Error("Usuário não encontrado");

  const tgt = users[idx];

  if(actor.id !== tgt.id){
    if(isAdmin(actor)){}
    else if(isGestor(actor)){
      if(tgt.createdBy !== actor.id)
        throw new Error("Gestor só edita quem ele criou");
    } else throw new Error("Sem permissão");
  }

  if(updates.username){
    if(users.find(u=>u.username===updates.username && u.id!==id))
      throw new Error("Username em uso");
    tgt.username = updates.username;
  }

  if(updates.role){
    if(updates.role==="admin" && !isAdmin(actor))
      throw new Error("Apenas admin cria admin");
    if(isGestor(actor) && updates.role!=="colaborador")
      throw new Error("Gestor não pode alterar para esse tipo");
    tgt.role = updates.role;
  }

  tgt.updatedAt = nowISO();
  users[idx] = tgt;
  saveJSON(USERS_KEY, users);
  return sanitize(tgt);
}

async function changePassword(actor,id,newPass){
  const users = await getAllUsers();
  const idx = users.findIndex(x=>x.id===id);
  if(idx===-1) throw new Error("Usuário não encontrado");

  const tgt = users[idx];

  if(actor.id===tgt.id || isAdmin(actor) || (isGestor(actor)&&tgt.createdBy===actor.id)){
    tgt.passwordHash = await hashPassword(newPass);
    tgt.updatedAt = nowISO();
    users[idx]=tgt;
    saveJSON(USERS_KEY, users);
    return {success:true};
  }
  throw new Error("Sem permissão");
}

async function deleteUser(actor,id){
  const users = await getAllUsers();
  const idx = users.findIndex(x=>x.id===id);
  if(idx===-1) throw new Error("Usuário não encontrado");

  const tgt = users[idx];

  if(actor.id===tgt.id)
    throw new Error("Não pode excluir a si mesmo");

  if(isAdmin(actor)){}
  else if(isGestor(actor)){
    if(tgt.createdBy!==actor.id)
      throw new Error("Gestor só exclui quem ele criou");
  } else throw new Error("Sem permissão");

  users.splice(idx,1);
  saveJSON(USERS_KEY, users);
  return {success:true};
}

function sanitize(u){
  const {passwordHash, ...rest}=u;
  return rest;
}

// ---------------------- UI ELEMENTS ----------------------
const loginBtn = document.getElementById("loginBtn");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const feedbackMessage = document.getElementById("feedbackMessage");

const sidebar = document.getElementById("sidebar");
const btnBack = document.getElementById("btnBack");
const appRoot = document.getElementById("app");
const loginBox = document.getElementById("loginBox");

const btnManageUsers = document.getElementById("btnManageUsers");
const btnDeliveries = document.getElementById("btnDeliveries");
const btnCamera = document.getElementById("btnCamera");
const btnMap = document.getElementById("btnMap");
const btnRoute = document.getElementById("btnRoute");
const btnSair = document.getElementById("btnSair");

const userManagementView = document.getElementById("userManagementView");
const deliveriesList = document.getElementById("deliveriesList");
const cameraContainer = document.getElementById("cameraContainer");
const mapEl = document.getElementById("map");

const userTableBody = document.getElementById("userTableBody");
const newUsername = document.getElementById("newUsername");
const newPassword = document.getElementById("newPassword");
const newUserRole = document.getElementById("newUserRole");
const createUserBtn = document.getElementById("createUserBtn");

const exportDaily = document.getElementById("exportDaily");
const exportQuinzenal = document.getElementById("exportQuinzenal");
const exportMensal = document.getElementById("exportMensal");
const deliveriesCount = document.getElementById("deliveriesCount");

// ---------------------- SIDEBAR MOBILE ----------------------
function openScreenHideMenu(){
  sidebar.style.display = "none";
  btnBack.style.display = "inline-block";
}
function backToMenu(){
  sidebar.style.display = "";
  btnBack.style.display = "none";
  hideAllViews();
  showView("list");
}
btnBack.addEventListener("click", backToMenu);

// ---------------------- LOGIN ----------------------
loginBtn.addEventListener("click", async ()=>{
  feedbackMessage.textContent = "Verificando...";
  try{
    const sess = await login(loginUser.value.trim(),loginPass.value.trim());
    currentUserObj = await findUserById(sess.userId);

    loginBox.style.display="none";
    appRoot.style.display="block";
    sidebar.style.display="";

    await loadAndRender();
  }catch(e){
    feedbackMessage.textContent = e.message;
  }
});
btnSair.onclick = logout;

// ---------------------- NAVIGATION ----------------------
btnManageUsers.onclick = ()=>{ openScreenHideMenu(); showView("users"); };
btnDeliveries.onclick = ()=>{ openScreenHideMenu(); showView("list"); };
btnCamera.onclick = ()=>{ openScreenHideMenu(); showView("camera"); startScanner(); };
btnMap.onclick = ()=>{ openScreenHideMenu(); showView("map"); setTimeout(()=>map&&map.invalidateSize(),200); };
btnRoute.onclick = ()=>{ openScreenHideMenu(); generateRoute(); };

// ---------------------- VIEWS ----------------------
function hideAllViews(){
  userManagementView.style.display="none";
  deliveriesList.style.display="none";
  cameraContainer.style.display="none";
  mapEl.style.display="none";
}
function showView(v){
  hideAllViews();
  if(v==="users") userManagementView.style.display="block";
  if(v==="list") deliveriesList.style.display="block";
  if(v==="camera") cameraContainer.style.display="flex";
  if(v==="map") mapEl.style.display="block";
}

// ---------------------- HIERARQUIA FILTERS ----------------------
async function getTeamUsernames(gestor){
  const users = await getAllUsers();
  const colabs = users.filter(u=>u.createdBy===gestor.id).map(u=>u.username);
  return [gestor.username, ...colabs];
}

// ---------------------- USERS UI ----------------------
createUserBtn.onclick = async ()=>{
  try{
    await createUser(currentUserObj,{
      username:newUsername.value.trim(),
      password:newPassword.value.trim(),
      role:newUserRole.value
    });
    newUsername.value="";
    newPassword.value="";
    renderUserTable();
    alert("Usuário criado.");
  }catch(e){
    alert(e.message);
  }
};

async function renderUserTable(){
  const users = await getAllUsers();
  userTableBody.innerHTML = "";

  users.forEach(u=>{
    const tr = document.createElement("tr");

    const creator = u.createdBy ? (users.find(x=>x.id===u.createdBy)?.username || "-") : "-";

    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td>${creator}</td>
      <td>
        <button class="btn-edit-small">Editar</button>
        <button class="btn-del-small">Excluir</button>
        <button class="btn-pass-small">Senha</button>
      </td>
    `;

    const btnE = tr.querySelector(".btn-edit-small");
    const btnD = tr.querySelector(".btn-del-small");
    const btnP = tr.querySelector(".btn-pass-small");

    btnE.onclick = async ()=>{
      try{
        const newU = prompt("Novo username (deixe em branco p/ manter):", u.username);
        let newRole = u.role;

        if(isAdmin(currentUserObj)){
          const r = prompt("Nova função (admin/gestor/colaborador):", u.role);
          if(["admin","gestor","colaborador"].includes(r)) newRole = r;
        } else if(isGestor(currentUserObj)){
          if(u.createdBy===currentUserObj.id){
            const r = prompt("Nova função (colaborador):", u.role);
            if(r==="colaborador") newRole = r;
          }
        }

        await editUser(currentUserObj, u.id, {
          username: newU || undefined,
          role: newRole
        });
        renderUserTable();
        alert("Atualizado.");
      }catch(e){ alert(e.message); }
    };

    btnD.onclick = async ()=>{
      if(!confirm("Excluir usuário?")) return;
      try{
        await deleteUser(currentUserObj, u.id);
        renderUserTable();
        alert("Excluído.");
      }catch(e){ alert(e.message); }
    };

    btnP.onclick = async ()=>{
      const np = prompt("Nova senha:");
      if(!np) return;
      try{
        await changePassword(currentUserObj, u.id, np);
        alert("Senha alterada.");
      }catch(e){ alert(e.message); }
    };

    if(u.id===currentUserObj.id) btnD.disabled = true;

    if(isGestor(currentUserObj) && u.createdBy!==currentUserObj.id){
      btnE.disabled = true;
      btnD.disabled = true;
    }

    userTableBody.appendChild(tr);
  });
}

// ---------------------- DELIVERIES UI ----------------------
async function renderDeliveriesList(){
  const scans = loadScans();

  if(!currentUserObj){
    deliveriesList.innerHTML="<p style='padding:10px;color:#666'>Faça login.</p>";
    return;
  }

  let visible = [];

  if(isAdmin(currentUserObj)){
    visible = scans;
  }
  else if(isGestor(currentUserObj)){
    const team = await getTeamUsernames(currentUserObj);
    visible = scans.filter(s=>team.includes(s.gestor));
  }
  else{
    visible = scans.filter(s=>s.gestor===currentUserObj.username);
  }

  if(visible.length===0){
    deliveriesList.innerHTML="<p style='padding:10px;color:#666'>Nenhuma entrega.</p>";
    deliveriesCount.textContent="Entregas: 0";
    return;
  }

  deliveriesList.innerHTML="";
  visible.forEach(s=>{
    const div = document.createElement("div");
    div.className="delivery-item";
    div.innerHTML=`
      <strong>${s.code}</strong>
      <div>Gestor: ${s.gestor} • ${new Date(s.timestamp).toLocaleString()}</div>
      <div style="margin-top:6px">${s.address||""}</div>
    `;
    deliveriesList.appendChild(div);
  });

  deliveriesCount.textContent="Entregas: "+visible.length;
}

// ---------------------- MAP ----------------------
let map=null, markersLayer=null;
function initMap(){
  if(map) return;
  map = L.map("map").setView([-23.55,-46.63],12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function plotScansOnMap(){
  if(!map) initMap();
  markersLayer.clearLayers();

  const scans = loadScans();
  scans.forEach(s=>{
    if(s.lat && s.lng){
      L.marker([s.lat,s.lng]).addTo(markersLayer)
        .bindPopup(`<b>${s.code}</b><br>${s.address||""}`);
    }
  });
}

function generateRoute(){
  const scans = loadScans().filter(s=>s.lat && s.lng);
  if(scans.length<2){
    alert("É preciso ao menos 2 entregas geolocalizadas.");
    return;
  }

  showView("map");
  initMap();

  const coords = scans.map(s=>[s.lat,s.lng]);
  L.polyline(coords,{color:"blue"}).addTo(map);
  coords.forEach((c,i)=>L.marker(c).addTo(map).bindPopup(`#${i+1}`));

  map.fitBounds(coords);
}

// ---------------------- SCANNER REAL ----------------------
let html5Scanner=null;
let scanning=false;

async function startScanner(){
  if(scanning) return;
  if(!currentUserObj){ alert("Faça login"); return; }

  scanning=true;

  if(html5Scanner){
    try{
      await html5Scanner.stop();
      html5Scanner.clear();
    }catch{}
  }

  html5Scanner = new Html5Qrcode("qr-reader");

  let cameras=[];
  try{ cameras = await Html5Qrcode.getCameras(); }catch(e){}

  let camId = cameras[0]?.id || null;
  for(const c of cameras){
    if(/back|rear|environment/i.test(c.label))
      camId = c.id;
  }

  html5Scanner.start(
    camId,
    { fps:10, qrbox:280 },
    qr=>{
      const scans = loadScans();
      const last = scans[0];
      if(last && last.code===qr && Date.now()-new Date(last.timestamp)<1500)
        return;

      const s = {
        id:uuid(),
        code:qr,
        timestamp:nowISO(),
        lat:null,
        lng:null,
        address:"",
        gestor:currentUserObj.username
      };

      addScan(s);
      renderDeliveriesList();
      plotScansOnMap();
      beep();
    },
    ()=>{}
  ).catch(err=>{
    scanning=false;
    alert("Não foi possível abrir a câmera.\nUse HTTPS ou localhost.");
    console.error(err);
  });
}

async function stopScanner(){
  try{
    if(html5Scanner){
      await html5Scanner.stop();
      html5Scanner.clear();
      html5Scanner=null;
    }
  }catch{}
  scanning=false;
}

// ---------------------- CSV EXPORT ----------------------
function filterByPeriod(days){
  const all = loadScans();
  if(!currentUserObj) return [];

  let visible=[];
  if(isAdmin(currentUserObj)){
    visible = all;
  }
  else if(isGestor(currentUserObj)){
    let teamList=[];
    return getTeamUsernames(currentUserObj).then(team=>{
      teamList=team;
      let result = all.filter(s=>teamList.includes(s.gestor));
      if(!days) return result;
      const cutoff=Date.now()-(days*86400000);
      return result.filter(s=>new Date(s.timestamp).getTime()>=cutoff);
    });
  }
  else{
    visible = all.filter(s=>s.gestor===currentUserObj.username);
  }

  if(!days) return visible;
  const cutoff=Date.now()-(days*86400000);
  return visible.filter(s=>new Date(s.timestamp).getTime()>=cutoff);
}

function exportCSVFor(days){
  Promise.resolve(filterByPeriod(days)).then(list=>{
    if(list.length===0){
      alert("Nenhuma entrega no período.");
      return;
    }
    let csv="codigo,gestor,data,lat,lng,endereco\n";
    list.forEach(s=>{
      csv+=`"${s.code}","${s.gestor}","${s.timestamp}",${s.lat||""},${s.lng||""},"${(s.address||"").replace(/"/g,'""')}"\n`;
    });

    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`entregas_${days||"all"}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

exportDaily.onclick=()=>exportCSVFor(1);
exportQuinzenal.onclick=()=>exportCSVFor(15);
exportMensal.onclick=()=>exportCSVFor(30);

// ---------------------- BEEP ----------------------
function beep(){
  try{
    const ctx=new AudioContext();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value=900;
    gain.gain.value=0.04;
    osc.start();
    setTimeout(()=>{osc.stop();ctx.close();},120);
  }catch{}
}

// ---------------------- LOAD & INITIAL VIEW ----------------------
let currentUserObj=null;

async function loadAndRender(){
  await seedIfNeeded();
  currentUserObj = await currentUser();
  renderUserTable();
  await renderDeliveriesList();
  initMap();
  plotScansOnMap();
  deliveriesCount.textContent="";
  showView("list");
}

window.addEventListener("DOMContentLoaded", async ()=>{
  await seedIfNeeded();
  const sess = loadSession();

  if(sess){
    currentUserObj = await findUserById(sess.userId);
    if(currentUserObj){
      loginBox.style.display="none";
      appRoot.style.display="block";
      sidebar.style.display="";
      await loadAndRender();
    } else clearSession();
  }
});

// ---------------------- REGISTER FOR DEV ----------------------
window.MiniMock={
  seedIfNeeded,getAllUsers,findUserById,findUserByUsername,
  login,logout,currentUser,
  createUser,editUser,changePassword,deleteUser,
  loadScans,addScan
};
