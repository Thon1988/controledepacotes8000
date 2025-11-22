// ======= Usuários iniciais =======
let users = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'gestor', password: 'gestor123', role: 'gestor' },
    { username: 'thon', password: '882010', role: 'gestor' }
];

// ======= Sessão e Login =======
const loginBtn = document.getElementById('loginBtn');
const feedback = document.getElementById('feedbackMessage');
loginBtn.addEventListener('click', ()=>{
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();

    const user = users.find(u=>u.username===username && u.password===password);
    if(user){
        localStorage.setItem('pegazus_session_v1', JSON.stringify(user));
        document.querySelector('.login-container').style.display='none';
        document.getElementById('sidebar').style.display='flex';
        hideAllViews();
    } else {
        feedback.textContent='Usuário ou senha incorretos';
    }
});

document.getElementById('btnSair').addEventListener('click', ()=>{
    localStorage.removeItem('pegazus_session_v1');
    document.querySelector('.login-container').style.display='flex';
    document.getElementById('sidebar').style.display='none';
    hideAllViews();
});

// ======= Navegação =======
function hideAllViews(){
    document.getElementById('userManagementView').classList.add('hidden');
    document.getElementById('deliveriesList').classList.add('hidden');
    document.getElementById('cameraContainer').classList.add('hidden');
    document.getElementById('map').classList.add('hidden');
}

document.getElementById('btnManageUsers').addEventListener('click', ()=>{
    hideAllViews();
    document.getElementById('userManagementView').classList.remove('hidden');
    renderUserList();
});

document.getElementById('btnDeliveries').addEventListener('click', ()=>{
    hideAllViews();
    document.getElementById('deliveriesList').classList.remove('hidden');
});

document.getElementById('btnCamera').addEventListener('click', ()=>{
    hideAllViews();
    document.getElementById('cameraContainer').classList.remove('hidden');
    startScanner();
});

document.getElementById('btnMap').addEventListener('click', ()=>{
    hideAllViews();
    document.getElementById('map').classList.remove('hidden');
    initMap();
});

document.getElementById('btnGenerateCSV').addEventListener('click', ()=>{
    generateCSV();
});

// ======= Usuários =======
function renderUserList(){
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML='';
    users.forEach((u, i)=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${u.username}</td><td>${u.role}</td><td>admin</td>
        <td>
            <button class="btn-small btn-delete" onclick="deleteUser(${i})">Excluir</button>
        </td>`;
        tbody.appendChild(tr);
    });
}

document.getElementById('createUserBtn').addEventListener('click', ()=>{
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value.trim();
    const role = document.getElementById('newUserRole').value;

    if(!username || !password){ alert('Preencha todos os campos'); return; }

    users.push({username,password,role});
    renderUserList();
    document.getElementById('newUsername').value='';
    document.getElementById('newPassword').value='';
});

function deleteUser(index){
    users.splice(index,1);
    renderUserList();
}

// ======= Scanner =======
let scannerActive=false;
function startScanner(){
    if(scannerActive) return;
    scannerActive=true;
    const video=document.getElementById('qrVideo');
    if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
        navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
        .then(stream=>{ video.srcObject=stream; video.setAttribute('playsinline', true); video.play(); })
        .catch(err=>console.error(err));
    }
}

// ======= MAP =======
let map;
function initMap(){
    if(map) return;
    map = L.map('map').setView([-23.5505,-46.6333], 12); // exemplo SP
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
}

// ======= CSV =======
function generateCSV(){
    const now = new Date();
    const daily = [['Data','Entregas']];
    const fortnight = [['Semana','Entregas']];
    const monthly = [['Mês','Entregas']];

    // Exemplo de dados
    for(let i=0;i<5;i++){
        daily.push([`2025-11-${i+1}`, Math.floor(Math.random()*20)]);
        fortnight.push([`Semana ${i+1}`, Math.floor(Math.random()*50)]);
        monthly.push([`Novembro`, Math.floor(Math.random()*200)]);
    }

    downloadCSV(daily,'relatorio_diario.csv');
    downloadCSV(fortnight,'relatorio_quinzenal.csv');
    downloadCSV(monthly,'rela
