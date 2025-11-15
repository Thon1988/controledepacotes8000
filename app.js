// app.js

// 1. GARANTIR que todas as IDs existem no HTML
const video = document.getElementById('videoElement');
const output = document.getElementById('output');
const startButton = document.getElementById('startButton');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

let scannedData = []; 
let scannerActive = false;
let lastScanTime = 0;
const scanInterval = 3000; 

// 2. A FUNÇÃO startCamera() DEVE ESTAR DEFINIDA CORRETAMENTE
function startCamera() {
    if (scannerActive) return;

    // Garante que o usuário veja o que está acontecendo
    output.innerHTML = "Aguardando autorização... Por favor, **PERMITA** o acesso à câmera.";
    startButton.disabled = true;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                video.srcObject = stream;
                video.addEventListener('loadedmetadata', () => {
                    video.play();
                    scannerActive = true;
                    startButton.style.display = 'none'; 
                    output.innerHTML = "✅ Scanner ativo! Aponte para um QR Code.";
                    requestAnimationFrame(tick);
                }, { once: true });
            })
            .catch(function(err) {
                // TRATAMENTO DE ERRO DE CÂMERA ROBUSTO
                startButton.disabled = false;
                startButton.style.display = 'block';
                let errorMessage = "";
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errorMessage = "🛑 Acesso Negado! Permita o uso da câmera.";
                } else if (err.name === 'SecurityError') {
                    errorMessage = "⚠️ Erro de Segurança. Requer HTTPS ou localhost.";
                } else {
                    errorMessage = `⚠️ Erro: ${err.name}.`;
                }
                output.innerHTML = errorMessage;
            });
    } else {
        output.innerHTML = "Seu navegador não suporta a câmera.";
        startButton.disabled = true;
    }
}

// 3. O restante das funções (tick, handleScanResult, convertToCSV, exportCSV) 
//    são as mesmas da versão completa e foram revisadas.

// ... (Resto do código omitido por brevidade, mas você deve usar a versão completa)
