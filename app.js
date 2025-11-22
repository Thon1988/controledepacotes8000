document.addEventListener("DOMContentLoaded", ()=>{

// ----------------- Usuários e Dados -----------------
const users = [{ username:'thon', password:'882010', role:'gestor' }];
let currentUser = null;

const deliveries = [
    { id:'101', nome:'João Silva', endereco:'Rua A, 123, São Paulo, SP' },
    { id:'102', nome:'Maria Oliveira', endereco:'Av. B, 456, Rio de Janeiro, RJ' },
    { id:'103', nome:'Carlos Souza', endereco:'Rua C, 789, Belo Horizonte, MG' },
    { id:'104', nome:'Ana Lima', endereco:'Av. D, 321, Curitiba, PR' }
];

let scanRecords = JSON.parse(localStorage.getItem('pegazus_scans_v3') || '[]');

// ----------------- Elementos UI -----------------
const cameraContainer = document.getElementById('cameraContainer');
const qrFeedback = document.getElementById('qrFeedback');
const btnBack = document.getElementById('btnBack');
const sidebar = document.getElementById('sidebar');
const loginContainer = document.getElementById('loginContainer'); 
const btnSair = document.getElementById('btnSair');
const btnGenerateCSV = document.getElementById('btnGenerateCSV');
const contentArea = document.getElementById('contentArea'); 
const btnEntregas = document.getElementById('btnEntregas'); 
const btnMapa = document.getElementById('btnMapa'); 
const btnGerarRota = document.getElementById('btnGerarRota'); 
const btnUsers = document.getElementById('btnUsers'); 

let html5QrcodeScanner;
let scannedQRCodes = new Set();
let beepSuccess = { play: ()=>{} }; // Definição inicial
let beepError = { play: ()=>{} };  // Definição inicial

// Tenta inicializar o áudio
try {
    beepSuccess = new Audio('https://www.soundjay.com/button/beep-07.wav');
    beepError = new Audio('https://www.soundjay.com/button/beep-10.wav');
} catch (e) {
    console.error("Audio initialization failed:", e);
}

// ----------------- Funções de Navegação e Estado -----------------

// Função para esconder todos os containers de conteúdo (Scanner, ContentArea, Login)
function hideAllContentViews() {
    cameraContainer.style.display = 'none';
    btnBack.style.display = 'none';
    contentArea.style.display = 'none';
    loginContainer.style.display = 'none';
}

// Botão Voltar: Volta do Scanner ou de uma visualização para o menu principal (ContentArea com Entregas)
btnBack.addEventListener('click', ()=>{
    stopScanner(); // Garante que a câmera pare
    
    // Esconde o que estava ativo (Scanner)
    cameraContainer.style.display='none';
    btnBack.style.display='none';
    
    // Volta para o Menu Principal/Inicial (lista de Entregas)
    showGenericContent(showDeliveries); 
});

// ----------------- Login / Logout -----------------

document.getElementById('loginBtn').addEventListener('click', ()=>{
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    
    const matched = users.find(u=>u.username===user && u.password===pass);
    
    if(matched){
        currentUser = matched;
        loginContainer.style.display='none';
        sidebar.style.display='flex'; // Mostra o menu lateral fixo
        document.getElementById('feedbackMessage').textContent='';
        // Inicia na tela de Entregas (o menu inicial)
        showGenericContent(showDeliveries); 
    } else {
        document.getElementById('feedbackMessage').textContent='Usuário ou senha inválidos';
    }
});

if(btnSair) {
    btnSair.addEventListener('click', ()=>{
        currentUser = null;
        scannedQRCodes.clear();
        sidebar.style.display='none';
        stopScanner();
        hideAllContentViews();
        loginContainer.style.display='block';
    });
}

// ----------------- Lógica de Visualização de Conteúdo -----------------

// Lógica de visualização de conteúdo genérico: Esconde tudo e mostra ContentArea
function showGenericContent(contentFunction) {
    if (!currentUser) return;
    
    // Esconde o Scanner e o botão Voltar
    cameraContainer.style.display = 'none';
    btnBack.style.display = 'none';
    stopScanner(); 
    
    // Esconde o ContentArea (para dar lugar a um novo conteúdo)
    contentArea.style.display = 'none';

    contentFunction(); // Executa a função específica que preenche o ContentArea

    // Mostra o ContentArea preenchido
    contentArea.style.display = 'block';
}

// ----------------- Scanner Logic -----------------

// Menu Camera: MUDANÇA na lógica de navegação para o Scanner
document.getElementById('btnCamera').addEventListener('click', ()=>{
    if (!currentUser) return;
    
    // Esconde o ContentArea
    contentArea.style.display = 'none';
    
    // Mostra Scanner e Botão Voltar
    cameraContainer.style.display='flex'; 
    btnBack.style.display='block'; 
    
    // Inicia o Scanner
    startScanner();
});

function startScanner(){
    if(html5QrcodeScanner) return;

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps:10, qrbox:250 },
        qrCodeMessage=>{
            // Lógica de escaneamento (inalterada)
            const qrString = String(qrCodeMessage);
            const delivery = deliveries.find(d=>d.id===qrString) || { id: qrString, nome:'Desconhecido', endereco:'Desconhecido' };

            if(scannedQRCodes.has(qrString)){
                qrFeedback.textContent='❌ QR Code já escaneado';
                qrFeedback.style.background='rgba(255,0,0,0.6)';
                beepError.play();
            } else {
                scannedQRCodes.add(qrString);
                qrFeedback.textContent=`✅ Entrega: ${delivery.nome} registrada!`;
                qrFeedback.style.background='rgba(0,128,0,0.6)';
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
            qrFeedback.style.display='block';
            setTimeout(()=>{ qrFeedback.style.display='none'; },2000);
        }
    ).catch(err=>{
        qrFeedback.textContent='❌ Erro ao acessar câmera. Verifique as permissões.';
        qrFeedback.style.background='rgba(255,0,0,0.6)';
        qrFeedback.style.display='block';
        console.error("Scanner startup failed:", err);
        setTimeout(()=>{ qrFeedback.style.display='none'; }, 4000);
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


// ----------------- Lógica de Entregas, Rota, Mapa e Usuários -----------------

if (btnEntregas) {
    btnEntregas.addEventListener('click', () => showGenericContent(showDeliveries));
}
function showDeliveries() {
    // Conteúdo da Lista de Entregas
    if (deliveries.length === 0) {
        contentArea.innerHTML = '<h2>Não há Entregas</h2><p>Nenhuma entrega cadastrada para ser exibida.</p>';
    } else {
        let listHtml = '<h2>📦 Entregas Cadastradas:</h2><p>Escaneadas: <strong>' + scannedQRCodes.size + '</strong></p><ul>';
        deliveries.forEach(d => {
            const isScanned = scannedQRCodes.has(d.id);
            const status = isScanned ? '✅ Concluída' : '⏳ Pendente';
            listHtml += `<li style="margin-bottom: 5px;"><strong>${d.nome}</strong> (ID: ${d.id}) - [${status}]</li>`;
        });
        listHtml += '</ul>';
        contentArea.innerHTML = listHtml;
    }
}

if (btnGerarRota) {
    btnGerarRota.addEventListener('click', () => showGenericContent(generateRoute));
}
function generateRoute() {
    // Conteúdo da Rota
    if (deliveries.length === 0) {
        showDeliveries(); 
        return;
    }
    
    if (scannedQRCodes.size < 2) {
        contentArea.innerHTML = '<h2>🗺️ Geração de Rota</h2><p style="color:red; font-weight: bold;">Necessário escanear pelo menos 2 entregas para gerar a rota.</p><p>Escaneie os QR Codes antes de tentar gerar a rota.</p>';
    } else {
        contentArea.innerHTML = `<h2>🗺️ Geração de Rota</h2><p style="color:green; font-weight: bold;">Rota gerada com sucesso para ${scannedQRCodes.size} entregas escaneadas!</p><p> (Integração com serviço de mapas pendente)</p>`;
    }
}

if (btnMapa) {
    btnMapa.addEventListener('click', () => showGenericContent(showMapPlaceholder));
}
function showMapPlaceholder() {
    // Conteúdo do Mapa
    contentArea.innerHTML = '<h2>📍 Visualização do Mapa</h2><p>A funcionalidade completa de mapa precisa de integração com uma API de mapas (ex: Google Maps) e está pendente.</p>';
}

if (btnUsers) {
    btnUsers.addEventListener('click', () => showGenericContent(showUsers));
}
function showUsers() {
    // Conteúdo de Usuários
    if (currentUser && currentUser.role === 'gestor') {
        let listHtml = '<h2>👥 Gestão de Usuários</h2><p>Lista de usuários cadastrados no sistema:</p><ul>';
        users.forEach(u => {
            listHtml += `<li style="margin-bottom: 5px;">**${u.username}** (Cargo: ${u.role})</li>`;
        });
        listHtml += '</ul>';
        contentArea.innerHTML = listHtml;
    } else {
        contentArea.innerHTML = '<h2>Acesso Negado</h2><p style="color:red; font-weight: bold;">Você não tem permissão de Gestor para visualizar a lista de usuários.</p>';
    }
}

// ----------------- CSV Logic -----------------

if (btnGenerateCSV) {
    btnGenerateCSV.addEventListener('click', generateAndShowCSV);
}

function generateAndShowCSV(){
    if (!currentUser) return;

    if(scanRecords.length===0){ 
        alert('Nenhum registro disponível'); 
        showGenericContent(showDeliveries); // Volta para o menu
        return; 
    }

    // Lógica para download (inalterada)
    let csv = 'ID Entrega,Nome Cliente,Endereço,QR Code,Usuário,Data e Hora\n';
    scanRecords.forEach(r=>{
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
    
    // Após o download, exibe a mensagem de sucesso e volta para o menu
    showGenericContent(()=>{
        contentArea.innerHTML = '<h2>📄 Relatório CSV</h2><p style="color:green; font-weight: bold;">Relatório de scans baixado com sucesso!</p>';
        setTimeout(() => showGenericContent(showDeliveries), 2000); // Volta para Entregas após 2s
    });
}

});
