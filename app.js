// ========================================
// PegazusLog v0.1 - app.js
// ========================================

// Usuários válidos com níveis
const USERS = {
    "thon": { pass: "882010", level: "admin" },
    "manager1": { pass: "123", level: "gestor" },
    "colab1": { pass: "456", level: "colaborador" }
};

// Elementos HTML
const loginBtn = document.getElementById("loginBtn");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const feedbackMessage = document.getElementById("feedbackMessage");

const sidebar = document.getElementById("sidebar");
const btnAddUser = document.getElementById("btnAddUser");
const btnAllCSV = document.getElementById("btnAllCSV");
const btnAddColab = document.getElementById("btnAddColab");
const btnGestorCSV = document.getElementById("btnGestorCSV");
const btnStartScanner = document.getElementById("btnStartScanner");
const btnMap = document.getElementById("btnMap");
const btnRoute = document.getElementById("btnRoute");
const btnSearchQR = document.getElementById("btnSearchQR");
const btnFilterDate = document.getElementById("btnFilterDate");

const video = document.getElementById("videoElement");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");
const scansList = document.getElementById("scansList");

// Estado
let currentUser = null;
let scanning = false;
let currentStream = null;
let scans = JSON.parse(localStorage.getItem("pegazus_scans") || "[]");

// ================================
// LOGIN
// ================================
loginBtn.addEventListener("click", () => {
    const username = loginUser.value.trim();
    const password = loginPass.value.trim();

    if (USERS[username] && USERS[username].pass === password) {
        feedbackMessage.textContent = "✔ Login realizado com sucesso!";
        feedbackMessage.style.color = "green";

        currentUser = { name: username, level: USERS[username].level };
        document.body.classList.add("logged-in");
        renderMenu();
        renderScans();
    } else {
        feedbackMessage.textContent = "❌ Usuário ou senha incorretos";
        feedbackMessage.style.color = "red";
    }
});

function logout() {
    document.body.classList.remove("logged-in");
    currentUser = null;
    video.pause();
    if(currentStream) currentStream.getTracks().forEach(t => t.stop());
}

// ================================
// MENU DINÂMICO
// ================================
function renderMenu() {
    btnAddUser.style.display = currentUser.level === "admin" ? "block" : "none";
    btnAllCSV.style.display = currentUser.level === "admin" ? "block" : "none";
    btnAddColab.style.display = currentUser.level === "gestor" || currentUser.level === "admin" ? "block" : "none";
    btnGestorCSV.style.display = currentUser.level === "gestor" ? "block" : "none";
    btnStartScanner.style.display = currentUser.level === "colaborador" || currentUser.level === "gestor" || currentUser.level === "admin" ? "block" : "none";
}

// ================================
// SCANNER QR CODE
// ================================
function adjustCanvas() {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
}

function drawFrame(result) {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (!result) return;
    overlayCtx.strokeStyle = "lime";
    overlayCtx.lineWidth = 4;
    overlayCtx.strokeRect(result.location.topLeftCorner.x, result.location.topLeftCorner.y,
        result.location.bottomRightCorner.x - result.location.topLeftCorner.x,
        result.location.bottomRightCorner.y - result.location.topLeftCorner.y);
}

async function startScanner() {
    try {
        const constraints = { audio: false, video: { facingMode: "environment" } };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;

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

function stopScanner() {
    scanning = false;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (currentStream) currentStream.getTracks().forEach(track => track.stop());
}

function beep() {
    const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
    audio.play();
}

function scanLoop() {
    if (!scanning) return;
    overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
    const imageData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
        drawFrame(code);

        // Bloquear duplicados
        if (scans.find(s => s.qrcode === code.data)) {
            feedbackMessage.textContent = "⚠ QR Code já escaneado!";
            feedbackMessage.style.color = "orange";
        } else {
            registerScan(code.data);
            beep();
        }
    }

    requestAnimationFrame(scanLoop);
}

// ================================
// REGISTRO DE SCANS
// ================================
function registerScan(data) {
    const date = new Date().toLocaleString();
    scans.unshift({ qrcode: data, date: date, user: currentUser.name });
    localStorage.setItem("pegazus_scans", JSON.stringify(scans));
    renderScans();
}

function renderScans(filtered = scans) {
    if (filtered.length === 0) {
        scansList.innerHTML = "0 entregas registradas.";
        return;
    }
    scansList.innerHTML = filtered.map(s => `
        <div class="item">
            <strong>${escapeHtml(s.qrcode)}</strong>
            <small>${s.date} - ${s.user}</small>
        </div>
    `).join("");
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ================================
// CSV
// ================================
function exportCSV() {
    const csv = "qrcode,date,user\n" + scans.map(s => `${s.qrcode},${s.date},${s.user}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "registros.csv";
    a.click();
}

// ================================
// BOTÕES
// ================================
btnStartScanner.onclick = startScanner;
btnAllCSV.onclick = exportCSV;
btnGestorCSV.onclick = exportCSV;

// ================================
// FILTRO POR DATA
// ================================
btnFilterDate.onclick = () => {
    const start = prompt("Data inicial (YYYY-MM-DD):");
    const end = prompt("Data final (YYYY-MM-DD):");
    if (!start || !end) return;
    const filtered = scans.filter(s => {
        const d = new Date(s.date);
        return d >= new Date(start) && d <= new Date(end);
    });
    renderScans(filtered);
};

// ================================
// PESQUISA QR CODE
// ================================
btnSearchQR.onclick = () => {
    const qrcode = prompt("Digite o QR Code:");
    if (!qrcode) return;
    const result = scans.filter(s => s.qrcode.includes(qrcode));
    renderScans(result);
};

// ================================
// MAPA & ROTA (abrir Google Maps/Waze)
// ================================
btnMap.onclick = () => {
    if(scans.length === 0) { alert("Nenhum QR Code registrado"); return; }
    const addresses = scans.map(s => encodeURIComponent(s.qrcode));
    const url = "https://www.google.com/maps/dir/" + addresses.join("/");
    window.open(url, "_blank");
};

btnRoute.onclick = () => {
    alert("Função de rota otimizada ainda não implementada. Apenas exporte o CSV e use seu app de mapa favorito.");
};
