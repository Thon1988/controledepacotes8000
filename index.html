<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>📦 Scanner 8000 v0.2</title>

    <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>

    <style>

        /* ---------------------------------------------------------
           PALETA MODERNA
        ---------------------------------------------------------- */
        :root {
            --primary: #0ea5e9;
            --primary-dark: #0284c7;
            --bg: #f5f7fa;
            --text: #1e293b;
            --panel-bg: #ffffff;
            --border: #e2e8f0;
            --radius: 14px;
            --shadow: 0 8px 20px rgba(0,0,0,0.08);
        }

        body {
            margin: 0;
            font-family: "Inter", system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
        }

        /* ---------------------------------------------------------
           LOGIN — CARD MODERNO
        ---------------------------------------------------------- */
        #loginScreen {
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        #loginForm {
            background: var(--panel-bg);
            padding: 40px 30px;
            border-radius: var(--radius);
            width: 100%;
            max-width: 380px;
            box-shadow: var(--shadow);
            display: flex;
            flex-direction: column;
            gap: 15px;
            text-align: center;
        }

        #loginForm h2 {
            margin: 0 0 10px;
            font-weight: 600;
        }

        #loginForm input {
            padding: 14px;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            font-size: 15px;
            transition: 0.2s;
        }
        #loginForm input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.25);
        }

        #loginForm button {
            padding: 14px;
            background: var(--primary);
            border: none;
            color: white;
            border-radius: var(--radius);
            font-size: 16px;
            cursor: pointer;
            transition: 0.2s;
            font-weight: 600;
        }
        #loginForm button:hover {
            background: var(--primary-dark);
        }

        .login-status-message {
            font-size: 13px;
            color: #6b7280;
            min-height: 16px;
        }


        /* ---------------------------------------------------------
           APP PRINCIPAL
        ---------------------------------------------------------- */
        .app {
            display: none;
            padding: 20px;
            max-width: 960px;
            margin: auto;
        }

        h1 {
            text-align: center;
            margin-bottom: 15px;
            font-size: 22px;
            font-weight: 600;
        }

        /* ---------------------------------------------------------
           CONTROLS — botões minimalistas
        ---------------------------------------------------------- */
        .controls {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: center;
            margin-bottom: 15px;
        }

        button {
            padding: 10px 14px;
            background: var(--primary);
            border: none;
            color: white;
            border-radius: var(--radius);
            cursor: pointer;
            transition: 0.2s;
            font-weight: 500;
        }

        button:hover {
            background: var(--primary-dark);
        }

        button.secondary {
            background: #64748b;
        }

        button.secondary:hover {
            background: #475569;
        }

        select, input[type="date"] {
            padding: 10px;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            background: white;
        }

        /* ---------------------------------------------------------
           CAMERA — estilo app scanner profissional
        ---------------------------------------------------------- */
        .camera-wrap {
            position: relative;
            background: black;
            border-radius: var(--radius);
            overflow: hidden;
            box-shadow: var(--shadow);
            height: 58vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        video#videoElement {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        canvas#overlay {
            position: absolute;
            top: 0;
            left: 0;
        }

        /* ---------------------------------------------------------
           PAINEL
        ---------------------------------------------------------- */
        .panel {
            background: var(--panel-bg);
            padding: 15px;
            margin-top: 15px;
            border-radius: var(--radius);
            box-shadow: var(--shadow);
        }

        #output {
            color: #64748b;
            min-height: 30px;
            font-size: 14px;
        }

        .list {
            max-height: 220px;
            overflow-y: auto;
            padding: 10px;
            border: 1px solid var(--border);
            border-radius: var(--radius);
        }

        .item {
            padding: 10px;
            border-bottom: 1px solid var(--border);
            color: #334155;
        }

        /* ---------------------------------------------------------
           POPUP — notificação moderna
        ---------------------------------------------------------- */
        #scanPopup {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--primary);
            color: white;
            padding: 12px 20px;
            border-radius: var(--radius);
            font-size: 15px;
            display: none;
            box-shadow: var(--shadow);
        }

        /* ---------------------------------------------------------
           LOGIN ATIVO
        ---------------------------------------------------------- */
        body.logged-in .app {
            display: block;
        }

        body.logged-in #loginScreen {
            display: none;
        }

        /* ---------------------------------------------------------
           RESPONSIVIDADE
        ---------------------------------------------------------- */
        @media (max-width: 600px) {
            .camera-wrap {
                height: 48vh;
            }
            h1 {
                font-size: 18px;
            }
        }

    </style>
</head>

<body>

    <!-- LOGIN -->
    <div id="loginScreen">
        <form id="loginForm">
            <h2>🔑 Acesso do Scanner</h2>
            <input id="loginUser" type="text" placeholder="Usuário">
            <input id="loginPass" type="password" placeholder="Senha">
            <button id="loginBtn">Entrar</button>
            <p id="loginStatus" class="login-status-message">Digite suas credenciais.</p>
        </form>
    </div>

    <!-- APP -->
    <div class="app">

        <h1>📦 Scanner 8000 v0.2</h1>

        <div class="controls">
            <button id="startButton" style="display:none">▶ Iniciar</button>
            <button id="stopButton" class="secondary" style="display:none">⏹ Parar</button>
            <button id="torchButton" class="secondary" style="display:none">🔦 Flash</button>

            <select id="deviceSelect" style="display:none"></select>

            <button id="exportBtn" class="secondary" style="display:none">⬇ Exportar CSV</button>
            <button id="clearBtn" class="secondary" style="display:none">🧹 Limpar</button>
        </div>

        <div class="camera-wrap">
            <video id="videoElement" autoplay muted playsinline></video>
            <canvas id="overlay"></canvas>
        </div>

        <div class="panel">
            <div id="output"></div>
            <div id="scansList" class="list"></div>
        </div>

    </div>

    <div id="scanPopup"></div>

    <script src="app.js"></script>

</body>
</html>
