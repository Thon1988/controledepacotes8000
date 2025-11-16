// app.js atualizado

// === ESTADO GLOBAL ===
let logged = false;
let cameraStream = null;
let scanning = false;
let deliveries = []; // armazenará objetos: { id, nome, endereco, cep, telefone, data }

// === LOGIN ===
const loginBtn = document.getElementById("loginBtn");
loginBtn.onclick = () => {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();

  if (user === "admin" && pass === "123") {
    document.body.classList.add("logged-in");
    logged = true;
  } else {
    document.getElementById("feedbackMessage").innerText = "Credenciais inválidas";
  }
};

function logout() {
  document.body.classList.remove("logged-in");
  logged = false;
}

// === MENU LATERAL ===
const menuBtn = document.getElementById("menuBtn");
menuBtn.style.display = "none"; // escondido no login = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
menuBtn.onclick = () => {
  if (!logged) return;
  sidebar.classList.toggle("open");
};

// === CAMERA E QR CODE ===
const video = document.getElementById("videoElement");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

function abrirCamera() {
  if (scanning) return;
  startScanner();
}

async function startScanner() {
  scanning = true;
  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = cameraStream;
    tick();
  } catch (e) {
    alert("Erro ao acessar a câmera");
  }
}

function stopScanner() {
  scanning = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
  }
}

function tick() {
  if (!scanning) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height);

    if (code) {
      processQRCode(code.data);
      stopScanner();
    }
  }
  requestAnimationFrame(tick);
}

function processQRCode(text) {
  // === BEEP ===
  const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
  audio.play();

  const parsed = parseQRCode(text);
  if (!parsed) return alert("Formato inválido do QR Code");

  // === BLOQUEAR QR DUPLICADO ===
  const exists = deliveries.some(d => d.nome === parsed.nome && d.endereco === parsed.endereco && d.cep === parsed.cep && d.telefone === parsed.telefone);
  if (exists) {
    alert("⚠️ Este QR Code já foi escaneado!");
    return;
  }

  deliveries.push(parsed);
  atualizarListaEntregas();
}(text) {
  const parsed = parseQRCode(text);
  if (!parsed) return alert("Formato inválido do QR Code");

  deliveries.push(parsed);
  atualizarListaEntregas();
}

// === PARSING DO QR CODE ===
function parseQRCode(raw) {
  const lines = raw.split(/\n|;/).map(l => l.trim());
  let obj = { id: Date.now(), data: new Date().toISOString() };

  for (let l of lines) {
    if (l.startsWith("NOME:")) obj.nome = l.replace("NOME:", "").trim();
    if (l.startsWith("ENDEREÇO:")) obj.endereco = l.replace("ENDEREÇO:", "").trim();
    if (l.startsWith("CEP:")) obj.cep = l.replace("CEP:", "").trim();
    if (l.startsWith("TELEFONE:")) obj.telefone = l.replace("TELEFONE:", "").trim();
  }

  if (!obj.nome || !obj.endereco || !obj.cep) return null;
  return obj;
}

// === LISTA DE ENTREGAS ===
function listarEntregas() {
  alert(JSON.stringify(deliveries, null, 2));
}

function atualizarListaEntregas() {
  document.getElementById("scansList").innerText = deliveries.length + " entregas registradas.";
}

// === PESQUISA ===
function pesquisarQRCode() {
  const id = prompt("Digite o ID do QR Code:");
  if (!id) return;
  const item = deliveries.find(x => x.id == id);
  if (!item) return alert("Não encontrado.");
  alert(JSON.stringify(item, null, 2));
}

// === MAPA ===
function openMapa() {
  if (deliveries.length === 0) return alert("Nenhuma entrega cadastrada.");
  const addr = deliveries[0].endereco + ", " + deliveries[0].cep;
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
}

function gerarRota() {
  if (deliveries.length < 2) return alert("Necessário 2 ou mais entregas.");
  const base = deliveries.map(d => d.endereco + ", " + d.cep).join("|");
  window.open(`https://www.google.com/maps/dir/${encodeURIComponent(base)}`);
}

// === CSV ===
const exportBtn = document.getElementById("exportBtn");
exportBtn.onclick = () => {
  if (deliveries.length === 0) return alert("Nada para exportar.");
  let csv = "ID;Nome;Endereco;CEP;Telefone;Data\n";
  deliveries.forEach(d => {
    csv += `${d.id};${d.nome};${d.endereco};${d.cep};${d.telefone};${d.data}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio.csv";
  a.click();
};
