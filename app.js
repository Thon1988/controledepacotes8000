<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>📦 Scanner 8000 v0.1</title>

    <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>

  <style>
    /* Estilos gerais do corpo da aplicação */
    html,body{
        height:100%;
        margin:0;
        font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial;
        background:#f4f4f7; /* Fundo claro fixo */
        color:#111; /* Texto preto fixo */
        display: flex; /* Para centralizar o conteúdo */
        flex-direction: column; /* Organiza os itens em coluna */
        justify-content: center; /* Centraliza verticalmente */
        align-items: center; /* Centraliza horizontalmente */
    }

    .app{
        max-width:920px;
        margin:12px auto;
        padding:12px;
        width: 100%; /* Ocupa a largura total para responsividade */
        box-sizing: border-box; /* Inclui padding na largura */
    }
    
    h1{margin:0 0 8px;font-size:18px;color:#111; text-align: center;} 
    
    .controls{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-bottom:10px;
        align-items:center;
        justify-content: center; /* Centraliza os botões */
    }
    button{
        background:#00b4d8;
        color:#fff;
        border:0;
        padding:8px 12px;
        border-radius:8px;
        cursor:pointer;
        font-weight:600;
        transition: background 0.2s ease;
    }
    button:hover {
        background: #0096c7;
    }
    button.secondary{background:#6c757d}
    button.secondary:hover {
        background: #5a6268;
    }
    
    /* Estilo para Inputs/Selects (Alto contraste) */
    .controls input[type="text"], 
    .controls input[type="password"], 
    .controls input[type="date"],
    .controls select {
      padding: 8px; 
      border-radius: 8px; 
      border: 1px solid #ccc; 
      width: auto; 
      color: #111; 
      background-color: #fff; 
      box-sizing: border-box;
    }

    .camera-wrap{
        position:relative;
        max-width:920px;
        margin:0 auto;
        border-radius:12px;
        overflow:hidden;
        background:#000;
        height:60vh;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1); /* Sombra suave */
    }
    video#videoElement{width:100%;height:100%;object-fit:cover;display:block;background:#000}
    canvas#overlay{position:absolute;left:0;top:0;pointer-events:none;width:100%;height:100%}
    
    /* Painel de Registros/Gerenciamento */
    .panel{
        background:#fff; /* Fundo de painel branco fixo */
        padding:10px;
        border-radius:8px;
        margin-top:12px;
        box-shadow:0 1px 6px rgba(0,0,0,.1); 
        color:#111; /* Texto preto fixo */
    }
    
    #output{min-height:36px;display:flex;align-items:center;gap:8px;color:#6c757d;padding:4px}
    .list{max-height:180px;overflow:auto;margin-top:8px;border-radius:6px;border:1px solid #eee;padding:8px}
    .item{padding:8px;border-bottom:1px solid #eee; color:#343a40;} 
    .select-device{background:#fff;color:#111;border-radius:8px;padding:6px}
    .select-label { color: #111; font-size: 14px; margin-left: 6px; }
    #scanPopup{position:fixed;right:16px;bottom:16px;background:#222;color:#fff;padding:10px 14px;border-radius:8px;display:none;z-index:9999}
    
    /* --- NOVOS ESTILOS PARA A TELA DE LOGIN --- */
    .login-container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: calc(100vh - 50px); /* Ajusta altura para não sobrepor o footer se houver */
        width: 100%;
        max-width: 400px; /* Largura máxima para o formulário */
        margin: auto; /* Centraliza na tela */
        padding: 20px;
        box-sizing: border-box;
    }

    #loginForm {
        background: #ffffff;
        padding: 30px 25px;
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
        text-align: center;
        width: 100%; /* Ocupa a largura do login-container */
        box-sizing: border-box;
        display: flex; /* Para organizar os inputs e botão */
        flex-direction: column;
        gap: 15px; /* Espaçamento entre os elementos do formulário */
    }

    #loginForm input[type="text"],
    #loginForm input[type="password"] {
        width: 100%; /* Ocupa 100% da largura do formulário */
        padding: 12px;
        margin-bottom: 0; /* Remove a margem inferior padrão */
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 16px;
        transition: border-color 0.2s ease;
    }
    #loginForm input[type="text"]:focus,
    #loginForm input[type="password"]:focus {
        border-color: #00b4d8; /* Cor de destaque ao focar */
        outline: none;
    }

    #loginForm button {
        width: 100%;
        padding: 12px 20px;
        font-size: 16px;
        font-weight: bold;
        background: #00b4d8;
        color: #fff;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s ease;
    }
    #loginForm button:hover {
        background: #0096c7;
    }

    /* Oculta a aplicação principal quando o login está ativo */
    body.login-active .app {
        display: none;
    }
    
    /* Quando não está logado, a saída e a lista não devem aparecer */
    #output, #scansList {
        display: none;
    }

    /* Responsividade para celular */
    @media (max-width:520px){ 
      .controls{flex-direction:column;align-items:stretch} 
      .camera-wrap{height:50vh} 
      .login-container {
            padding: 10px;
            max-width: 95%; /* Ajusta para telas menores */
        }
    }
  </style>
</head>
<body>
    <div class="app">
        <h1>📦 Scanner 8000 v0.1</h1>

        <div class="controls" id="controls">
              <button id="startButton" aria-label="Iniciar câmera" style="display:none">▶️ Iniciar câmera</button>
      <button id="stopButton" class="secondary" style="display:none" aria-label="Parar câmera">⏹️ Parar</button>
      <button id="torchButton" class="secondary" style="display:none" aria-label="Ligar flash">🔦 Flash</button>

      <label for="deviceSelect" class="select-label" style="display:none" id="deviceSelectLabel">Câmera:</label>
      <select id="deviceSelect" class="select-device" style="display:none" aria-labelledby="deviceSelectLabel"></select>

      <button id="exportBtn" class="secondary" style="display:none" aria-label="Exportar CSV">⬇️ Exportar CSV</button>
      <button id="clearBtn" class="secondary" style="display:none" aria-label="Limpar registros">🧹 Limpar</button>
    </div>

        <div class="camera-wrap" id="cameraWrap">
      <video id="videoElement" muted playsinline autoplay></video>
      <canvas id="overlay"></canvas>
    </div>

    <div class="panel">
            <div id="output">Por favor, faça login para começar.</div>
      <div class="list" id="scansList" aria-live="polite"></div>
    </div>
  </div>

  <div id="scanPopup" role="status" aria-live="polite"></div>

    <script src="app.js"></script>
</body>
</html>
