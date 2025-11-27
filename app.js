import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Camera, 
  Upload, 
  X, 
  SwitchCamera, 
  Zap,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

// Load jsQR from CDN
const loadJsQR = () => {
  return new Promise((resolve, reject) => {
    if (window.jsQR) {
      resolve(window.jsQR);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.onload = () => resolve(window.jsQR);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export default function QRScanner({ onScan, isProcessing }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastScanRef = useRef({ code: '', time: 0 });
  
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [jsQRLoaded, setJsQRLoaded] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);

  const SCAN_DELAY = 1000; // Delay entre leituras do mesmo código (1 segundo)

  // Beep sound for successful scan
  const beep = useCallback((freq = 1200, duration = 100, vol = 0.1) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.start();
      setTimeout(() => { 
        osc.stop(); 
        audioCtx.close(); 
      }, duration);
    } catch (e) {}
  }, []);

  // Load jsQR on mount
  useEffect(() => {
    loadJsQR()
      .then(() => setJsQRLoaded(true))
      .catch(() => setError('Erro ao carregar biblioteca de QR Code'));
  }, []);

  // Enumerate video devices
  const enumerateDevices = useCallback(async () => {
    try {
      // Solicitar permissão para garantir que as labels dos dispositivos sejam populadas
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      
      const devs = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devs.filter(d => d.kind === 'videoinput');
      setDevices(videoDevs);
      return videoDevs;
    } catch (e) {
      console.error("Erro ao enumerar dispositivos: ", e);
      return [];
    }
  }, []);

  // Draw scan area overlay (Adaptado para renderização do React)
  const drawOverlay = useCallback((qrLocation = null) => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;
    
    // Usa as dimensões de renderização do elemento de vídeo na tela
    const w = video.clientWidth;
    const h = video.clientHeight;

    // Configura o canvas do overlay para corresponder ao vídeo
    overlay.width = w;
    overlay.height = h;

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // Draw semi-transparent overlay outside scan area
    const boxSize = Math.min(w, h) * 0.65;
    const x = (w - boxSize) / 2;
    const y = (h - boxSize) / 2;

    // Darken areas outside scan box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, w, y);
    ctx.fillRect(0, y + boxSize, w, h - y - boxSize);
    ctx.fillRect(0, y, x, boxSize);
    ctx.fillRect(x + boxSize, y, w - x - boxSize, boxSize);

    // Draw scan box border and corners
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, boxSize, boxSize);

    // Draw corner markers
    const cornerLen = 30;
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + boxSize - cornerLen, y);
    ctx.lineTo(x + boxSize, y);
    ctx.lineTo(x + boxSize, y + cornerLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + boxSize - cornerLen);
    ctx.lineTo(x, y + boxSize);
    ctx.lineTo(x + cornerLen, y + boxSize);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + boxSize - cornerLen, y + boxSize);
    ctx.lineTo(x + boxSize, y + boxSize);
    ctx.lineTo(x + boxSize, y + boxSize - cornerLen);
    ctx.stroke();

    // Draw QR code bounding box if detected (green highlight)
    if (qrLocation) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(qrLocation.topLeftCorner.x, qrLocation.topLeftCorner.y);
      ctx.lineTo(qrLocation.topRightCorner.x, qrLocation.topRightCorner.y);
      ctx.lineTo(qrLocation.bottomRightCorner.x, qrLocation.bottomRightCorner.y);
      ctx.lineTo(qrLocation.bottomLeftCorner.x, qrLocation.bottomLeftCorner.y);
      ctx.closePath();
      ctx.stroke();
    }
  }, []);

  // Scan loop using jsQR
  const scanLoop = useCallback(() => {
    if (!isScanning || !jsQRLoaded || !window.jsQR) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA || !video.videoWidth) {
      drawOverlay(null); 
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const ctx = canvas.getContext('2d');
    const vw = video.videoWidth; // Resolução real do vídeo
    const vh = video.videoHeight;
    const videoRect = video.getBoundingClientRect(); // Dimensões do elemento na tela

    // Configura o canvas escondido
    canvas.width = vw;
    canvas.height = vh;
    ctx.drawImage(video, 0, 0, vw, vh);

    // --- Lógica de Escaneamento: Área de 90% Centralizada ---
    const scanSize = Math.min(vw, vh) * 0.9;
    const sx = (vw - scanSize) / 2;
    const sy = (vh - scanSize) / 2;
    const imageData = ctx.getImageData(sx, sy, scanSize, scanSize);

    const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });
    // --- Fim da Lógica de Escaneamento ---

    if (code && code.data) {
      const scaleX = videoRect.width / vw;
      const scaleY = videoRect.height / vh;

      // Mapeia coordenadas do QR (lidas na ImageData centralizada) para as coordenadas de tela
      const mapCorner = (pt) => ({
        x: Math.round((pt.x + sx) * scaleX),
        y: Math.round((pt.y + sy) * scaleY)
      });

      const mappedLocation = code.location ? {
        topLeftCorner: mapCorner(code.location.topLeftCorner),
        topRightCorner: mapCorner(code.location.topRightCorner),
        bottomLeftCorner: mapCorner(code.location.bottomLeftCorner),
        bottomRightCorner: mapCorner(code.location.bottomRightCorner)
      } : null;

      drawOverlay(mappedLocation);

      const now = Date.now();
      const qrData = code.data.trim();

      // Prevenção de duplicatas com delay de 1 segundo
      if (qrData !== lastScanRef.current.code || (now - lastScanRef.current.time) >= SCAN_DELAY) {
        lastScanRef.current = { code: qrData, time: now };

        // Feedback sonoro e vibratório
        beep();
        if (navigator.vibrate) navigator.vibrate(80);
        toast.success(`Código detectado: ${qrData.substring(0, 15)}...`);

        // Process the QR data
        handleQRDetected(qrData);
      }
    } else {
      drawOverlay(null);
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  }, [isScanning, jsQRLoaded, beep, drawOverlay]);

  // Handle QR code detection - extract data and send to parent
  const handleQRDetected = async (rawData) => {
    if (isProcessing) return; 

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Redraw final frame onto the hidden canvas for capture
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], 'qr_capture.jpg', { type: 'image/jpeg' });
        // Pass both the raw QR data and the image to parent
        onScan(file, rawData);
      }
    }, 'image/jpeg', 0.95);
  };

  // Start camera
  const startCamera = useCallback(async (deviceId = null) => {
    if (!jsQRLoaded || isCameraStarting) return;
    setIsCameraStarting(true);

    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    try {
      setError(null);

      const deviceIdToUse = deviceId || currentDeviceId;
      
      const isMobile = window.innerWidth <= 768;
      let constraints = {
        video: deviceIdToUse 
          ? { deviceId: { exact: deviceIdToUse } }
          : { 
              // Seleção automática: Prioriza a câmera traseira no mobile
              facingMode: isMobile ? 'environment' : 'user', 
              width: { ideal: 1280 }, 
              height: { ideal: 720 } 
            },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps = track.getCapabilities();
          setHasTorch(caps && caps.torch);
        } catch (e) {
          setHasTorch(false);
        }
      }

      // Auto-seleção de câmera traseira (Executa apenas na primeira chamada)
      if (!deviceId && devices.length === 0) {
        const devs = await enumerateDevices();
        
        if (devs.length > 1) {
          const backCamera = devs.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('environment') || 
            d.label.toLowerCase().includes('traseira')
          );
          
          if (backCamera && backCamera.deviceId !== deviceIdToUse) {
            // Reinicia com a câmera traseira
            setCurrentDeviceId(backCamera.deviceId);
            setIsCameraStarting(false);
            return;
          }
        }
        if(devs.length > 0) setCurrentDeviceId(devs[0].deviceId);
      }

      setIsScanning(true);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(scanLoop);

    } catch (err) {
      console.error('Camera error:', err);
      setError('Erro ao acessar câmera: ' + err.message + '. Verifique as permissões do navegador.');
      stopCamera();
    } finally {
      setIsCameraStarting(false);
    }
  }, [jsQRLoaded, isCameraStarting, currentDeviceId, enumerateDevices, devices.length, scanLoop]);

  // Stop camera
  const stopCamera = useCallback(() => {
    setIsScanning(false);
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setTorchOn(false);
    lastScanRef.current = { code: '', time: 0 };
  }, []);

  // Switch camera
  const switchCamera = useCallback(async () => {
    if (devices.length < 2) return;

    const currentIndex = devices.findIndex(d => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];

    stopCamera();
    setCurrentDeviceId(nextDevice.deviceId);
  }, [devices, currentDeviceId, stopCamera]);

  // Toggle torch/flash
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !hasTorch) return;

    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn }]
      });
      setTorchOn(!torchOn);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  }, [hasTorch, torchOn]);

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onScan(file, null); 
    }
    e.target.value = '';
  };

  // Efeito para reiniciar a câmera se o currentDeviceId mudar (após a troca ou auto-seleção)
  useEffect(() => {
    if (currentDeviceId && isScanning) {
      startCamera(currentDeviceId);
    }
  }, [currentDeviceId, isScanning, startCamera]); 

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <Card className="overflow-hidden bg-white/80 backdrop-blur-sm border-0 shadow-xl">
      <div className="p-6">
        <div className="relative aspect-[4/3] max-w-lg mx-auto rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800">
          {(isScanning || isCameraStarting) ? (
            <>
              {/* CORREÇÃO CRÍTICA: Usar a prop 'ref' */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                onLoadedData={() => {
                   drawOverlay(null); 
                }}
              />
              {/* CORREÇÃO CRÍTICA: Usar a prop 'ref' */}
              <canvas 
                ref={overlayRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />

              {/* Scanning indicator */}
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-white text-xs font-medium">Escaneando...</span>
              </div>

              {/* Controls */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                {devices.length > 1 && (
                  <Button
                    onClick={switchCamera}
                    size="icon"
                    variant="secondary"
                    className="rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 border-0 h-12 w-12"
                    disabled={isProcessing}
                  >
                    <SwitchCamera className="w-5 h-5 text-white" />
                  </Button>
                )}

                {hasTorch && (
                  <Button
                    onClick={toggleTorch}
                    size="icon"
                    variant="secondary"
                    className={`rounded-full backdrop-blur-sm border-0 h-12 w-12 ${
                      torchOn ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-white/20 hover:bg-white/30'
                    }`}
                    title="Flash"
                    disabled={isProcessing}
                  >
                    <Zap className={`w-5 h-5 text-white`} />
                  </Button>
                )}

                <Button
                  onClick={stopCamera}
                  size="icon"
                  variant="secondary"
                  className="rounded-full bg-red-500/80 backdrop-blur-sm hover:bg-red-600 border-0 h-12 w-12"
                  disabled={isProcessing}
                >
                  <X className="w-5 h-5 text-white" />
                </Button>
              </div>

              {(isProcessing || isCameraStarting) && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                    <span className="text-white font-medium">{isCameraStarting ? 'Abrindo Câmera...' : 'Processando...'}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Camera className="w-12 h-12 text-white" />
              </div>
              <div className="text-center">
                <h3 className="text-white font-semibold text-lg mb-2">Scanner de QR Code</h3>
                <p className="text-slate-400 text-sm">
                  Escaneie etiquetas Shopee e Mercado Livre
                </p>
                <p className="text-slate-500 text-xs mt-2">
                  Leitura automática em tempo real
                </p>
              </div>
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
              {!jsQRLoaded && (
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Carregando biblioteca...</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <Button
                  onClick={() => startCamera()}
                  disabled={!jsQRLoaded || isProcessing}
                  className="flex-1 bg-violet-500 hover:bg-violet-600 rounded-xl h-12"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Abrir Câmera
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 rounded-xl h-12"
                  disabled={isProcessing}
                >
                  <Upload className="w-5 h-5 mr-2" />
                  Upload
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Hidden canvases */}
        {/* CORREÇÃO CRÍTICA: Usar a prop 'ref' */}
        <canvas ref={canvasRef} className="hidden" />
        <input
          /* CORREÇÃO CRÍTICA: Usar a prop 'ref' */
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    </Card>
  );
}
