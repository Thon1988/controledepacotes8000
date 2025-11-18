// app.js — PegazusLog v1.1 (BarcodeDetector primary, jsQR fallback)
// Works with Firestore if firebase-config.js is present and initialized (db = firebase.firestore())
// Otherwise falls back to localStorage for users and scans.

// ---------- CONFIG & STATE ----------
const VALID_USERS = {
  "thon": { password: "882010", role: "admin" },
  "user1": { password: "123", role: "colaborador" }
};

let ALL_USERS = Object.assign({}, VALID_USERS); // merged with remote if available
let currentUser = null;

let scans = []; // loaded from Firestore or localStorage
let filteredScans = [];
let currentFilters = { gestor: "all", dateStart: null, dateEnd: null };

let map = null, routeLayer = null;
let currentStream = null, scanning = false, rafId = null;
let overlayCtx = null;
let usingBarcodeDetector = false;
let barcodeDetector = null;

// DOM shortcuts (IDs must match your HTML)
const loginBtn = document.getElementById("loginBtn");
const loginUserInput = document.getElementById("loginUser");
const loginPassInput = document.getElementById("loginPass");
const feedbackMessage = document.getElementById("feedbackMessage");

const appDiv = document.getElementById("app");
const loginContainer = document.querySelector(".login-container");

const btnCamera = document.getElementById("btnCamera");
const btnDeliveries = document.getElementById("btnDeliveries");
const btnMap = document.getElementById("btnMap");
const btnRoute = document.getElementById("btnRoute");
const btnManageUsers = document.getElementById("btnManageUsers");
const btnSair = document.getElementById("btnSair");
const btnExport = document.getElementById("btnExport");
const exportMenu = document.getElementById("exportMenu");

const filterGestor = document.getElementById("filterGestor");
const filterDateStart = document.getElementById("filterDateStart");
const filterDateEnd = document.getElementById("filterDateEnd");
const applyFiltersBtn = document.getElementById("applyFilters");

const createUserBtn = document.getElementById("createUserBtn");
const newUsername = document.getElementById("newUsername");
const newPassword = document.getElementById("newPassword");
const newUserRole = document.getElementById("newUserRole");
const userFeedbackMessage = document.getElementById("userFeedbackMessage");
const userTableBody = document.getElementById("userTableBody");

const video = document.getElementById("videoElement");
const overlay = document.getElementById("overlay");
const cameraSelect = document.getElementById("cameraSelect");
const scanLine = document.getElementById("scanLine");
const manualEntryBtn = document.getElementById("manualEntryBtn");

const deliveriesList = document.getElementById("deliveriesList");
const mapDiv = document.getElementById("map");

// initialize overlayCtx when DOM ready
if (overlay) overlayCtx = overlay.getContext("2d");

// ---------- STORAGE LAYERS (Firestore optional, fallback localStorage) ----------
const hasFirestore = (typeof firebase !== 'undefined') && (typeof firebase.firestore === 'function');
let db = null;
if (hasFirestore) {
  try {
    db = firebase.firestore();
  } catch (e) {
    console.warn("Firestore present but init failed:", e);
    db = null;
  }
}

// Users persistence
async function loadUsers() {
  if (db) {
    try {
      const snapshot = await db.collection("users").get();
      const dynamic = {};
      snapshot.forEach(doc => dynamic[doc.id] = doc.data());
      ALL_USERS = Object.assign({}, VALID_USERS, dynamic);
      console.log("[loadUsers] Firestore users loaded:", Object.keys(ALL_USERS));
      return true;
    } catch (e) {
      console.error("[loadUsers] Firestore error:", e);
      ALL_USERS = Object.assign({}, VALID_USERS);
      return false;
    }
  } else {
    // localStorage fallback
    try {
      const raw = localStorage.getItem("pegazus_users");
      const parsed = raw ? JSON.parse(raw) : {};
      ALL_USERS = Object.assign({}, VALID_USERS, parsed);
      console.log("[loadUsers] local users loaded");
      return true;
    } catch (e) {
      console.error("[loadUsers] localStorage error:", e);
      ALL_USERS = Object.assign({}, VALID_USERS);
      return false;
    }
  }
}

async function saveUser(username, userData) {
  if (db) {
    try {
      await db.collection("users").doc(username).set(userData);
      await loadUsers();
      return true;
    } catch (e) {
      console.error("[saveUser] Firestore error:", e);
      return false;
    }
  } else {
    // localStorage fallback
    try {
      const raw = localStorage.getItem("pegazus_users");
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[username] = userData;
      localStorage.setItem("pegazus_users", JSON.stringify(parsed));
      await loadUsers();
      return true;
    } catch (e) {
      console.error("[saveUser] localStorage error:", e);
      return false;
    }
  }
}

async function deleteUserFromDB(username) {
  if (db) {
    try {
      await db.collection("users").doc(username).delete();
      await loadUsers();
      return true;
    } catch (e) {
      console.error("[deleteUserFromDB] Firestore error:", e);
      return false;
    }
  } else {
    try {
      const raw = localStorage.getItem("pegazus_users");
      const parsed = raw ? JSON.parse(raw) : {};
      delete parsed[username];
      localStorage.setItem("pegazus_users", JSON.stringify(parsed));
      await loadUsers();
      return true;
    } catch (e) {
      console.error("[deleteUserFromDB] localStorage error:", e);
      return false;
    }
  }
}

// Scans persistence
async function loadScans() {
  if (db) {
    try {
      const snapshot = await db.collection("scans").orderBy("timestamp", "desc").get();
      scans = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // keep timestamp ISO string
        if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          data.timestamp = data.timestamp.toDate().toISOString();
        }
        scans.push(data);
      });
      console.log("[loadScans] loaded", scans.length);
      return true;
    } catch (e) {
      console.error("[loadScans] Firestore error:", e);
      scans = [];
      return false;
    }
  } else {
    try {
      const raw = localStorage.getItem("pegazus_scans");
      scans = raw ? JSON.parse(raw) : [];
      return true;
    } catch (e) {
      console.error("[loadScans] localStorage error:", e);
      scans = [];
      return false;
    }
  }
}

async function saveScan(newScan) {
  if (db) {
    try {
      await db.collection("scans").doc(newScan.id).set(newScan);
      await loadScans();
      updateFilteredScans();
      return true;
    } catch (e) {
      console.error("[saveScan] Firestore error:", e);
      return false;
    }
  } else {
    try {
      scans.unshift(newScan);
      localStorage.setItem("pegazus_scans", JSON.stringify(scans));
      updateFilteredScans();
      return true;
    } catch (e) {
      console.error("[saveScan] localStorage error:", e);
      return false;
    }
  }
}

// ---------- AUTH (login/logout) ----------
loginBtn && (loginBtn.onclick = async () => {
  const username = loginUserInput.value.trim();
  const password = loginPassInput.value.trim();
  feedbackMessage.style.color = "black";
  feedbackMessage.textContent = "Verificando...";

  await loadUsers();

  if (ALL_USERS[username] && ALL_USERS[username].password === password) {
    currentUser = { username, role: ALL_USERS[username].role || 'colaborador' };
    localStorage.setItem("loggedUser", username);
    // hide login show app
    loginContainer.style.display = "none";
    appDiv.style.display = "block";

    await initApp();
  } else {
    feedbackMessage.style.color = "red";
    feedbackMessage.textContent = "Usuário ou senha incorretos";
  }
});

btnSair && (btnSair.onclick = () => {
  // stop camera if active
  stopCamera();
  localStorage.removeItem("loggedUser");
  location.reload();
});

async function tryRestoreSession() {
  const stored = localStorage.getItem("loggedUser");
  if (!stored) return false;
  await loadUsers();
  if (ALL_USERS[stored]) {
    currentUser = { username: stored, role: ALL_USERS[stored].role || 'colaborador' };
    loginContainer.style.display = "none";
    appDiv.style.display = "block";
    await initApp();
    return true;
  }
  return false;
}

// ---------- APP INIT ----------
async function initApp() {
  // populate role select
  if (newUserRole) {
    newUserRole.innerHTML = `<option value="colaborador">Colaborador</option>
                             <option value="gestor">Gestor</option>
                             <option value="admin">Administrador</option>`;
  }

  await loadScans();
  await loadUsers();

  // setup UI events
  initMenuEvents();
  applyUserLimitations();
  populateGestorFilter();
  updateFilteredScans();
  initMapIfNeeded();

  // decide scanner engine: BarcodeDetector preferred
  if ('BarcodeDetector' in window) {
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        usingBarcodeDetector = true;
        console.log("[Scanner] Using native BarcodeDetector");
      }
    } catch (e) {
      console.warn("[Scanner] BarcodeDetector init failed", e);
      usingBarcodeDetector = false;
    }
  }
  if (!usingBarcodeDetector) {
    console.log("[Scanner] Falling back to jsQR");
    usingBarcodeDetector = false;
  }
}

// ---------- MENU & UI ----------
function initMenuEvents() {
  btnCamera && (btnCamera.onclick = () => showView('cameraContainer'));
  btnDeliveries && (btnDeliveries.onclick = () => { showView('deliveriesList'); updateFilteredScans(); });
  btnMap && (btnMap.onclick = () => { showView('map'); map && map.invalidateSize(); });
  btnRoute && (btnRoute.onclick = () => generateRoute());
  btnManageUsers && (btnManageUsers.onclick = () => showView('userManagementView'));
  createUserBtn && (createUserBtn.onclick = createUser);
  applyFiltersBtn && (applyFiltersBtn.onclick = handleFilterChange);
  btnExport && (btnExport.onclick = () => exportMenu.style.display = exportMenu.style.display === 'flex' ? 'none' : 'flex');
  document.querySelectorAll('.exportOption').forEach(b => b.onclick = () => exportFilteredScansToCSV(b.dataset.period));
}

function applyUserLimitations() {
  if (!currentUser) return;
  if (currentUser.role === 'admin') {
    btnManageUsers.style.display = 'block';
  } else {
    btnManageUsers.style.display = 'none';
  }
  if (currentUser.role === 'colaborador') {
    // collaborator limited: hide export
    const exportCont = document.getElementById('exportContainer');
    if (exportCont) exportCont.style.display = 'none';
  } else {
    const exportCont = document.getElementById('exportContainer');
    if (exportCont) exportCont.style.display = 'block';
  }
}

function showView(viewId) {
  // hide all views inside .view-container
  const container = document.querySelector('.view-container');
  if (!container) return;
  container.querySelectorAll(':scope > div').forEach(div => div.style.display = 'none');
  const target = document.getElementById(viewId);
  if (target) target.style.display = 'block';

  if (viewId === 'cameraContainer') {
    initCamera(); // start camera when showing camera view
  } else {
    stopCamera();
  }

  if (viewId === 'map' && map) {
    setTimeout(() => map.invalidateSize(), 300);
  }
}

// ---------- USER MANAGEMENT UI ----------
function renderUserManagementView() {
  if (!userTableBody) return;
  userTableBody.innerHTML = '';
  Object.keys(ALL_USERS).forEach(username => {
    if (!VALID_USERS[username]) {
      const user = ALL_USERS[username];
      const row = userTableBody.insertRow();
      const tdName = row.insertCell();
      const tdRole = row.insertCell();
      const tdActions = row.insertCell();
      tdName.textContent = username;
      tdRole.textContent = user.role;
      tdActions.innerHTML = `<button class="edit-btn" onclick="editUserPrompt('${username}')">Editar</button>
                             <button class="delete-btn" onclick="confirmDeleteUser('${username}')" ${currentUser.role !== 'admin' || user.role === 'admin' ? 'disabled' : ''}>Excluir</button>`;
    }
  });
  if (userFeedbackMessage) userFeedbackMessage.textContent = '';
}
window.renderUserManagementView = renderUserManagementView; // allow buttons in table to call

async function createUser() {
  const username = newUsername.value.trim();
  const password = newPassword.value.trim();
  const role = newUserRole.value;
  if (!username || !password || !role) {
    userFeedbackMessage.style.color = "red";
    userFeedbackMessage.textContent = "Preencha todos os campos.";
    return;
  }
  await loadUsers();
  if (ALL_USERS[username]) {
    userFeedbackMessage.style.color = "red";
    userFeedbackMessage.textContent = `Usuário "${username}" já existe.`;
    return;
  }
  userFeedbackMessage.style.color = "black";
  userFeedbackMessage.textContent = "Salvando...";

  const ok = await saveUser(username, { password, role });
  if (ok) {
    userFeedbackMessage.style.color = "green";
    userFeedbackMessage.textContent = `Usuário "${username}" criado.`;
    newUsername.value = '';
    newPassword.value = '';
    await loadUsers();
    renderUserManagementView();
  } else {
    userFeedbackMessage.style.color = "red";
    userFeedbackMessage.textContent = "Erro ao salvar usuário.";
  }
}

function editUserPrompt(username) {
  const user = ALL_USERS[username];
  if (!user) return alert("Usuário não encontrado.");
  const newPassword = prompt(`Nova senha para ${username} (deixe vazio para manter):`);
  if (newPassword === null) return;
  let newRole = user.role;
  if (currentUser.role === 'admin') {
    const r = prompt(`Novo papel para ${username} (admin/gestor/colaborador):`, user.role);
    if (r && ['admin','gestor','colaborador'].includes(r)) newRole = r;
  }
  (async () => {
    if (newPassword.trim() !== '') user.password = newPassword.trim();
    user.role = newRole;
    const ok = await saveUser(username, { password: user.password, role: user.role });
    if (ok) {
      alert("Usuário atualizado.");
      await loadUsers();
      renderUserManagementView();
      if (username === currentUser.username) { // if self changed, force logout
        logoutAndReload();
      }
    } else {
      alert("Falha ao atualizar.");
    }
  })();
}

function confirmDeleteUser(username) {
  if (!confirm(`Excluir usuário ${username}?`)) return;
  (async () => {
    const ok = await deleteUserFromDB(username);
    if (ok) {
      alert("Usuário excluído.");
      await loadUsers();
      renderUserManagementView();
    } else {
      alert("Falha ao excluir.");
    }
  })();
}

function logoutAndReload() {
  localStorage.removeItem("loggedUser");
  location.reload();
}

// ---------- CAMERA & SCANNER (BarcodeDetector primary, jsQR fallback) ----------
function initCamera() {
  if (!cameraSelect || !manualEntryBtn || !scanLine) return startCamera(null);
  // prepare UI
  cameraSelect.style.display = 'none';
  manualEntryBtn.style.display = 'none';
  scanLine.style.display = 'none';
  // enumerate cameras
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    startCamera(null);
    return;
  }
  navigator.mediaDevices.enumerateDevices()
    .then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      if (videoDevices.length > 0) {
        populateCameraSelect(videoDevices);
        cameraSelect.style.display = 'block';
      } else {
        startCamera(null);
      }
    })
    .catch(err => {
      console.warn("enumerateDevices failed:", err);
      startCamera(null);
    });
}

function populateCameraSelect(devices) {
  cameraSelect.innerHTML = '';
  devices.forEach((d, idx) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Câmera ${idx+1}`;
    cameraSelect.appendChild(opt);
  });
  cameraSelect.onchange = () => {
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
    }
    startCamera(cameraSelect.value);
  };
  // prefer first device / environment
  startCamera(devices[0].deviceId);
}

function startCamera(deviceId) {
  if (scanning) return;
  const constraints = {
    audio: false,
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      facingMode: 'environment'
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      currentStream = stream;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          // adjust overlay size
          overlay.width = video.videoWidth || video.clientWidth || 640;
          overlay.height = video.videoHeight || video.clientHeight || 480;
          scanning = true;
          if (scanLine) scanLine.style.display = 'block';
          if (manualEntryBtn) manualEntryBtn.style.display = 'block';
          startScanLoop();
        };
      }
    })
    .catch(async (err) => {
      console.error("getUserMedia error:", err);
      alert("Não foi possível acessar a câmera. Verifique permissões / HTTPS.");
    });
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  scanning = false;
  if (scanLine) scanLine.style.display = 'none';
  if (manualEntryBtn) manualEntryBtn.style.display = 'none';
}

async function startScanLoop() {
  // If BarcodeDetector available, use it; otherwise, use jsQR on canvas frames
  if (usingBarcodeDetector && barcodeDetector) {
    // BarcodeDetector-based loop
    (async function loop() {
      if (!scanning) return;
      try {
        // detect from video element directly
        const barcodes = await barcodeDetector.detect(video);
        if (barcodes && barcodes.length > 0) {
          const barcode = barcodes[0];
          // barcode.rawValue has the decoded text
          handleFoundCode(barcode.rawValue);
          return;
        }
      } catch (e) {
        // if detect fails (some browsers require ImageBitmap fallback), we fallback to canvas method
        console.warn("BarcodeDetector.detect failed, fallback to canvas", e);
        usingBarcodeDetector = false;
      }
      rafId = requestAnimationFrame(loop);
    })();
  } else {
    // Canvas + jsQR loop
    (function loop() {
      if (!scanning) return;
      try {
        // draw video frame to overlay
        overlay.width = video.videoWidth || video.clientWidth || 640;
        overlay.height = video.videoHeight || video.clientHeight || 480;
        overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
        const imageData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (code) {
          // draw bounding box
          drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#28ff7a");
          drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#28ff7a");
          drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#28ff7a");
          drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#28ff7a");
          handleFoundCode(code.data);
          return;
        }
      } catch (e) {
        console.error("scan loop error:", e);
      }
      rafId = requestAnimationFrame(loop);
    })();
  }
}

function drawLine(begin, end, color) {
  if (!overlayCtx) return;
  overlayCtx.beginPath();
  overlayCtx.moveTo(begin.x, begin.y);
  overlayCtx.lineTo(end.x, end.y);
  overlayCtx.lineWidth = 4;
  overlayCtx.strokeStyle = color;
  overlayCtx.stroke();
}

// Called when any engine finds a QR text
let lastFoundTimestamp = 0;
async function handleFoundCode(rawText) {
  const now = Date.now();
  // debounce: prevent spamming (1.5s)
  if (now - lastFoundTimestamp < 1500) return;
  lastFoundTimestamp = now;

  stopCamera();

  // beep and feedback
  beep();

  // parse rawText: user specified format in earlier messages:
  // Example:
  // NOME: Maria Barbosa
  // ENDEREÇO: Rua Azul, 234 - Centro
  // CEP: 03702-010
  // TELEFONE: 11988887777
  const parsed = parseQRCodeText(rawText);

  // if code already exists in scans (duplicate id check)
  const duplicate = scans.find(s => s.code === parsed.code || s.code === parsed.nome || s.code === rawText);
  if (duplicate) {
    alert("Este QR Code já foi escaneado anteriormente. Registro duplicado não permitido.");
    showView('deliveriesList');
    return;
  }

  // ask type
  const type = prompt("Tipo (Entrega/Coleta):", "Entrega");
  // get location
  if (!navigator.geolocation) {
    alert("Geolocalização não disponível.");
    showView('deliveriesList');
    return;
  }
  navigator.geolocation.getCurrentPosition(async pos => {
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    // address: use parsed address if present else geocode placeholder
    const address = parsed.endereco || (`Lat:${coords.lat.toFixed(6)},Lng:${coords.lng.toFixed(6)}`);
    // register
    await registerScan(parsed.code || parsed.nome || rawText, coords, type || "Entrega", address, parsed);
    showView('deliveriesList');
  }, err => {
    console.error("geolocation error:", err);
    alert("Não foi possível obter a localização.");
    showView('deliveriesList');
  }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
}

// parse a QR payload to object (robust to multiple separators)
function parseQRCodeText(text) {
  const out = { raw: text, nome: '', endereco: '', cep: '', telefone: '', code: '' };
  // try JSON first
  try {
    const j = JSON.parse(text);
    out.nome = j.nome || j.name || '';
    out.endereco = j.endereco || j.address || '';
    out.cep = j.cep || j.CEP || '';
    out.telefone = j.telefone || j.telefone || j.phone || '';
    out.code = j.id || j.code || out.nome;
    return out;
  } catch (e) { /* not JSON */ }

  // otherwise parse lines "KEY: VALUE"
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^([^:]+)\s*:\s*(.+)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const val = m[2].trim();
      if (key.includes('nome') || key.includes('name')) out.nome = val;
      else if (key.includes('end') || key.includes('endereço') || key.includes('address')) out.endereco = val;
      else if (key.includes('cep')) out.cep = val;
      else if (key.includes('tel') || key.includes('fone') || key.includes('phone')) out.telefone = val;
      else if (key.includes('id') || key.includes('codigo') || key.includes('code')) out.code = val;
    }
  }
  // fallback: try comma-separated parts
  if (!out.nome && text.includes(',')) {
    const parts = text.split(',');
    out.nome = parts[0].trim();
    out.endereco = parts.slice(1).join(',').trim();
  }
  // final fallback
  if (!out.code) out.code = out.nome || out.endereco || text;
  return out;
}

// manual entry
manualEntryBtn && (manualEntryBtn.onclick = () => {
  stopCamera();
  const code = prompt("Código:");
  const type = prompt("Tipo (Entrega/Coleta):", "Entrega");
  if (!code) {
    showView('deliveriesList');
    return;
  }
  if (!navigator.geolocation) {
    alert("Geolocalização não disponível.");
    return;
  }
  navigator.geolocation.getCurrentPosition(async pos => {
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const address = `Manual Lat:${coords.lat.toFixed(6)},Lng:${coords.lng.toFixed(6)}`;
    await registerScan(code, coords, type, address, {});
    showView('deliveriesList');
  }, err => {
    alert("Erro de localização.");
  });
});

// beep
function beep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => { o.stop(); }, 120);
  } catch (e) {
    console.warn("beep failed", e);
  }
}

// ---------- REGISTER SCAN ----------
async function registerScan(code, coords, type, address, parsedMeta = {}) {
  if (!currentUser) return alert("Usuário não logado.");

  // prevent duplicates within short time and existing ones in DB
  if (scans.some(s => s.code === code && (new Date() - new Date(s.timestamp) < 5000))) {
    alert("Scan recente ignorado (duplicado).");
    return;
  }

  const newScan = {
    id: generateId(),
    code: code,
    nome: parsedMeta.nome || '',
    endereco: parsedMeta.endereco || address || '',
    cep: parsedMeta.cep || '',
    telefone: parsedMeta.telefone || '',
    lat: coords.lat,
    lng: coords.lng,
    timestamp: new Date().toISOString(),
    type: type || 'Entrega',
    gestor: currentUser.username
  };

  const ok = await saveScan(newScan);
  if (ok) {
    alert("Entrega registrada.");
    beep();
  } else {
    alert("Erro ao salvar entrega.");
  }
}

// ---------- FILTERS & LIST ----------
function handleFilterChange() {
  currentFilters.gestor = filterGestor.value;
  currentFilters.dateStart = filterDateStart.value;
  currentFilters.dateEnd = filterDateEnd.value;
  updateFilteredScans();
}

function updateFilteredScans() {
  let temp = scans.slice(); // copy
  if (!temp) temp = [];

  if (currentFilters.gestor && currentFilters.gestor !== 'all') {
    temp = temp.filter(s => s.gestor === currentFilters.gestor);
  } else if (currentUser && currentUser.role === 'colaborador') {
    temp = temp.filter(s => s.gestor === currentUser.username);
  }

  if (currentFilters.dateStart) {
    const start = new Date(currentFilters.dateStart);
    temp = temp.filter(s => new Date(s.timestamp) >= start);
  }
  if (currentFilters.dateEnd) {
    const end = new Date(currentFilters.dateEnd);
    end.setDate(end.getDate() + 1);
    temp = temp.filter(s => new Date(s.timestamp) < end);
  }

  filteredScans = temp;
  renderDeliveriesList();
  btnDeliveries && (btnDeliveries.textContent = `📦 Entregas (${filteredScans.length})`);
}

function renderDeliveriesList() {
  if (!deliveriesList) return;
  deliveriesList.innerHTML = '';
  if (!filteredScans || filteredScans.length === 0) {
    deliveriesList.innerHTML = '<p style="text-align:center; margin-top:50px; color:var(--secondary-color)">Nenhuma entrega encontrada com os filtros atuais.</p>';
    return;
  }
  filteredScans.forEach(scan => {
    const d = document.createElement('div');
    d.className = 'delivery-item';
    const date = new Date(scan.timestamp).toLocaleString();
    d.innerHTML = `<strong>${escapeHtml(scan.code)} <span class="id-label">(${escapeHtml(scan.type || '')})</span></strong>
                   <p class="address">${escapeHtml(scan.endereco || '')}</p>
                   <div class="metadata">Registrado por: ${escapeHtml(scan.gestor)} | ${escapeHtml(date)}</div>`;
    deliveriesList.appendChild(d);
  });
}

// ---------- MAP & ROUTE ----------
function initMapIfNeeded() {
  if (!mapDiv) return;
  if (!map) {
    map = L.map('map').setView([-23.55052, -46.633309], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
  }
}

function generateRoute() {
  if (!filteredScans || filteredScans.length === 0) {
    alert("Sem entregas filtradas.");
    return;
  }
  showView('map');
  routeLayer.clearLayers();
  const latlngs = filteredScans.map(s => [s.lat, s.lng]);
  filteredScans.forEach((s, idx) => {
    L.marker([s.lat, s.lng]).addTo(routeLayer).bindPopup(`<b>${idx+1} - ${escapeHtml(s.code)}</b><br>${escapeHtml(s.endereco || '')}`);
  });
  if (latlngs.length > 1) L.polyline(latlngs, { color: 'blue' }).addTo(routeLayer);
  map.fitBounds(L.latLngBounds(latlngs));
  map.invalidateSize();
}

// ---------- EXPORT CSV ----------
function exportFilteredScansToCSV(period) {
  if (!filteredScans || filteredScans.length === 0) {
    alert("Nada a exportar.");
    return;
  }
  const headers = ["ID","Código","Nome","Endereço","CEP","Telefone","Latitude","Longitude","Gestor","DataHora","Tipo"];
  let csv = headers.join(",") + "\n";
  filteredScans.forEach(s => {
    const row = [
      s.id || '',
      s.code || '',
      s.nome || '',
      (s.endereco || '').replace(/,/g,';'),
      s.cep || '',
      s.telefone || '',
      s.lat || '',
      s.lng || '',
      s.gestor || '',
      new Date(s.timestamp).toISOString(),
      s.type || ''
    ].map(f => `"${String(f).replace(/"/g,'""')}"`).join(",");
    csv += row + "\n";
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const start = currentFilters.dateStart || 'inicio';
  const end = currentFilters.dateEnd || 'fim';
  a.download = `PegazusLog_${period}_${start}_a_${end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  alert("Exportado " + filteredScans.length + " registros.");
}

// ---------- UTILITIES ----------
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

// ---------- BOOTSTRAP ----------
(async function bootstrap() {
  // try restore session
  await loadUsers();
  await loadScans();
  const restored = await tryRestoreSession();
  if (!restored) {
    // ensure login visible
    if (loginContainer) loginContainer.style.display = '';
    if (appDiv) appDiv.style.display = 'none';
  } else {
    // session restored; initApp already called
  }
  // safety: wire exports menu buttons if present
  document.querySelectorAll('.exportOption').forEach(b => b.onclick = () => exportFilteredScansToCSV(b.dataset.period));
})();

// Expose some functions to global for HTML inline buttons
window.renderUserManagementView = renderUserManagementView;
window.confirmDeleteUser = confirmDeleteUser;
window.editUserPrompt = editUserPrompt;
window.stopCamera = stopCamera;
window.startCamera = () => initCamera(); // allow calling startCamera externally
