document.addEventListener("DOMContentLoaded", ()=>{

// Usuário
const users = [{ username:'thon', password:'882010', role:'gestor' }];
let currentUser = null;

// Scanner
const cameraContainer = document.getElementById('cameraContainer');
const qrFeedback = document.getElementById('qrFeedback');
const btnBack = document.getElementById('btnBack');
const sidebar = document.getElementById('sidebar');
let html5QrcodeScanner;
let scannedQRCodes = new Set();
let beepSuccess = new Audio('https://www.soundjay.com/button/beep-07.wav');
let beepError = new Audio('https://www.soundjay.com/button/beep-10.wav');

// Login
document.getElementById('loginBtn').addEventListener('click', ()=>{
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const matched = users.find(u=>u.username===user && u.password===pass);
    if(matched){
        currentUser = matched;
        document.getElementById('loginContainer').style.display='none';
        sidebar.style.display='flex';
    } else {
        document.getElementById('feedbackMessage').textContent='Usuário ou senha inválidos';
    }
});

// Menu Camera
document.getElementById('btnCamera').addEventListener('click', startScanner);

// Botão Voltar
btnBack.addEventListener('click', ()=>{
    stopScanner();
    cameraContainer.style.display='none';
    btnBack.style.display='none';
    sidebar.style.display='flex';
});

// Scanner
function startScanner(){
    cameraContainer.style.display='flex';
    btnBack.style.display='block';
    sidebar.style.display='none';

    if(html5QrcodeScanner) return;

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps:10, qrbox:250 },
        qrCodeMessage=>{
            if(scannedQRCodes.has(qrCodeMessage)){
                qrFeedback.textContent='❌ QR Code já escaneado';
                qrFeedback.style.background='rgba(255,0,0,0.6)';
                qrFeedback.style.display='block';
                beepError.play();
            } else {
                scannedQRCodes.add(qrCodeMessage);
                qrFeedback.textContent=`✅ QR Code escaneado: ${qrCodeMessage}`;
                qrFeedback.style.background='rgba(0,128,0,0.6)';
                qrFeedback.style.display='block';
                beepSuccess.play();
            }
            setTimeout(()=>{ qrFeedback.style.display='none'; },2000);
        }
    ).catch(err=>{
        qrFeedback.textContent='Erro ao acessar câmera';
        qrFeedback.style.background='rgba(255,0,0,0.6)';
        qrFeedback.style.display='block';
    });
}

function stopScanner(){
    if(html5QrcodeScanner){
        html5QrcodeScanner.stop().then(()=>{
            html5QrcodeScanner.clear();
            html5QrcodeScanner=null;
        }).catch(err=>console.error(err));
    }
}
