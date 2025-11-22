document.addEventListener("DOMContentLoaded", ()=>{

// ----------------- Usuários e Dados -----------------
const users = [{ username:'thon', password:'882010', role:'gestor' }];
let currentUser = null;

// Entregas (exemplo)
const deliveries = [
    { id:'101', nome:'João Silva', endereco:'Rua A, 123, São Paulo, SP' },
    { id:'102', nome:'Maria Oliveira', endereco:'Av. B, 456, Rio de Janeiro, RJ' },
    { id:'103', nome:'Carlos Souza', endereco:'Rua C, 789, Belo Horizonte, MG' },
    { id:'104', nome:'Ana Lima', endereco:'Av. D, 321, Curitiba, PR' }
];

// Registro de leituras para CSV
let scanRecords = JSON.parse(localStorage.getItem('pegazus_scans_v3') || '[]');

// ----------------- Scanner & UI -----------------
const cameraContainer = document.getElementById('cameraContainer');
const qrFeedback = document.getElementById('qrFeedback');
const btnBack = document.getElementById('btnBack');
const sidebar = document.getElementById('sidebar');
const loginContainer = document.getElementById('loginContainer');
const btnSair = document.getElementById('btnSair');
const btnGenerateCSV = document.getElementById('btnGenerateCSV');
let html5QrcodeScanner;
let scannedQRCodes = new Set();
let beepSuccess;
let beepError;

// Tenta inicializar o áudio (pode falhar se não for HTTPS/localhost)
try {
    beepSuccess = new Audio('https://www.soundjay.com/button/beep-07.wav');
    beepError = new Audio('https://www.soundjay.com/button/beep-10.wav');
} catch (e) {
    console.error("Audio initialization failed:", e);
    // Cria objetos mock para evitar erro no .play()
    beepSuccess = { play: ()=>{} }; 
    beepError = { play: ()=>{} };
}

// ----------------- Login / Logout -----------------

document.getElementById('loginBtn').addEventListener('click', ()=>{
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    
    const matched = users.find(u=>u.username===user && u.password===pass);
    
    if(matched){
        currentUser = matched;
        loginContainer.style.display='none';
        sidebar.style.display='flex';
        document.getElementById('feedbackMessage').textContent='';
    } else {
        document.getElementById('feedbackMessage').textContent='Usuário ou senha inválidos';
    }
});

// Botão Sair (Logout)
if(btnSair) {
    btnSair.addEventListener('click', ()=>{
        currentUser = null;
        scannedQRCodes.clear();
        sidebar.style.display='none';
        loginContainer.style.display='block';
        stopScanner();
        cameraContainer.style.display='none';
        btnBack.style.display='none';
    });
}

// ----------------- Navegação / CSV -----------------

// Menu Camera
document.getElementById('btnCamera').addEventListener('click', startScanner);

// Botão Voltar
btnBack.addEventListener('click', ()=>{
    stopScanner();
    cameraContainer.style.display='none';
    btnBack.style.display='none';
    sidebar.style.display='flex';
});

// Botão Gerar CSV
if (btnGenerateCSV) {
    btnGenerateCSV.addEventListener('click', generateCSV);
}


// ----------------- Scanner Logic -----------------

function startScanner(){
    if (!currentUser) {
        alert('Você precisa estar logado para acessar o scanner.');
        return;
    }
    
    cameraContainer.style.display='flex';
    btnBack.style.display='block';
    sidebar.style.display='none';

    if(html5QrcodeScanner) return;

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps:10, qrbox:250 },
        qrCodeMessage=>{
            // Garante que o ID do QR code seja tratado como string para comparação
            const qrString = String(qrCodeMessage);
            const delivery = deliveries.find(d=>d.id===qrString) || { id: qrString, nome:'Desconhecido', endereco:'Desconhecido' };

            if(scannedQRCodes.has(qrString)){
                qrFeedback.textContent='❌ QR Code já escaneado';
                qrFeedback.style.background='rgba(255,0,0,0.6)';
                qrFeedback.style.display='block';
                beepError.play();
            } else {
                scannedQRCodes.add(qrString);
                qrFeedback.textContent=`✅ Entrega: ${delivery.nome}`;
                qrFeedback.style.background='rgba(0,128,0,0.6)';
                qrFeedback.style.display='block';
                beepSuccess.play();

                // Salva no registro
                const record = {
                    idEntrega: delivery.id,
                    nomeCliente: delivery.nome,
                    endereco: delivery.endereco,
                    qr: qrString,
                    usuario: currentUser.username,
                    datetime: new Date().toISOString()
                };
                scanRecords.push(record);
                localStorage.setItem('pegazus_scans_v3', JSON.stringify(scanRecords));
            }
            setTimeout(()=>{ qrFeedback.style.display='none'; },2000);
        }
    ).catch(err=>{
        qrFeedback.textContent='Erro ao acessar câmera';
        qrFeedback.style.background='rgba(255,0,0,0.6)';
        qrFeedback.style.display='block';
        console.error("Scanner startup failed:", err);
    });
}

function stopScanner(){
    if(html5QrcodeScanner){
        html5QrcodeScanner.stop().then(()=>{
            html5QrcodeScanner.clear();
            html5QrcodeScanner=null;
        }).catch(err=>console.error("Error stopping scanner, but proceeding:", err));
    }
}

// ----------------- CSV Logic -----------------

function generateCSV(){
    if(scanRecords.length===0){ alert('Nenhum registro disponível'); return; }

    let csv = 'ID Entrega,Nome Cliente,Endereço,QR Code,Usuário,Data e Hora\n';
    scanRecords.forEach(r=>{
        // Usa aspas para envolver strings para lidar com vírgulas dentro do endereço
        csv += `${r.idEntrega},"${r.nomeCliente}","${r.endereco.replace(/"/g, '""')}",${r.qr},${r.usuario},${r.datetime}\n`;
    });

    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url;
    a.download='relatorio_scans.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

});
