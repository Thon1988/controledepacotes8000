// PegazusLog v12 - app.js (corrigido + login funcionando + modo A)
// ===============================================================
// LOGIN SIMPLES
const VALID_USERS = {
    "thon": "882010",
    "manager1": "123"
};

document.getElementById("loginBtn").addEventListener("click", function () {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    const status = document.getElementById("feedbackMessage");

    if (VALID_USERS[username] === password) {
        status.textContent = "✔ Login realizado com sucesso!";
        status.style.color = "green";

        // Ativa a tela logada (modo A)
        document.body.classList.add("logged-in");
    } else {
        status.textContent = "❌ Usuário ou senha incorretos";
        status.style.color = "red";
    }
});

// ================================
// QR CODE SCANNER
// ================================
let video = document.getElementById("videoElement");
let overlay = document.getElementById("overlay");
let overlayCtx = overlay.getContext("2d");

let scanning = false;
let torchEnabled = false;
let currentStream = null;

// Ajustar canvas ao tamanho do vídeo
function adjustCanvas() {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
}

// Desenhar borda
e
function drawFrame(result) {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    if (!result) return;

    overlayCtx.strokeStyle = "lime";
    overlayCtx.lineWidth = 4;
    overlayCtx.strokeRect(result.location.topLeftCorner.x, result.location.topLeftCorner.y,
        result.location.bottomRightCorner.x - result.location.topLeftCorner.x,
        result.location.bottomRightCorner.y - result.location.topLeftCorner.y);
}

// Iniciar câmera
async function startScanner() {
    try {
        const constraints = {
            audio: false,
            video: {
                facingMode: "environment"
            }
        };

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

// Parar câmera
function stopScanner() {
    scanning = false;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
}

// Loop de varredura
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

// ================================
// REGISTRO DE LEITURAS
// ================================
let scans = JSON.parse(localStorage.getItem("pegazus_scans") || "[]");
let scansList = document.getElementById("scansList");

function saveScans() {
    localStorage.setItem("pegazus_scans", JSON.stringify(scans));
}

function renderScans() {
    scansList.innerHTML = scans.map(item => `
        <div class="item">
            <div><strong>${escapeHtml(item.code)}</strong></div>
            <div class="meta">${item.date}</div>
        </div>
    `).join("");
}

function registerScan(data) {
    const date = new Date().toLocaleString();

    scans.unshift({ code: data, date: date });
    saveScans();
    renderScans();

    document.getElementById("output").textContent = "Último: " + data;
}

// ================================
// FERRAMENTAS
// ================================
function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function beep() {
    const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
    audio.play();
}

// ================================
// BOTÕES
// ================================
document.getElementById("startButton").onclick = startScanner;
document.getElementById("stopButton").onclick = stopScanner;
document.getElementById("clearBtn").onclick = () => {
    if (confirm("Limpar todos os registros?")) {
        scans = [];
        saveScans();
        renderScans();
    }
};

document.getElementById("exportBtn").onclick = () => {
    let csv = "codigo,data\n" + scans.map(i => `${i.code},${i.date}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "registros.csv";
    a.click();
};

// Render inicial
renderScans();
