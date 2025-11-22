// ======= USUÁRIOS =======
let users = [
    { username:'admin', password:'admin123', role:'admin' },
    { username:'gestor', password:'gestor123', role:'gestor' },
    { username:'thon', password:'882010', role:'gestor' }
];

// ======= ENTREGAS (simulação Mercado Livre / Shopee) =======
const deliveries = [
    { id:101, qr:'QR101', nome:'João Silva', endereco:'Rua A, 123, São Paulo, SP' },
    { id:102, qr:'QR102', nome:'Maria Oliveira', endereco:'Av. B, 456, Rio de Janeiro, RJ' },
    { id:103, qr:'QR103', nome:'Carlos Souza', endereco:'Rua C, 789, Belo Horizonte, MG' },
    { id:104, qr:'QR104', nome:'Ana Lima', endereco:'Av. D, 321, Curitiba, PR' }
];

// ======= ELEMENTOS =======
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
let scanRecords = JSON.parse(localStorage.getItem('pegazus_scans_v2') || '[]');
let beepSuccess = new Audio('https://www.soundjay.com/button/beep-07.wav');
let beepError = new Audio('https://www.soundjay.com/button/beep-10.wav');
let map;

// ======= FUNÇÕES GERAIS =======
function hideAllViews(){
    userView.classList.add('hidden');
    deliveriesList.classList.add('hidden');
    cameraContainer.classList.add('hidden');
    mapDiv.classList.add('hidden');
    btnBack.style.display='none';
    stopScanner();
}

function showView(viewId){
    hideAllViews();
    const view = document.getElementById(viewId);
    view.classList.remove('hidden');
    btnBack.style.display='block';
    sidebar.style.display='none';
    if(viewId==='cameraContainer') startScanner();
}

// ======= BOTÃO VOLTAR =======
btnBack.addEventListener('click', ()=>{
    hideAllViews();
    sidebar.style.display='flex';
});

// ======= CAMERA =======
function startScanner(){
    if(html5QrcodeScanner) return;

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps:10, qrbox:250 },
        qrCodeMessage=>{
            const delivery = deliveries.find(d=>d.qr===qrCodeMessage);
            if(!delivery){
                qrFeedback.textContent='QR Code inválido';
                qrFeedback.style.display='block';
                beepError.play();
                setTimeout(()=>{ qrFeedback.style.display='none'; },2000);
                return;
            }

            if(scannedQRCodes.has(qrCodeMessage)){
                qrFeedback.textContent='QR Code já escaneado';
                qrFeedback.style.display='block';
                beepError.play();
            } else {
                scannedQRCodes.add(qrCodeMessage);
                qrFeedback.textContent=`Entrega: ${delivery.nome} - ${delivery.endereco}`;
                qrFeedback.style.display='block';
                beepSuccess.play();
                recordScan(delivery, qrCodeMessage);
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

// ======= REGISTRAR LEITURA =======
function recordScan(delivery, qrCode){
    const session = users[0]; // ou pegar user logado se houver login
    scanRecords.push({
        idEntrega: delivery.id,
        nomeCliente: delivery.nome,
        endereco: delivery.endereco,
        qr: qrCode,
        user: session.username,
        datetime: new Date().toISOString()
    });
    localStorage.setItem('pegazus_scans_v2', JSON.stringify(scanRecords));
}

// ======= GERAR CSV =======
document.getElementById('btnGenerateCSV').addEventListener('click', ()=>{
    const period = prompt('Digite o período: diário / quinzenal / mensal').toLowerCase();
    let filtered = [];
    const now = new Date();
    if(period==='diário'){
        filtered = scanRecords.filter(r=>new Date(r.datetime).toDateString()===now.toDateString());
    } else if(period==='quinzenal'){
        filtered = scanRecords.filter(r=>(now - new Date(r.datetime))/(1000*60*60*24)<=15);
    } else if(period==='mensal'){
        filtered = scanRecords.filter(r=>(now - new Date(r.datetime))/(1000*60*60*24)<=30);
    } else { alert('Período inválido'); return; }

    if(filtered.length===0){ alert('Nenhum registro para este período'); return; }

    let csv = 'ID Entrega,Nome Cliente,Endereço,QR Code,Usuário,Data e Hora\n';
    filtered.forEach(r=>{
        csv += `${r.idEntrega},"${r.nomeCliente}","${r.endereco}",${r.qr},${r.user},${r.datetime}\n`;
    });

    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url;
    a.download=`relatorio_${period}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// ======= MENU BUTTONS =======
document.getElementById('btnCamera').addEventListener('click', ()=>showView('cameraContainer'));
document.getElementById('btnDeliveries').addEventListener('click', ()=>showDeliveries());
document.getElementById('btnMap').addEventListener('click', ()=>showMap());
document.getElementById('btnManageUsers').addEventListener('click', ()=>showUsers());

// ======= DELIVERIES =======
function showDeliveries(){
    hideAllViews();
    deliveriesList.classList.remove('hidden');
    btnBack.style.display='block';
    sidebar.style.display='none';
    deliveriesList.innerHTML='';
    deliveries.forEach(d=>{
        const div = document.createElement('div');
        div.className='delivery-item';
        div.innerHTML=`Entrega #${d.id}: ${d.nome}<div class="meta">${d.endereco}</div>`;
        deliveriesList.appendChild(div);
    });
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
        <td><button class="btn-delete btn-small">Excluir</button></td>`;
        tbody.appendChild(tr);
    });

    document.getElementById('createUserBtn').addEventListener('click', ()=>{
        const name=document.getElementById('newUsername').value.trim();
        const pass=document.getElementById('newPassword').value.trim();
        const role=document.getElementById('newUserRole').value;
        if(name && pass){ users.push({username:name,password:pass,role}); renderUsers(); }
    });
}
