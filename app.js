// ======= USUÁRIOS =======
let users = [
    { username:'admin', password:'admin123', role:'admin' },
    { username:'gestor', password:'gestor123', role:'gestor' },
    { username:'thon', password:'882010', role:'gestor' }
];

const loginBtn = document.getElementById('loginBtn');
const feedback = document.getElementById('feedbackMessage');
const sidebar = document.getElementById('sidebar');
const btnBack = document.getElementById('btnBack');
const cameraContainer = document.getElementById('cameraContainer');
const qrFeedback = document.getElementById('qrFeedback');

let html5QrcodeScanner;
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
    document.getElementById('userManagementView').classList.add('hidden');
    document.getElementById('deliveriesList').classList.add('hidden');
    document.getElementById('cameraContainer').classList.add('hidden');
    document.getElementById('map').classList.add('hidden');
    btnBack.style.display='none';
}

function showView(viewId){
    hideAllViews();
    const view = document.getElementById(viewId);
    view.classList.remove('hidden');
    btnBack.style.display='block';
    sidebar.style.display='none';

    if(viewId==='cameraContainer'){
        startScanner();
    }
}

// BACK BUTTON
btnBack.addEventListener('click', ()=>{
    hideAllViews();
    sidebar.style.display='flex';
    stopScanner();
});

// ======= CAMERA SCANNER =======
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
