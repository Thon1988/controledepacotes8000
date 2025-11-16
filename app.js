// app.js — Pegazus v0.1 | Versão V14: Foco na Prevenção da Tela Branca e Coerência com o Novo HTML.

// ======================// LOGIN // ======================
const VALID_USERS = {
  "thon": {password:"882010",role:"admin"},
  "manager1": {password:"123",role:"gestor"},
  "user1": {password:"321",role:"colaborador"}
};

const loginBtn = document.getElementById("loginBtn");
const loginContainer = document.querySelector(".login-container");
const appContainer = document.getElementById("app");
const sidebar = document.getElementById("sidebar");
const feedback = document.getElementById("feedbackMessage");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");


if (loginBtn) {
    loginBtn.addEventListener("click", () => {
        const user = loginUser.value.trim();
        const pass = loginPass.value.trim();

        if(VALID_USERS[user] && VALID_USERS[user].password === pass){
            if (loginContainer) loginContainer.style.display = "none";
            if (appContainer) appContainer.style.display = "flex";
            if (sidebar) sidebar.style.display = "flex";
            if (feedback) feedback.textContent = "";
            localStorage.setItem("loggedUser", user);
            initApp();
        } else {
            if (feedback) feedback.textContent = "Usuário ou senha incorretos";
        }
    });
}

// Verifica se o usuário já está logado ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem("loggedUser")) {
        if (loginContainer) loginContainer.style.display = "none";
        if (appContainer) appContainer.style.display = "flex";
        if (sidebar) sidebar.style.display = "flex";
        initApp();
    }
});


// ======================// VARIÁVEIS GLOBAIS // ======================
let video = document.getElementById("videoElement");
let overlay = document.getElementById("overlay");
let overlayCtx = overlay ? overlay.getContext("2d") : null;
let scanning = false;
let currentStream = null;
let scans = JSON.parse(localStorage.getItem("pegazus_scans") || "[]");
let map, userMarker, deliveryMarkers = [];
let scansList = document.getElementById("scansList");
let mapElement = document.getElementById("map"); // Renomeado para evitar conflito com 'map' objeto


// ======================// INICIALIZA APP (CORRIGIDA) // ======================
function initApp(){
  // 1. Inicia o mapa em background (sem mostrar a tela)
  initMap();
  
  // 2. Garante que Câmera e Mapa estejam ocultos
  hideCamera();
  hideMap();
  
  // 3. Mostra a lista de entregas como tela padrão (Prevenção da Tela Branca)
  renderScansList();
  if (scansList) scansList.style.display = "block";
}


// ======================// BOTÕES // ======================
document.getElementById("btnCamera")?.addEventListener("click", () => {
  hideMap();
  if (scansList) scansList.style.display = "none";
  showCamera();
});

document.getElementById("btnEntregas")?.addEventListener("click", () => {
  hideCamera();
  hideMap();
  renderScansList();
  if (scansList) scansList.style.display = "block";
});

document.getElementById("btnMapa")?.addEventListener("click", () => {
  hideCamera();
  if (scansList) scansList.style.display = "none";
  showMap();
});

document.getElementById("btnSair")?.addEventListener("click", () => {
  localStorage.removeItem("loggedUser");
  location.reload();
});


// ======================// EXPORTAR CSV // ======================
const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");

if (exportBtn) {
    exportBtn.addEventListener("click", () => { 
        if(exportMenu) exportMenu.style.display = exportMenu.style.display === "block" ? "none" : "block"; 
    });
}

document.querySelectorAll(".exportOption").forEach(btn => {
  btn.addEventListener("click", () => {
    if(exportMenu) exportMenu.style.display = "none";
    exportCSV(btn.dataset.period);
  });
});

function exportCSV(period){
  if(scans.length===0){ alert("Nenhum registro!"); return; }

  const now = new Date();
  let filtered = scans;

  if(period==="diario"){
    filtered=scans.filter(s=>new Date(s.date).toDateString()===now.toDateString());
  } else if(period==="quinzenal"){
    filtered=scans.filter(s=>{
      const d=new Date(s.date), day=d.getDate();
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear() && ((day>=1 && day<=15)||(day>15&&day<=31));
    });
  } else if(period==="mensal"){
    filtered=scans.filter(s=>{
      const d=new Date(s.date);
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    });
  }

  if(filtered.length===0){ alert("Nenhum registro neste período."); return; }

  // Garante que o CSV seja formatado corretamente com headers e dados
  let csv = "nome,endereco,cep,telefone,data\n"+filtered.map(s=>`${s.nome},${s.endereco},${s.cep},${s.telefone},${s.date}`).join("\n");
  const bom = "\uFEFF"; // Byte Order Mark para UTF-8 no Excel
  const blob = new Blob([bom + csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`entregas_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


// ======================// SCANNER // ======================
function showCamera(){
  if (mapElement) mapElement.style.display = "none";
  if (scansList) scansList.style.display = "none";
  if (video) video.style.display = "block";

  navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}})
    .then(stream=>{
      currentStream=stream;
      if (video) {
          video.srcObject=stream;
          video.play();
      }
      scanning=true;
      scanLoop();
    }).catch(err=>alert("Erro câmera: Acesso negado ou dispositivo indisponível.\nDetalhe: "+err.name));
}

function hideCamera(){
  if (video) video.style.display="none";
  scanning=false;
  if(currentStream){ currentStream.getTracks().forEach(t=>t.stop()); }
}

function scanLoop(){
  if(!scanning || !video || !overlayCtx) return;
  
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);

      const imageData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if(code){
        // Desenho da caixa delimitadora omitido por brevidade, mas deve ser inserido aqui.
        processQRCode(code.data);
      } else {
         overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      }
  }
  requestAnimationFrame(scanLoop);
}

function processQRCode(data){
  const parsed=parseQRData(data);
  // Se for duplicado, usa console.warn em vez de alert para não travar o scanner
  if(scans.find(s=>s.nome===parsed.nome && s.endereco===parsed.endereco)){
    beep();
    console.warn("QR Code já registrado!");
    return;
  }
  scans.unshift({...parsed,date:new Date().toLocaleString('pt-BR')}); // Adiciona locale
  localStorage.setItem("pegazus_scans",JSON.stringify(scans));
  beep();
  renderScansList();
  addDeliveryMarker(parsed);
}

function parseQRData(qrText){
  const lines=qrText.split("\n");
  let obj={nome:"",endereco:"",cep:"",telefone:""};
  lines.forEach(line=>{
    if(line.startsWith("NOME:")) obj.nome=line.replace("NOME:","").trim();
    else if(line.startsWith("ENDEREÇO:")) obj.endereco=line.replace("ENDEREÇO:","").trim();
    else if(line.startsWith("CEP:")) obj.cep=line.replace("CEP:","").trim();
    else if(line.startsWith("TELEFONE:")) obj.telefone=line.replace("TELEFONE:","").trim();
  });
  return obj;
}

function renderScansList(){
  if(!scansList) return;
  
  if(scans.length===0){
    scansList.innerHTML="<p style='text-align:center; color:#6c757d; padding:20px;'>Nenhuma entrega registrada ainda.</p>";
  } else {
    // Melhoria na exibição: usando HTML simples, mas mais claro
    scansList.innerHTML=scans.map(s=>
        `<div style="padding: 10px; border-bottom: 1px solid #eee;">
            <strong>${s.nome}</strong> - ${s.cep}<br>
            ${s.endereco}<br>
            <span style="font-size: 12px; color: #6c757d;">${s.telefone} | ${s.date}</span>
        </div>`
    ).join("");
  }
  // A exibição do bloco é controlada pelo initApp() ou pelo botão
}

function beep(){ 
    try {
        // Áudio mais compatível
        const audioData = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
        new Audio(audioData).play(); 
    } catch (e) {
        console.warn("Falha ao emitir beep.");
    }
}


// ======================// MAPA // ======================
function initMap(){
  if (!mapElement || typeof google === 'undefined') {
    console.warn("API Key do Google Maps não carregada ou elemento #map não encontrado.");
    return;
  }
  
  // Tenta obter a posição do usuário
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const userPos={lat:pos.coords.latitude,lng:pos.coords.longitude};
      
      // Cria o objeto de mapa e o armazena na variável global 'map'
      map = new google.maps.Map(mapElement, {center:userPos,zoom:14});
      userMarker = new google.maps.Marker({position:userPos,map:map,title:"Você"});
      
      // Adiciona marcadores de entregas
      deliveryMarkers.forEach(m=>m.setMap(null));
      scans.forEach(addDeliveryMarker); 
    }, (error) => {
        // Em caso de falha na geolocalização, centraliza em São Paulo
        console.warn("Erro de Geolocalização:", error.message);
        map = new google.maps.Map(mapElement, {center: {lat: -23.5505, lng: -46.6333}, zoom: 10});
        scans.forEach(addDeliveryMarker);
    });
  } else {
      // Geolocalização não suportada
      map = new google.maps.Map(mapElement, {center: {lat: -23.5505, lng: -46.6333}, zoom: 10});
      scans.forEach(addDeliveryMarker);
  }
}

function addDeliveryMarker(delivery){
  // Usa a variável global 'map'
  if(!map) return;
  const geocoder=new google.maps.Geocoder();
  geocoder.geocode({address:delivery.endereco + ", " + delivery.cep},(results,status)=>{
    if(status==="OK" && results[0]){
      const marker=new google.maps.Marker({position:results[0].geometry.location,map:map,title:delivery.nome});
      deliveryMarkers.push(marker);
    }
  });
}

function showMap(){ 
  if (mapElement) mapElement.style.display="block";
  // Força o mapa a recalcular seu tamanho quando ele é tornado visível
  if (map && typeof google !== 'undefined') {
      google.maps.event.trigger(map, 'resize');
      // Centraliza no usuário se o marcador existir
      if (userMarker) map.setCenter(userMarker.getPosition()); 
  } else {
      // Se por algum motivo o mapa não carregou, tenta inicializar novamente
      initMap();
  }
}

function hideMap(){ 
    if (mapElement) mapElement.style.display="none"; 
}
