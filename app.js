const USERS = {
  "thon": { password: "882010", role: "admin" },
  "manager1": { password: "123", role: "gestor" },
  "colab1": { password: "321", role: "colaborador" }
};

let currentUser = null;
let map, userMarker, routeLayer;
let scans = JSON.parse(localStorage.getItem("pegazus_scans") || "[]");
let cameraAllowed = localStorage.getItem("cameraAllowed") === "true";
let locationAllowed = localStorage.getItem("locationAllowed") === "true";

const loginBtn = document.getElementById("loginBtn");
const feedbackMessage = document.getElementById("feedbackMessage");
const mainContent = document.getElementById("mainContent");
const sidebar = document.getElementById("sidebar");
const scansListDiv = document.getElementById("scansList");
const video = document.getElementById("videoElement");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");

let scanning = false;
let currentStream = null;

// =====================
// LOGIN
// =====================
loginBtn.addEventListener("click", async () => {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();
  if (USERS[user] && USERS[user].password === pass) {
    currentUser = { username: user, role: USERS[user].role };
    document.body.classList.add("logged-in");
    mainContent.style.display = "block";
    feedbackMessage.textContent = "";
    renderDeliveriesCount();
    if (!cameraAllowed) {
      cameraAllowed = await requestCameraPermission();
      localStorage.setItem("cameraAllowed", cameraAllowed);
    }
    if (!locationAllowed) {
      locationAllowed = await requestLocationPermission();
      localStorage.setItem("locationAllowed", locationAllowed);
    }
    initMap();
    renderScans();
  } else {
    feedbackMessage.textContent = "❌ Usuário ou senha inválidos";
  }
});

async function requestCameraPermission() {
  try { await navigator.mediaDevices.getUserMedia({ video:true }); return true; }
  catch(e){ alert("Permissão de câmera negada"); return false; }
}

async function requestLocationPermission() {
  return new Promise(resolve=>{
    if(!navigator.geolocation){ alert("Geolocalização não suportada"); resolve(false); return; }
    navigator.geolocation.getCurrentPosition(()=>resolve(true), ()=>{ alert("Permissão de localização negada"); resolve(false); });
  });
}

// =====================
// LOGOUT
// =====================
function logout(){ location.reload(); }

// =====================
// MAPA
// =====================
function initMap(){
  map = L.map('map').setView([0,0],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OSM' }).addTo(map);
  if(locationAllowed && navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude, lng=pos.coords.longitude;
      map.setView([lat,lng],15);
      userMarker=L.marker([lat,lng]).addTo(map).bindPopup("Você está aqui").openPopup();
      renderDeliveryMarkers();
    });
  }
}

function renderDeliveryMarkers(){
  scans.forEach(s=>{
    if(s.lat && s.lng){
      L.marker([s.lat,s.lng]).addTo(map).bindPopup(`${s.nome} - ${s.endereco}`);
    }
  });
}

function generateRoute(){
  if(!map) return alert("Mapa não inicializado");
  if(routeLayer) map.removeLayer(routeLayer);
  const latlngs = scans.filter(s=>s.lat && s.lng).map(s=>[s.lat,s.lng]);
  if(latlngs.length<2) return alert("Mais de um endereço para rota");
  routeLayer=L.polyline(latlngs,{color:'blue'}).addTo(map);
  map.fitBounds(routeLayer.getBounds());
}

// =====================
// SCANNER
// =====================
function adjustCanvas(){ overlay.width=video.videoWidth; overlay.height=video.videoHeight; }

function drawFrame(result){
  overlayCtx.clearRect(0,0,overlay.width,overlay.height);
  if(!result) return;
  overlayCtx.strokeStyle="lime"; overlayCtx.lineWidth=4;
  overlayCtx.strokeRect(
    result.location.topLeftCorner.x,
    result.location.topLeftCorner.y,
    result.location.bottomRightCorner.x - result.location.topLeftCorner.x,
    result.location.bottomRightCorner.y - result.location.topLeftCorner.y
  );
}

async function startScanner(){
  if(!cameraAllowed) return alert("Câmera não autorizada!");
  stopMap();
  try{
    const constraints={video:{facingMode:"environment"}, audio:false};
    currentStream=await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject=currentStream;
    video.style.display="block";
    overlay.style.display="block";
    video.onloadedmetadata=()=>{ adjustCanvas(); video.play(); scanning=true; scanLoop(); };
  }catch(e){ alert("Erro ao acessar câmera: "+e); }
}

function scanLoop(){
  if(!scanning) return;
  overlayCtx.drawImage(video,0,0,overlay.width,overlay.height);
  const imageData=overlayCtx.getImageData(0,0,overlay.width,overlay.height);
  const code=jsQR(imageData.data,imageData.width,imageData.height);
  if(code){ drawFrame(code); registerScan(code.data); beep(); }
  requestAnimationFrame(scanLoop);
}

function stopScanner(){
  scanning=false; overlayCtx.clearRect(0,0,overlay.width,overlay.height);
  video.style.display="none"; overlay.style.display="none";
  if(currentStream) currentStream.getTracks().forEach(t=>t.stop());
}

function stopMap(){ document.getElementById("map").style.display="none"; }

// =====================
// REGISTRO
// =====================
function registerScan(data){
  if(scans.find(s=>s.raw===data)) return alert("QR Code já registrado!");
  const nomeMatch=data.match(/NOME:([^\n]*)/i);
  const enderecoMatch=data.match(/ENDEREÇO:([^\n]*)/i);
  const cepMatch=data.match(/CEP:([^\n]*)/i);
  const telMatch=data.match(/TELEFONE:([^\n]*)/i);
  const scanObj={
    raw:data,
    nome:nomeMatch?nomeMatch[1].trim():"Desconhecido",
    endereco:enderecoMatch?enderecoMatch[1].trim():"",
    cep:cepMatch?cepMatch[1].trim():"",
    telefone:telMatch?telMatch[1].trim():"",
    gestor: currentUser.username,
    date:new Date().toLocaleString()
  };
  scans.unshift(scanObj);
  localStorage.setItem("pegazus_scans",JSON.stringify(scans));
  renderScans();
  renderDeliveriesCount();
}

function renderScans(){
  if(scans.length===0){ scansListDiv.innerHTML="0 entregas registradas."; return; }
  scansListDiv.innerHTML=scans.map(s=>`
    <div class="item">
      <strong>${s.nome}</strong>
      <small>${s.endereco} | ${s.cep} | ${s.telefone}</small>
      <small>Registrado por: ${s.gestor}</small>
      <small>${s.date}</small>
    </div>
  `).join("");
}

function renderDeliveriesCount(){
  const btnDeliveries=document.getElementById("btnDeliveries");
  btnDeliveries.textContent=`📋 Entregas (${scans.length} entregas)`;
}

// =====================
// BEEP
// =====================
function beep(){ const audio=new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="); audio.play(); }

// =====================
// BOTÕES
// =====================
document.getElementById("btnStartScanner").addEventListener("click",()=>{ stopMap(); startScanner(); });
document.getElementById("btnMap").addEventListener("click",()=>{ stopScanner(); document.getElementById("map").style.display="block"; });
document.getElementById("btnAllCSV").addEventListener("click",()=>{
  if(scans.length===0) return alert("Sem registros");
  let csv="nome,endereco,cep,telefone,gestor,data\n"+scans.map(s=>`${s.nome},${s.endereco},${s.cep},${s.telefone},${s.gestor},${s.date}`).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="registros.csv"; a.click();
});
