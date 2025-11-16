// app.js — PegazusLog v0.2 | Funcionalidades Completas

// ======================// LOGIN E UTILS // ======================
const VALID_USERS = {
    "thon": {password:"882010", role:"admin"},
    "manager1": {password:"123", role:"gestor"},
    "user1": {password:"123", role:"colaborador"}
};

let currentUser = null;
let scans = JSON.parse(localStorage.getItem("pegazus_scans") || "[]");
let map, routeLayer, userMarker; 
let rafId = null;
let currentStream = null;
let scanning = false;
let currentFilters = { gestor: "all", dateStart: null, dateEnd: null };
let filteredScans = [];

const video = document.getElementById("videoElement");
const overlay = document.getElementById("overlay");
const cameraContainer = document.getElementById("cameraContainer");
const deliveriesList = document.getElementById("deliveriesList");
const sidebar = document.getElementById("sidebar");
const camSelect = document.getElementById("cameraSelect");
let overlayCtx = overlay ? overlay.getContext("2d") : null;

// Geração de ID simples
const generateId = () => Math.random().toString(36).substring(2, 9);

function beep() {
    try {
        const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
        audio.play();
    } catch (e) { console.warn("Falha ao emitir beep."); }
}

function updateDeliveriesCount() {
    const total = scans.length;
    const filtered = filteredScans.length;
    document.getElementById("btnDeliveries").textContent = `📦 Entregas (${filtered} de ${total})`;
}

// ======================// GERENCIAMENTO DE VISUALIZAÇÃO // ======================

function showView(viewId) {
    // Esconde todas as visualizações principais
    document.getElementById("map").style.display = "none";
    document.getElementById("deliveriesList").style.display = "none";
    document.getElementById("cameraContainer").style.display = "none";
    stopScanner(); // Garante que a câmera esteja parada

    // Esconde/Mostra o menu lateral principal e o botão Voltar
    sidebar.style.display = "flex";
    document.getElementById("btnVoltarCamera").style.display = "none";
    
    // Esconde menus extras
    document.getElementById("exportMenu").style.display = "none";
    document.getElementById("filterOptions").style.display = "none";


    switch (viewId) {
        case 'list':
            document.getElementById("deliveriesList").style.display = "block";
            updateFilteredScans(); 
            break;
        case 'map':
            document.getElementById("map").style.display = "block";
            if (map) map.invalidateSize(); 
            break;
        case 'camera':
            sidebar.style.display = "none"; // Esconde o menu principal
            document.getElementById("btnVoltarCamera").style.display = "block"; // Mostra o botão Voltar
            document.getElementById("cameraContainer").style.display = "flex";
            
            // Força a detecção/seleção da câmera novamente
            document.getElementById("btnCamera").onclick();
            break;
    }
}

// ======================// LOGIN E SAIR // ======================
document.getElementById("loginBtn").onclick = () => {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    if (VALID_USERS[username] && VALID_USERS[username].password === password) {
        currentUser = { username, role: VALID_USERS[username].role };
        localStorage.setItem("loggedUser", username); 
        document.body.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        initApp();
    } else {
        document.getElementById("feedbackMessage").textContent = "Usuário ou senha incorretos";
    }
};

document.getElementById("btnSair").onclick = logout;
function logout() { 
    localStorage.removeItem("loggedUser");
    location.reload(); 
}

// ======================// INICIALIZAÇÃO // ======================
window.addEventListener('DOMContentLoaded', () => {
    const loggedUser = localStorage.getItem("loggedUser");
    if (loggedUser && VALID_USERS[loggedUser]) {
        currentUser = { username: loggedUser, role: VALID_USERS[loggedUser].role };
        document.body.querySelector(".login-container").style.display = "none";
        document.getElementById("app").style.display = "block";
        initApp();
    }
});

function initApp() {
    initMap();
    
    // Cria e configura o botão "Voltar" (para a câmera)
    const voltarBtn = document.createElement('button');
    voltarBtn.id = "btnVoltarCamera";
    voltarBtn.textContent = "🔙 Voltar";
    voltarBtn.style.cssText = "position:absolute; top:10px; left:10px; z-index:1000; display:none; padding:10px; border:none; border-radius:6px; cursor:pointer; background:#dc3545; color:white; font-weight:bold; width:150px;";
    voltarBtn.onclick = () => showView('list');
    document.getElementById("app").appendChild(voltarBtn);

    // Inicializa a lista de entregas como tela principal
    showView('list'); 
    
    // Inicializa os eventos do menu 
    initMenuEvents();
}

function initMenuEvents() {
    document.getElementById("btnMap").onclick = () => { showView('map'); };
    document.getElementById("btnDeliveries").onclick = () => { showView('list'); };
    document.getElementById("btnRoute").onclick = generateOptimizedRoute;
    
    // Filtros
    document.getElementById("btnFilter").onclick = () => {
        const options = document.getElementById("filterOptions");
        options.style.display = options.style.display === "flex" ? "none" : "flex";
        document.getElementById("exportMenu").style.display = "none";
        if (options.style.display === "flex") populateGestorFilter();
    };
    document.getElementById("applyFilters").onclick = () => {
        currentFilters.gestor = document.getElementById("filterGestor").value;
        currentFilters.dateStart = document.getElementById("filterDateStart").value;
        currentFilters.dateEnd = document.getElementById("filterDateEnd").value;
        updateFilteredScans();
        document.getElementById("filterOptions").style.display = "none";
    };
}

// ======================// MAPA LEAFLET // ======================
function initMap() {
    const mapElement = document.getElementById("map");
    if (mapElement.gmap) return;
    
    map = L.map('map').setView([-23.5505, -46.6333], 12); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    mapElement.gmap = map;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const userPos = [pos.coords.latitude, pos.coords.longitude];
            map.setView(userPos, 14);
            userMarker = L.marker(userPos).addTo(map).bindPopup("Você está aqui").openPopup();
        });
    }
}

function updateMapMarkers(listToRender) {
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== userMarker) {
            map.removeLayer(layer);
        }
    });

    listToRender.forEach(scanObj => {
        if (scanObj.lat && scanObj.lng) {
            L.marker([scanObj.lat, scanObj.lng]).addTo(map)
                .bindPopup(`<b>${scanObj.nome}</b><br>${scanObj.endereco}`);
        }
    });
}

// ======================// SCANNER AVANÇADO (Seleção de Câmera) // ======================

document.getElementById("btnCamera").onclick = async () => {
    // Esconde o menu principal e mostra o botão de voltar
    showView('camera');
    
    // Popula as câmeras disponíveis
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        camSelect.innerHTML = '<option value="">Selecione a Câmera</option>';
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Câmera ${camSelect.options.length}`;
            camSelect.appendChild(option);
        });

        // Mostra o seletor apenas se houver mais de uma opção (além do "Selecione...")
        if (videoDevices.length > 0) {
            camSelect.style.display = "block";
        } else {
             alert("Nenhuma câmera detectada.");
             showView('list');
        }

    } catch (e) {
        alert("Erro ao detectar câmeras: " + e.message);
        console.error(e);
        showView('list');
    }
};

camSelect.onchange = (e) => {
    const deviceId = e.target.value;
    if (deviceId) {
        camSelect.style.display = "none";
        startScanner(deviceId);
    }
};

async function startScanner(deviceId) {
    try {
        if (!video || !overlayCtx) throw new Error("Elementos do scanner não encontrados.");
        
        if(currentStream) stopScanner();

        const constraints = { 
            video: { 
                deviceId: deviceId ? { exact: deviceId } : undefined 
            } 
        };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        await video.play();

        scanning = true;
        video.onloadedmetadata = () => { 
            overlay.width = video.videoWidth; 
            overlay.height = video.videoHeight; 
            scanLoop(); 
        };

    } catch (e) {
        alert("Erro ao acessar a câmera: " + e.message);
        console.error(e);
        showView('list');
    }
}

function stopScanner() {
    scanning = false;
    if (currentStream) { 
        currentStream.getTracks().forEach(t => t.stop()); 
        currentStream = null;
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    if(camSelect) camSelect.style.display = "none";
}

function scanLoop() {
    if (!scanning || !video || !overlayCtx) return;
    overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
    const imgData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height);
    
    if (code) {
        const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = code.location;
        overlayCtx.strokeStyle = "#00FF00"; overlayCtx.lineWidth = 4; overlayCtx.beginPath();
        overlayCtx.moveTo(topLeftCorner.x, topLeftCorner.y); overlayCtx.lineTo(topRightCorner.x, topRightCorner.y);
        overlayCtx.lineTo(bottomRightCorner.x, bottomRightCorner.y); overlayCtx.lineTo(bottomLeftCorner.x, bottomLeftCorner.y);
        overlayCtx.closePath(); overlayCtx.stroke();

        registerScan(code.data);
        beep();
    }
    rafId = requestAnimationFrame(scanLoop);
}

// ======================// REGISTRO E GEOCODIFICAÇÃO // ======================

async function geocodeAddress(scanObj) {
    if (!scanObj.endereco) return;
    const query = encodeURIComponent(`${scanObj.endereco}, ${scanObj.cep}, Brasil`);
    try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
        const data = await resp.json();
        if (data.length > 0) {
            scanObj.lat = parseFloat(data[0].lat);
            scanObj.lng = parseFloat(data[0].lon);
        } else { scanObj.lat = scanObj.lng = null; }
    } catch (e) { scanObj.lat = scanObj.lng = null; console.error("Erro geocodificação:", e); }
}

async function registerScan(data) {
    if (scans.find(s => s.rawId === data)) {
        stopScanner();
        alert("QR Code já registrado!");
        showView('list');
        return;
    }
    
    const regex = (key) => {
        const match = data.match(new RegExp(`${key}:([^\n]*)`, 'i'));
        return match ? match[1].trim() : "";
    };

    const scanObj = {
        id: generateId(), 
        rawId: data, 
        nome: regex("NOME") || "Desconhecido",
        endereco: regex("ENDEREÇO") || "",
        cep: regex("CEP") || "",
        telefone: regex("TELEFONE") || "",
        gestor: currentUser ? currentUser.username : "Desconhecido",
        date: new Date().toLocaleString('pt-BR')
    };
    
    await geocodeAddress(scanObj);

    scans.unshift(scanObj);
    localStorage.setItem("pegazus_scans", JSON.stringify(scans));
    
    stopScanner();
    updateFilteredScans(); 
    showView('list');
}

// ======================// FILTROS E LISTAGEM // ======================
function populateGestorFilter() {
    const select = document.getElementById("filterGestor");
    const uniqueGestores = [...new Set(scans.map(s => s.gestor).concat(Object.keys(VALID_USERS)))]; 

    select.innerHTML = '<option value="all">Todos</option>';
    uniqueGestores.sort().forEach(gestor => {
        if(gestor === "Desconhecido") return;
        const option = document.createElement('option');
        option.value = gestor;
        option.textContent = gestor;
        select.appendChild(option);
    });
}

function updateFilteredScans() {
    filteredScans = [...scans];
    
    if (currentFilters.gestor !== "all") {
        filteredScans = filteredScans.filter(s => s.gestor === currentFilters.gestor);
    }
    
    if (currentFilters.dateStart || currentFilters.dateEnd) {
        const start = currentFilters.dateStart ? new Date(currentFilters.dateStart) : null;
        const end = currentFilters.dateEnd ? new Date(currentFilters.dateEnd) : null;

        filteredScans = filteredScans.filter(s => {
            const parts = s.date.split(',')[0].trim().split('/');
            const scanDate = new Date(parts[2], parts[1] - 1, parts[0]);
            
            let isAfterStart = start ? scanDate >= start : true;
            let isBeforeEnd = end ? scanDate <= end : true;
            
            return isAfterStart && isBeforeEnd;
        });
    }

    renderDeliveriesList(filteredScans);
    if(document.getElementById("map").style.display === "block") updateMapMarkers(filteredScans);
    updateDeliveriesCount();
}

function renderDeliveriesList(listToRender = filteredScans) {
    if (!deliveriesList) return;
    
    if (listToRender.length === 0) {
        deliveriesList.innerHTML = "<p style='text-align:center;'>Nenhuma entrega encontrada.</p>";
    } else {
         deliveriesList.innerHTML = listToRender.map(s => 
            `<div style="padding: 10px 0; border-bottom: 1px solid #ddd;">
                <strong>${s.nome}</strong> - ID: ${s.id}<br>
                ${s.endereco}<br>
                <span style="font-size: 11px; color: #6c757d;">CEP: ${s.cep} | Tel: ${s.telefone} | Gestor: ${s.gestor} | ${s.date}</span>
            </div>`
        ).join("");
    }
}


// ======================// ROTA OTIMIZADA // ======================
function generateOptimizedRoute(){
    if(!map) return alert("Mapa não inicializado");
    if(routeLayer) map.removeLayer(routeLayer);

    const points=filteredScans.filter(s=>s.lat&&s.lng).map(s=>({lat:s.lat,lng:s.lng,nome:s.nome}));
    if(points.length<2) return alert("São necessários pelo menos 2 endereços com geolocalização.");

    // Algoritmo do Vizinho Mais Próximo (Heurística simples)
    let visited=[], route=[points[0]]; visited.push(0);
    while(route.length<points.length){
        const last=route[route.length-1]; let nearestIdx=-1, nearestDist=Infinity;
        points.forEach((p,i)=>{if(!visited.includes(i)){const dist=Math.hypot(last.lat-p.lat,last.lng-p.lng); if(dist<nearestDist){nearestDist=dist; nearestIdx=i;}}});
        route.push(points[nearestIdx]); visited.push(nearestIdx);
    }

    const latlngs=route.map(p=>[p.lat,p.lng]);
    routeLayer=L.polyline(latlngs,{color:'blue'}).addTo(map);
    map.fitBounds(routeLayer.getBounds());
    alert("Rota otimizada (Vizinho Mais Próximo) gerada no mapa.");
}


// ======================// EXPORTAÇÃO CSV POR PERÍODO // ======================
const exportBtn = document.getElementById("btnExport");
const exportMenu = document.getElementById("exportMenu");

exportBtn.onclick = () => {
    document.getElementById("filterOptions").style.display = "none";
    if (exportMenu) exportMenu.style.display = exportMenu.style.display === "flex" ? "none" : "flex";
};

document.querySelectorAll(".exportOption").forEach(btn => {
  btn.onclick = () => {
    if (exportMenu) exportMenu.style.display = "none";
    exportCSV(btn.dataset.period);
  };
});

function exportCSV(period){
  if(scans.length===0){ alert("Nenhum registro!"); return; }

  const now = new Date();
  let filtered = [...scans];
  let filename = "entregas_geral";

  const parseStoredDate = (s) => {
      const parts = s.date.split(',')[0].trim().split('/');
      return new Date(parts[2], parts[1] - 1, parts[0]);
  };

  if(period==="diario"){
    filtered=scans.filter(s=>parseStoredDate(s).toDateString()===now.toDateString());
    filename = "entregas_diario";
  } else if(period==="quinzenal"){
    const currentDayOfMonth = now.getDate();
    filtered=scans.filter(s=>{
      const d = parseStoredDate(s);
      const dDay = d.getDate();
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear() && 
             ((currentDayOfMonth >= 1 && currentDayOfMonth <= 15 && dDay >= 1 && dDay <= 15) || 
              (currentDayOfMonth > 15 && dDay > 15));
    });
    filename = "entregas_quinzenal";
  } else if(period==="mensal"){
    filtered=scans.filter(s=>{
      const d = parseStoredDate(s);
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    });
    filename = "entregas_mensal";
  }

  if(filtered.length===0){ alert(`Nenhum registro encontrado para o período ${period}.`); return; }

  let csv = "id,rawId,nome,endereco,cep,telefone,gestor,data,latitude,longitude\n" + 
            filtered.map(s => 
                `${s.id},${s.rawId},${s.nome},${s.endereco},${s.cep},${s.telefone},${s.gestor},${s.date},${s.lat || ''},${s.lng || ''}`
            ).join("\n");
            
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
