// ======================
// LOGIN
// ======================
const VALID_USERS = {
  "thon": {password:"882010",role:"admin"},
  "manager1": {password:"123",role:"gestor"},
  "user1": {password:"321",role:"colaborador"}
};

const loginBtn = document.getElementById("loginBtn");
loginBtn.addEventListener("click",()=>{
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();
  const feedback = document.getElementById("feedbackMessage");

  if(VALID_USERS[user] && VALID_USERS[user].password===pass){
    document.querySelector(".login-container").style.display="none";
    document.getElementById("app").style.display="flex";
    document.getElementById("sidebar").style.display="flex";
    feedback.textContent="";
    localStorage.setItem("loggedUser",user);
    initApp();
  } else {
    feedback.textContent="Usuário ou senha incorretos";
  }
});

// ======================
// VARIÁVEIS GLOBAIS
// ======================
let video = document.getElementById("videoElement");
let overlay = document.getElementById("overlay");
let overlayCtx = overlay.getContext("2d");
let scanning=false;
let currentStream=null;
let scans = JSON.parse(localStorage.getItem("pegazus_scans")||"[]");
let map, userMarker, deliveryMarkers=[];

// ======================
// INICIALIZA APP
// ======================
function initApp(){
  renderScansList();
  initMap();
}

// ======================
// BOTÕES
// ======================
document.getElementById("btnCamera").addEventListener("click",()=>{
  showCamera();
});

document.getElementById("btnEntregas").addEventListener("click",()=>{
  hideCamera();
  hideMap();
  renderScansList();
  document.getElementById("scansList").style.display="block";
});

document.getElementById("btnMapa").addEventListener("click",()=>{
  hideCamera();
  document.getElementById("scansList").style.display="none";
  showMap();
});

document.getElementById("btnSair").addEventListener("click",()=>{
  localStorage.removeItem("loggedUser");
  location.reload();
});

// ======================
// EXPORTAR CSV
// ======================
const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");

exportBtn.addEventListener("click",()=>{ exportMenu.style.display=exportMenu.style.display==="block"?"none":"block"; });

document.querySelectorAll(".exportOption").forEach(btn=>{
  btn.addEventListener("click",()=>{
    exportMenu.style.display="none";
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
      return d.getMonth()===now.getMonth() && ((day>=1 && day<=15)||(day>15&&day<=31));
    });
  } else if(period==="mensal"){
    filtered=scans.filter(s=>{
      const d=new Date(s.date);
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    });
  }

  if(filtered.length===0){ alert("Nenhum registro neste período."); return; }

  let csv = "nome,endereco,cep,telefone,data\n"+filtered.map(s=>`${s.nome},${s.endereco},${s.cep},${s.telefone},${s.date}`).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`entregas_${period}.csv`;
  a.click();
}

// ======================
// SCANNER
// ======================
function showCamera(){
  document.getElementById("map").style.display="none";
  document.getElementById("scansList").style.display="none";
  video.style.display="block";

  navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}})
    .then(stream=>{
      currentStream=stream;
      video.srcObject=stream;
      video.play();
      scanning=true;
      scanLoop();
    }).catch(err=>alert("Erro câmera: "+err));
}

function hideCamera(){
  video.style.display="none";
  scanning=false;
  if(currentStream){ currentStream.getTracks().forEach(t=>t.stop()); }
}

function scanLoop(){
  if(!scanning) return;
  overlay.width=video.videoWidth;
  overlay.height=video.videoHeight;
  overlayCtx.drawImage(video,0,0,overlay.width,overlay.height);

  const imageData=overlayCtx.getImageData(0,0,overlay.width,overlay.height);
  const code=jsQR(imageData.data,imageData.width,imageData.height);
  if(code){
    processQRCode(code.data);
  }
  requestAnimationFrame(scanLoop);
}

function processQRCode(data){
  const parsed=parseQRData(data);
  if(scans.find(s=>s.nome===parsed.nome && s.endereco===parsed.endereco)){
    beep();
    alert("QR Code já registrado!");
    return;
  }
  scans.unshift({...parsed,date:new Date().toLocaleString()});
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
    if(line.startsWith("ENDEREÇO:")) obj.endereco=line.replace("ENDEREÇO:","").trim();
    if(line.startsWith("CEP:")) obj.cep=line.replace("CEP:","").trim();
    if(line.startsWith("TELEFONE:")) obj.telefone=line.replace("TELEFONE:","").trim();
  });
  return obj;
}

function renderScansList(){
  const listDiv=document.getElementById("scansList");
  if(scans.length===0){
    listDiv.innerHTML="Nenhuma entrega registrada";
  } else {
    listDiv.innerHTML=scans.map(s=>`<div>${s.nome} - ${s.endereco} - ${s.cep} - ${s.telefone} - ${s.date}</div>`).join("");
  }
  listDiv.style.display="block";
}

function beep(){ new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play(); }

// ======================
// MAPA
// ======================
function initMap(){
  map=document.getElementById("map");
  map.style.display="block";
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const userPos={lat:pos.coords.latitude,lng:pos.coords.longitude};
      map.style.display="block";
      const gmap=new google.maps.Map(map,{center:userPos,zoom:14});
      userMarker=new google.maps.Marker({position:userPos,map:gmap,title:"Você"});
      deliveryMarkers.forEach(m=>m.setMap(null));
      map.gmap=gmap;
    });
  }
}

function addDeliveryMarker(delivery){
  if(!map.gmap) return;
  const geocoder=new google.maps.Geocoder();
  geocoder.geocode({address:delivery.endereco},(results,status)=>{
    if(status==="OK"){
      const marker=new google.maps.Marker({position:results[0].geometry.location,map:map.gmap,title:delivery.nome});
      deliveryMarkers.push(marker);
    }
  });
}

function showMap(){ map.style.display="block"; }
function hideMap(){ map.style.display="none"; }
