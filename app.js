// app.js — PegazusLog v0.4 (BETA) | Câmera Principal e Scanner Quadrado

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
const deliveriesList = document.getElementById("deliveriesList");
const sidebar = document.getElementById("sidebar");
const camSelect = document.getElementById("cameraSelect");
let overlayCtx = overlay ? overlay.getContext("2d") : null;

// Geração de ID simples
const generateId = () => Math.random().toString(36).substring(2, 9);

function beep() {
    try {
        // Gera um som simples para confirmação de leitura
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
    stopScanner(); 

    // Oculta a linha scanner por padrão
    const scanLine = document.getElementById("scanLine");
    if(scanLine) scanLine.style.display = "none";

    // Prepara a sidebar e o botão Voltar
    sidebar.style.display = "flex";
    const voltarBtn = document.getElementById("btnVoltarCamera");
    if (voltarBtn) {
        voltarBtn.style.display = "none";
    }
    document.getElementById("exportMenu").style.display = "none";


    switch (viewId) {
        case 'list':
            document.getElementById("deliveriesList").style.display = "block";
            // Reposiciona o view-container ao lado da sidebar (padrão)
            document.querySelector(".view-container").style.left = "220px";
            updateFilteredScans(); 
            break;
        case 'map':
            document.getElementById("map").style.display = "block";
            document.querySelector(".view-container").style.left = "220px";
            if (map) map.invalidateSize(); 
            break;
        case 'camera':
            sidebar.style.display = "none"; // Esconde a sidebar
            document.querySelector(".view-container").style.left = "0"; // View-container ocupa toda a largura
            
            if (voltarBtn) {
                voltarBtn.style.display = "block"; // Torna o botão Voltar visível
            }
            
            document.getElementById("cameraContainer").style.display = "flex";
            if(scanLine) scanLine.style.display = "block"; // Mostra a linha scanner
            
            startScanner(); // Inicia a câmera automaticamente
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
    
    // Cria e configura o botão "Voltar" (FIXO NA PARTE INFERIOR CENTRALIZADA)
    const voltarBtn = document.createElement('button');
    voltarBtn.id = "btnVoltarCamera";
    voltarBtn.textContent = "🔙 Voltar ao Início"; 
    
    // CSS para posicionar no rodapé e centralizar horizontalmente
    voltarBtn.style.cssText = `
        position: fixed; 
        bottom: 10px; 
        left: 50%; 
        transform: translateX(-50%); 
        z-index: 1000; 
        display: none; 
        padding: 10px; 
        border: none; 
        border-radius: 6px; 
        cursor: pointer; 
        background: #dc3545; 
        color: white; 
        font-weight: bold; 
        width: 180px;
    `;
    voltarBtn.onclick = () => showView('list');
    document.getElementById("app").appendChild(voltarBtn);

    showView('list'); 
    
    initMenuEvents();
    populateGestorFilter(); 
}

function initMenuEvents() {
    document.getElementById("btnMap").onclick = () => { showView('map'); };
    document.getElementById("btnDeliveries").onclick = () => { showView('list'); };
    document.getElementById("btnRoute").onclick = generateOptimizedRoute;
    document.getElementById("btnCamera").onclick = () => showView('camera');

    // Evento para o Calendário Interativo
    document.getElementById("applyFilters").onclick = () => {
        currentFilters.gestor = document.getElementById("filterGestor").value;
        currentFilters.dateStart = document.getElementById("filterDateStart").value;
        currentFilters.dateEnd = document.getElementById("filterDateEnd").value;
        updateFilteredScans();
    };
    
    // Eventos de Exportação
    const exportBtn = document.getElementById("btnExport");
    const exportMenu = document.getElementById("exportMenu");

    exportBtn.onclick = () => {
        if (exportMenu) exportMenu.style.display = exportMenu.style.display === "flex" ? "none" : "flex";
    };

    document.querySelectorAll(".exportOption").forEach(btn => {
      btn.onclick = () => {
        if (exportMenu) exportMenu.style.display = "none";
        exportCSV(btn.dataset.period);
      };
    });
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

// ======================// SCANNER AVANÇADO (Câmera Robusta) // ======================

async function startScanner(deviceId) {
    try {
        if (!video || !overlayCtx) throw new Error("Elementos do scanner não encontrados.");
        if(currentStream) stopScanner();

        let constraints;
        let successful = false;

        // TENTATIVA 1: Prioriza a câmera traseira padrão ("environment")
        if (!deviceId) {
             constraints = { video: { facingMode: { exact: "environment" } } };
             try {
                 currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                 successful = true;
             } catch (e) {
                 console.warn("Falha 1 (environment). Tentando TENTATIVA 2 (principal).", e);
             }
        }
        
        // TENTATIVA 2: Busca pela câmera principal (resolução alta) - NOVO
        if (!successful && !deviceId) {
            // Tenta forçar alta resolução (pelo menos 720p), geralmente associada à lente principal.
            constraints = { video: { 
                width: { min: 1280 }, 
                height: { min: 720 }, 
                facingMode: { exact: "environment" }
            }};
            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                successful = true;
            } catch (e) {
                console.warn("Falha 2 (resolução alta). Tentando TENTATIVA 3 (frontal).", e);
            }
        }
        
        // TENTATIVA 3: Fallback para a câmera frontal ('user')
        if (!successful && !deviceId) {
            constraints = { video: { facingMode: { exact: "user" } } };
            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                successful = true;
            } catch (e) {
                console.warn("Falha 3 (user). Recorrendo ao seletor manual. Erro:", e);
            }
        }
        
        // TENTATIVA ESPECÍFICA (via seletor manual)
        if (deviceId) {
             constraints = { video: { deviceId: { exact: deviceId } } };
             currentStream = await navigator.mediaDevices.getUserMedia(constraints);
             successful = true;
        }


        if (successful) {
            video.srcObject = currentStream;
            await video.play();
            scanning = true;
            video.onloadedmetadata = () => { 
                overlay.width = video.videoWidth; 
                overlay.height = video.videoHeight; 
                scanLoop(); 
            };
            camSelect.style.display = "none";
            return; // Sucesso
        }
        
        // 4. ÚLTIMO RECURSO: Mostra o seletor manual
        await showCameraSelector();


    } catch (e) {
        console.error("Erro fatal na inicialização da câmera:", e);
        await showCameraSelector();
    }
}

async function showCameraSelector() {
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

        if (videoDevices.length > 0) {
            camSelect.style.display = "block"; 
        } else {
             alert("Nenhuma câmera detectada.");
             showView('list');
        }

    } catch (e) {
        alert("Erro fatal ao listar câmeras: " + e.message);
        showView('list');
    }
}

camSelect.onchange = (e) => {
    const deviceId = e.target.value;
    if (deviceId) {
        startScanner(deviceId); // Chama startScanner com o ID escolhido
    }
};

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
    
    // Esconde a linha scanner
    const scanLine = document.getElementById("scanLine");
    if(scanLine) scanLine.style.display = "none";
}

function scanLoop() {
    if (!scanning || !video || !overlayCtx) return;
    
    // Desenha o vídeo no canvas para processamento
    overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
    const imgData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height);
    
    if (code) {
        // Desenha o retângulo de detecção do QR Code
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
        // Usa Nominatim (OpenStreetMap) para geocodificação
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
        // Busca a chave seguida por dois pontos e captura tudo até uma nova linha
        const match = data.match(new RegExp(`${key}:([^\n]*)`, 'i'));
        return match ? match[1].trim() : "";
    };

    let nome = regex("NOME");
    let endereco = regex("ENDEREÇO");
    let cep = regex("CEP");
    let telefone = regex("TELEFONE");
    
    // Fallback: Se não encontrar NOME ou ENDEREÇO por regex, 
    // usa os primeiros caracteres do rawId como nome/ID de rastreamento.
    if (!nome && !endereco) { 
        nome = `ID: ${data.substring(0, 20).trim()}`;
    }


    const scanObj = {
        id: generateId(), 
        rawId: data, // IMPORTANTE: Salva o código completo para relatório!
        nome: nome || "ID/Desconhecido", 
        endereco: endereco || "",
        cep: cep || "",
        telefone: telefone || "",
        gestor: currentUser ? currentUser.username : "Desconhecido",
        date: new Date().toLocaleString('pt-BR')
    };
    
    // Tenta obter coordenadas geográficas
    await geocodeAddress(scanObj);

    // Salva o novo registro
    scans.unshift(scanObj);
    localStorage.setItem("pegazus_scans", JSON.stringify(scans));
    
    stopScanner();
    // Confirmação para o usuário
    alert(`✅ QR Code Registrado!\nComprador: ${scanObj.nome}\nEndereço: ${scanObj.endereco || 'Não Encontrado'}`); 
    
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

// Função auxiliar para parsear a data do formato "DD/MM/YYYY" para Date object
function parseStoredDate(s) {
    // Assume que a data está no formato "DD/MM/YYYY, HH:MM:SS"
    const parts = s.date.split(',')[0].trim().split('/');
    // Cria a data no formato YYYY, MM-1, DD
    return new Date(parts[2], parts[1] - 1, parts[0]); 
}

function updateFilteredScans() {
    filteredScans = [...scans];
    
    if (currentFilters.gestor !== "all") {
        filteredScans = filteredScans.filter(s => s.gestor === currentFilters.gestor);
    }
    
    if (currentFilters.dateStart || currentFilters.dateEnd) {
        // Criamos as datas de corte no fuso horário local, ignorando o tempo, para comparação apenas da data.
        const start = currentFilters.dateStart ? new Date(currentFilters.dateStart + 'T00:00:00') : null;
        const end = currentFilters.dateEnd ? new Date(currentFilters.dateEnd + 'T23:59:59') : null;

        filteredScans = filteredScans.filter(s => {
            const scanDate = parseStoredDate(s);
            
            // Compara apenas a data (dia, mês e ano)
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

    // Implementação simplificada do Algoritmo do Vizinho Mais Próximo
    let visited=[], route=[points[0]]; visited.push(0);
    while(route.length<points.length){
        const last=route[route.length-1]; let nearestIdx=-1, nearestDist=Infinity;
        points.forEach((p,i)=>{
            if(!visited.includes(i)){
                // Calcula distância euclidiana (aproximação)
                const dist=Math.hypot(last.lat-p.lat,last.lng-p.lng); 
                if(dist<nearestDist){ 
                    nearestDist=dist; 
                    nearestIdx=i;
                }
            }
        });
        if(nearestIdx !== -1) {
            route.push(points[nearestIdx]); 
            visited.push(nearestIdx);
        } else {
            // Caso de erro, ou se todos foram visitados
            break; 
        }
    }

    const latlngs=route.map(p=>[p.lat,p.lng]);
    routeLayer=L.polyline(latlngs,{color:'blue'}).addTo(map);
    map.fitBounds(routeLayer.getBounds());
    alert("Rota otimizada (Vizinho Mais Próximo) gerada no mapa.");
}


// ======================// EXPORTAÇÃO CSV POR PERÍODO // ======================

function exportCSV(period){
  if(scans.length===0){ alert("Nenhum registro!"); return; }

  const now = new new Date();
  let filtered = [...scans];
  let filename = "entregas_geral";

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
  
  // CSV HEADER: rawId (código completo) incluído
  const csvHeader = "id,rawId,nome,endereco,cep,telefone,gestor,data,latitude,longitude\n";
  
  // Mapeia os dados, garantindo que o rawId (código completo) e outros campos com vírgulas/aspas sejam tratados corretamente
  const csvData = filtered.map(s => {
      // Função para envolver o campo em aspas e duplicar aspas internas (padrão CSV)
      const escapeCsv = (data) => `"${String(data || '').replace(/"/g, '""')}"`;

      return `${s.id},${escapeCsv(s.rawId)},${escapeCsv(s.nome)},${escapeCsv(s.endereco)},${escapeCsv(s.cep)},${escapeCsv(s.telefone)},${escapeCsv(s.gestor)},${escapeCsv(s.date)},${s.lat || ''},${s.lng || ''}`;
  }).join("\n");
            
  // Adiciona BOM (Byte Order Mark) para garantir que caracteres especiais sejam lidos corretamente
  const bom = "\uFEFF"; 
  const csv = csvHeader + csvData;
  const blob = new Blob([bom + csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
