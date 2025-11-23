// app.js - PegazusLog integrated scanner (hybrid C)
// Requires: jsQR (loaded in index.html) and Leaflet (loaded in index.html)

document.addEventListener('DOMContentLoaded', ()=>{

  // ---------- state ----------
  // For now we ensure only 'thon' exists (admin). This overrides localStorage on first load.
  const DEFAULT_USERS = [
    { id:'u1', username:'thon', password:'882010', role:'admin' }
  ];
  let users = (() => {
    try {
      const raw = localStorage.getItem('pegazus_users_v3');
      if (!raw) {
        localStorage.setItem('pegazus_users_v3', JSON.stringify(DEFAULT_USERS));
        return JSON.parse(JSON.stringify(DEFAULT_USERS));
      }
      // if exists, keep it (but ensure thon exists). If you want to force overwrite, clear localStorage first.
      const parsed = JSON.parse(raw);
      // ensure thon exists; if not, add
      if (!parsed.some(u=>u.username==='thon')) {
        parsed.unshift(DEFAULT_USERS[0]);
        localStorage.setItem('pegazus_users_v3', JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) {
      localStorage.setItem('pegazus_users_v3', JSON.stringify(DEFAULT_USERS));
      return JSON.parse(JSON.stringify(DEFAULT_USERS));
    }
  })();

  function saveUsers() {
    localStorage.setItem('pegazus_users_v3', JSON.stringify(users));
  }

  let currentUser = null;
  const CD_LOCATION = { lat:-23.5505, lon:-46.6333 };
  let scanRecords = JSON.parse(localStorage.getItem('pegazus_scans_v3') || '[]');

  // ---------- elements ----------
  const sidebar = document.getElementById('sidebar');
  const userInfoDiv = document.getElementById('userInfo');
  const loginContainer = document.getElementById('loginContainer');
  const loginUser = document.getElementById('loginUser');
  const loginPass = document.getElementById('loginPass');
  const feedbackMessage = document.getElementById('feedbackMessage');
  const btnLogin = document.getElementById('loginBtn');
  const btnSair = document.getElementById('btnSair');
  const btnCamera = document.getElementById('btnCamera');
  const btnEntregas = document.getElementById('btnEntregas');
  const btnMapa = document.getElementById('btnMapa');
  const btnGerarRota = document.getElementById('btnGerarRota');
  const btnUsers = document.getElementById('btnUsers');
  const btnGenerateCSV = document.getElementById('btnGenerateCSV');
  const btnTestImage = document.getElementById('btnTestImage');
  const btnBack = document.getElementById('btnBack');
  const contentArea = document.getElementById('contentArea');

  // camera UI
  const video = document.getElementById('videoElement');
  const overlay = document.getElementById('overlay');
  const overlayCtx = overlay.getContext('2d');
  const cameraContainer = document.getElementById('cameraContainer');
  const qrFeedback = document.getElementById('qrFeedback');
  const scansList = document.getElementById('scansList');
  const stopButton = document.getElementById('stopButton');
  const torchButton = document.getElementById('torchButton');
  const deviceSelect = document.getElementById('deviceSelect');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const openScansList = document.getElementById('openScansList');

  // internals
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  let mediaStream = null, currentVideoTrack = null;
  let scanning = false, rafId = null;
  const STORAGE_KEY = 'pegazus_scans_v3';
  const SCAN_INTERVAL = 700;
  let lastScanTime = 0;
  const DUPLICATE_WINDOW = 60*1000;

  // audio beeps (simple synthesized)
  function beep(duration = 90, freq = 1400, vol = 0.12){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(ctx.destination); o.start();
      setTimeout(()=>{ try{ o.stop(); ctx.close(); }catch(e){} }, duration);
    }catch(e){}
  }

  function showFeedback(text, ok=true, ms=1500){
    if (!qrFeedback) return;
    qrFeedback.textContent = text;
    qrFeedback.style.background = ok? 'rgba(0,128,0,0.7)' : 'rgba(255,0,0,0.7)';
    qrFeedback.style.display = 'block';
    setTimeout(()=> qrFeedback.style.display='none', ms);
  }

  // helpers
  function saveRecords(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(scanRecords)); }
  function escapeHtml(s){ return (''+s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  // extraction helpers (hybrid from your provided scripts)
  function extractIdFromLink(link){
    if(!link) return {type:null,value:null};
    const shopeePattern1 = /-i\.(\d+)\.(\d+)/i; const m1 = link.match(shopeePattern1); if(m1) return {type:'shopee_item',value:m1[2],shopId:m1[1]};
    const shopeePattern2 = /shopee\.[^\/]+\/(?:product|products|item)\/(\d+)/i; const m2 = link.match(shopeePattern2); if(m2) return {type:'shopee_item',value:m2[1]};
    const mlPattern1 = /ML[A-Z]*-?(\d+)/i; const m3 = link.match(mlPattern1); if(m3) return {type:'mercadolivre_item',value:m3[1]};
    const mlPattern2 = /\/(\d{6,})(?:[^\d]|$)/; const m4 = link.match(mlPattern2); if(m4) return {type:'mercadolivre_item',value:m4[1]};
    const fallback = link.match(/(\d{6,})/); if(fallback) return {type:'number',value:fallback[1]};
    return {type:null,value:null};
  }
  function extractQrId(payload){
    if(!payload) return {type:null,value:null};
    const p = payload.trim();
    const kv = [/(?:qr[_\-]?id|qrid|id|codigo|cod|codigo_id|qrCodeId)[:=]\s*([A-Za-z0-9\-_]+)/i, /(?:idPedido|pedido_id|order_id|order)[:=]\s*([A-Za-z0-9\-_]+)/i];
    for(const re of kv){ const m = p.match(re); if(m) return {type:'qr_field',value:m[1]}; }
    try{ const url = new URL(p); const qp = ['id','qrid','qr_id','codigo','code','itemId','orderId','order_id']; for(const k of qp) if(url.searchParams.has(k)) return {type:`qr_param:${k}`,value:url.searchParams.get(k)} }catch(e){}
    const num = p.match(/([0-9]{6,})/); if(num) return {type:'numeric',value:num[1]};
    if(p.length <= 64 && /[A-Za-z0-9\-_]{4,}/.test(p)) return {type:'text',value:p.split(/\s|;|,|\|/)[0]};
    return {type:null,value:null};
  }

  // render editable scans list
  function renderScans(){
    if(!scansList) return;
    scansList.innerHTML = '';
    if(!scanRecords.length){ scansList.innerHTML = '<div style="color:#666">Nenhum registro ainda.</div>'; return; }
    scanRecords.forEach((r, i)=>{
      const div = document.createElement('div'); div.className='item';
      div.innerHTML = `<div style="display:flex;gap:8px;align-items:center">
        <div class="badge">${escapeHtml(r.plataforma||'—')}</div>
        <div style="flex:1"><div class="link-text" title="${escapeHtml(r.raw_qr)}">${escapeHtml(r.raw_qr)}</div>
        <div class="meta">${escapeHtml(r.nomeCliente||'Sem nome')} — ${escapeHtml(r.endereco||'Sem endereço')}</div></div>
        <div><button data-i="${i}" style="background:#00b4d8;color:white;padding:6px;border-radius:6px">Editar</button></div>
      </div>`;
      const btn = div.querySelector('button[data-i]'); btn.addEventListener('click', ()=> editRecord(i));
      scansList.appendChild(div);
    });
  }

  function editRecord(idx){
    const r = scanRecords[idx];
    const form = document.createElement('div'); form.className='item';
    form.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px">
        <label>Nome cliente <input id="edit_name" value="${escapeHtml(r.nomeCliente||'')}" /></label>
        <label>Endereço <input id="edit_addr" value="${escapeHtml(r.endereco||'')}" /></label>
        <label>ID entrega <input id="edit_id" value="${escapeHtml(r.idEntrega||'')}" /></label>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button id="saveRec" style="background:${'var(--success)'};padding:6px;border-radius:6px;color:#fff">Salvar</button>
          <button id="cancelRec" style="background:#6c757d;padding:6px;border-radius:6px;color:#fff">Cancelar</button>
        </div>
      </div>`;
    scansList.innerHTML=''; scansList.appendChild(form);
    document.getElementById('cancelRec').addEventListener('click', renderScans);
    document.getElementById('saveRec').addEventListener('click', ()=>{
      r.nomeCliente = document.getElementById('edit_name').value.trim();
      r.endereco = document.getElementById('edit_addr').value.trim();
      r.idEntrega = document.getElementById('edit_id').value.trim();
      scanRecords[idx]=r; saveRecords(); renderScans();
    });
  }

  // ---------- camera helpers ----------
  async function enumerateVideoDevices(){
    try{ const devs = await navigator.mediaDevices.enumerateDevices(); return devs.filter(d=>d.kind==='videoinput'); }catch(e){ return []; }
  }

  function fitCanvases(){
    const vw = video.videoWidth || video.clientWidth || 640;
    const vh = video.videoHeight || video.clientHeight || 480;
    const targetW = Math.min(1024, Math.max(320, Math.round(vw * 0.6)));
    const targetH = Math.round((vh / vw) * targetW) || 480;
    tempCanvas.width = targetW; tempCanvas.height = targetH;
    overlay.width = vw; overlay.height = vh;
    drawBoundingBox(null);
  }

  function drawBoundingBox(loc){
    overlayCtx.clearRect(0,0,overlay.width,overlay.height);
    if(!loc){
      const w = overlay.width, h = overlay.height;
      const boxW = Math.round(w * 0.40), boxH = Math.round(boxW); // 40% width square
      const x = Math.round((w - boxW)/2), y = Math.round((h - boxH)/2);
      overlayCtx.strokeStyle = 'rgba(255,255,255,0.35)'; overlayCtx.lineWidth = 3; overlayCtx.strokeRect(x,y,boxW,boxH);
      return;
    }
    overlayCtx.strokeStyle = 'rgba(0,200,83,0.95)'; overlayCtx.lineWidth = Math.max(2, overlay.width/200);
    overlayCtx.beginPath();
    overlayCtx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
    overlayCtx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
    overlayCtx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
    overlayCtx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
    overlayCtx.closePath(); overlayCtx.stroke();
  }

  async function startScanner(){
    if(scanning) return;
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ alert('Câmera não suportada'); return; }
    try{
      let stream;
      try{
        stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' }, width:{ideal:1280}, height:{ideal:720} }, audio:false });
      }catch(e){
        await navigator.mediaDevices.getUserMedia({ video:true, audio:false }).then(s=>{ stream=s }).catch(err=>{ throw err; });
      }
      mediaStream = stream; video.srcObject = mediaStream; await video.play();
      currentVideoTrack = mediaStream.getVideoTracks()[0] || null;
      try{ const caps = currentVideoTrack.getCapabilities(); torchButton.style.display = (caps && caps.torch)? 'inline-block':'none'; }catch(e){ torchButton.style.display='none'; }
      const devices = await enumerateVideoDevices();
      populateDeviceSelect(devices);
      scanning = true; stopButton.style.display='inline-block'; cameraContainer.style.display='flex'; btnBack.style.display='block';
      fitCanvases(); rafId = requestAnimationFrame(scanLoop);
    }catch(err){
      console.error('Erro ao abrir câmera',err);
      showFeedback('Erro ao acessar câmera — ver console', false, 4000);
    }
  }

  function populateDeviceSelect(devices){
    deviceSelect.innerHTML=''; if(!devices || devices.length===0){ deviceSelect.style.display='none'; return; }
    devices.forEach(d=>{ const opt = document.createElement('option'); opt.value=d.deviceId; opt.text=d.label||('Câmera '+(deviceSelect.length+1)); deviceSelect.appendChild(opt); });
    deviceSelect.style.display = devices.length>1 ? 'inline-block' : 'none';
  }

  function stopScanner(){
    if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop());
    mediaStream = null; currentVideoTrack=null; if(rafId) cancelAnimationFrame(rafId); rafId=null; scanning=false;
    video.pause(); video.srcObject = null;
    stopButton.style.display='none'; torchButton.style.display='none'; deviceSelect.style.display='none';
    cameraContainer.style.display='none'; btnBack.style.display='none';
    overlayCtx.clearRect(0,0,overlay.width,overlay.height);
  }

  async function toggleTorch(){
    if(!currentVideoTrack) return;
    try{ const caps = currentVideoTrack.getCapabilities(); if(!caps.torch) return; await currentVideoTrack.applyConstraints({ advanced:[{ torch: !currentVideoTrack.torchOn }] }); }catch(e){ console.warn('torch not supported', e); }
  }

  function scanLoop(){
    if(!scanning) return;
    if(video.readyState === video.HAVE_ENOUGH_DATA){
      try{
        const vw = video.videoWidth || video.clientWidth; const vh = video.videoHeight || video.clientHeight;
        if(!vw||!vh){ rafId = requestAnimationFrame(scanLoop); return; }
        const cropFactor = 0.6; const sw = Math.floor(vw * cropFactor); const sh = Math.floor(vh * cropFactor);
        const sx = Math.floor((vw - sw)/2); const sy = Math.floor((vh - sh)/2);
        tempCtx.drawImage(video, sx, sy, sw, sh, 0,0, tempCanvas.width, tempCanvas.height);
        const imageData = tempCtx.getImageData(0,0,tempCanvas.width,tempCanvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if(code && code.data){
          let loc = null;
          if(code.location){
            const scaleX = sw / tempCanvas.width; const scaleY = sh / tempCanvas.height;
            const mapCorner = (pt)=>({ x: Math.round(pt.x*scaleX + sx), y: Math.round(pt.y*scaleY + sy) });
            loc = { topLeftCorner: mapCorner(code.location.topLeftCorner), topRightCorner: mapCorner(code.location.topRightCorner), bottomLeftCorner: mapCorner(code.location.bottomLeftCorner), bottomRightCorner: mapCorner(code.location.bottomRightCorner) };
            drawBoundingBox(loc);
          } else drawBoundingBox(null);
          const now = Date.now();
          if(now - lastScanTime >= SCAN_INTERVAL){ lastScanTime = now; handleScanResult((code.data||'').trim()); }
        } else drawBoundingBox(null);
      }catch(e){ console.error('frame error', e); }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  // core handling
  async function handleScanResult(payload){
    if(!payload) return;
    if(scanRecords.some(it => it.raw_qr === payload && (Date.now() - (it.timestamp||0)) < DUPLICATE_WINDOW)){
      showFeedback('Já escaneado recentemente', false); beep(70,600,0.06); return;
    }
    const plataforma = (()=>{ const l=payload.toLowerCase(); if(l.includes('shopee.')) return 'Shopee'; if(l.includes('mercadolivre')||l.includes('mercadolibre')) return 'Mercado Livre'; return 'Outra'; })();
    const extractedId = extractIdFromLink(payload); const qrId = extractQrId(payload);
    const record = {
      idEntrega: extractedId.value || qrId.value || payload.substring(0,12),
      nomeCliente: '', endereco: '', raw_qr: payload,
      plataforma, extractedId, qrId,
      usuario: currentUser ? currentUser.username : 'anon',
      datetime: new Date().toISOString(),
      timestamp: Date.now(),
      lat: CD_LOCATION.lat + (Math.random()-0.5)*0.05,
      lon: CD_LOCATION.lon + (Math.random()-0.5)*0.05
    };
    scanRecords.unshift(record); saveRecords(); renderScans();
    beep(); try{ if(navigator.vibrate) navigator.vibrate(80); }catch(e){}
    showFeedback('Leitura OK: ' + (record.idEntrega||'---'));
    try{ await navigator.clipboard.writeText(record.idEntrega||record.raw_qr); }catch(e){}
  }

  // CSV generation (diário/quinzenal/mensal) with menu
  function generateCSVMenu(){
    if(!currentUser) { alert('Faça login para gerar relatórios'); return; }
    contentArea.innerHTML = `
      <h2>📄 Gerar Relatório CSV</h2>
      <p>Escolha o período:</p>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="csvDiario" class="nav-btn">Diário</button>
        <button id="csvQuinze" class="nav-btn">Quinzenal</button>
        <button id="csvMensal" class="nav-btn">Mensal</button>
        <button id="csvCancelar" style="background:#6c757d;color:#fff;border:none;border-radius:6px;padding:8px">Cancelar</button>
      </div>
      <p style="margin-top:12px;color:#666">Total registros: ${scanRecords.length}</p>
    `;
    document.getElementById('csvDiario').addEventListener('click', ()=> generateCSVPeriod('diário'));
    document.getElementById('csvQuinze').addEventListener('click', ()=> generateCSVPeriod('quinzenal'));
    document.getElementById('csvMensal').addEventListener('click', ()=> generateCSVPeriod('mensal'));
    document.getElementById('csvCancelar').addEventListener('click', ()=> showDeliveries());
  }

  function generateCSVPeriod(period){
    if(!currentUser) return;
    const now = new Date();
    let filtered = [];
    if(period==='diário'){
      filtered = scanRecords.filter(r=> new Date(r.datetime).toDateString() === now.toDateString());
    } else if(period==='quinzenal'){
      filtered = scanRecords.filter(r=> (now - new Date(r.datetime))/(1000*60*60*24) <= 15);
    } else if(period==='mensal'){
      filtered = scanRecords.filter(r=> (now - new Date(r.datetime))/(1000*60*60*24) <= 30);
    }
    if(filtered.length===0){ alert('Nenhum registro para este período'); return; }
    let csv = 'ID Entrega,Nome Cliente,Endereço,Raw QR,Plataforma,Usuário,Data e Hora,Latitude,Longitude\n';
    filtered.forEach(r=>{
      const nome = (r.nomeCliente||'').replace(/"/g,'""');
      const end = (r.endereco||'').replace(/"/g,'""');
      csv += `${r.idEntrega},"${nome}","${end}","${r.raw_qr}",${r.plataforma},${r.usuario},${r.datetime},${r.lat||''},${r.lon||''}\n`;
    });
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`relatorio_${period}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // after generation go back to deliveries
    setTimeout(()=> showDeliveries(), 600);
  }

  // UI: deliveries view
  function showDeliveries(){
    if(!currentUser) return;
    cameraContainer.style.display='none'; contentArea.style.display='block'; btnBack.style.display='none';
    if(!scanRecords.length) contentArea.innerHTML = '<h2>📦 Entregas Pendentes</h2><p>Nenhuma entrega registrada. Use o Scanner.</p>';
    else {
      let html = `<h2>📦 Entregas Registradas</h2><p>Total: ${scanRecords.length}</p><ul>`;
      scanRecords.forEach(r=>{ html += `<li><strong>${escapeHtml(r.nomeCliente||r.idEntrega)}</strong> — ${escapeHtml(r.endereco||r.raw_qr)}<br><small>${escapeHtml(r.datetime)}</small></li>`; });
      html += '</ul>'; contentArea.innerHTML = html;
    }
  }

  // UI: map
  function showMap(){
    if(!currentUser) return;
    cameraContainer.style.display='none'; contentArea.style.display='block'; btnBack.style.display='none';
    contentArea.innerHTML = `<h2>📍 Mapa</h2><div id="fleetMap" style="height:60vh;border-radius:8px;margin-top:12px"></div>`;
    setTimeout(()=>{ // initialize leaflet
      const map = L.map('fleetMap').setView([CD_LOCATION.lat, CD_LOCATION.lon], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      L.marker([CD_LOCATION.lat, CD_LOCATION.lon]).addTo(map).bindPopup('Centro de Distribuição').openPopup();
      scanRecords.forEach(r=>{ if(r.lat && r.lon) L.marker([r.lat, r.lon]).addTo(map).bindPopup(`${r.idEntrega} • ${r.nomeCliente||'—'}`); });
      // locate user and show a small blue GPS icon
      map.locate({setView:false, maxZoom:16}).on('locationfound', e=>{
        const blueIcon = L.divIcon({
          className: 'custom-user-icon',
          html: '<div style="background:#007bff;width:12px;height:12px;border-radius:50%;border:3px solid white;"></div>',
          iconSize: [18,18]
        });
        L.marker(e.latlng, {icon: blueIcon}).addTo(map).bindPopup('Você está aqui').openPopup();
      });
    },50);
  }

  // users management
  function showUsers(){
    if(!currentUser) return;
    cameraContainer.style.display='none'; contentArea.style.display='block'; btnBack.style.display='none';
    if(currentUser.role === 'colaborador'){ contentArea.innerHTML='<h2>Acesso negado</h2>'; return; }
    let html = `<h2>👥 Gestão de Usuários</h2><ul>`;
    users.forEach(u=> html += `<li><strong>${u.username}</strong> (${u.role}) ${u.id===currentUser.id?'(você)':''} ${ (currentUser.role!=='colaborador' && u.id!==currentUser.id) ? `<button data-id="${u.id}" class="editUserBtn">Editar</button>` : '' }</li>`);
    html += '</ul><h3>Criar Usuário</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="newU" placeholder="username"><input id="newP" placeholder="senha"><select id="newR"><option value="colaborador">Colaborador</option>${currentUser.role==='admin'?'<option value="gestor">Gestor</option>':''}</select><button id="createU">Criar</button></div>';
    contentArea.innerHTML = html;
    document.querySelectorAll('.editUserBtn').forEach(btn=> btn.addEventListener('click', (e)=> { const id = e.target.dataset.id; editUserById(id); }));
    document.getElementById('createU').addEventListener('click', ()=>{
      const nn = document.getElementById('newU').value.trim();
      const np = document.getElementById('newP').value;
      const nr = document.getElementById('newR').value;
      if(!nn||!np){ alert('Preencha'); return; }
      if(users.some(u=>u.username===nn)){ alert('Usuário já existe'); return; }
      const nu = { id:'u'+(Date.now()), username:nn, password:np, role:nr };
      users.push(nu); saveUsers(); showUsers();
    });
  }

  function editUserById(id){
    const u = users.find(x=>x.id===id); if(!u) return;
    // Build form that allows admin to edit username, password and role (if admin)
    const form = document.createElement('div');
    form.innerHTML = `
      <h3>Editar usuário</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <label>Usuário (login)<input id="eu" value="${escapeHtml(u.username)}"></label>
        <label>Nova senha (deixe vazio para manter)<input id="ep" placeholder="nova senha"></label>
        <label>Perfil
          <select id="er">
            <option value="colaborador" ${u.role==='colaborador'?'selected':''}>Colaborador</option>
            <option value="gestor" ${u.role==='gestor'?'selected':''}>Gestor</option>
            ${currentUser.role==='admin'?`<option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>`:''}
          </select>
        </label>
        <div style="display:flex;gap:8px">
          <button id="saveU" style="background:var(--success);color:#fff;padding:8px;border-radius:6px">Salvar</button>
          <button id="cancelU" style="background:#6c757d;color:#fff;padding:8px;border-radius:6px">Cancelar</button>
        </div>
      </div>
    `;
    contentArea.innerHTML = '';
    contentArea.appendChild(form);
    document.getElementById('cancelU').addEventListener('click', showUsers);
    document.getElementById('saveU').addEventListener('click', ()=>{
      const newUsername = document.getElementById('eu').value.trim();
      const newPass = document.getElementById('ep').value.trim();
      const newRole = document.getElementById('er').value;
      if(!newUsername){ alert('Nome de usuário não pode ficar vazio'); return; }
      // ensure unique username except for this user
      if(users.some(x=> x.username===newUsername && x.id !== u.id)){ alert('Nome de usuário já existe'); return; }
      u.username = newUsername;
      if(newPass) u.password = newPass;
      if(currentUser.role === 'admin') u.role = newRole;
      saveUsers();
      // if editing yourself, update currentUser reference
      if(u.id === currentUser.id) currentUser = u;
      showUsers();
    });
  }

  // ---------- events ----------
  // login handling
  btnLogin.addEventListener('click', ()=>{
    const u = (loginUser && loginUser.value || '').trim();
    const p = (loginPass && loginPass.value) || '';
    const matched = users.find(x=> x.username===u && x.password===p);
    if(!matched){ feedbackMessage.textContent='Usuário ou senha inválidos'; return; }
    currentUser = matched; feedbackMessage.textContent=''; loginContainer.style.display='none'; sidebar.style.display='flex';
    userInfoDiv.innerHTML = `Usuário: <strong>${currentUser.username}</strong><br>Nível: <strong>${currentUser.role}</strong>`;
    // show deliveries by default
    showDeliveries();
  });

  btnSair.addEventListener('click', ()=>{ currentUser=null; sidebar.style.display='none'; loginContainer.style.display='block'; contentArea.style.display='none'; stopScanner(); });

  btnCamera.addEventListener('click', ()=>{ if(!currentUser) return; contentArea.style.display='none'; cameraContainer.style.display='flex'; btnBack.style.display='block'; startScanner(); });
  stopButton && stopButton.addEventListener('click', ()=> stopScanner());
  torchButton && torchButton.addEventListener('click', ()=> toggleTorch());
  deviceSelect && deviceSelect.addEventListener('change', async ()=>{ const id = deviceSelect.value; if(!id) return; stopScanner(); try{ mediaStream = await navigator.mediaDevices.getUserMedia({ video:{ deviceId:{ exact:id } }, audio:false }); video.srcObject = mediaStream; await video.play(); currentVideoTrack = mediaStream.getVideoTracks()[0] || null; fitCanvases(); scanning=true; rafId = requestAnimationFrame(scanLoop); stopButton.style.display='inline-block'; }catch(e){ console.warn('device select failed', e); showFeedback('Falha ao selecionar câmera', false); } });
  exportBtn && exportBtn.addEventListener('click', ()=>{ if(!currentUser){ alert('Faça login'); return;} generateCSVMenu(); });
  clearBtn && clearBtn.addEventListener('click', ()=>{ if(confirm('Limpar registros?')){ scanRecords=[]; saveRecords(); renderScans(); }});
  openScansList && openScansList.addEventListener('click', ()=>{ renderScans(); cameraContainer.scrollIntoView({behavior:'smooth'}); });

  btnEntregas.addEventListener('click', ()=> showDeliveries());
  btnMapa.addEventListener('click', ()=> showMap());
  btnGenerateCSV.addEventListener('click', ()=> generateCSVMenu());
  btnGerarRota.addEventListener('click', ()=> { showDeliveries(); setTimeout(()=> alert('Rota (placeholder) — depende de entregas escaneadas'),200); });
  btnUsers.addEventListener('click', ()=> showUsers());
  btnBack.addEventListener('click', ()=> { stopScanner(); cameraContainer.style.display='none'; btnBack.style.display='none'; showDeliveries(); });

  btnTestImage && btnTestImage.addEventListener('click', ()=> { try{ window.open('/mnt/data/ex qrcode.jpg','_blank'); }catch(e){ alert('Imagem de teste não encontrada') } });

  // initial render
  renderScans();
  // ensure feedback blank
  if(feedbackMessage) feedbackMessage.textContent='';

  // expose debug
  window._pegazus = { startScanner, stopScanner, getScans: ()=> scanRecords, getUsers: ()=> users };

}); // DOMContentLoaded
