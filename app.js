// =========================================================
// 1. VARIÁVEIS GLOBAIS
// =========================================================
var map;
var routingControl = null;
var marcadoresEntregadores = {}; // {motorista_id: L.marker}
var dadosEntregasOriginais = []; // Dados brutos da API para filtros
var layerGroupEntregas = L.layerGroup(); // Layer para marcadores de entrega
const INTERVALO_RASTREAMENTO = 15000; // 15 segundos
const DEPOSITO_LAT_LNG = L.latLng(-23.5505, -46.6333); // Seu Depósito

// =========================================================
// 2. ÍCONES (Passo C & Rastreamento)
// =========================================================

// Ícones para status de entrega (cores diferentes)
const IconeEntrega = {
    'Pendente': L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
    'Em Rota': L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
    'Entregue': L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
    'Cancelada': L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] }),
};

// Ícone para o Entregador
const IconeEntregador = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
});


// =========================================================
// 3. FUNÇÕES PRINCIPAIS (Inicialização e Ciclo de Vida)
// =========================================================

// 3.1. Inicialização do Mapa (Passo A)
function inicializarMapa() {
    try {
        map = L.map('mapid').setView(DEPOSITO_LAT_LNG, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);
        layerGroupEntregas.addTo(map); // Adiciona o LayerGroup ao mapa
        
        console.log("Mapa Leaflet inicializado.");
        return true;
    } catch(e) {
        console.error("Erro ao inicializar o Leaflet:", e);
        return false;
    }
}

// 3.2. Função de carregamento inicial dos dados da API
async function carregarEntregas() {
    console.log("Iniciando busca de entregas...");
    try {
        const response = await fetch('/api/entregas/ativas'); // Endpoint (Passo B)
        if (!response.ok) throw new Error('Falha na API de entregas');
        
        dadosEntregasOriginais = await response.json();
        
        // Renderiza e inicia o rastreamento após a primeira carga
        preencherFiltros(dadosEntregasOriginais); 
        renderizarMarcadores(dadosEntregasOriginais);
        iniciarRastreamento();

    } catch (error) {
        console.error("❌ ERRO ao carregar entregas:", error);
        Swal.fire('Erro', 'Não foi possível carregar os dados das entregas.', 'error');
    }
}

// 3.3. Função de Rastreamento (Passo Rastreamento A)
function iniciarRastreamento() {
    atualizarPosicoesEntregadores(); 
    setInterval(atualizarPosicoesEntregadores, INTERVALO_RASTREAMENTO);
}


// =========================================================
// 4. LÓGICA DE FILTRAGEM E RENDERIZAÇÃO
// =========================================================

// 4.1. Preencher opções de motorista nos filtros
function preencherFiltros(dados) {
    const selectMotorista = document.getElementById('filtroMotorista');
    if (!selectMotorista) return;

    // Limpa as opções existentes (exceto o "Todos")
    selectMotorista.innerHTML = '<option value="Todos">Todos</option>';
    
    // Extrai motoristas únicos
    const motoristas = [...new Set(dados.filter(e => e.motorista_id).map(e => ({
        id: e.motorista_id,
        nome: e.motorista_nome || `Motorista ${e.motorista_id}` // Assuma que a API retorna o nome
    })).map(m => JSON.stringify(m)))].map(s => JSON.parse(s));

    motoristas.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.nome;
        selectMotorista.appendChild(option);
    });
}

// 4.2. Renderiza marcadores no mapa (usado por carregarEntregas e aplicarFiltros)
function renderizarMarcadores(entregasFiltradas) {
    layerGroupEntregas.clearLayers(); 

    entregasFiltradas.forEach(entrega => {
        const { id, latitude, longitude, status } = entrega;
        if (latitude && longitude) {
            const customIcon = IconeEntrega[status] || IconeEntrega['Default'];
            const marker = L.marker([latitude, longitude], { icon: customIcon });
            
            // Reutiliza a lógica do popup
            marker.bindPopup(criarPopupContent(entrega)); 
            layerGroupEntregas.addLayer(marker); 
        }
    });

    // Ajusta a visão do mapa para os marcadores renderizados (se houver)
    if (layerGroupEntregas.getLayers().length > 0) {
        const bounds = layerGroupEntregas.getBounds();
        if (bounds.isValid()) {
             map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}

// 4.3. Aplica os filtros (Chamado pelo 'onchange' ou 'onclick' nos controles)
function aplicarFiltros() {
    const statusSelecionado = document.getElementById('filtroStatus')?.value || 'Todos';
    const motoristaSelecionado = document.getElementById('filtroMotorista')?.value || 'Todos';
    const dataMinima = document.getElementById('filtroData')?.value;

    let entregasFiltradas = dadosEntregasOriginais; 

    if (statusSelecionado !== 'Todos') {
        entregasFiltradas = entregasFiltradas.filter(e => e.status === statusSelecionado);
    }

    if (motoristaSelecionado !== 'Todos') {
        entregasFiltradas = entregasFiltradas.filter(e => String(e.motorista_id) === motoristaSelecionado);
    }
    
    if (dataMinima) {
        const dataFiltro = new Date(dataMinima);
        entregasFiltradas = entregasFiltradas.filter(e => {
            if (e.previsao_entrega) {
                // Compara apenas a data (ignora a hora)
                const dataEntrega = new Date(e.previsao_entrega.substring(0, 10)); 
                return dataEntrega >= dataFiltro;
            }
            return false;
        });
    }
    
    renderizarMarcadores(entregasFiltradas);
}

// =========================================================
// 5. FUNÇÕES DE RASTREAMENTO E ROTA (Adaptadas)
// =========================================================

async function atualizarPosicoesEntregadores() {
    // ... Código da função atualizarPosicoesEntregadores do passo anterior ...
    const ENDPOINT_POSICOES = '/api/entregadores/posicoes';

    try {
        const response = await fetch(ENDPOINT_POSICOES);
        const posicoes = await response.json();

        posicoes.forEach(entregador => {
            const { motorista_id, latitude, longitude, nome, ultima_atualizacao } = entregador;
            const posicao = L.latLng(latitude, longitude);
            
            if (marcadoresEntregadores[motorista_id]) {
                marcadoresEntregadores[motorista_id].setLatLng(posicao);
                const popupContent = `<b>${nome}</b><br>Posição: ${new Date(ultima_atualizacao).toLocaleTimeString()}`;
                marcadoresEntregadores[motorista_id].setPopupContent(popupContent);

            } else {
                const popupContent = `<b>${nome}</b><br>Posição: ${new Date(ultima_atualizacao).toLocaleTimeString()}`;
                const novoMarker = L.marker(posicao, { icon: IconeEntregador })
                                    .bindPopup(popupContent)
                                    .addTo(map);
                marcadoresEntregadores[motorista_id] = novoMarker;
            }
        });
        
    } catch (error) {
        console.error("Erro ao rastrear entregadores:", error);
    }
}

/**
 * Desenha a rota no mapa do Depósito até um destino específico (Passo Roteamento C)
 * @param {number} lat - Latitude do destino.
 * @param {number} lng - Longitude do destino.
 */
function desenharRota(lat, lng) {
    if (routingControl) {
        map.removeControl(routingControl);
    }
    
    const destino = L.latLng(lat, lng);

    routingControl = L.Routing.control({
        waypoints: [DEPOSITO_LAT_LNG, destino],
        routeWhileDragging: false,
        show: true,
        language: 'pt',
        autoRoute: true,
        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
        lineOptions: {
            styles: [
                {color: 'black', opacity: 0.15, weight: 9},
                {color: 'white', opacity: 0.8, weight: 6},
                {color: '#007bff', opacity: 1, weight: 3}
            ]
        }
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
        const routes = e.routes;
        if (routes.length > 0) {
            const bounds = routes[0].coordinates.reduce((a, b) => a.extend(b), L.latLngBounds());
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    });
}

// =========================================================
// 6. POPUP, STATUS E COMPROVATIVO (Adaptadas)
// =========================================================

// 6.1. Cria o conteúdo do popup com os botões
function criarPopupContent(entrega) {
    const { id, status, endereco, nome_cliente, latitude, longitude } = entrega;
    return `
        <div style="min-width: 180px;">
            <center><b>Entrega #${id} - ${status}</b></center>
            <hr style="margin: 5px 0;">
            <b>Cliente:</b> ${nome_cliente}<br>
            <b>Endereço:</b> ${endereco}<br>
            
            <hr style="margin: 5px 0;">
            <button onclick="abrirDetalhesEntrega(${id})" 
                    style="width: 100%; margin-bottom: 5px; padding: 5px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Atualizar Status
            </button>
            <button onclick="abrirComprovativoCamera(${id})" 
                    style="width: 100%; margin-bottom: 5px; padding: 5px; background-color: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">
                Comprovativo / QR Code
            </button>
            <button onclick="desenharRota(${latitude}, ${longitude})" 
                    style="width: 100%; padding: 5px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Mostrar Rota
            </button>
        </div>
    `;
}

// 6.2. Abrir Comprovativo / QR Code (Passo Câmera/QR Code)
function abrirComprovativoCamera(entregaId) {
    const cameraHtml = `<div id="reader" style="width:100%; height: 300px;"></div>`;
    
    Swal.fire({
        title: `Comprovativo Entrega #${entregaId}`,
        html: cameraHtml,
        showCancelButton: true,
        showConfirmButton: false,
        didOpen: () => {
            iniciarQrCodeScanner(entregaId); 
        },
        willClose: () => {
            if (window.qrCodeScanner) {
                window.qrCodeScanner.clear().catch(error => console.error("Falha ao desligar a câmera", error));
            }
        }
    });
}

// 6.3. Inicializa o Leitor de QR Code (requer html5-qrcode.js)
function iniciarQrCodeScanner(entregaId) {
    const html5QrCode = new Html5Qrcode("reader");
    window.qrCodeScanner = html5QrCode;
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config,
        (decodedText, decodedResult) => {
            html5QrCode.stop().then(() => {
                Swal.fire({
                    title: 'QR Code Lido!',
                    text: `Código: ${decodedText}. Deseja anexar como comprovativo?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Anexar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        enviarComprovativoAPI(entregaId, decodedText, 'QR_CODE');
                    }
                });
            });
        },
        (errorMessage) => { /* Ignorar erros de varredura contínua */ }
    ).catch((err) => {
        Swal.showValidationMessage(`Erro ao iniciar câmera: ${err}`);
    });
}

// 6.4. Enviar Comprovativo para a API
async function enviarComprovativoAPI(id, dado, tipo) {
    // Exemplo: Substitua pela sua chamada real
    console.log(`Enviando ${tipo} para a Entrega #${id}: ${dado}`);

    try {
        const response = await fetch(`/api/entregas/${id}/comprovante`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo_comprovante: tipo, dado: dado })
        });
        
        if (!response.ok) throw new Error('Falha ao enviar comprovante');

        Swal.fire('Sucesso!', 'Comprovativo enviado e anexado à entrega.', 'success');

    } catch (error) {
        console.error("Erro no envio de comprovativo:", error);
        Swal.fire('Erro!', 'Não foi possível enviar o comprovativo.', 'error');
    }
}
