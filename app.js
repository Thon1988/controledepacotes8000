// ============================
// Usuários iniciais
// ============================
let users = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'gestor', password: 'gestor123', role: 'gestor' },
    { username: 'thon', password: '882010', role: 'gestor' }
];

// Carregar do localStorage
if (localStorage.getItem('users')) {
    users = JSON.parse(localStorage.getItem('users'));
} else {
    localStorage.setItem('users', JSON.stringify(users));
}

// ============================
// Navegação
// ============================
function hideAllSections() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('users-section').classList.add('hidden');
    document.getElementById('scanner-section').classList.add('hidden');
}

function showDashboard() {
    hideAllSections();
    document.getElementById('dashboard-section').classList.remove('hidden');
}

function showUsers() {
    hideAllSections();
    document.getElementById('users-section').classList.remove('hidden');
    renderUserList();
}

function showScanner() {
    hideAllSections();
    document.getElementById('scanner-section').classList.remove('hidden');
    startScanner();
}

function goBack() {
    showDashboard();
}

// ============================
// Login
// ============================
function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        document.getElementById('login-error').textContent = '';
        sessionStorage.setItem('currentUser', JSON.stringify(user));
        showDashboard();
    } else {
        document.getElementById('login-error').textContent = 'Usuário ou senha incorretos';
    }
}

// ============================
// CRUD Usuários
// ============================
function addUser() {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value.trim();

    if (!username || !password) {
        alert('Preencha todos os campos');
        return;
    }

    if (users.find(u => u.username === username)) {
        alert('Usuário já existe');
        return;
    }

    users.push({ username, password, role: 'gestor' });
    localStorage.setItem('users', JSON.stringify(users));
    renderUserList();

    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
}

function renderUserList() {
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';

    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));

    users.forEach((user, index) => {
        const li = document.createElement('li');
        li.textContent = `${user.username} (${user.role})`;

        if ((currentUser.role === 'gestor' && user.role === 'gestor') ||
            (currentUser.role === 'admin' && user.username !== 'admin')) {
            const delBtn = document.createElement('button');
            delBtn.textContent = 'Excluir';
            delBtn.onclick = () => deleteUser(index);
            li.appendChild(delBtn);
        }

        userList.appendChild(li);
    });
}

function deleteUser(index) {
    users.splice(index, 1);
    localStorage.setItem('users', JSON.stringify(users));
    renderUserList();
}

// ============================
// Scanner QR Code
// ============================
let html5QrCode;

function startScanner() {
    const resultContainer = document.getElementById("scan-result");
    resultContainer.textContent = "";

    if (html5QrCode) {
        html5QrCode.stop().then(() => html5QrCode.clear());
    }

    html5QrCode = new Html5Qrcode("qr-reader");
    Html5Qrcode.getCameras().then(cameras => {
        if (cameras && cameras.length) {
            const cameraId = cameras[0].id;
            html5QrCode.start(
                cameraId,
                { fps: 10, qrbox: 250 },
                qrCodeMessage => {
                    resultContainer.textContent = `QR Code lido: ${qrCodeMessage}`;
                },
                errorMessage => {
                    console.warn(errorMessage);
                }
            );
        }
    }).catch(err => {
        console.error("Erro ao acessar a câmera: ", err);
        resultContainer.textContent = "Não foi possível acessar a câmera";
    });
}

// ============================
// Inicialização
// ============================
window.addEventListener('load', () => {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (currentUser) {
        showDashboard();
    } else {
        hideAllSections();
        document.getElementById('login-section').classList.remove('hidden');
    }
});
