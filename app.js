// app.js

const video = document.getElementById('videoElement');
const output = document.getElementById('output');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

let scannedData = []; // Array para armazenar os links e data/hora

// Função para iniciar a câmera
function startCamera() {
    // Dentro da função startCamera no app.js:
navigator.mediaDevices.getUserMedia({ 
    video: { 
        // Esta linha pede para usar a câmera traseira, ideal para scanner
        facingMode: "environment" 
    } 
})if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }) // Prioriza a câmera traseira
            .then(function(stream) {
                video.srcObject = stream;
                video.play();
                requestAnimationFrame(tick);
            })
            .catch(function(err) {
                output.innerHTML = "Erro ao acessar a câmera: " + err;
            });
    } else {
        output.innerHTML = "Seu navegador não suporta acesso à câmera.";
    }
}

// Loop de processamento de vídeo (o "scanner" real)
function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Ajusta o canvas para o tamanho do vídeo
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Pega os dados de imagem do frame
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Usa a biblioteca jsQR para buscar um código
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code) {
            handleScanResult(code.data);
        }
    }
    requestAnimationFrame(tick); // Continua o loop
}

let lastScanTime = 0;
const scanInterval = 3000; // 3 segundos para evitar múltiplos scans do mesmo código

// Função que processa o resultado do QR Code
function handleScanResult(link) {
    const now = Date.now();
    // Verifica se já passou o tempo mínimo desde o último scan
    if (now - lastScanTime < scanInterval) {
        return;
    }
    
    // Verifica se o link já foi escaneado recentemente
    const isDuplicate = scannedData.some(item => item.link === link && (now - item.timestamp) < 60000); // Duplicata em 1 minuto
    
    if (isDuplicate) {
        output.innerHTML = `Código já escaneado! (${link})`;
        return;
    }

    lastScanTime = now;
    const timestamp = new Date().toLocaleString('pt-BR');
    
    // Lógica simples para identificar a plataforma
    let plataforma = 'Desconhecida';
    if (link.includes('shopee.com.br')) {
        plataforma = 'Shopee';
    } else if (link.includes('mercadolivre.com.br')) {
        plataforma = 'Mercado Livre';
    }

    const scanEntry = {
        plataforma: plataforma,
        link: link,
        dataHora: timestamp,
        timestamp: now // Salva o timestamp bruto para controle
    };

    scannedData.push(scanEntry);
    output.innerHTML = `✅ QR Code lido! (${scannedData.length} itens salvos)`;
    console.log("Dados salvos:", scanEntry);
}

// Inicia a câmera quando a página carregar
window.onload = startCamera;

// Continuação de app.js

function convertToCSV(data) {
    if (data.length === 0) return '';
    
    // Define os cabeçalhos (baseado nas chaves do objeto)
    const headers = ["Plataforma", "Link", "Data/Hora"];
    const csvArray = [headers.join(';')]; // Primeira linha com cabeçalhos

    // Itera sobre os dados para criar as linhas do CSV
    data.forEach(item => {
        // Certifique-se de que a ordem corresponde aos cabeçalhos
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

    // Remove o timestamp interno antes de gerar o CSV final
    const dataToExport = scannedData.map(item => ({
        plataforma: item.plataforma,
        link: item.link,
        dataHora: item.dataHora
    }));

    const csvContent = convertToCSV(dataToExport);

    // Cria um Blob (objeto binário de dados) com o conteúdo CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Cria um link temporário para iniciar o download
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'scans_produtos.csv');
    
    // Simula um clique no link
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`Exportação concluída! ${dataToExport.length} itens salvos em 'scans_produtos.csv'.`);
}