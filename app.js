// =========================================================
// Pegazus Scanner v12 - app.js  (VERSÃO CORRIGIDA + LOGIN OK)
// =========================================================

// -----------------------------
// LOGIN
// -----------------------------

const VALID_USERS = {
    "thon": "882010",
    "manager1": "123"
};

document.getElementById("loginBtn").addEventListener("click", function () {

    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    const status = document.getElementById("loginStatus");

    if (VALID_USERS[username] === password) {
        status.textContent = "✔ Login realizado com sucesso!";
        status.style.color = "green";

        // ativa layout logado
        document.body.classList.add("logged-in");

        // limpa campos
        document.getElementById("loginUser").value = "";
        document.getElementById("loginPass").value = "";

    } else {
        status.textContent = "❌ Usuário ou senha incorretos";
        status.style.color = "red";
    }
});


// =========================================================
// SCANNER
// =========================================================

let video = document.getElementById("videoElement");
let overlay = document.getElementById("overlay");
let overlayCtx = overlay.getContext("2d");

let scanning = false;
let currentStream = null;

// Ajusta o canvas ao tamanho do vídeo
function adjustCanvas() {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
}

// Desenha borda verde no QR detectado
function drawFrame(result) {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    if (!result) return;

    overlayCtx.strokeStyle = "lime";
    overlayCtx.lineWidth = 4;

    const tl = result.location.topLeftCorner;
    const br = result.location.bottomRightCorner;

    overlayCtx.strokeRect(
        tl.x,
        tl.y,
        br.x - tl.x,
        br.y - tl.y
    );
}

// Inicia a câmera
async function startScanner() {
    try {
        const constraints = {
            audio: false,
            video: { facingMode: "environment" }
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

// Para a câmera
function stopScanner() {
    scanning = false;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
    }
}


// Loop de detecção
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


// =========================================================
// REGISTROS
// =========================================================

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
    const timestamp = new Date().toLocaleString();

    scans.unshift({ code: data, date: timestamp });

    saveScans();
    renderScans();

    document.getElementById("output").textContent = "Último: " + data;
}


// =========================================================
// FERRAMENTAS
// =========================================================

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function beep() {
    const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
    audio.play();
}


// =========================================================
// BOTÕES
// =========================================================

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
    let csv = "codigo,data\n" +
        scans.map(i => `${i.code},${i.date}`).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "registros.csv";
    a.click();
};


// Render inicial
renderScans();
