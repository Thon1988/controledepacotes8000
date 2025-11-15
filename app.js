// app.js

const video = document.getElementById('videoElement');
const output = document.getElementById('output');
const startButton = document.getElementById('startButton');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

let scannedData = []; // Array para armazenar os dados escaneados
let scannerActive = false;
let lastScanTime = 0;
const scanInterval = 3000; // Intervalo de 3 segundos para evitar múltiplos scans do mesmo código

// Função principal para iniciar a câmera e solicitar permissão
function startCamera() {
    if (scannerActive) return;

    output.innerHTML = "Aguardando autorização... Por favor, **PERMITA** o acesso à câmera na janela pop-up.";
    startButton.disabled = true;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                // SUCESSO: Permissão concedida
                video.srcObject = stream;
                video.play();
                scannerActive = true;
                startButton.style.display = 'none'; 
                output.innerHTML = "✅ Scanner ativo! Aponte para um QR Code.";
                requestAnimationFrame(tick);
            })
            .catch(function(err) {
                // FALHA: Permissão negada ou erro de segurança
                startButton.disabled = false;
                
                let errorMessage = "Erro desconhecido ao acessar a câmera. Verifique o console (F12) para mais detalhes.";

                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errorMessage = "🛑 Acesso Negado! Permita o uso da câmera nas configurações do seu navegador para este site.";
                } else if (err.name === 'SecurityError') {
                    errorMessage = "⚠️ Erro de Segurança. O acesso à câmera requer HTTPS ou localhost.";
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

// Loop de escaneamento
function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && scannerActive) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
            handleScanResult(code.data);
        }
    }
    requestAnimationFrame(tick);
}

// Processa o link escaneado
function handleScanResult(link) {
    const now = Date.now();
    
    // Controle de tempo para evitar múltiplos scans
    if (now - lastScanTime < scanInterval) {
        return;
    }
    
    // Verifica se o link já foi escaneado no último minuto
    const isDuplicate = scannedData.some(item => item.link === link && (now - item.timestamp) < 60000); 
    
    if (isDuplicate) {
        output.innerHTML = `Código ${link.substring(0, 20)}... já escaneado recentemente!`;
        return;
    }

    lastScanTime = now;
    const timestamp = new Date().toLocaleString('pt-BR');
    
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
        timestamp: now
    };

    scannedData.push(scanEntry);
    output.innerHTML = `✅ QR Code lido e salvo! (${scannedData.length} itens salvos)`;
    console.log("Dado salvo:", scanEntry);
}

// Converte os dados para o formato CSV
function convertToCSV(data) {
    if (data.length === 0) return '';
    
    // Cabeçalhos
    const headers = ["Plataforma", "Link_Completo", "Data_Hora_Scan"];
    const csvArray = [headers.join(';')];

    data.forEach(item => {
        // Envolve em aspas para garantir que links com vírgula funcionem, usando ponto e vírgula como separador
        const row = [
            `"${item.plataforma}"`,
            `"${item.link}"`,
            `"${item.dataHora}"`
        ];
        csvArray.push(row.join(';'));
    });

    return csvArray.join('\n');
}

// Função para iniciar o download do arquivo CSV
function exportCSV() {
    if (scannedData.length === 0) {
        alert("Nenhum dado escaneado para exportar!");
        return;
    }

    // Remove o timestamp interno antes de exportar
    const dataToExport = scannedData.map(item => ({
        plataforma: item.plataforma,
        link: item.link,
        dataHora: item.dataHora
    }));

    const csvContent = convertToCSV(dataToExport);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'scanner_pacotes_dados.csv');
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`Exportação concluída! ${dataToExport.length} itens salvos.`);
}


