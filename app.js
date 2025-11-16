// ===============================
// app.js ATUALIZADO — Login funcionando + permissões + scanner
// ===============================

// === ESTADO GLOBAL ===
let logged = false;
let cameraStream = null;
let scanning = false;
let deliveries = []; // { id, nome, endereco, cep, telefone, data, user }

// === BASE DE USUÁRIOS (LocalStorage Persistente) ===
if (!localStorage.getItem("pegazus_users")) {
    localStorage.setItem("pegazus_users", JSON.stringify([
        { username: "thon", password: "882010", role: "admin", owner: null }
    ]));
}
let users = JSON.parse(localStorage.getItem("pegazus_users"));
let currentUser = null;

function salvarUsuarios() {
    localStorage.setItem("pegazus_users", JSON.stringify(users));
}

// === LOGIN ===
const loginBtn = document.getElementById("loginBtn");
loginBtn.onclick = () => {
    const user = document.getElementById("loginUser").value.trim();
    const pass = document.getElementById("loginPass").value.trim();
    const feedback = document.getElementById("feedbackMessage");

    const found = users.find(u => u.username === user && u.password === pass);

    if (!found) {
        feedback.innerText = "❌ Credenciais inválidas";
        feedback.style.color = "#ff4d4d";
        return;
    }

    logged = true;
    currentUser = found;

    feedback.innerText = "✔ Login realizado";
    feedback.style.color = "green";

    document.body.classList.add("logged-in");
    atualizarMenuPorPermissao();
};

function logout() {
    logged = false;
    currentUser = null;
    document.body.classList.remove("logged-in");
}

// === MENU DE PERMISSÕES ===
function atualizarMenuPorPermissao() {
    document.querySelectorAll(".menu-admin, .menu-gestor, .menu-colab")
        .forEach(e => e.style.display = "none");

    if (!currentUser) return;

    if (currentUser.role === "admin") {
        document.querySelectorAll(".menu-admin, .menu-gestor, .menu-colab")
            .forEach(e => e.style.display = "block");
    }

    if (currentUser.role === "gestor") {
        document.querySelectorAll(".menu-gestor, .menu-colab")
            .forEach(e => e.style.display = "block");
    }

    if (currentUser.role === "colab") {
        document.querySelectorAll(".menu-colab")
            .forEach(e => e.style.display = "block");
    }
}

// === ADICIONAR USUÁRIOS ===
function adicionarUsuario(role) {
    const username = prompt("Novo usuário:");
    const pass = prompt("Senha:");
    if (!username || !pass) return;

    users.push({
        username,
        password: pass,
        role,
        owner: currentUser.role !== "admin" ? currentUser.username : null
    });
    salvarUsuarios();
    alert("Usuário adicionado!");
}

// === MENU LATERAL ===
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
menuBtn.onclick = () => {
    if (!logged) return;
    sidebar.classList.toggle("open");
};

// === CAMERA / QR ===
const video = document.getElementById("videoElement");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

function abrirCamera() {
    if (scanning) return;
    startScanner();
}

async function startScanner() {
    scanning = true;

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = cameraStream;
        video.play();
        tick();
    } catch (e) {
        alert("Erro ao acessar câmera");
    }
}

function stopScanner() {
    scanning = false;
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
}

function tick() {
    if (!scanning) return;

    if (video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, canvas.width, canvas.height);

        if (code) {
            processQRCode(code.data);
            stopScanner();
        }
    }

    requestAnimationFrame(tick);
}

// === PROCESSAR QR ===
function processQRCode(raw) {
    const parsed = parseQRCode(raw);
    if (!parsed) return alert("Formato inválido!");

    if (deliveries.some(x => x.telefone === parsed.telefone)) {
        alert("⚠️ QR Code já escaneado!");
        return;
    }

    parsed.user = currentUser.username;
    deliveries.push(parsed);
    atualizarListaEntregas();

    new Audio("beep.mp3").play();
}

function parseQRCode(raw) {
    const lines = raw.split(/\n|;/).map(l => l.trim());
    let obj = { id: Date.now(), data: new Date().toLocaleString() };

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
    document.getElementById("scansList").innerText = deliveries.length + " entregas registradas";
}

// === EXPORTAR CSV ===
const exportBtn = document.getElementById("exportBtn");
exportBtn.onclick = () => {
    let lista = [];

    if (currentUser.role === "admin") lista = deliveries;
    else if (currentUser.role === "gestor") lista = deliveries.filter(d => {
        const u = users.find(x => x.username === d.user);
        return u && u.owner === currentUser.username;
    });
    else lista = deliveries.filter(d => d.user === currentUser.username);

    if (lista.length === 0) return alert("Nada para exportar.");

    let csv = "ID;Nome;Endereco;CEP;Telefone;Data;Colaborador\n";
    lista.forEach(d => csv += `${d.id};${d.nome};${d.endereco};${d.cep};${d.telefone};${d.data};${d.user}\n`);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio.csv";
    a.click();
};
