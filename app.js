document.addEventListener("DOMContentLoaded", ()=>{

    // ----------------- Usuários e Dados (Reestruturado) -----------------
    let users = JSON.parse(localStorage.getItem('pegazus_users_v3')) || [
        { id: 'u1', username: 'thon', password: '882010', role: 'admin' },
        { id: 'u2', username: 'gestor01', password: '123', role: 'gestor' },
        { id: 'u3', username: 'colab01', password: '456', role: 'colaborador' }
    ];
    let currentUser = null;

    // ALTERAÇÃO 1: A lista de entregas inicia VAZIA. Elas só aparecerão após o scan.
    const deliveries = [];
    const CD_LOCATION = { lat: -23.5505, lon: -46.6333 };

    let scanRecords = JSON.parse(localStorage.getItem('pegazus_scans_v3') || '[]');
    let nextUserId = users.reduce((max, u) => Math.max(max, parseInt(u.id.substring(1)) || 0), 0) + 1;

    function saveUsers() {
        localStorage.setItem('pegazus_users_v3', JSON.stringify(users));
    }

    // ----------------- Elementos UI -----------------
    const cameraContainer = document.getElementById('cameraContainer');
    const qrFeedback = document.getElementById('qrFeedback');
    const btnBack = document.getElementById('btnBack');
    const sidebar = document.getElementById('sidebar');
    const userInfoDiv = document.getElementById('userInfo');
    const loginContainer = document.getElementById('loginContainer'); 
    const btnSair = document.getElementById('btnSair');
    const btnGenerateCSV = document.getElementById('btnGenerateCSV');
    const contentArea = document.getElementById('contentArea'); 
    const btnEntregas = document.getElementById('btnEntregas'); 
    const btnMapa = document.getElementById('btnMapa'); 
    const btnGerarRota = document.getElementById('btnGerarRota'); 
    const btnUsers = document.getElementById('btnUsers'); 
    const loginUser = document.getElementById('loginUser');
    const loginPass = document.getElementById('loginPass');

    let html5QrcodeScanner;
    let scannedQRCodes = new Set(scanRecords.map(r => r.qr)); 
    let beepSuccess = { play: ()=>{} }; 
    let beepError = { play: ()=>{} };  

    try {
        beepSuccess = new Audio('https://www.soundjay.com/button/beep-07.wav');
        beepError = new Audio('https://www.soundjay.com/button/beep-10.wav');
    } catch (e) {
        console.error("Audio initialization failed:", e);
    }

    if (loginUser) loginUser.value = '';
    if (loginPass) loginPass.value = '';
    if (sidebar) sidebar.style.display = 'none';

    // ----------------- Funções de Navegação e Estado -----------------

    btnBack.addEventListener('click', ()=>{
        stopScanner(); 
        cameraContainer.style.display='none';
        btnBack.style.display='none';
        showGenericContent(showDeliveries); 
    });

    // ----------------- Login / Logout -----------------

    function updateSidebarInfo() {
        if (currentUser) {
            userInfoDiv.innerHTML = `
                Usuário: <strong>${currentUser.username}</strong><br>
                Nível: <strong>${currentUser.role.toUpperCase()}</strong>
            `;
            btnUsers.style.display = (currentUser.role !== 'colaborador') ? 'block' : 'none';
        }
    }

    document.getElementById('loginBtn').addEventListener('click', ()=>{
        const user = loginUser.value.trim();
        const pass = loginPass.value; 
        
        const matched = users.find(u=>u.username===user && u.password===pass);
        
        if(matched){
            currentUser = matched;
            loginContainer.style.display='none';
            sidebar.style.display='flex'; 
            document.getElementById('feedbackMessage').textContent='';
            updateSidebarInfo();
            showGenericContent(showDeliveries); 
        } else {
            document.getElementById('feedbackMessage').textContent='Usuário ou senha inválidos';
        }
    });

    if(btnSair) {
        btnSair.addEventListener('click', ()=>{
            currentUser = null;
            scannedQRCodes.clear();
            sidebar.style.display='none';
            stopScanner();
            cameraContainer.style.display = 'none';
            contentArea.style.display = 'none';
            loginContainer.style.display='block';
            if (loginUser) loginUser.value = '';
            if (loginPass) loginPass.value = '';
        });
    }

    // ----------------- Lógica de Visualização de Conteúdo -----------------

    function showGenericContent(contentFunction) {
        if (!currentUser) return;
        
        cameraContainer.style.display = 'none';
        btnBack.style.display = 'none';
        stopScanner(); 
        
        contentArea.style.display = 'none';

        contentFunction(); 

        contentArea.style.display = 'block';
    }

    // ----------------- Scanner Logic -----------------

    document.getElementById('btnCamera').addEventListener('click', ()=>{
        if (!currentUser) return;
        
        contentArea.style.display = 'none';
        
        cameraContainer.style.display='flex'; 
        btnBack.style.display='block'; 
        
        // ALTERAÇÃO 2: Tenta iniciar o scanner ao clicar
        startScanner();
    });

    function startScanner(){
        if(html5QrcodeScanner) return; // Se já está rodando, não faz nada

        html5QrcodeScanner = new Html5Qrcode("qr-reader");
        html5QrcodeScanner.start(
            { facingMode: "environment" },
            { fps:10, qrbox:250 },
            qrCodeMessage=>{
                const qrString = String(qrCodeMessage);
                
                // Simula os dados de entrega com base no QR Code
                let delivery = scanRecords.find(r => r.qr === qrString) 
                                || { id: qrString.substring(0, 8), nome: 'Entrega (QR: ' + qrString.substring(0, 15) + '...)', endereco: 'Endereço Indefinido', lat: CD_LOCATION.lat, lon: CD_LOCATION.lon };
                
                // Se for um novo código, adiciona o nome/endereço simulado ao registro
                if (!delivery.nome) {
                     delivery.nome = 'Entrega (QR: ' + qrString.substring(0, 15) + '...)';
                     delivery.endereco = 'Endereço Indefinido';
                     delivery.lat = CD_LOCATION.lat;
                     delivery.lon = CD_LOCATION.lon;
                }

                if(scannedQRCodes.has(qrString)){
                    qrFeedback.textContent=`❌ Entrega (QR: ${qrString.substring(0, 8)}...) já registrada.`;
                    qrFeedback.style.background='rgba(255,0,0,0.6)';
                    beepError.play();
                } else {
                    scannedQRCodes.add(qrString);
                    qrFeedback.textContent=`✅ Entrega: ${delivery.nome.substring(0, 30)} registrada!`;
                    qrFeedback.style.background='rgba(0,128,0,0.6)';
                    beepSuccess.play();

                    const record = {
                        idEntrega: delivery.id,
                        nomeCliente: delivery.nome,
                        endereco: delivery.endereco,
                        qr: qrString,
                        usuario: currentUser.username,
                        datetime: new Date().toISOString(),
                        // Dados de localização simulados do CD para novas entregas
                        lat: CD_LOCATION.lat + (Math.random() - 0.5) * 0.05, 
                        lon: CD_LOCATION.lon + (Math.random() - 0.5) * 0.05
                    };
                    scanRecords.push(record);
                    localStorage.setItem('pegazus_scans_v3', JSON.stringify(scanRecords));
                }
                qrFeedback.style.display='block';
                setTimeout(()=>{ qrFeedback.style.display='none'; },3000);
            }
        ).catch(err=>{
            qrFeedback.textContent='❌ Erro ao acessar câmera. Verifique as permissões. (Rodando em servidor local?)';
            qrFeedback.style.background='rgba(255,0,0,0.6)';
            qrFeedback.style.display='block';
            console.error("Scanner startup failed:", err);
            setTimeout(()=>{ qrFeedback.style.display='none'; }, 6000);
        });
    }

    function stopScanner(){
        if(html5QrcodeScanner){
            // Verifica se o scanner está em estado de "started" antes de tentar parar
            if(html5QrcodeScanner.isScanning) {
                html5QrcodeScanner.stop().then(()=>{
                    html5QrcodeScanner.clear();
                    html5QrcodeScanner=null;
                }).catch(err=>console.error("Error stopping scanner, but proceeding:", err));
            } else {
                html5QrcodeScanner.clear();
                html5QrcodeScanner=null;
            }
        }
    }


    // ----------------- Funções de Conteúdo -----------------

    if (btnEntregas) {
        btnEntregas.addEventListener('click', () => showGenericContent(showDeliveries));
    }
    function showDeliveries() {
        // Agora mostra as entregas que JÁ FORAM escaneadas
        if (scanRecords.length === 0) {
            contentArea.innerHTML = '<h2>📦 Entregas Pendentes</h2><p>Nenhuma entrega registrada ainda. Por favor, use o **Scanner** primeiro.</p>';
        } else {
            let listHtml = '<h2>📦 Entregas Registradas:</h2><p>Total Escaneadas: <strong>' + scanRecords.length + '</strong></p><ul class="delivery-list">';
            
            scanRecords.forEach((r, index) => {
                // Simula que todas as entregas escaneadas estão "concluídas"
                const status = '✅ Concluída'; 
                listHtml += `<li style="display:block;"><strong>${r.nomeCliente}</strong> (ID: ${r.idEntrega})<br><small>Endereço: ${r.endereco}</small> - [${status}]</li>`;
            });
            listHtml += '</ul>';
            contentArea.innerHTML = listHtml;
        }
    }

    if (btnGerarRota) {
        btnGerarRota.addEventListener('click', () => showGenericContent(generateRoute));
    }
    function generateRoute() {
        if (scanRecords.length < 2) {
            contentArea.innerHTML = '<h2>🗺️ Geração de Rota</h2><p style="color:red; font-weight: bold;">Necessário escanear pelo menos 2 entregas para gerar a rota.</p>';
        } else {
            contentArea.innerHTML = `<h2>🗺️ Geração de Rota</h2><p style="color:green; font-weight: bold;">Rota gerada com sucesso para ${scanRecords.length} entregas escaneadas!</p><p> (Integração com serviço de otimização de rotas pendente)</p>`;
        }
    }

    if (btnMapa) {
        btnMapa.addEventListener('click', () => showGenericContent(showMapPlaceholder));
    }
    
    // FUNÇÃO: Inicializa o mapa Leaflet com localização do usuário
    function showMapPlaceholder() {
        contentArea.innerHTML = `
            <h2>📍 Mapa de Frota & Localização Atual</h2>
            <p>O mapa é centralizado na sua posição atual (se a permissão for concedida).</p>
            <div id="fleetMap"></div>
        `;

        var map = L.map('fleetMap').setView([CD_LOCATION.lat, CD_LOCATION.lon], 13); 

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // Marcador do Centro de Distribuição
        L.marker([CD_LOCATION.lat, CD_LOCATION.lon]).addTo(map)
            .bindPopup('Centro de Distribuição')
            .openPopup();
        
        // Adiciona marcadores para as entregas registradas
        scanRecords.forEach(r => {
            if (r.lat && r.lon) {
                L.marker([r.lat, r.lon], { icon: L.divIcon({ className: 'custom-div-icon', html: '<div style="background-color: var(--success); width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>', iconSize: [12, 12] }) }).addTo(map)
                    .bindPopup(`Entrega ${r.idEntrega}: ${r.nomeCliente} (Entregue por: ${r.usuario})`);
            }
        });

        // Tenta localizar o usuário em tempo real
        map.locate({setView: true, maxZoom: 16, watch: true, enableHighAccuracy: true});
        
        let userMarker = null;

        function onLocationFound(e) {
            const radius = e.accuracy / 2;
            
            if (userMarker) {
                map.removeLayer(userMarker);
                map.eachLayer(layer => {
                    if (layer instanceof L.Circle) map.removeLayer(layer);
                });
            }
            
            userMarker = L.marker(e.latlng, { icon: L.divIcon({ className: 'custom-user-icon', html: '<div style="background-color: var(--primary); width: 15px; height: 15px; border-radius: 50%; border: 3px solid white;"></div>', iconSize: [18, 18] }) }).addTo(map)
                .bindPopup("Você está aqui dentro de " + radius.toFixed(0) + " metros.")
                .openPopup();

            L.circle(e.latlng, radius).addTo(map);
        }

        function onLocationError(e) {
            console.error("Erro na Geolocalização: ", e.message);
        }

        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);
    }

    if (btnUsers) {
        btnUsers.addEventListener('click', () => showGenericContent(showUsers));
    }
    
    // ----------------- Gestão de Usuários (Admin/Gestor/Colaborador) -----------------

    function canEdit(targetRole) {
        const role = currentUser.role;
        if (role === 'admin') return true;
        if (role === 'gestor' && (targetRole === 'colaborador')) return true;
        return false;
    }

    function canDelete(targetRole) {
        return canEdit(targetRole); 
    }

    function showUsers() {
        if (currentUser.role === 'colaborador') {
            contentArea.innerHTML = '<h2>Acesso Negado</h2><p style="color:red; font-weight: bold;">Você não tem permissão para visualizar ou gerenciar usuários.</p>';
            return;
        }

        let listHtml = '<h2>👥 Gestão de Usuários</h2><p>Você pode editar a senha de qualquer usuário, ou excluir usuários conforme sua permissão.</p><ul class="user-list">';
        
        users.forEach(u => {
            const isCurrentUser = u.id === currentUser.id;
            const canRemove = canDelete(u.role) && !isCurrentUser;
            
            listHtml += `<li data-user-id="${u.id}" id="user-row-${u.id}">
                <div class="user-details">
                    <strong>${u.username}</strong> (${u.role.toUpperCase()})
                </div>
                <div class="user-actions">
                    <button class="action-btn edit-btn" onclick="editUser('${u.id}', '${u.role}', ${isCurrentUser})">✏️ Editar</button>
                    ${canRemove ? `<button class="action-btn delete-btn" onclick="deleteUser('${u.id}', '${u.username}')">🗑️ Excluir</button>` : ''}
                </div>
            </li>`;
        });
        listHtml += '</ul>';

        if (currentUser.role === 'admin' || currentUser.role === 'gestor') {
            listHtml += `
                <h3 style="margin-top: 20px;">+ Novo Usuário</h3>
                <div class="user-management">
                    <input type="text" id="newUsername" placeholder="Nome de Usuário (login)" required>
                    <input type="password" id="newPassword" placeholder="Senha" required>
                    <select id="newUserRole">
                        ${currentUser.role === 'admin' ? '<option value="gestor">Gestor</option>' : ''}
                        <option value="colaborador">Colaborador</option>
                    </select>
                    <button id="createUserBtn" class="action-btn save-btn">Criar Usuário</button>
                </div>
            `;
        }

        contentArea.innerHTML = listHtml;
        
        if (document.getElementById('createUserBtn')) {
            document.getElementById('createUserBtn').addEventListener('click', createUser);
        }
    }
    
    // Funções de manipulação de usuário no escopo global (windows)
    window.editUser = function(id, role, isCurrentUser) {
        const user = users.find(u => u.id === id);
        if (!user || (!canEdit(user.role) && !isCurrentUser)) {
            alert('Ação não permitida.');
            return;
        }

        const row = document.getElementById(`user-row-${id}`);

        row.innerHTML = `
            <div class="user-details" style="width: 100%;">
                <strong>${user.username}</strong> (${user.role.toUpperCase()})
                <input type="password" id="editPassword-${id}" placeholder="Nova Senha (deixe vazio para não alterar)">
                <select id="editRole-${id}" ${currentUser.role === 'admin' && !isCurrentUser ? '' : 'disabled'}>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="gestor" ${user.role === 'gestor' ? 'selected' : ''}>Gestor</option>
                    <option value="colaborador" ${user.role === 'colaborador' ? 'selected' : ''}>Colaborador</option>
                </select>
            </div>
            <div class="user-actions">
                <button class="action-btn save-btn" onclick="saveUser('${id}')">💾 Salvar</button>
                <button class="action-btn cancel-btn" onclick="showUsers()">❌ Cancelar</button>
            </div>
        `;
    }

    window.saveUser = function(id) {
        const user = users.find(u => u.id === id);
        if (!user) return;

        const newPass = document.getElementById(`editPassword-${id}`).value;
        const newRoleElement = document.getElementById(`editRole-${id}`);
        const newRole = newRoleElement ? newRoleElement.value : user.role;
        
        if (newPass) {
            user.password = newPass;
        }
        
        if (currentUser.role === 'admin' && user.id !== currentUser.id) {
             user.role = newRole;
        }
        
        if (user.id === currentUser.id) {
            currentUser.password = user.password;
            updateSidebarInfo();
        }

        saveUsers();
        showUsers();
    }

    window.deleteUser = function(id, username) {
        const user = users.find(u => u.id === id);
        if (!user || !canDelete(user.role)) {
            alert('Ação não permitida para o seu nível de acesso.');
            return;
        }
        if (confirm(`Tem certeza que deseja excluir o usuário ${username}? Esta ação é irreversível.`)) {
            users = users.filter(u => u.id !== id);
            saveUsers();
            showUsers();
        }
    }

    function createUser() {
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value;
        const role = document.getElementById('newUserRole').value;

        if (!username || !password || users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            alert('Usuário ou senha inválidos, ou nome de usuário já existe.');
            return;
        }

        const newUser = {
            id: 'u' + (nextUserId++),
            username: username,
            password: password,
            role: role
        };

        users.push(newUser);
        saveUsers();
        showUsers();
    }

    // ----------------- CSV Logic -----------------

    if (btnGenerateCSV) {
        btnGenerateCSV.addEventListener('click', generateAndShowCSV);
    }

    function generateAndShowCSV(){
        if (!currentUser) return;

        if(scanRecords.length===0){ 
            alert('Nenhum registro disponível para relatório.'); 
            showGenericContent(showDeliveries); 
            return; 
        }

        let csv = 'ID Entrega,Nome Cliente,Endereço,QR Code,Usuário,Data e Hora,Latitude,Longitude\n';
        scanRecords.forEach(r=>{
            const nome = r.nomeCliente.replace(/"/g, '""');
            const endereco = r.endereco.replace(/"/g, '""');
            csv += `${r.idEntrega},"${nome}","${endereco}",${r.qr},${r.usuario},${r.datetime},${r.lat || ''},${r.lon || ''}\n`;
        });

        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href=url;
        a.download='relatorio_scans.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showGenericContent(()=>{
            contentArea.innerHTML = '<h2>📄 Relatório CSV</h2><p style="color:var(--success); font-weight: bold;">Relatório de scans baixado com sucesso!</p>';
            setTimeout(() => showGenericContent(showDeliveries), 2000);
        });
    }

});
