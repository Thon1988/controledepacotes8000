// app.js (Apenas a função startCamera() modificada)

const video = document.getElementById('videoElement');
const output = document.getElementById('output');
const startButton = document.getElementById('startButton');

// ... (Restante das variáveis e funções)

let scannerActive = false; 

// Função para iniciar a câmera
function startCamera() {
    if (scannerActive) return;

    output.innerHTML = "Aguardando autorização... Por favor, **PERMITA** o acesso à câmera na janela pop-up que irá aparecer.";
    startButton.disabled = true; // Desabilita o botão para evitar cliques múltiplos

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        
        // Tenta acessar a câmera
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(function(stream) {
                // SUCESSO: A autorização foi dada
                video.srcObject = stream;
                video.play();
                scannerActive = true;
                startButton.style.display = 'none'; 
                output.innerHTML = "✅ Scanner ativo! Aponte para um QR Code.";
                // Inicia o loop de escaneamento
                requestAnimationFrame(tick);
            })
            .catch(function(err) {
                // FALHA: A autorização foi negada ou houve outro erro
                startButton.disabled = false; // Reabilita o botão para nova tentativa
                
                let errorMessage = "Erro desconhecido ao acessar a câmera.";

                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    errorMessage = "🛑 Acesso Negado! Por favor, PERMITA o uso da câmera nas configurações do seu navegador para este site.";
                } else if (err.name === 'NotFoundError') {
                    errorMessage = "Câmera não encontrada. Verifique se o dispositivo tem câmera.";
                } else if (err.name === 'SecurityError') {
                    errorMessage = "⚠️ Erro de Segurança. Você precisa estar em HTTPS ou servidor local (http://localhost:8000).";
                }
                
                // Exibe a mensagem de erro detalhada
                output.innerHTML = errorMessage;
                console.error("Detalhes do erro:", err);
            });
    } else {
        // Se o navegador não suporta a função
        output.innerHTML = "Seu navegador não suporta a funcionalidade de acesso à câmera.";
        startButton.disabled = true;
    }
}

// ... (Restante do seu app.js, incluindo tick, handleScanResult, exportCSV)

