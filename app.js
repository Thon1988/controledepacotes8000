// Usuários e níveis
const USERS = {
  "thon": { password: "882010", role: "admin" },
  "manager1": { password: "123", role: "gestor" },
  "colab1": { password: "321", role: "colaborador" }
};

let currentUser = null;
let map, userMarker;
let cameraAllowed = localStorage.getItem("cameraAllowed");
let locationAllowed = localStorage.getItem("locationAllowed");

// LOGIN
const loginBtn = document.getElementById("loginBtn");
loginBtn.addEventListener("click", async () => {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();

  if (USERS[user] && USERS[user].password === pass) {
    currentUser = { username: user, role: USERS[user].role };
    document.body.classList.add("logged-in");
    document.getElementById("mainContent").style.display = "block";
    renderSidebarByRole();

    // Solicita permissões se nunca permitidas
    if (!cameraAllowed) {
      cameraAllowed = await requestCameraPermission();
      localStorage.setItem("cameraAllowed", cameraAllowed);
    }
    if (!locationAllowed) {
      locationAllowed = await requestLocationPermission();
      localStorage.setItem("locationAllowed", locationAllowed);
    }

    initMap();
  } else {
    const feedbackMessage = document.getElementById("feedbackMessage");
    feedbackMessage.textContent = "❌ Usuário ou senha inválidos";
    feedbackMessage.style.color = "red";
  }
});

// Permissão câmera
async function requestCameraPermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    return true;
  } catch (e) {
    alert("Permissão de câmera negada!");
    return false;
  }
}

// Permissão localização
async function requestLocationPermission() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      alert("Geolocalização não suportada!");
      resolve(false);
    } else {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => { alert("Permissão de localização negada!"); resolve(false); }
      );
    }
  });
}

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
}

// LOGOUT
function logout() { location.reload(); }

// BOTÃO VOLTAR
function goBack() {
  document.getElementById("mainContent").scrollIntoView();
}

// ============================
// MAPA
// ============================
function initMap() {
  map = L.map('map').setView([0,0],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  if (locationAllowed && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      map.setView([lat, lng], 15);
      userMarker = L.marker([lat,lng]).addTo(map).bindPopup("Você está aqui").openPopup();
    });
  }
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

function adjustCanvas() {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

function drawFrame(result) {
  overlayCtx.clearRect(0,0,overlay.width,overlay.height);
  if(!result) return;
  overlayCtx.strokeStyle = "lime";
  overlayCtx.lineWidth = 4;
  overlayCtx.strokeRect(
    result.location.topLeftCorner.x,
    result.location.topLeftCorner.y,
    result.location.bottomRightCorner.x - result.location.topLeftCorner.x,
    result.location.bottomRightCorner.y - result.location.topLeftCorner.y
  );
}

// Iniciar scanner
async function startScanner() {
  if (!cameraAllowed) return alert("Câmera não autorizada!");
  try {
    const constraints = { video: { facingMode: { exact: "environment" } }, audio:false };
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    video.style.display = "block";
    overlay.style.display = "block";
    video.onloadedmetadata = () => { adjustCanvas(); video.play(); scanning=true; scanLoop(); };
  } catch(e) {
    alert("Erro ao acessar câmera: "+e);
  }
}

// Loop scanner
function scanLoop() {
  if(!scanning) return;
  overlayCtx.drawImage(video,0,0,overlay.width,overlay.height);
  const imageData = overlayCtx.getImageData(0,0,overlay.width,overlay.height);
  const code = jsQR(imageData.data,imageData.width,imageData.height);
  if(code) { drawFrame(code); registerScan(code.data); beep(); }
  requestAnimationFrame(scanLoop);
}

// Registrar scan
function registerScan(data){
  if(scans.find(s=>s.raw===data)) return alert("QR Code já registrado!");

  const nomeMatch = data.match(/NOME:([^\n]*)/i);
  const enderecoMatch = data.match(/ENDEREÇO:([^\n]*)/i);
  const cepMatch = data.match(/CEP:([^\n]*)/i);
  const telMatch = data.match(/TELEFONE:([^\n]*)/i);

  const scanObj = {
    raw:data,
    nome: nomeMatch?nomeMatch[1].trim():"Desconhecido",
    endereco: enderecoMatch?enderecoMatch[1].trim():"",
    cep: cepMatch?cepMatch[1].trim():"",
    telefone: telMatch?telMatch[1].trim():"",
    gestor: currentUser.username,
    date: new Date().toLocaleString()
  };
  scans.unshift(scanObj);
  localStorage.setItem("pegazus_scans",JSON.stringify(scans));
  renderScans();
}

function renderScans(){
  if(scans.length===0){ scansList.innerHTML="0 entregas registradas."; return; }
  scansList.innerHTML=scans.map(item=>`
    <div class="item">
      <strong>${item.nome}</strong>
      <small>${item.endereco} | ${item.cep} | ${item.telefone}</small>
      <small>Registrado por: ${item.gestor}</small>
      <small>${item.date}</small>
    </div>
  `).join("");
}

// BEEP
function beep(){ const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="); audio.play(); }

// BOTÕES
document.getElementById("btnStartScanner").addEventListener("click", startScanner);
document.getElementById("btnAllCSV").addEventListener("click",()=>{
  if(scans.length===0) return alert("Sem registros para exportar.");
  let csv="nome,endereco,cep,telefone,gestor,data\n"+scans.map(s=>`${s.nome},${s.endereco},${s.cep},${s.telefone},${s.gestor},${s.date}`).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url;
  a.download="registros.csv";
  a.click();
});

// Render inicial
renderScans();
