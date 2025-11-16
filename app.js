// PegazusLog app.js (versão com QR scanner, login, CSV, geocodificação placeholder, TSP heurística)

/* ==========================
    LOGIN BÁSICO
========================== */
const loginBtn = document.getElementById("loginBtn");
const feedbackMessage = document.getElementById("feedbackMessage");

loginBtn.onclick = () => {
  const u = document.getElementById("loginUser").value.trim();
  const p = document.getElementById("loginPass").value.trim();

  if (u === "admin" && p === "1234") {
    document.body.classList.add("logged-in");
    feedbackMessage.textContent = "";
  } else {
    feedbackMessage.textContent = "Usuário ou senha incorretos";
  }
};

function logout() {
  document.body.classList.remove("logged-in");
}

/* ==========================
    MENU LATERAL
========================== */
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");

menuBtn.onclick = () => sidebar.classList.toggle("open");

/* ==========================
    SCANNER DE QR CODE
========================== */
let video = document.getElementById("videoElement");
let overlay = document.getElementById("overlay");
let ctx = overlay.getContext("2d");
let scanning = false;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    scanning = true;
    scanLoop();
  } catch (e) {
    alert("Erro ao acessar câmera: " + e);
  }
}

function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
  }
  scanning = false;
}

document.getElementById("startButton").onclick = startCamera;
document.getElementById("stopButton").onclick = stopCamera;

/* ==========================
    LISTA DE ENTREGAS
========================== */
let entregas = []; // {nome, endereco, cep, telefone, raw, lat, lng, data}

function parseQRCode(text) {
  const obj = {
    raw: text,
    nome: "",
    endereco: "",
    cep: "",
    telefone: "",
    data: new Date().toISOString().slice(0, 10)
  };

  text.split(/\n|\r/).forEach(l => {
    l = l.trim();
    if (l.startsWith("NOME:")) obj.nome = l.replace("NOME:", "").trim();
    if (l.startsWith("ENDEREÇO:")) obj.endereco = l.replace("ENDEREÇO:", "").trim();
    if (l.startsWith("CEP:")) obj.cep = l.replace("CEP:", "").trim();
    if (l.startsWith("TELEFONE:")) obj.telefone = l.replace("TELEFONE:", "").trim();
  });

  return obj;
}

async function scanLoop() {
  if (!scanning) return;

  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, overlay.width, overlay.height);

  const imageData = ctx.getImageData(0, 0, overlay.width, overlay.height);
  const code = jsQR(imageData.data, overlay.width, overlay.height);

  if (code) {
    let obj = parseQRCode(code.data);

    // opcional: geocodificação automática
    obj = await geocodeAddress(obj);

    entregas.push(obj);
    renderLista();
    alert("QR Lido: " + obj.nome);
    scanning = false;
    stopCamera();
  }

  requestAnimationFrame(scanLoop);
}

/* ==========================
    GEOCODIFICAÇÃO (PLACEHOLDER)
========================== */
async function geocodeAddress(ent) {
  // Plugue sua API aqui (Google, Mapbox, OpenRoute, etc)
  // Aqui usamos valores fictícios
  ent.lat = -23.55 + Math.random() * 0.02;
  ent.lng = -46.63 + Math.random() * 0.02;
  return ent;
}

/* ==========================
    LISTAGEM
========================== */
function renderLista() {
  const div = document.getElementById("scansList");
  div.innerHTML = "";

  entregas.forEach((e, i) => {
    div.innerHTML += `
      <div style="padding:8px; margin:6px 0; background:#fff; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.15)">
        <b>${e.nome}</b><br>
        ${e.endereco} — ${e.cep}<br>
        Tel: ${e.telefone}<br>
        Lat/Lng: ${e.lat?.toFixed(5)}, ${e.lng?.toFixed(5)}<br>
        Data: ${e.data}
      </div>
    `;
  });
}

/* ==========================
    FILTRO POR DATA
========================== */
function filtrarPorData(inicio, fim) {
  return entregas.filter(e => e.data >= inicio && e.data <= fim);
}

/* ==========================
    RELATÓRIO CSV
========================== */
document.getElementById("exportBtn").onclick = () => {
  let csv = "NOME,ENDEREÇO,CEP,TELEFONE,LAT,LNG,DATA\n";
  entregas.forEach(e => {
    csv += `${e.nome},${e.endereco},${e.cep},${e.telefone},${e.lat},${e.lng},${e.data}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio_entregas.csv";
  a.click();

  URL.revokeObjectURL(url);
};

/* ==========================
    MAPA / ROTA (PLACEHOLDER)
========================== */
function openMapa() {
  alert("Mapa será implementado (Google/Leaflet)");
}

function gerarRota() {
  alert("Otimização de rota (TSP heurística) será aplicada aqui.");
}

function listarEntregas() {
  renderLista();
}

function pesquisarQRCode() {
  const q = prompt("Digite nome ou CEP").toLowerCase();
  const f = entregas.filter(e => e.nome.toLowerCase().includes(q) || e.cep.includes(q));

  let msg = f.map(x => x.nome + " - " + x.endereco).join("\n");
  alert(msg || "Nenhum encontrado");
}
