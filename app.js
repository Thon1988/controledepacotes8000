// app.js

const video = document.getElementById('videoElement');
const output = document.getElementById('output');
const startButton = document.getElementById('startButton');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

let scannedData = [];
let scannerActive = false;
let lastScanTime = 0;
const scanInterval = 3000;

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
                // FALHA: Trata erros de forma detalhada
                startButton.disabled = false;
                
                let errorMessage = "Erro desconhecido ao acessar a câmera. ";

                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errorMessage = "🛑 Acesso Negado! Permita o uso da câmera nas configurações do seu navegador para este site.";
                } else if (err.name === 'SecurityError') {
                    errorMessage = "⚠️ Erro de Segurança. O acesso à câmera requer HTTPS ou localhost.";
                } else if (err.name === 'NotFoundError') {
                    errorMessage = "Câmera não encontrada. Verifique se o dispositivo tem câmera.";
                } else {
                    // Captura e exibe o nome do erro que estava aparecendo como "desconhecido"
                    errorMessage = `⚠️ Erro Interno do Dispositivo: ${err.name}. Verifique se a câmera está liberada.`;
                }
                
                output.innerHTML = errorMessage;
                console.error("Detalhes do erro na câmera:", err);
            });
    } else {
        output.innerHTML = "Seu navegador não suporta a funcionalidade de acesso à câmera.";
        startButton.disabled = true;
    }
}

// ... (Restante das funções: tick, handleScanResult, convertToCSV, exportCSV)
// ... O restante do código JavaScript que lida com o scan e exportação permanece o mesmo.

// A função tick continua a mesma...
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
// ...
// (O código completo para handleScanResult, convertToCSV, exportCSV deve ser mantido)
// ...

