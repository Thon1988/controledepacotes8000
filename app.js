/* ===========================
   PegazusLog - app.js
   Versão estável — Opção A
   =========================== */

document.addEventListener("DOMContentLoaded", function () {

  /* -------------------------------
     ELEMENTOS
  --------------------------------*/
  const loginPage = document.getElementById("loginPage");
  const loginBtn  = document.getElementById("loginBtn");
  const loginUser = document.getElementById("loginUser");
  const loginPass = document.getElementById("loginPass");
  const loginError = document.getElementById("loginError");

  const appContainer = document.getElementById("appContainer");
  const sidebar      = document.getElementById("sidebar");
  const userInfo     = document.getElementById("userInfo");

  const contentArea = document.getElementById("contentArea");

  const cameraContainer = document.getElementById("cameraContainer");
  const video = document.getElementById("videoElement");
  const overlay = document.getElementById("overlay");
  const overlayCtx = overlay.getContext("2d");

  const deviceSelect = document.getElementById("deviceSelect");
  const stopButton = document.getElementById("stopButton");
  const torchButton = document.getElementById("torchButton");
  const scansList = document.getElementById("scansList");
  const qrFeedback = document.getElementById("qrFeedback");

  const btnCamera = document.getElementById("btnCamera");
  const btnEntregas = document.getElementById("btnEntregas");
  const btnMapa = document.getElementById("btnMapa");
  const btnUsers = document.getElementById("btnUsers");
  const btnGenerateCSV = document.getElementById("btnGenerateCSV");
  const btnGerarRota = document.getElementById("btnGerarRota");
  const btnSync = document.getElementById("btnSync");

  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearBtn");

  /* -------------------------------
     LOGIN — LOCAL OFFLINE
  --------------------------------*/
  const USERS_DB = [
    { username: "thon", password: "882010", role: "admin" }
  ];

  let currentUser = null;


  function doLogin() {
    const u = loginUser.value.trim();
    const p = loginPass.value.trim();

    const found = USERS_DB.find(x => x.username === u && x.password === p);

    if (!found) {
      loginError.textContent = "Usuário ou senha inválidos";
      return;
    }

    currentUser = found;

    loginError.textContent = "";
    loginPage.style.display = "none";
    appContainer.style.display = "grid";
    sidebar.style.display = "block";

    userInfo.textContent = "Usuário: " + currentUser.username;

    showHome();
  }


  loginBtn.addEventListener("click", doLogin);


  /* -------------------------------
     HOME
  --------------------------------*/
  function showHome() {
    stopScanner();
    contentArea.innerHTML = `
      <h2>Bem-vindo, ${currentUser.username}</h2>
      <p>Use o menu para acessar as funções.</p>
    `;
  }


  /* -------------------------------
     SCANNER
  --------------------------------*/

  let mediaStream = null;
  let scanning = false;
  let rafId = null;
  let tempCanvas = document.createElement("canvas");
  let tempCtx = tempCanvas.getContext("2d");

  async function startScanner() {

    stopScanner();

    cameraContainer.style.display = "flex";
    contentArea.style.display = "none";

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });

      video.srcObject = mediaStream;
      await video.play();

      scanning = true;
      fitCanvas();
      scanLoop();

    } catch (e) {
      alert("Erro ao acessar a câmera");
    }
  }


  function stopScanner() {
    scanning = false;
    if (rafId) cancelAnimationFrame(rafId);

    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }

    cameraContainer.style.display = "none";
    contentArea.style.display = "block";
  }


  function fitCanvas() {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    tempCanvas.width = 600;
    tempCanvas.height = 600;
  }


  function drawBox() {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    const pxPerCm = 96 / 2.54;
    const size = pxPerCm * 10;

    const scale = overlay.width / overlay.clientWidth;
    const box = size * scale;

    const x = (overlay.width - box) / 2;
    const y = (overlay.height - box) / 2;

    overlayCtx.strokeStyle = "rgba(255,255,255,0.5)";
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeRect(x, y, box, box);
  }


  function scanLoop() {
    if (!scanning) return;

    drawBox();

    try {
      tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
      let img = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

      let code = jsQR(img.data, img.width, img.height);

      if (code && code.data) {
        handleScan(code.data.trim());
      }
    } catch (e) {}

    rafId = requestAnimationFrame(scanLoop);
  }


  const scanData = [];

  function handleScan(text) {
    if (scanData.some(s => s.value === text)) {
      showFeedback("Já escaneado", false);
      return;
    }

    scanData.unshift({
      value: text,
      time: new Date().toLocaleString()
    });

    renderScans();
    showFeedback("OK");
  }


  function renderScans() {
    scansList.innerHTML = "";

    scanData.forEach(r => {
      let div = document.createElement("div");
      div.className = "small";
      div.style.padding = "6px";
      div.style.background = "rgba(255,255,255,0.05)";
      div.style.marginBottom = "6px";
      div.innerHTML = `<strong>${r.value}</strong><br><span>${r.time}</span>`;
      scansList.appendChild(div);
    });
  }


  function showFeedback(msg, ok = true) {
    qrFeedback.textContent = msg;
    qrFeedback.style.background = ok ? "#00b894" : "#d63031";
    qrFeedback.style.display = "block";

    setTimeout(() => {
      qrFeedback.style.display = "none";
    }, 1200);
  }


  /* -------------------------------
     EXPORTAR CSV
  --------------------------------*/
  function exportCSV() {
    if (scanData.length === 0) {
      alert("Nada para exportar.");
      return;
    }

    let csv = "valor,data\n";
    scanData.forEach(s => {
      csv += `"${s.value}","${s.time}"\n`;
    });

    let blob = new Blob([csv], { type: "text/csv" });
    let url = URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.href = url;
    a.download = "scans.csv";
    a.click();
  }


  /* -------------------------------
     MAPA
  --------------------------------*/
  function showMap() {
    stopScanner();

    contentArea.innerHTML = `
      <h2>📍 Mapa</h2>
      <div id="mapArea" style="height:60vh;border-radius:10px;margin-top:10px"></div>
    `;

    setTimeout(() => {
      const map = L.map("mapArea").setView([-23.55, -46.63], 12);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      map.locate({ setView: true, maxZoom: 16 });

      map.on("locationfound", e => {
        L.marker(e.latlng).addTo(map).bindPopup("Você está aqui").openPopup();
      });

    }, 300);
  }


  /* -------------------------------
     USUÁRIOS
  --------------------------------*/
  function showUsers() {
    stopScanner();

    contentArea.innerHTML = `
      <h2>👥 Usuários</h2>
      <ul>
        ${USERS_DB.map(u => `<li><strong>${u.username}</strong> (${u.role})</li>`).join("")}
      </ul>
    `;
  }


  /* -------------------------------
     ROTAS
  --------------------------------*/
  function showRota() {
    stopScanner();

    contentArea.innerHTML = `
      <h2>🗺️ Gerar Rota</h2>
      <p>Disponível após scanner real.</p>
    `;
  }


  /* -------------------------------
     SINCRONIZAÇÃO MOCK
  --------------------------------*/
  function syncMock() {
    showFeedback("Sincronizado ✓");
  }


  /* -------------------------------
     EVENTOS DO MENU
  --------------------------------*/
  btnCamera.onclick = startScanner;
  btnEntregas.onclick = () => {
    stopScanner();
    renderScans();
    contentArea.innerHTML = `
      <h2>📦 Entregas</h2>
      <p>Total: ${scanData.length}</p>
    `;
  };
  btnMapa.onclick = showMap;
  btnUsers.onclick = showUsers;
  btnGenerateCSV.onclick = exportCSV;
  btnGerarRota.onclick = showRota;
  btnSync.onclick = syncMock;

  exportBtn.onclick = exportCSV;
  clearBtn.onclick = () => {
    scanData.length = 0;
    renderScans();
  };

});
