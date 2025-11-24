/* ============================================================
   PegazusLog — APP.JS COMPLETO
   Login • Scanner • Lista • CSV • Mapa • Botões • Storage
   ============================================================ */

/* ====== LOGIN SIMPLES LOCAL ====== */
const USERS = [
    { user: "thon", pass: "882010", role: "admin" }
];

let loggedUser = null;

/* ====== ELEMENTOS ====== */
const loginContainer = document.getElementById("loginContainer");
const sidebar = document.getElementById("sidebar");
const menuNav = document.getElementById("menuNav");
const userInfo = document.getElementById("userInfo");
const contentArea = document.getElementById("contentArea");
const cameraContainer = document.getElementById("cameraContainer");

const loginBtn = document.getElementById("loginBtn");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const feedbackMessage = document.getElementById("feedbackMessage");

const btnSair = document.getElementById("btnSair");

const btnCamera = document.getElementById("btnCamera");
const btnMapa = document.getElementById("btnMapa");
const btnEntregas = document.getElementById("btnEntregas");
const btnUsers = document.getElementById("btnUsers");
const btnGenerateCSV = document.getElementById("btnGenerateCSV");
const btnGerarRota = document.getElementById("btnGerarRota");

const qrFeedback = document.getElementById("qrFeedback");

const scansList = document.getElementById("scansList");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

const stopButton = document.getElementById("stopButton");
const torchButton = document.getElementById("torchButton");
const deviceSelect = document.getElementById("deviceSelect");

let scans = JSON.parse(localStorage.getItem("pegazus_scans") || "[]");

let stream = null;
let currentCameraId = null;
let torchOn = false;

/* ============================================================
   LOGIN
============================================================ */
loginBtn.onclick = () => {
    const u = loginUser.value.trim();
    const p = loginPass.value.trim();

    const found = USERS.find(x => x.user === u && x.pass === p);

    if (!found) {
        feedbackMessage.textContent = "Usuário ou senha incorretos";
        return;
    }

    loggedUser = found;

    loginContainer.style.display = "none";
    menuNav.style.display = "flex";
    userInfo.style.display = "block";
    userInfo.textContent = "Usuário: " + loggedUser.user;

    contentArea.style.display = "block";
};

/* ============================================================
   BOTÃO SAIR
============================================================ */
btnSair.onclick = () => {
    location.reload();
};

/* ============================================================
   FUNÇÃO PARA MOSTRAR FEEDBACK DE QR
============================================================ */
function showFeedback(msg, color="#00c853") {
    qrFeedback.textContent = msg;
    qrFeedback.style.background = color;
    qrFeedback.style.display = "block";
    setTimeout(()=> qrFeedback.style.display="none", 1200);
}

/* ============================================================
   LISTA DE SCANS
============================================================ */
function renderScans(){
    scansList.innerHTML = "";

    scans.forEach(item => {
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
            <div class="badge">${new Date(item.time).toLocaleString()}</div>
            <div>${item.code}</div>
        `;
        scansList.appendChild(div);
    });
}

renderScans();

/* LIMPAR SCANS */
clearBtn.onclick = () => {
    scans = [];
    localStorage.setItem("pegazus_scans", JSON.stringify(scans));
    renderScans();
};

/* EXPORTAR CSV */
exportBtn.onclick = () => {
    if (!scans.length) {
        alert("Nenhum registro para exportar.");
        return;
    }

    let csv = "data:text/csv;charset=utf-8,ID,Data/Hora\n";
    scans.forEach(s => {
        csv += `${s.code},${new Date(s.time).toLocaleString()}\n`;
    });

    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = "PegazusLog_scans.csv";
    link.click();
};

/* ============================================================
   CÂMERAS E SCANNER
============================================================ */
const video = document.getElementById("videoElement");
const overlay = document.getElementById("overlay");
let ctxOverlay = overlay.getContext("2d");

let scanning = false;

async function loadCameras(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    deviceSelect.innerHTML = "";
    cams.forEach(cam => {
        const opt = document.createElement("option");
        opt.value = cam.deviceId;
        opt.textContent = cam.label || "Câmera";
        deviceSelect.appendChild(opt);
    });

    if (!currentCameraId && cams.length) currentCameraId = cams[0].deviceId;
}

deviceSelect.onchange = () => {
    currentCameraId = deviceSelect.value;
    startScanner();
};

async function startScanner(){
    try {
        stopScanner();

        cameraContainer.style.display = "flex";
        contentArea.style.display = "none";

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: currentCameraId ? { exact: currentCameraId } : undefined,
                autofocus: true
            }
        });

        video.srcObject = stream;
        video.play();

        stopButton.style.display = "inline-block";
        torchButton.style.display = "inline-block";
        deviceSelect.style.display = "block";

        scanning = true;
        scanLoop();

    } catch (err) {
        console.error(err);
        alert("Erro ao acessar câmera.");
    }
}

function stopScanner(){
    scanning = false;
    stopButton.style.display = "none";
    torchButton.style.display = "none";
    deviceSelect.style.display = "none";

    if (stream){
        stream.getTracks().forEach(t => t.stop());
    }
}

stopButton.onclick = () => {
    stopScanner();
    cameraContainer.style.display = "none";
    contentArea.style.display = "block";
};

torchButton.onclick = () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;

    const capabilities = track.getCapabilities();
    if (!capabilities.torch) {
        alert("Flash não suportado");
        return;
    }

    torchOn = !torchOn;
    track.applyConstraints({ advanced: [{ torch: torchOn }]});
};

function scanLoop(){
    if (!scanning) return;

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    ctxOverlay.drawImage(video, 0, 0, overlay.width, overlay.height);
    const imgData = ctxOverlay.getImageData(0, 0, overlay.width, overlay.height);

    const code = jsQR(imgData.data, imgData.width, imgData.height);

    if (code){
        if (scans.find(s => s.code === code.data)) {
            showFeedback("Já escaneado!", "#b02a37");
        } else {
            scans.push({ code: code.data, time: Date.now() });
            localStorage.setItem("pegazus_scans", JSON.stringify(scans));
            renderScans();
            showFeedback("OK!", "#00c853");
        }
    }

    requestAnimationFrame(scanLoop);
}

/* ============================================================
   AÇÕES DO MENU
============================================================ */
btnCamera.onclick = async () => {
    await loadCameras();
    startScanner();
};

btnEntregas.onclick = () => {
    cameraContainer.style.display = "none";
    contentArea.style.display = "block";
    contentArea.innerHTML = "<h2>Entregas</h2><p>Em desenvolvimento…</p>";
};

btnUsers.onclick = () => {
    cameraContainer.style.display = "none";
    contentArea.style.display = "block";
    contentArea.innerHTML = "<h2>Usuários</h2><p>Gestão de usuários em desenvolvimento…</p>";
};

btnGerarRota.onclick = () => {
    cameraContainer.style.display = "none";
    contentArea.style.display = "block";
    contentArea.innerHTML = "<h2>Gerar Rota</h2><p>Função depende dos QR codes escaneados…</p>";
};

/* ============================================================
   MAPA (Leaflet)
============================================================ */
let map = null;

btnMapa.onclick = () => {
    cameraContainer.style.display = "none";
    contentArea.style.display = "block";

    contentArea.innerHTML = `<h2>Mapa</h2><div id="mapid" style="height:70vh;border-radius:10px"></div>`;

    if (!map) {
        map = L.map("mapid");

        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            map.setView([latitude, longitude], 16);

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
            L.marker([latitude, longitude]).addTo(map)
                .bindPopup("Você está aqui").openPopup();
        });
    }
};

