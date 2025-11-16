// Usuários válidos e níveis
const USERS = {
  "thon": { password: "882010", role: "admin" },
  "manager1": { password: "123", role: "gestor" },
  "colab1": { password: "321", role: "colaborador" }
};

let currentUser = null;

// LOGIN
const loginBtn = document.getElementById("loginBtn");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const feedbackMessage = document.getElementById("feedbackMessage");

loginBtn.addEventListener("click", () => {
  const user = loginUser.value.trim();
  const pass = loginPass.value.trim();

  if (USERS[user] && USERS[user].password === pass) {
    feedbackMessage.textContent = "✔ Login realizado com sucesso!";
    feedbackMessage.style.color = "green";
    currentUser = { username: user, role: USERS[user].role };
    document.body.classList.add("logged-in");
    renderSidebarByRole();
    document.getElementById("scannerSection").style.display = "block";
  } else {
    feedbackMessage.textContent = "❌ Usuário ou senha inválidos";
    feedbackMessage.style.color = "red";
  }
});

// SIDEBAR por função
function renderSidebarByRole() {
  const sidebar = document.getElementById("sidebar");
  const allButtons = sidebar.querySelectorAll("button");
  allButtons.forEach(btn => btn.style.display = "block");

  if (currentUser.role === "colaborador") {
    sidebar.querySelector("#btnMap").style.display = "none";
    sidebar.querySelector("#btnRoute").style.display = "none";
    sidebar.querySelector("#btnSearchQR").style.display = "none";
    sidebar.querySelector("#btnFilterDate").style.display = "none";
    sidebar.querySelector("#btnAllCSV").style.display = "none";
  }
  if (currentUser.role === "gestor") {
    // Gestor não vê adicionar admin
  }
}

// LOGOUT
function logout() {
  location.reload();
}

// ============================
// SCANNER QR CODE
// ============================
let video = document.getElementById("videoElement");
let overlay = document.getElementById("overlay");
let overlayCtx = overlay.getContext("2d");

let scanning = false;
let currentStream = null;
let scans = JSON.parse(localStorage.getItem("pegazus_scans") || "[]");
let scansList = document.getElementById("scansList");

// Ajusta canvas
function adjustCanvas() {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

// Desenha borda QR
function drawFrame(result) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  if (!result) return;
  overlayCtx.strokeStyle = "lime";
  overlayCtx.lineWidth = 4;
  overlayCtx.strokeRect(
    result.location.topLeftCorner.x,
    result.location.topLeftCorner.y,
    result.location.bottomRightCorner.x - result.location.topLeftCorner.x,
    result.location.bottomRightCorner.y - result.location.topLeftCorner.y
  );
}

// Iniciar câmera
async function startScanner() {
  try {
    const constraints = { video: { facingMode: "environment" }, audio: false };
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    video.style.display = "block";
    overlay.style.display = "block";

    video.onloadedmetadata = () => {
      adjustCanvas();
      video.play();
      scanning = true;
      scanLoop();
    };
  } catch (err) {
    alert("Erro ao acessar câmera: " + err);
  }
}

// Parar câmera
function stopScanner() {
  scanning = false;
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
  video.style.display = "none";
  overlay.style.display = "none";
}

// Loop de scanner
function scanLoop() {
  if (!scanning) return;
  overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
  const imageData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);

  if (code) {
    drawFrame(code);
    registerScan(code.data);
    beep();
  }
  requestAnimationFrame(scanLoop);
}

// ============================
// REGISTRO DE SCANS
// ============================
function saveScans() {
  localStorage.setItem("pegazus_scans", JSON.stringify(scans));
}

function renderScans() {
  if (scans.length === 0) {
    scansList.innerHTML = "0 entregas registradas.";
    return;
  }
  scansList.innerHTML = scans.map(item => `
    <div class="item">
      <strong>${item.nome}</strong>
      <small>${item.endereco} | ${item.cep} | ${item.telefone}</small>
      <small>Registrado por: ${item.gestor}</small>
      <small>${item.date}</small>
    </div>
  `).join("");
}

// Registrar scan
function registerScan(data) {
  const alreadyScanned = scans.find(s => s.raw === data);
  if (alreadyScanned) {
    alert("QR Code já registrado!");
    return;
  }

  const nomeMatch = data.match(/NOME:([^\n]*)/i);
  const enderecoMatch = data.match(/ENDEREÇO:([^\n]*)/i);
  const cepMatch = data.match(/CEP:([^\n]*)/i);
  const telMatch = data.match(/TELEFONE:([^\n]*)/i);

  const scanObj = {
    raw: data,
    nome: nomeMatch ? nomeMatch[1].trim() : "Desconhecido",
    endereco: enderecoMatch ? enderecoMatch[1].trim() : "",
    cep: cepMatch ? cepMatch[1].trim() : "",
    telefone: telMatch ? telMatch[1].trim() : "",
    gestor: currentUser.username,
    date: new Date().toLocaleString()
  };

  scans.unshift(scanObj);
  saveScans();
  renderScans();
}

// ============================
// BEEP
// ============================
function beep() {
  const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
  audio.play();
}

// ============================
// EXPORT CSV
// ============================
document.getElementById("btnAllCSV").addEventListener("click", () => {
  if (scans.length === 0) return alert("Sem registros para exportar.");
  let csv = "nome,endereco,cep,telefone,gestor,data\n" +
    scans.map(s => `${s.nome},${s.endereco},${s.cep},${s.telefone},${s.gestor},${s.date}`).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "registros.csv";
  a.click();
});

// BOTÃO CAMERA
document.getElementById("btnStartScanner").addEventListener("click", startScanner);

// Render inicial
renderScans();
