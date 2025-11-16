// app.js atualizado com persistência via LocalStorage (MODELO B)

// === ESTADO GLOBAL ===
let logged = false;
let cameraStream = null;
let scanning = false;
let deliveries = JSON.parse(localStorage.getItem("deliveries") || "[]");
let currentUser = null;

// === BASE DE USUÁRIOS (LocalStorage) ===
// Estrutura do usuário:
// { username, password, role, owner }

function loadUsers() {
  let saved = localStorage.getItem("users");
  if (saved) return JSON.parse(saved);

  // Se não existir, cria base inicial
  const base = [
    { username: "thon", password: "882010", role: "admin", owner: null }
  ];
  localStorage.setItem("users", JSON.stringify(base));
  return base;
}

function saveUsers(list) {
  localStorage.setItem("users", JSON.stringify(list));
}

let users = loadUsers();

// === LOGIN ===
const loginBtn = document.getElementById("loginBtn");
loginBtn.onclick = () => {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();

  const found = users.find(u => u.username === user && u.password === pass);

  if (!found) {
    document.getElementById("feedbackMessage").innerText = "Credenciais inválidas";
    return;
  }

  logged = true;
  currentUser = found;
  document.body.classList.add("logged-in");

  atualizarMenuPorPermissao();
  atualizarListaEntregas();
};

function logout() {
  logged = false;
  currentUser = null;
  document.body.classList.remove("logged-in");
}

// === CONFIGURAÇÃO DO MENU POR PERMISSÃO ===
function atualizarMenuPorPermissao() {
  if (!currentUser) return;

  document.querySelectorAll(".menu-admin").forEach(e => e.style.display = "none");
  document.querySelectorAll(".menu-gestor").forEach(e => e.style.display = "none");
  document.querySelectorAll(".menu-colab").forEach(e => e.style.display = "none");

  if (currentUser.role === "admin") {
    document.querySelectorAll(".menu-admin").forEach(e => e.style.display = "block");
    document.querySelectorAll(".menu-gestor").forEach(e => e.style.display = "block");
    document.querySelectorAll(".menu-colab").forEach(e => e.style.display = "block");
  }

  if (currentUser.role === "gestor") {
    document.querySelectorAll(".menu-gestor").forEach(e => e.style.display = "block");
    document.querySelectorAll(".menu-colab").forEach(e => e.style.display = "block");
  }

  if (currentUser.role === "colab") {
    document.querySelectorAll(".menu-colab").forEach(e => e.style.display = "block");
  }
}

// === ADICIONAR USUÁRIOS ===
function adicionarUsuario(role) {
  const username = prompt("Usuário novo:");
  const pass = prompt("Senha:");
  if (!username || !pass) return;

  users.push({ username, password: pass, role, owner: currentUser.username });
  saveUsers(users);

  alert("Usuário criado com sucesso!");
}

// === MENU LATERAL ===
const menuBtn = document.getElementById("menuBtn");
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

// === PROCESSAMENTO DO QR ===
function processQRCode(text) {
  const parsed = parseQRCode(text);
  if (!parsed) return alert("Formato inválido do QR Code");

  // impedir duplicados por telefone
  if (deliveries.some(x => x.telefone === parsed.telefone)) {
    alert("⚠️ QR Code já escaneado!");
    return;
  }

  parsed.user = currentUser.username;
  deliveries.push(parsed);
  localStorage.setItem("deliveries", JSON.stringify(deliveries));
  atualizarListaEntregas();

  const bip = new Audio("beep.mp3");
  bip.play();
}

function parseQRCode(raw) {
  const lines = raw.split(/
|;/).map(l => l.trim());
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

function atualizarListaEntregas() {
  document.getElementById("scansList").innerText = deliveries.length + " entregas registradas.";
}

// === CSV — respeitando permissões ===
const exportBtn = document.getElementById("exportBtn");
exportBtn.onclick = () => {
  let dataToExport = [];

  if (currentUser.role === "admin") {
    dataToExport = deliveries;
  } else if (currentUser.role === "gestor") {
    dataToExport = deliveries.filter(d => {
      const u = users.find(x => x.username === d.user);
      return u && u.owner === currentUser.username;
    });
  } else {
    dataToExport = deliveries.filter(d => d.user === currentUser.username);
  }

  if (dataToExport.length === 0) return alert("Nada para exportar.");

  let csv = "ID;Nome;Endereco;CEP;Telefone;Data;Colaborador
";
  dataToExport.forEach(d => {
    csv += `${d.id};${d.nome};${d.endereco};${d.cep};${d.telefone};${d.data};${d.user}
`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio.csv";
  a.click();
};
