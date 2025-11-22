// ============================
// Usuários iniciais
// ============================
let users = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'gestor', password: 'gestor123', role: 'gestor' }
];

// Carregar usuários do localStorage se existirem
if (localStorage.getItem('users')) {
    users = JSON.parse(localStorage.getItem('users'));
} else {
    localStorage.setItem('users', JSON.stringify(users));
}

// ============================
// Funções de Navegação
// ============================
function showDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('users-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
}

function showUsers() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('users-section').classList.remove('hidden');
    renderUserList();
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
// CRUD de Usuários
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

    // Limpar campos
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
}

// Renderiza a lista de usuários com botões de exclusão conforme permissões
function renderUserList() {
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';

    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));

    users.forEach((user, index) => {
        const li = document.createElement('li');
        li.textContent = `${user.username} (${user.role})`;

        // Permissões para excluir
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

// Excluir usuário
function deleteUser(index) {
    users.splice(index, 1);
    localStorage.setItem('users', JSON.stringify(users));
    renderUserList();
}

// ============================
// Inicialização
// ============================
// Se já estiver logado, mostrar dashboard automaticamente
window.addEventListener('load', () => {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (currentUser) {
        showDashboard();
    }
});
