// ======= Usuários iniciais =======
let users = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'gestor', password: 'gestor123', role: 'gestor' },
    { username: 'thon', password: '882010', role: 'gestor' }
];

const loginBtn = document.getElementById('loginBtn');
const feedback = document.getElementById('feedbackMessage');
const sidebar = document.getElementById('sidebar');
const btnBack = document.getElementById('btnBack');
const cameraContainer = document.getElementById('cameraContainer');
const qrFeedback = document.getElementById('qrFeedback');

let scannedQRCodes = new Set();
let beepSuccess = new Audio('https://www.soundjay.com/button/beep-07.wav');
let beepError = new Audio('https://www.soundjay.com/button/beep-10.wav');

// ======= LOGIN =======
loginBtn.addEventListener('click', ()=>{
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();
    const user = users.find(u=>u.username===username && u.password===password);
    if(user){
        localStorage.setItem('pegazus_session_v1', JSON.stringify(user));
        document.querySelector('.login-container').style.display='none';
        sidebar.style.display='flex';
    } else { feedback.textContent='Usuário ou senha incorretos'; }
});

document.getElementById('btnSair').addEventListener('click', ()=>{
    localStorage.removeItem('pegazus_session_v1');
    document.querySelector('.login-container').style.display='flex';
    sidebar.style.display='none';
    hideAllViews();
    stopScanner();
});

// ======= VIEWS =======
function hideAllViews(){
    document.getElementById('userManagementView').classList.add('hidden');
    document.getElementById('deliveriesList').classList.add('hidden');
    document.getElementById('cameraContainer').classList.add('hidden');
    document.getElementById('map').classList.add('hidden');
    btnBack.style.display='none';
}

function showView(viewId){
    hideAllViews();
    document.getElementById(viewId).classList.remove('hidden');
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

// ======= USERS =======
function renderUserList(){
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML='';
    users.forEach((u,i)=>{
        const tr = document.createElement('tr');
        tr.innerHTML=`<td>${u.username}</td><td>${u.role}</td><td>admin</td>
        <td><button class="btn-small btn-delete" onclick="deleteUser(${i})">Excluir</button></td>`;
        tbody.appendChild(tr);
    });
}

document.getElementById('createUserBtn').addEventListener('click', ()=>{
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value.trim();
    const role = document.getElementById('newUserRole').value;
    if(!username||!password){ alert('Preencha todos os campos'); return; }
    users.push({username,password,role});
    renderUserList();
    document.getElementById('newUsername').value='';
    document.getElementById('newPassword').value='';
});

function deleteUser(index){ users.splice(index,1); renderUserList(); }

// ======= CAMERA SHOPEE STYLE =======
let scannerActive=false;
let videoStream=null;

function startScanner(){
    if(scannerActive) return;
    scannerActive=true;
    const video = document.getElementById('qrVideo');
    if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
        navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
        .then(stream=>{
            videoStream = stream;
            video.srcObject=stream;
            video.setAttribute('playsinline', true);
            video.play();
            scanLoop();
        })
        .catch(err=>console.error(err));
    }
}

// Parar scanner
function stopScanner(){
    scannerActive=false;
    const video = document.getElementById('qrVideo');
    if(videoStream){
        videoStream.getTracks().forEach(track=>track.stop());
        videoStream=null;
    }
}

// Simulação de leitura de QR (substituir com biblioteca real como jsQR)
function scanLoop(){
    if(!scannerActive) return;
    // Simula detecção QR a cada 3s
    setTimeout(()=>{
        let qrValue = 'QR_'+Math.floor(Math.random()*10); // Simulado
        if(scannedQRCodes.has(qrValue)){
            qrFeedback.textContent='QR Code já escaneado';
            qrFeedback.style.display='block';
            beepError.play();
        } else {
            scannedQRCodes.add(qrValue);
            qrFeedback.textContent='QR Code detectado: '+qrValue;
            qrFeedback.style.display='block';
            beepSuccess.play();
        }
        setTimeout(()=>{ qrFeedback.style.display='none'; },2000);
        scanLoop();
    },3000);
}

// ======= MAP =======
let map;
function initMap(){
    if(map) return;
    map = L.map('map').setView([-23.5505,-46.6333], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
}

// ======= CSV =======
function generateCSV(){
    const daily=[['Data','Entregas']], fortnight=[['Semana','Entregas']], monthly=[['Mês','Entregas']];
    for(let i=0;i<5;i++){
        daily.push([`2025-11-${i+1}`,Math.floor(Math.random()*20)]);
        fortnight.push([`Semana ${i+1}`,Math.floor(Math.random()*50)]);
        monthly.push([`Novembro`,Math.floor(Math.random()*200)]);
    }
    downloadCSV(daily,'relatorio_diario.csv');
    downloadCSV(fortnight,'relatorio_quinzenal.csv');
    downloadCSV(monthly,'relatorio_mensal.csv');
}
function downloadCSV(data, filename){
    let csvContent = data.map(e=>e.join(",")).join("\n");
    let blob = new Blob([csvContent], {type:'text/csv;charset=utf-8;'});
    let link=document.createElement('a');
    link.href=URL.createObjectURL(blob);
    link.download=filename;
    link.click();
}

// ======= LOAD SESSION =======
window.addEventListener('load', ()=>{
    const session = localStorage.getItem('pegazus_session_v1');
    if(session){ document.querySelector('.login-container').style.display='none'; sidebar.style.display='flex'; }
});
