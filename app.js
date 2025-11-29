/* =======================================================
      SISTEMA COMPLETO — PegazusLog
==========================================================*/

/*  LOGIN */
let users = JSON.parse(localStorage.getItem("users")) || [
  { id: "admin", username: "admin", password: "admin", role: "admin" }
];

let entregas = JSON.parse(localStorage.getItem("entregas")) || [];

let currentUser = null;

function saveUsers() {
  localStorage.setItem("users", JSON.stringify(users));
}

function saveEntregas() {
  localStorage.setItem("entregas", JSON.stringify(entregas));
}

document.getElementById("btnLogin").onclick = () => {
  const u = loginUser.value.trim();
  const p = loginPass.value.trim();

  const found = users.find(x => x.username === u && x.password === p);
  if (!found) {
    loginError.innerHTML = "Usuário ou senha inválidos";
    return;
  }

  currentUser = found;

  loginSection.style.display = "none";
  app.style.display = "flex";
  displayUser.innerHTML = currentUser.username;
};


/* =======================================================
      MENU E TROCA DE TELAS
==========================================================*/

function esconderTelas() {
  inicio.style.display = "none";
  telaEntregas.style.display = "none";
  telaMapa.style.display = "none";
  telaUsuarios.style.display = "none";
}

btnEntregas.onclick = () => {
  esconderTelas();
  telaEntregas.style.display = "block";
  renderEntregas();
};

btnMap.onclick = () => {
  esconderTelas();
  telaMapa.style.display = "block";
  exibirMapa();
};

closeMapa.onclick = () => {
  telaMapa.style.display = "none";
  inicio.style.display = "block";
};

btnUsers.onclick = () => {
  esconderTelas();
  telaUsuarios.style.display = "block";
  renderUsers();
};


/* =======================================================
      SCANNER (SIMPLIFICADO) + MANUAL
==========================================================*/

btnScan.onclick = () => {
  const manual = prompt("Digite um código rastreio:");
  if (!manual) return;

  registrarEntrega(manual, "Endereço do QRCode");  // COMO O FORMATO É TIPO 4
};

function registrarEntrega(rastreio, endereco) {
  entregas.push({
    id: Date.now(),
    rastreio,
    endereco,
    user: currentUser.username,
    data: new Date().toLocaleDateString(),
    hora: new Date().toLocaleTimeString(),
  });

  saveEntregas();
  alert("Entrega registrada!");
}


/* =======================================================
      RENDER LISTA DE ENTREGAS
==========================================================*/

function renderEntregas() {
  const area = document.getElementById("listaEntregas");
  area.innerHTML = "";

  entregas.forEach(e => {
    area.innerHTML += `
      <div class="entrega-card">
        <strong>${e.rastreio}</strong><br>
        ${e.endereco}<br>
        Usuário: ${e.user}<br>
        ${e.data} ${e.hora}
      </div>
    `;
  });
}


/* =======================================================
      CSV
==========================================================*/

btnCSV.onclick = () => {
  if (entregas.length === 0) return alert("Sem entregas.");

  let csv = "Rastreio;Endereço;Usuário;Data;Hora\n";

  entregas.forEach(e => {
    csv += `${e.rastreio};${e.endereco};${e.user};${e.data};${e.hora}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "relatorio.csv";
  a.click();
};


/* =======================================================
      MAPA
==========================================================*/

let mapInstance = null;

function exibirMapa() {
  if (!mapInstance) {
    mapInstance = L.map("mapaView").setView([-23.55, -46.63], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapInstance);
  }
  mapInstance.invalidateSize();
}


/* =======================================================
      USUÁRIOS — CRUD COMPLETO
==========================================================*/

function filtrarUsuarios() {
  const texto = searchUser.value.toLowerCase();
  const tipo = filterRole.value;

  return users.filter(u =>
    u.username.toLowerCase().includes(texto) &&
    (tipo === "" || tipo === u.role)
  );
}

function renderUsers() {
  const box = listaUsuarios;
  box.innerHTML = "";

  filtrarUsuarios().forEach(u => {
    const card = document.createElement("div");
    card.className = "user-card";
    card.innerHTML = `
      <strong>${u.username}</strong><br>
      Tipo: ${u.role}<br><br>

      <button class="btn-editar" onclick="editUser('${u.id}')">Editar</button>
      <button class="btn-excluir" onclick="deleteUser('${u.id}')">Excluir</button>
    `;
    box.appendChild(card);
  });
}

searchUser.oninput = renderUsers;
filterRole.onchange = renderUsers;

btnNovoUser.onclick = () => criarUserModal();

function criarUserModal() {
  abrirModal(`
    <h3>Novo Usuário</h3>
    <input id="uNome" placeholder="Nome" style="width:100%;padding:10px;margin:5px 0;">
    <input id="uSenha" type="password" placeholder="Senha" style="width:100%;padding:10px;margin:5px 0;">
    
    <select id="uTipo" style="width:100%;padding:10px;margin:5px 0;">
      <option value="colaborador">Colaborador</option>
      <option value="gestor">Gestor</option>
      <option value="admin">Admin</option>
    </select>

    <button onclick="salvarNovoUser()" class="btn-primary" style="margin-top:10px;">Salvar</button>
  `);
}

window.salvarNovoUser = () => {
  const nome = document.getElementById("uNome").value;
  const senha = document.getElementById("uSenha").value;
  const tipo = document.getElementById("uTipo").value;

  if (!nome || !senha) return alert("Preencha os campos!");

  users.push({
    id: Date.now(),
    username: nome,
    password: senha,
    role: tipo,
  });
  saveUsers();

  fecharModal();
  renderUsers();
};

window.editUser = id => {
  const u = users.find(x => x.id == id);
  if (!u) return;

  abrirModal(`
    <h3>Editar Usuário</h3>

    <input id="editNome" value="${u.username}" style="width:100%;padding:10px;margin:5px 0;">
    <input id="editSenha" placeholder="Nova senha (opcional)" type="password" style="width:100%;padding:10px;margin:5px 0;">

    <select id="editTipo" style="width:100%;padding:10px;margin:5px 0;">
      <option ${u.role=='colaborador'?'selected':''}>colaborador</option>
      <option ${u.role=='gestor'?'selected':''}>gestor</option>
      <option ${u.role=='admin'?'selected':''}>admin</option>
    </select>

    <button onclick="salvarEdicao('${u.id}')" class="btn-primary">Salvar</button>
  `);
};

window.salvarEdicao = id => {
  const u = users.find(x => x.id == id);
  u.username = editNome.value;
  if (editSenha.value.trim() !== "") u.password = editSenha.value;
  u.role = editTipo.value;

  saveUsers();
  fecharModal();
  renderUsers();
};

window.deleteUser = id => {
  if (!confirm("Excluir este usuário?")) return;
  users = users.filter(u => u.id != id);
  saveUsers();
  renderUsers();
};


/* =======================================================
      MODAL GENÉRICO
==========================================================*/

function abrirModal(html) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.id = "modalBg";

  bg.innerHTML = `
    <div class="modal">
      <button onclick="fecharModal()" style="float:right;">❌</button>
      ${html}
    </div>
  `;

  document.body.appendChild(bg);
}

window.fecharModal = () => {
  const m = document.getElementById("modalBg");
  if (m) m.remove();
};


/* =======================================================
      LOGOUT
==========================================================*/

btnLogout.onclick = () => location.reload();
