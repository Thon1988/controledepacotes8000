// app.js

const video = document.getElementById('videoElement');
const output = document.getElementById('output');
const startButton = document.getElementById('startButton'); // Novo elemento
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

let scannedData = [];
let scannerActive = false; // Novo controle para garantir que o scanner só inicie uma vez

// Função para iniciar a câmera
function startCamera() {
    if (scannerActive) return; // Se já estiver ativo, não faça nada

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                video.srcObject = stream;
                video.play();
                scannerActive = true; // Marca como ativo
                startButton.style.display = 'none'; // Esconde o botão após iniciar
                output.innerHTML = "✅ Scanner ativo! Aponte para um QR Code.";
                requestAnimationFrame(tick);
            })
            .catch(function(err) {
                output.innerHTML = "Erro ao acessar a câmera: " + err + ". (Lembre-se: precisa estar em um servidor http/https)";
                startButton.disabled = true;
            });
    } else {
        output.innerHTML = "Seu navegador não suporta acesso à câmera.";
        startButton.disabled = true;
    }
}

// O restante do código (tick, handleScanResult, convertToCSV, exportCSV) permanece o mesmo.

// Removido: window.onload = startCamera;
// Agora, a função é chamada apenas pelo botão.


// Função que processa o resultado do QR Code (Apenas a primeira parte para contexto)
function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // ... (resto da função tick)
        // ...
        
        // ...
    }
    requestAnimationFrame(tick);
}

// ... (O restante das funções handleScanResult, convertToCSV e exportCSV)
// ...
