// app.js

const video = document.getElementById('videoElement');
const output = document.getElementById('output');
const startButton = document.getElementById('startButton');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

let scannedData = []; // Array para armazenar os dados escaneados
let scannerActive = false;
let lastScanTime = 0;
const scanInterval = 3000; // Intervalo de 3 segundos para evitar múltiplos scans

// ## 1. Inicialização e Controle da Câmera

function startCamera() {
    if (scannerActive) return;

    output.innerHTML = "Aguardando autorização... Por favor, **PERMITA** o acesso à câmera na janela pop-up.";
    startButton.disabled = true;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        
        // Prioriza a câmera traseira (facingMode: "environment")
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                // SUCESSO: Permissão concedida
                video.srcObject = stream;
                video.play();
                scannerActive = true;
                startButton.style.display = 'none'; 
                output.innerHTML = "✅ Scanner ativo! Aponte para um QR Code.";
                requestAnimationFrame(tick); // Inicia o loop de escaneamento
            })
            .catch(function(err) {
                // FALHA: Trata erros de permissão ou segurança
                startButton.disabled = false;
                
                let errorMessage = "Erro desconhecido ao acessar a câmera. ";

                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errorMessage = "🛑 Acesso Negado! Permita o uso da câmera nas configurações do seu navegador.";
                } else if (err.name === 'SecurityError') {
                    errorMessage = "⚠️ Erro de Segurança. O acesso à câmera requer HTTPS ou localhost.";
                } else if (err.name === 'NotFoundError') {
                    errorMessage = "Câmera não encontrada. Verifique se o dispositivo tem câmera.";
                } else {
                    errorMessage = `⚠️ Erro Interno do Dispositivo: ${err.name}. Verifique se a câmera está liberada.`;
                }
                
                output.innerHTML = errorMessage;
                console.error("Detalhes do erro na câmera:", err);
            });
    } else {
        // Navegador não suporta
        output.innerHTML = "Seu navegador não suporta a funcionalidade de acesso à câmera.";
        startButton.disabled = true;
    }
}

// ## 2. Loop de Escaneamento e Processamento do QR Code

function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && scannerActive) {
        // Desenha o frame do vídeo no canvas
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Pega os dados de imagem e tenta decodificar o QR Code (usando jsQR)
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
            handleScanResult(code.data);
        }
    }
    requestAnimationFrame(tick);
}

function handleScanResult(link) {
    const now = Date.now();
    
    // 1. Controle de tempo (Evita múltiplos scans em 3 segundos)
    if (now - lastScanTime < scanInterval) {
        return;
    }
    
    // 2. Verifica se o link já foi escaneado no último minuto
    const isDuplicate = scannedData.some(item => item.link === link && (now - item.timestamp) < 60000); 
    
    if (isDuplicate) {
        output.innerHTML = `Código ${link.substring(0, 20)}... já escaneado recentemente!`;
        return;
    }

    lastScanTime = now;
    const timestamp = new Date().toLocaleString('pt-BR');
    
    // 3. Identifica a plataforma
    let plataforma = 'Outra';
    if (link.includes('shopee.com.br')) {
        plataforma = 'Shopee';
    } else if (link.includes('mercadolivre.com.br')) {
        plataforma = 'Mercado Livre';
    }

    const scanEntry = {
        plataforma: plataforma,
        link: link,
        dataHora: timestamp,
        timestamp: now // Timestamp para controle interno
    };

    scannedData.push(scanEntry);
    output.innerHTML = `✅ QR Code lido e salvo! (${scannedData.length} itens salvos)`;
    console.log("Dado salvo:", scanEntry);
}

// ## 3. Funções de Exportação CSV

function convertToCSV(data) {
    if (data.length === 0) return '';
    
    // Cabeçalhos (usando ';' como separador para melhor compatibilidade com Excel)
    const headers = ["Plataforma", "Link_Completo", "Data_Hora_Scan"];
    const csvArray = [headers.join(';')];

    data.forEach(item => {
        // Envolve em aspas para tratar links que contenham o separador (ponto e vírgula)
        const row = [
            `"${item.plataforma}"`,
            `"${item.link}"`,
            `"${item.dataHora}"`
        ];
        csvArray.push(row.join(';'));
    });

    return csvArray.join('\n');
}

function exportCSV() {
    if (scannedData.length === 0) {
        alert("Nenhum dado escaneado para exportar!");
        return;
    }

    // Prepara os dados para exportação (removendo o timestamp interno)
    const dataToExport = scannedData.map(item => ({
        plataforma: item.plataforma,
        link: item.link,
        dataHora: item.dataHora
    }));

    const csvContent = convert