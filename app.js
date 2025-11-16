// app.js — PegazusLog: scanner + sidebar de entregas, rotas, pesquisa e CSV
// Assumptions: HTML from conversation (loginUser, loginPass, loginBtn, body.logged-in behavior, startButton, stopButton, exportBtn, clearBtn, videoElement, overlay, scansList, output, scanPopup)

/* =========================
   Config & State
   ========================= */
const VALID_USERS = { thon: "882010", manager1: "123", admin: "admin" };
const STORAGE_KEY = "pegazus_scans_full";
const SESSION_USER_KEY = "pegazus_user";

let video = document.getElementById("videoElement");
let overlay = document.getElementById("overlay");
let overlayCtx = overlay.getContext("2d");

let startButton = document.getElementById("startButton");
let stopButton = document.getElementById("stopButton");
let exportBtn = document.getElementById("exportBtn");
let clearBtn = document.getElementById("clearBtn");
let output = document.getElementById("output");
let scansListEl = document.getElementById("scansList");
let scanPopup = document.getElementById("scanPopup");

let scanning = false;
let mediaStream = null;
let rafId = null;
let lastScanTime = 0;
const SCAN_INTERVAL = 700;
const DUPLICATE_WINDOW = 60 * 1000;

let scans = loadScans(); // array of entries
let currentUser = loadSessionUser(); // { username }

/* =========================
   Helpers
   ========================= */
function loadScans() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    return [];
  }
}
function saveScans() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
  } catch (e) {}
}
function saveSessionUser(userObj) {
  try {
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(userObj));
  } catch (e) {}
}
function loadSessionUser() {
  try {
    const s = sessionStorage.getItem(SESSION_USER_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}
function clearSessionUser() {
  try { sessionStorage.removeItem(SESSION_USER_KEY); } catch (e) {}
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
}

function beep(duration = 90, freq = 1400, vol = 0.08) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { try { o.stop(); ctx.close(); } catch (e) {} }, duration);
  } catch (e) {}
}

function showPopup(msg, ms = 900) {
  if (!scanPopup) return;
  scanPopup.textContent = msg;
  scanPopup.style.display = "block";
  setTimeout(() => (scanPopup.style.display = "none"), ms);
}

/* =========================
   Login
   ========================= */
const loginBtn = document.getElementById("loginBtn");
const loginUserInput = document.getElementById("loginUser");
const loginPassInput = document.getElementById("loginPass");
const feedbackMessage = document.getElementById("feedbackMessage");

loginBtn.addEventListener("click", () => {
  const u = (loginUserInput.value || "").trim();
  const p = (loginPassInput.value || "").trim();

  if (VALID_USERS[u] && VALID_USERS[u] === p) {
    // set session and UI
    currentUser = { username: u };
    saveSessionUser(currentUser);
    feedbackMessage.textContent = "✔ Login efetuado";
    feedbackMessage.style.color = "green";
    document.body.classList.add("logged-in");
    initAfterLogin();
  } else {
    feedbackMessage.textContent = "❌ Usuário ou senha inválidos";
    feedbackMessage.style.color = "red";
  }
});

function logout() {
  clearSessionUser();
  currentUser = null;
  document.body.classList.remove("logged-in");
  // pause camera if needed
  stopCamera();
  // optional: keep credentials in inputs (you asked earlier)
  feedbackMessage.textContent = "Você saiu.";
  feedbackMessage.style.color = "var(--muted)";
}

/* =========================
   Sidebar (dynamic)
   ========================= */
function createSidebar() {
  if (document.getElementById("peg-sidebar")) return;
  const sidebar = document.createElement("div");
  sidebar.id = "peg-sidebar";
  sidebar.style.position = "fixed";
  sidebar.style.left = "0";
  sidebar.style.top = "0";
  sidebar.style.bottom = "0";
  sidebar.style.width = "300px";
  sidebar.style.background = "var(--card)";
  sidebar.style.boxShadow = "2px 0 10px rgba(0,0,0,0.08)";
  sidebar.style.padding = "14px";
  sidebar.style.display = "flex";
  sidebar.style.flexDirection = "column";
  sidebar.style.gap = "8px";
  sidebar.style.transform = "translateX(-320px)";
  sidebar.style.transition = "transform .28s ease";
  sidebar.style.zIndex = "9999";

  const title = document.createElement("div");
  title.innerHTML = "<strong>Menu</strong>";
  title.style.marginBottom = "6px";

  const btnMapa = genBtn("📍 Mapa de Entregas", () => openMapAll());
  btnMapa.id = "btnMapa";
  const btnGerarRota = genBtn("🧭 Gerar Rota", () => generateRoute());
  btnGerarRota.id = "btnGerarRota";
  const btnEntregas = genBtn("📦 Entregas", () => openDeliveriesPanel());
  btnEntregas.id = "btnListaEntregas";
  const btnPesquisar = genBtn("🔎 Pesquisar QRCode", () => searchQRCode());
  btnPesquisar.id = "btnPesquisar";
  const btnExport = genBtn("📄 Gerar Relatório (CSV)", () => exportCSVAll());
  btnExport.id = "btnExportCSV";
  const btnSair = genBtn("🚪 Sair", () => { if (confirm("Deseja sair?")) logout(); });
  btnSair.id = "btnSair";

  sidebar.appendChild(title);
  sidebar.appendChild(btnMapa);
  sidebar.appendChild(btnGerarRota);
  sidebar.appendChild(btnEntregas);
  sidebar.appendChild(btnPesquisar);
  sidebar.appendChild(btnExport);
  sidebar.appendChild(btnSair);

  document.body.appendChild(sidebar);

  // Toggle button
  const toggle = document.createElement("button");
  toggle.id = "peg-sidebar-toggle";
  toggle.innerText = "☰";
  toggle.style.position = "fixed";
  toggle.style.left = "10px";
  toggle.style.top = "10px";
  toggle.style.zIndex = "10000";
  toggle.style.padding = "8px 10px";
  toggle.style.borderRadius = "8px";
  toggle.style.border = "none";
  toggle.style.background = "var(--card)";
  toggle.style.boxShadow = "0 6px 18px rgba(0,0,0,0.08)";
  toggle.addEventListener("click", () => {
    const s = document.getElementById("peg-sidebar");
    if (!s) return;
    if (s.style.transform === "translateX(0px)") {
      s.style.transform = "translateX(-320px)";
    } else {
      s.style.transform = "translateX(0px)";
    }
  });
  document.body.appendChild(toggle);

  // small helper panel container for deliveries
  const deliveriesPanel = document.createElement("div");
  deliveriesPanel.id = "peg-deliveries-panel";
  deliveriesPanel.style.position = "fixed";
  deliveriesPanel.style.right = "10px";
  deliveriesPanel.style.top = "60px";
  deliveriesPanel.style.width = "360px";
  deliveriesPanel.style.maxHeight = "70vh";
  deliveriesPanel.style.overflow = "auto";
  deliveriesPanel.style.background = "var(--card)";
  deliveriesPanel.style.boxShadow = "var(--shadow)";
  deliveriesPanel.style.borderRadius = "10px";
  deliveriesPanel.style.padding = "10px";
  deliveriesPanel.style.display = "none";
  deliveriesPanel.style.zIndex = "9999";
  document.body.appendChild(deliveriesPanel);
}

function genBtn(label, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.padding = "10px";
  b.style.borderRadius = "8px";
  b.style.border = "1px solid var(--border)";
  b.style.background = "transparent";
  b.style.cursor = "pointer";
  b.style.textAlign = "left";
  b.addEventListener("click", onClick);
  return b;
}

/* =========================
   Scans handling (on QR)
   ========================= */
function simulateCompradorInfo(mainId) {
  // Simple deterministic pseudo-random mapping to produce consistent test data
  const seed = (mainId || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const names = ["João Silva", "Maria Santos", "Pedro Almeida", "Ana Oliveira", "Carlos Souza", "Fernando Costa", "Juliana Lima", "Ricardo Teles"];
  const addresses = [
    "Rua das Flores, 100, Centro",
    "Av. Paulista, 1578 - Apto 5",
    "Praça da Sé, s/n",
    "Travessa do Comércio, 50",
    "Rua das Acácias, 200",
    "Alameda dos Bobos, 10",
    "Rua Nova, 33",
    "Av. das Nações, 88"
  ];
  const ceps = ["01001-000", "04538-132", "05407-002", "09726-210", "13087-460", "02916-000", "01413-001", "04533-000"];
  const phones = ["11987654321", "11999998888", "1133334444", "11912345678", "1122223333", "11988887777", "11977776666", "11955554444"];

  const idx = seed % names.length;
  const tipo = (seed % 2 === 0) ? "Residencial" : "Comercial";

  return {
    nome: names[idx],
    endereco: addresses[idx],
    cep: ceps[idx],
    telefone: phones[idx],
    tipo
  };
}

function registerScan(fullPayload) {
  // Guard: avoid duplicates within DUPLICATE_WINDOW
  const now = Date.now();
  if (scans.some(s => s.link === fullPayload && (now - s.timestamp) < DUPLICATE_WINDOW)) {
    showPopup("Já escaneado recentemente");
    return;
  }

  const extracted = extractQrIdOrIdFromLink(fullPayload);
  const mainId = extracted.value || fullPayload;
  const comprador = simulateCompradorInfo(mainId);
  const username = currentUser ? currentUser.username : "anonymous";

  const entry = {
    plataforma: detectPlatform(fullPayload),
    link: fullPayload,
    dataHora: new Date().toLocaleString("pt-BR"),
    timestamp: now,
    extractedId: extracted,
    comprador,
    scannedBy: username
  };

  scans.unshift(entry);
  saveScans();
  renderScans();
  showPopup("OK • " + (extracted.value || mainId));
  beep();
  try { navigator.clipboard.writeText(extracted.value || mainId); } catch (e) {}
}

function detectPlatform(link) {
  const l = (link || "").toLowerCase();
  if (l.includes("shopee")) return "Shopee";
  if (l.includes("mercadolivre") || l.includes("mercadolibre")) return "Mercado Livre";
  return "Outra";
}

function extractQrIdOrIdFromLink(payload) {
  if (!payload) return { type: null, value: null };
  const p = payload.trim();

  // try param-based
  try {
    const url = new URL(p);
    const keys = ["id","qrid","qr_id","tracking","orderId","order_id"];
    for (const k of keys) {
      if (url.searchParams.has(k)) return { type: "param:" + k, value: url.searchParams.get(k) };
    }
  } catch (e) {}

  // kv patterns
  const kv = p.match(/(?:qr[_-]?id|id|order[_-]?id|pedido|tracking|codigo)[:=]\s*([A-Za-z0-9\-_]+)/i);
  if (kv) return { type: "kv", value: kv[1] };

  // numeric fallback
  const num = p.match(/(\d{6,})/);
  if (num) return { type: "numeric", value: num[1] };

  // otherwise short token
  if (p.length <= 64 && /[A-Za-z0-9\-_]{4,}/.test(p)) return { type: "token", value: p.split(/[,\s|;]/)[0] };

  return { type: "full", value: p.substring(0, 200) };
}

/* =========================
   Rendering UI
   ========================= */
function renderScans() {
  // main list (compact)
  scansListEl.innerHTML = "";
  if (!scans || scans.length === 0) {
    scansListEl.innerHTML = "<div style='color:var(--muted)'>Nenhuma leitura</div>";
    return;
  }

  scans.forEach((s, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.alignItems = "center";

    const left = document.createElement("div");
    left.style.flex = "1";
    left.innerHTML = `<div style="font-weight:600">${escapeHtml(s.extractedId.value || s.link)}</div>
                      <div style="font-size:12px;color:var(--muted)">${escapeHtml(s.comprador.nome)} • ${escapeHtml(s.comprador.endereco)} • CEP ${escapeHtml(s.comprador.cep)}</div>
                      <div style="font-size:11px;color:var(--muted)">Por: ${escapeHtml(s.scannedBy)} • ${escapeHtml(s.dataHora)}</div>`;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.flexDirection = "column";
    actions.style.gap = "6px";
    actions.style.marginLeft = "12px";

    const btnMap = document.createElement("button");
    btnMap.textContent = "📍";
    btnMap.title = "Abrir no Mapa";
    btnMap.style.padding = "6px";
    btnMap.onclick = () => openInMaps(`${s.comprador.endereco} CEP ${s.comprador.cep}`);

    const btnDetails = document.createElement("button");
    btnDetails.textContent = "ℹ️";
    btnDetails.title = "Detalhes";
    btnDetails.style.padding = "6px";
    btnDetails.onclick = () => showDeliveryDetails(s);

    actions.appendChild(btnMap);
    actions.appendChild(btnDetails);

    div.appendChild(left);
    div.appendChild(actions);

    scansListEl.appendChild(div);
  });
}

/* =========================
   Deliveries panel & details
   ========================= */
function openDeliveriesPanel() {
  const panel = document.getElementById("peg-deliveries-panel");
  if (!panel) return;
  // toggle
  panel.style.display = (panel.style.display === "block") ? "none" : "block";
  if (panel.style.display === "block") {
    panel.innerHTML = "<h3 style='margin-top:0'>Entregas</h3>";
    if (!scans.length) {
      panel.innerHTML += "<div style='color:var(--muted)'>Nenhuma entrega registrada.</div>";
      return;
    }
    scans.forEach(s => {
      const el = document.createElement("div");
      el.style.padding = "8px";
      el.style.borderBottom = "1px dashed var(--border)";
      el.innerHTML = `<strong>${escapeHtml(s.comprador.nome)}</strong> • ${escapeHtml(s.comprador.tipo)} <br>
                      ${escapeHtml(s.comprador.endereco)} • CEP ${escapeHtml(s.comprador.cep)} <br>
                      📞 ${escapeHtml(s.comprador.telefone)} • <em>Gestor:</em> ${escapeHtml(s.scannedBy)} <br>
                      <small style="color:var(--muted)">${escapeHtml(s.extractedId.value || s.link)}</small>`;
      panel.appendChild(el);
    });
  }
}

function showDeliveryDetails(entry) {
  // simple modal via prompt-like overlay (quick implementation)
  const info = `
Nome: ${entry.comprador.nome}
Tipo: ${entry.comprador.tipo}
Endereço: ${entry.comprador.endereco}
CEP: ${entry.comprador.cep}
Telefone: ${entry.comprador.telefone}
Gestor: ${entry.scannedBy}
ID: ${entry.extractedId.value || entry.link}
Data: ${entry.dataHora}
`;
  alert(info);
}

/* =========================
   Map & Routing
   ========================= */
function openInMaps(address) {
  if (!address) return alert("Endereço inválido");
  const encoded = encodeURIComponent(address);
  // Try Waze scheme first (mobile). Then fall back to Google Maps.
  // Opening waze:// may fail silently on desktop; we fallback after short delay.
  const wazeUrl = `waze://?q=${encoded}`;
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  // Try Waze by creating a temporary iframe (attempt). Use setTimeout fallback to Google Maps.
  let opened = false;
  try {
    // Attempt to open Waze
    window.location = wazeUrl;
    opened = true;
    // If Waze not installed, after 800ms open Google Maps
    setTimeout(() => { window.open(googleUrl, "_blank"); }, 800);
  } catch (e) {
    window.open(googleUrl, "_blank");
  }
}

function openMapAll() {
  if (!scans.length) return alert("Nenhuma entrega registrada.");
  // Build a search query combining addresses separated by " | " — Google may show multiple pins
  const queries = scans.map(s => `${s.comprador.endereco} CEP ${s.comprador.cep}`);
  const q = encodeURIComponent(queries.join(" | "));
  const gUrl = `https://www.google.com/maps/search/?api=1&query=${q}`;
  window.open(gUrl, "_blank");
}

function generateRoute() {
  if (!scans.length) return alert("Nenhuma entrega registrada.");
  // Google Maps directions: origin omitted (will use user's location on mobile), destination = last, waypoints = others
  const addresses = scans.map(s => `${s.comprador.endereco} ${s.comprador.cep}`);
  const destination = encodeURIComponent(addresses[addresses.length - 1]);
  const waypoints = addresses.slice(0, -1).map(a => encodeURIComponent(a)).join("|");
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}` + (waypoints ? `&waypoints=${waypoints}` : "");
  window.open(url, "_blank");
}

/* =========================
   Search QR
   ========================= */
function searchQRCode() {
  const q = prompt("Pesquisar QRCode (parte do ID):");
  if (!q) return;
  const results = scans.filter(s => (s.extractedId.value || s.link).toLowerCase().includes(q.toLowerCase()));
  if (!results.length) return alert("Nenhum resultado encontrado.");
  // Show first result details
  const first = results[0];
  showDeliveryDetails(first);
}

/* =========================
   CSV Export (all fields)
   ========================= */
function convertToCSV(entries) {
  const headers = ["Plataforma","Link_Completo","QR_ID_Tipo","QR_ID_Valor","ID_Tipo","ID_Valor","Comprador_Nome","Comprador_Endereco","Comprador_CEP","Comprador_Telefone","Tipo_Local","Data_Hora_Scan","Scanned_By"];
  const rows = [headers.join(";")];
  entries.forEach(it => {
    const qrType = it.extractedId.type || "";
    const qrVal = it.extractedId.value || "";
    const idType = it.extractedId.type || "";
    const idVal = it.extractedId.value || "";
    const safe = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    rows.push([
      safe(it.plataforma), safe(it.link), safe(qrType), safe(qrVal), safe(idType), safe(idVal),
      safe(it.comprador.nome), safe(it.comprador.endereco), safe(it.comprador.cep), safe(it.comprador.telefone),
      safe(it.comprador.tipo), safe(it.dataHora), safe(it.scannedBy)
    ].join(";"));
  });
  return rows.join("\r\n");
}

function exportCSVAll() {
  if (!scans.length) return alert("Nenhum dado para exportar.");
  const csv = convertToCSV(scans);
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio_scans_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================
   Camera + Scanner (jsQR)
   ========================= */
function fitCanvas() {
  const vw = video.videoWidth || video.clientWidth || 640;
  const vh = video.videoHeight || video.clientHeight || 480;
  overlay.width = vw;
  overlay.height = vh;
}

async function startCamera() {
  if (!currentUser) return alert("Faça login antes de iniciar a câmera.");
  if (mediaStream) stopCamera();
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = mediaStream;
    await video.play().catch(()=>{});
    fitCanvas();
    scanning = true;
    lastScanTime = 0;
    requestAnimationFrame(scanFrame);
  } catch (e) {
    console.error("Erro getUserMedia:", e);
    alert("Erro ao acessar a câmera: " + (e && e.message ? e.message : e));
  }
}
function stopCamera() {
  scanning = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  overlayCtx.clearRect(0,0,overlay.width,overlay.height);
}

function scanFrame() {
  if (!scanning) return;
  try {
    if (video.readyState >= 2) {
      fitCanvas();
      overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
      const imageData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
      if (code && code.data) {
        const now = Date.now();
        if (now - lastScanTime > SCAN_INTERVAL) {
          lastScanTime = now;
          registerScan(code.data.trim());
        }
        // draw box
        drawBox(code.location);
      } else {
        // optionally draw guide rectangle
        drawGuide();
      }
    }
  } catch (e) {
    console.error("scan error", e);
  }
  rafId = requestAnimationFrame(scanFrame);
}

function drawBox(location) {
  overlayCtx.clearRect(0,0,overlay.width,overlay.height);
  if (!location) return;
  overlayCtx.strokeStyle = "rgba(0,200,83,0.95)";
  overlayCtx.lineWidth = Math.max(2, overlay.width / 200);
  overlayCtx.beginPath();
  overlayCtx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
  overlayCtx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
  overlayCtx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
  overlayCtx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
  overlayCtx.closePath();
  overlayCtx.stroke();
  overlayCtx.fillStyle = "rgba(0,200,83,0.12)";
  overlayCtx.fill();
}
function drawGuide() {
  overlayCtx.clearRect(0,0,overlay.width,overlay.height);
  const w = overlay.width, h = overlay.height;
  const boxW = Math.floor(w * 0.6), boxH = Math.floor(h * 0.45);
  const x = Math.floor((w - boxW)/2), y = Math.floor((h - boxH)/2);
  overlayCtx.strokeStyle = "rgba(255,255,255,0.35)";
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeRect(x,y,boxW,boxH);
}

/* =========================
   UI wiring & init
   ========================= */
startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
clearBtn.addEventListener("click", () => {
  if (!confirm("Limpar todos os registros?")) return;
  scans = [];
  saveScans();
  renderScans();
});
exportBtn.addEventListener("click", exportCSVAll);

// theme toggle
const themeToggle = document.getElementById("themeToggle");
themeToggle.addEventListener("click", () => {
  const doc = document.documentElement;
  const cur = doc.getAttribute("data-theme") || "light";
  const next = cur === "light" ? "dark" : "light";
  doc.setAttribute("data-theme", next);
  themeToggle.textContent = next === "dark" ? "☀️ Modo Claro" : "🌙 Modo Escuro";
});

// when logged in, init
function initAfterLogin() {
  createSidebar();
  renderScans();
  // show deliveries panel button available
  // restore user
  currentUser = loadSessionUser();
}

// on load: if session exists, auto-enter
window.addEventListener("DOMContentLoaded", () => {
  if (currentUser) {
    document.body.classList.add("logged-in");
    initAfterLogin();
  }
  // prepare deliveries panel element (created by createSidebar)
  createSidebar();
  renderScans();
});

/* =========================
   Utility: find & open on maps from list selection (optional)
   ========================= */
// search by id or part of content and scroll to it in list (optional)
function findAndScroll(match) {
  const idx = scans.findIndex(s => (s.extractedId.value || s.link).toLowerCase().includes(match.toLowerCase()));
  if (idx === -1) return alert("Nenhum resultado encontrado.");
  // open deliveries panel and show details
  openDeliveriesPanel();
  const panel = document.getElementById("peg-deliveries-panel");
  // highlight nth child
  const child = panel.children[idx+1]; // first child is h3
  if (child) {
    child.style.background = "rgba(14,165,233,0.08)";
    setTimeout(() => child.style.background = "transparent", 1800);
    child.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
