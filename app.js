// =====================
// GEOCODIFICAÇÃO AUTOMÁTICA
// =====================
async function geocodeAddress(scanObj){
  if(!scanObj.endereco) return null;
  const query = encodeURIComponent(`${scanObj.endereco}, ${scanObj.cep}, Brasil`);
  try{
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`);
    const data = await response.json();
    if(data && data.length>0){
      scanObj.lat = parseFloat(data[0].lat);
      scanObj.lng = parseFloat(data[0].lon);
    } else {
      scanObj.lat = scanObj.lng = null;
    }
  } catch(e){
    console.error("Erro geocodificando endereço", e);
    scanObj.lat = scanObj.lng = null;
  }
}

// =====================
// REGISTRO COM GEOCODIFICAÇÃO
// =====================
async function registerScan(data){
  if(scans.find(s=>s.raw===data)) return alert("QR Code já registrado!");
  const nomeMatch=data.match(/NOME:([^\n]*)/i);
  const enderecoMatch=data.match(/ENDEREÇO:([^\n]*)/i);
  const cepMatch=data.match(/CEP:([^\n]*)/i);
  const telMatch=data.match(/TELEFONE:([^\n]*)/i);

  const scanObj={
    raw:data,
    nome:nomeMatch?nomeMatch[1].trim():"Desconhecido",
    endereco:enderecoMatch?enderecoMatch[1].trim():"",
    cep:cepMatch?cepMatch[1].trim():"",
    telefone:telMatch?telMatch[1].trim():"",
    gestor: currentUser.username,
    date:new Date().toLocaleString()
  };

  // Geocodifica o endereço antes de adicionar
  await geocodeAddress(scanObj);

  scans.unshift(scanObj);
  localStorage.setItem("pegazus_scans",JSON.stringify(scans));
  renderScans();
  renderDeliveriesCount();
  if(map && scanObj.lat && scanObj.lng){
    L.marker([scanObj.lat,scanObj.lng]).addTo(map).bindPopup(`${scanObj.nome} - ${scanObj.endereco}`);
  }
}

// =====================
// ROTA OTIMIZADA SIMPLES (heurística nearest neighbor)
// =====================
function generateOptimizedRoute(){
  if(!map) return alert("Mapa não inicializado");
  if(routeLayer) map.removeLayer(routeLayer);

  const points = scans.filter(s=>s.lat && s.lng).map(s=>({lat:s.lat,lng:s.lng,nome:s.nome}));
  if(points.length<2) return alert("Mais de um endereço necessário para rota");

  let visited = [], route=[points[0]];
  visited.push(0);

  while(route.length<points.length){
    const last = route[route.length-1];
    let nearestIdx = -1;
    let nearestDist = Infinity;
    points.forEach((p,i)=>{
      if(!visited.includes(i)){
        const dist = Math.hypot(last.lat-p.lat,last.lng-p.lng);
        if(dist<nearestDist){ nearestDist=dist; nearestIdx=i; }
      }
    });
    route.push(points[nearestIdx]);
    visited.push(nearestIdx);
  }

  const latlngs = route.map(p=>[p.lat,p.lng]);
  routeLayer=L.polyline(latlngs,{color:'blue'}).addTo(map);
  map.fitBounds(routeLayer.getBounds());
}
