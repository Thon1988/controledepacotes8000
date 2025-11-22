// ======= USUÁRIOS =======
let users = [
    { username:'admin', password:'admin123', role:'admin' },
    { username:'gestor', password:'gestor123', role:'gestor' },
    { username:'thon', password:'882010', role:'gestor' }
];

// ======= ELEMENTOS =======
const loginBtn = document.getElementById('loginBtn');
const feedback = document.getElementById('feedbackMessage');
const sidebar = document.getElementById('sidebar');
const btnBack = document.getElementById('btnBack');
const cameraContainer = document.getElementById('cameraContainer');
const qrFeedback = document.getElementById('qrFeedback');
const userView = document.getElementById('userManagementView');
const deliveriesList = document.getElementById('deliveriesList');
const mapDiv = document.getElementById('map');

// ======= VARIÁVEIS =======
let html5QrcodeScanner;
let scannedQRCodes = new Set();
let beepSuccess = new Audio('https://www.soundjay.com/button/beep-07.wav');
let beepError = new Audio('https://www.soundjay.com/button/beep-10.wav');
let map;

// ======= LOGIN =======
loginBtn.addEventListener('click', ()=>{
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();
    const user = users.find(u=>u.username===username && u.password===password);
    if(user){
        localStorage.setItem('pegazus_session_v1', JSON.stringify(user));
        document.querySelector('.login-container').style.display='none';
        sidebar.style.display='flex';
        showDeliveries(); // inicial view
    } else { feedback.textContent='Usuário ou senha incorretos'; }
});

// ======= LOGOUT =======
document.getElementById('btnSair').addEventListener('click', ()=>{
    localStorage.removeItem('pegazus_session_v1');
    document.querySelector('.login-container').style.display='flex';
    sidebar.style.display='none';
    hideAllViews();
    stopScanner();
});

// ======= VIEWS =======
function hideAllViews(){
    userView.classList.add('hidden');
    deliveriesList.classList.add('hidden');
    cameraContainer.classList.add('hidden');
    mapDiv.classList.add('hidden');
    btnBack.style.display='none';
}

function showView(viewId){
    hideAllViews();
    const view = document.getElementById(viewId);
    view.classList.remove('hidden');
    btnBack.style.display='block';
    sidebar.style.display='none';
    if(viewId==='cameraContainer') startScanner();
}

// BACK BUTTON
btnBack.addEventListener('click', ()=>{
    hideAllViews();
    sidebar.style.display='flex';
    stopScanner();
});

// ======= CAMERA =======
function startScanner(){
    if(html5QrcodeScanner) return;

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        qrCodeMessage=>{
            if(scannedQRCodes.has(qrCodeMessage)){
                qrFeedback.textContent='QR Code já escaneado';
                qrFeedback.style.display='block';
                beepError.play();
            } else {
                scannedQRCodes.add(qrCodeMessage);
                qrFeedback.textContent='QR Code detectado: '+qrCodeMessage;
                qrFeedback.style.display='block';
                beepSuccess.play();
            }
            setTimeout(()=>{ qrFeedback.style.display='none'; },2000);
        }
    ).catch(err=>console.error(err));
}

function stopScanner(){
    if(html5QrcodeScanner){
        html5QrcodeScanner.stop().then(()=>{
            html5QrcodeScanner.clear();
            html5QrcodeScanner=null;
        }).catch(err=>console.error(err));
    }
}

// ======= MENU BUTTONS =======
document.getElementById('btnCamera').addEventListener('click', ()=>showView('cameraContainer'));
document.getElementById('btnManageUsers').addEventListener('click', ()=>showView('userManagementView'));
document.getElementById('btnDeliveries').addEventListener('click', ()=>showDeliveries());
document.getElementById('btnMap').addEventListener('click', ()=>showMap());
document.getElementById('btnGenerateCSV').addEventListener('click', ()=>alert('CSV gerado (exemplo)'));

// ======= DELIVERIES =======
function showDeliveries(){
    hideAllViews();
    deliveriesList.classList.remove('hidden');
    btnBack.style.display='block';
    sidebar.style.display='none';
    deliveriesList.innerHTML='';
    for(let i=1;i<=5;i++){
        const div = document.createElement('div');
        div.className='delivery-item';
        div.innerHTML=`Entrega #${i}<div class="meta">Detalhes...</div>`;
        deliveriesList.appendChild(div);
    }
}

// ======= MAP =======
function showMap(){
    hideAllViews();
    mapDiv.classList.remove('hidden');
    btnBack.style.display='block';
    sidebar.style.display='none';
    if(!map){
        map = L.map('map').setView([-23.5505,-46.6333],12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
            attribution:'&copy; OpenStreetMap contributors'
        }).addTo(map);
    }
}

// ======= USERS =======
function showUsers(){
    hideAllViews();
    userView.classList.remove('hidden');
    btnBack.style.display='block';
    sidebar.style.display='none';
    renderUsers();
}

function renderUsers(){
    userView.innerHTML=`
    <h2>Gerenciar Usuários</h2>
    <div class="card">
        <h3>Criar usuário</h3>
        <input id="newUsername" placeholder="Novo usuário">
        <input id="newPassword" placeholder="Senha">
        <select id="newUserRole">
            <option value="gestor">Gestor</option>
            <option value="colaborador">Colaborador</option>
        </select>
        <button id="createUserBtn" class="login-btn">Criar</button>
    </div>
    <h3 style="margin-top:25px;">Usuários cadastrados</h3>
    <table>
        <thead>
            <tr>
                <th>Usuário</th>
                <th>Função</th>
                <th>Ações</th>
            </tr>
        </thead>
        <tbody id="userTableBody"></tbody>
    </table>
    `;
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML='';
    users.forEach(u=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${u.username}</td><td>${u.role}</td>
        <td>
        <button class="btn-delete btn-small">Excluir</button>
        </td>`;
        tbody.appendChild(tr);
    });

    document.getElementById('createUserBtn').addEventListener('click', ()=>{
        const name=document.getElementById('newUsername').value.trim();
        const pass=document.getElementById('newPassword').value.trim();
        const role=document.getElementById('newUserRole').value;
        if(name && pass){ users.push({username:name,password:pass,role}); renderUsers(); }
    });
}

document.getElementById('btnManageUsers').addEventListener('click', ()=>showUsers());
