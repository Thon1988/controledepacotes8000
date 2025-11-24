// app.js - PegazusLog Scanner (Opção A)
// Requisitos: jsQR (index.html) e Leaflet (index.html)
// Uso: incluir após o index.html (defer está ok)

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Config e estado ---------- */
  const STORAGE_USERS_KEY = 'pegazus_users_v3';
  const STORAGE_SCANS_KEY = 'pegazus_scans_v3';

  const DEFAULT_USERS = [
    { id: 'u1', username: 'thon', password: '882010', role: 'admin' }
  ];

  function loadUsersFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_USERS_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS));
        return JSON.parse(JSON.stringify(DEFAULT_USERS));
      }
      const parsed = JSON.parse(raw);
      if (!parsed.some(u => u.username === 'thon')) {
        parsed.unshift(DEFAULT_USERS[0]);
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return JSON.parse(JSON.stringify(DEFAULT_USERS));
    }
  }

  let users = loadUsersFromStorage();
  function saveUsers() {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  }

  let scanRecords = JSON.parse(localStorage.getItem(STORAGE_SCANS_KEY) || '[]');
  function saveRecords() {
    localStorage.setItem(STORAGE_SCANS_KEY, JSON.stringify(scanRecords));
  }

  let currentUser = null;
  const CD_LOCATION = { lat: -23.5505, lon: -46.6333 };

  /* ---------- DOM ---------- */
  const sidebar = document.getElementById('sidebar');
  const userInfoDiv = document.getElementById('userInfo');
  const loginContainer = document.getElementById('loginContainer');
  const loginUser = document.getElementById('loginUser');
  const loginPass = document.getElementById('loginPass');
  const feedbackMessage = document.getElementById('feedbackMessage');
  const btnLogin = document.getElementById('loginBtn');
  const btnSair = document.getElementById('btnSair');

  const btnCamera = document.getElementById('btnCamera');
  const btnEntregas = document.getElementById('btnEntregas');
  const btnMapa = document.getElementById('btnMapa');
  const btnGerarRota = document.getElementById('btnGerarRota');
  const btnUsers = document.getElementById('btnUsers');
  const btnGenerateCSV = document.getElementById('btnGenerateCSV');

  const contentArea = document.getElementById('contentArea');

  const video = document.getElementById('videoElement');
  const overlay = document.getElementById('overlay');
  const cameraContainer = document.getElementById('cameraContainer');
  const overlayCtx = overlay.getContext('2d');

  const torchButton = document.getElementById('torchButton');
  const stopButton = document.getElementById('stopButton');
  const deviceSelect = document.getElementById('deviceSelect');

  const scansList = document.getElementById('scansList');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');

  const qrFeedback = document.getElementById('qrFeedback');

  /* ---------- SCANNER ---------- */
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  let mediaStream = null;
  let currentVideoTrack = null;
  let scanning = false;
  let rafId = null;
  let lastScan = 0;

  const SCAN_INTERVAL = 650;
  const DUP_WINDOW = 60000;

  function showFeedback(text, ok = true, ms = 1500) {
    qrFeedback.style.display = 'block';
    qrFeedback.textContent = text;
    qrFeedback.style.background = ok ? '#00c853' : '#c62828';
    setTimeout(() => qrFeedback.style.display = 'none', ms);
  }

  function beep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1300;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 90);
  }

  function drawCenterBox() {
    const w = overlay.width;
    const h = overlay.height;

    const box = Math.min(w, h) * 0.35; // 10cm equivalente visual

    const x = (w - box) / 2;
    const y = (h - box) / 2;

    overlayCtx.clearRect(0, 0, w, h);
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.30)';
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeRect(x, y, box, box);
  }

  async function startScanner() {
    if (scanning) return;

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });

      video.srcObject = mediaStream;
      await video.play();

      currentVideoTrack = mediaStream.getVideoTracks()[0];

      scanning = true;
      cameraContainer.style.display = 'flex';
      stopButton.style.display = 'inline-block';

      fitCanvas();
      rafId = requestAnimationFrame(scanLoop);

    } catch (err) {
      console.error(err);
      alert("Não foi possível acessar a câmera");
    }
  }

  function stopScanner() {
    scanning = false;

    if (rafId) cancelAnimationFrame(rafId);

    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }

    cameraContainer.style.display = 'none';
    stopButton.style.display = 'none';

    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function fitCanvas() {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;

    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    drawCenterBox();
  }

  function scanLoop() {
    if (!scanning) return;

    if (video.readyState >= 2) {
      tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
      const img = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });

      if (code && code.data) {
        const now = Date.now();
        if (now - lastScan > SCAN_INTERVAL) {
          lastScan = now;
          handleScan(code.data.trim());
        }
      }
    }

    rafId = requestAnimationFrame(scanLoop);
  }

  /* -------- REGISTROS -------- */

  function escapeHtml(s) {
    return ('' + s).replace(/[&<>"]/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
  }

  function renderScans() {
    scansList.innerHTML = '';

    if (scanRecords.length === 0) {
      scansList.innerHTML = '<div class="small">Nenhum registro.</div>';
      return;
    }

    scanRecords.forEach(r => {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div><strong>${escapeHtml(r.idEntrega)}</strong></div>
        <div class="small">${escapeHtml(r.datetime)}</div>
      `;
      scansList.appendChild(div);
    });
  }

  function handleScan(raw) {
    if (scanRecords.some(r => r.raw === raw && Date.now() - r.timestamp < DUP_WINDOW)) {
      showFeedback("Já escaneado recentemente", false);
      return;
    }

    const record = {
      idEntrega: raw,
      raw: raw,
      datetime: new Date().toLocaleString(),
      usuario: currentUser.username,
      timestamp: Date.now(),
      lat: CD_LOCATION.lat + (Math.random() - 0.5) * 0.04,
      lon: CD_LOCATION.lon + (Math.random() - 0.5) * 0.04
    };

    scanRecords.unshift(record);
    saveRecords();
    renderScans();

    beep();
    showFeedback("Leitura OK");
    navigator.vibrate?.(80);
  }

  /* ---------- CSV ---------- */
  function generateCSV() {
    if (!scanRecords.length) {
      alert("Nenhum registro");
      return;
    }

    let csv = "ID,Data,Usuário,Lat,Lon\n";
    scanRecords.forEach(r => {
      csv += `${r.idEntrega},${r.datetime},${r.usuario},${r.lat},${r.lon}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = "relatorio.csv";
    a.click();
  }

  /* ---------- TELAS ---------- */
  function showEntregaList() {
    contentArea.style.display = 'block';

    if (!scanRecords.length) {
      contentArea.innerHTML = "<h2>Nenhuma entrega</h2>";
      return;
    }

    let html = "<h2>Entregas</h2><ul>";
    scanRecords.forEach(r => {
      html += `<li><strong>${escapeHtml(r.idEntrega)}</strong> — ${escapeHtml(r.datetime)}</li>`;
    });
    html += "</ul>";

    contentArea.innerHTML = html;
  }

  function showMap() {
    contentArea.style.display = 'block';

    contentArea.innerHTML = `
      <h2>Mapa</h2>
      <div id="map" style="height:60vh;border-radius:12px"></div>
    `;

    setTimeout(() => {
      const map = L.map("map").setView([CD_LOCATION.lat, CD_LOCATION.lon], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      scanRecords.forEach(r => {
        L.marker([r.lat, r.lon]).addTo(map).bindPopup(r.idEntrega);
      });
    }, 100);
  }

  function showUsers() {
    if (currentUser.role !== 'admin') {
      contentArea.innerHTML = "<h2>Acesso negado</h2>";
      return;
    }

    let html = "<h2>Usuários</h2><ul>";
    users.forEach(u => {
      html += `<li>${u.username} (${u.role})</li>`;
    });
    html += "</ul>";
    contentArea.innerHTML = html;
  }

  /* ---------- LOGIN ---------- */
  function doLogin() {
    const u = loginUser.value.trim();
    const p = loginPass.value;

    const match = users.find(x => x.username === u && x.password === p);

    if (!match) {
      feedbackMessage.textContent = "Usuário ou senha inválidos";
      return;
    }

    currentUser = match;

    loginContainer.style.display = 'none';
    sidebar.style.display = 'block';
    contentArea.style.display = 'block';

    userInfoDiv.innerHTML = `
      Usuário: <strong>${match.username}</strong><br>
      Perfil: <strong>${match.role}</strong>
    `;

    showEntregaList();
  }

  btnLogin.addEventListener("click", doLogin);

  btnSair.addEventListener("click", () => {
    currentUser = null;
    sidebar.style.display = 'none';
    contentArea.style.display = 'none';
    loginContainer.style.display = 'block';
    stopScanner();
  });

  /* ---------- MENU ---------- */
  btnCamera.addEventListener("click", () => {
    contentArea.style.display = 'none';
    startScanner();
  });

  btnEntregas.addEventListener("click", () => {
    stopScanner();
    showEntregaList();
  });

  btnMapa.addEventListener("click", () => {
    stopScanner();
    showMap();
  });

  btnUsers.addEventListener("click", () => {
    stopScanner();
    showUsers();
  });

  btnGenerateCSV.addEventListener("click", () => {
    generateCSV();
  });

  btnGerarRota.addEventListener("click", () => {
    alert("Função de rota será adicionada posteriormente");
  });

  stopButton.addEventListener("click", () => stopScanner());

  exportBtn.addEventListener("click", () => generateCSV());
  clearBtn.addEventListener("click", () => {
    if (confirm("Limpar registros?")) {
      scanRecords = [];
      saveRecords();
      renderScans();
      showEntregaList();
    }
  });

  /* Inicial */
  sidebar.style.display = 'none';
  contentArea.style.display = 'none';
  renderScans();
});
