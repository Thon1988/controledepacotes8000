// =====================
// LOGIN
// =====================
const VALID_USERS = {
  "thon": {password:"882010", role:"admin"},
  "manager1": {password:"123", role:"gestor"},
  "user1": {password:"123", role:"colaborador"}
};

let currentUser = null;
let scans = JSON.parse(localStorage.getItem("pegazus_scans")||"[]");

// Login
document.getElementById("loginBtn").onclick = ()=>{
  const username=document.getElementById("loginUser").value.trim();
  const password=document.getElementById("loginPass").value.trim();
  if(VALID_USERS[username] && VALID_USERS[username].password===password){
    currentUser={username,role:VALID_USERS[username].role};
    document.body.querySelector(".login-container").style.display="none";
    document.getElementById("app").style.display="block";
    initMap();
    renderDeliveriesCount();
  } else {
    document.getElementById("feedbackMessage").textContent="Usuário ou senha incorretos";
  }
};

function logout(){
  location.reload();
}

// =====================
// MAPA
// =====================
let map, routeLayer;
function initMap(){
  map = L.map('map').setView([-23.5505,-46.6333],12); // Default SP
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap'
  }).addTo(map);

  // Geolocalização do usuário
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      map.setView([pos.coords.latitude,pos.coords.longitude],14);
      L.marker([pos.coords.latitude,pos.coords.longitude]).addTo(map)
        .bindPopup("Você está aqui").openPopup();
    });
  }
}

// =====================
// SCANNER
// =====================
let video=document.getElementById("videoElement");
let overlay=document.getElementById("overlay");
let overlayCtx=overlay.getContext("2d");
let scanning=false;

document.getElementById("btnCamera").onclick=async()=>{
  document.getElementById("map").style.display="none";
  document.getElementById("deliveriesList").style.display="none";
  document.getElementById("cameraContainer").style.display="flex";

  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
  video.srcObject=stream;
  scanning=true;
  video.onloadedmetadata=()=>{overlay.width=video.videoWidth; overlay.height=video.videoHeight; scanLoop();};
};

function stopScanner(){
  scanning=false;
  let stream=video.srcObject;
  if(stream){stream.getTracks().forEach(t=>t.stop());}
  document.getElementById("cameraContainer").style.display="none";
}

function scanLoop(){
  if(!scanning) return;
  overlayCtx.drawImage(video,0,0,overlay.width,overlay.height);
  const imgData=overlayCtx.getImageData(0,0,overlay.width,overlay.height);
  const code=jsQR(imgData.data,imgData.width,imgData.height);
  if(code){
    registerScan(code.data);
    beep();
  }
  requestAnimationFrame(scanLoop);
}

// =====================
// REGISTRO E GEOCODIFICAÇÃO
// =====================
async function geocodeAddress(scanObj){
  if(!scanObj.endereco) return null;
  const query=encodeURIComponent(`${scanObj.endereco}, ${scanObj.cep}, Brasil`);
  try{
    const resp=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`);
    const data=await resp.json();
    if(data.length>0){ scanObj.lat=parseFloat(data[0].lat); scanObj.lng=parseFloat(data[0].lon);}
    else{scanObj.lat=scanObj.lng=null;}
  } catch(e){scanObj.lat=scanObj.lng=null;}
}

async function registerScan(data){
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
    gestor:currentUser.username,
    date:new Date().toLocaleString()
  };

  await geocodeAddress(scanObj);
  scans.unshift(scanObj);
  localStorage.setItem("pegazus_scans",JSON.stringify(scans));
  renderDeliveriesCount();
  stopScanner();

  if(map && scanObj.lat && scanObj.lng){
    L.marker([scanObj.lat,scanObj.lng]).addTo(map)
      .bindPopup(`${scanObj.nome} - ${scanObj.endereco}`);
  }
}

// =====================
// ENTREGAS
// =====================
function renderDeliveriesCount(){
  const btn=document.getElementById("btnDeliveries");
  btn.textContent=`📦 Entregas (${scans.length})`;
}

document.getElementById("btnDeliveries").onclick=()=>{
  const listDiv=document.getElementById("deliveriesList");
  if(listDiv.style.display==="block") listDiv.style.display="none";
  else {
    listDiv.innerHTML=scans.map(s=>`<div>${s.nome} - ${s.endereco} - ${s.cep} - ${s.telefone}</div>`).join("");
    listDiv.style.display="block";
  }
};

// =====================
// ROTA OTIMIZADA
// =====================
function generateOptimizedRoute(){
  if(!map) return alert("Mapa não inicializado");
  if(routeLayer) map.removeLayer(routeLayer);

  const points=scans.filter(s=>s.lat&&s.lng).map(s=>({lat:s.lat,lng:s.lng,nome:s.nome}));
  if(points.length<2) return alert("Mais de um endereço necessário");

  let visited=[], route=[points[0]]; visited.push(0);
  while(route.length<points.length){
    const last=route[route.length-1]; let nearestIdx=-1, nearestDist=Infinity;
    points.forEach((p,i)=>{if(!visited.includes(i)){const dist=Math.hypot(last.lat-p.lat,last.lng-p.lng); if(dist<nearestDist){nearestDist=dist; nearestIdx=i;}}});
    route.push(points[nearestIdx]); visited.push(nearestIdx);
  }

  const latlngs=route.map(p=>[p.lat,p.lng]);
  routeLayer=L.polyline(latlngs,{color:'blue'}).addTo(map);
  map.fitBounds(routeLayer.getBounds());
}
document.getElementById("btnRoute").onclick=generateOptimizedRoute;

// =====================
// EXPORT CSV
// =====================
document.getElementById("btnExport").onclick=()=>{
  let csv="nome,endereco,cep,telefone,gestor,data\n"+scans.map(s=>`${s.nome},${s.endereco},${s.cep},${s.telefone},${s.gestor},${s.date}`).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="entregas.csv";
  a.click();
};

// =====================
// AUDIO DE BIP
// =====================
function beep(){
  const audio=new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
  audio.play();
}

// =====================
// BOTÃO MAPA
// =====================
document.getElementById("btnMap").onclick=()=>{
  stopScanner();
  document.getElementById("cameraContainer").style.display="none";
  document.getElementById("map").style.display="block";
  document.getElementById("deliveriesList").style.display="none";
};
