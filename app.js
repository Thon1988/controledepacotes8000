// =========================================================
// Pegazus Scanner v12 - app.js  (VERSÃO CORRIGIDA + LOGIN OK)
// =========================================================

// -----------------------------
// LOGIN
// -----------------------------

const VALID_USERS = {
    "thon": "882010",
    "manager1": "123"
};

document.getElementById("loginBtn").addEventListener("click", function () {

    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    const status = document.getElementById("loginStatus");

    if (VALID_USERS[username] === password) {
        status.textContent = "✔ Login realizado com sucesso!";
        status.style.color = "green";

        // ativa layout logado
        document.body.classList.add("logged-in");

        // limpa campos
        document.getElementById("loginUser").value = "";
        document.getElementById("loginPass").value = "";

    } else {
        status.textContent = "❌ Usuário ou senha incorretos";
        status.style.color = "red";
    }
});


// =========================================================
// SCANNER
// =========================================================

let video = document.getElementById("videoElement");
let overlay = document.getElementById("overlay");
let overlayCtx = overlay.getContext("2d");

let scanning = false;
let currentStream = null;

// Ajusta o canva
