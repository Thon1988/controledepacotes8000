// Usuários iniciais
let users = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'gestor', password: 'gestor123', role: 'gestor' }
];

// Carregar usuários do localStorage se existir
if (localStorage.getItem('users')) {
    users = JSON.parse(localStorage.getItem('users'));
}

// Funções de navegação
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

// Login
function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        document.getElementById('login-error').textContent = '';
        showDashboard();
        sessionStorage.setItem('currentUser', JSON.stringify(user));
    } else {
        document.getElementById('login-error').textContent = 'Usuário ou senha incorretos';
    }
}

// CRUD de Usuários
function addUser() {
    const username = document.getElementById('new-username').value;
    const password = document.getElementById('new-password').value;

    if (!username || !password) return alert('Preencha todos os campos');

    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (users.find(u => u.username === username)) return alert('Usuário já existe');

    users.push({ username, password, role: 'gestor' });
    localStorage.setItem('users', JSON.stringify(users));
    renderUserList();
}

function renderUserList() {
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';

    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));

    users.forEach((user, index) => {
        const li = document.createElement('li');
        li.textContent = `${user.username} (${user.role})`;

        if (currentUser.role === 'gestor' && user.role === 'gestor') {
            const delBtn = document.createElement('button');
            delBtn.textContent = 'Excluir';
            delBtn.onclick = () => deleteUser(index);
            li.appendChild(delBtn);
        }

        if (currentUser.role === 'admin' && user.username !== 'admin') {
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
