import { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal, Cpu, Radio, AlertTriangle, Volume2, VolumeX, Edit3 } from 'lucide-react';
import { motion } from 'motion/react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, shaderMaterial } from '@react-three/drei';
import { createXRStore, XR } from '@react-three/xr';
import * as Tone from 'tone';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const store = createXRStore();
const BRIDGE_HTTP = ((import.meta as any).env?.VITE_BRIDGE_URL as string) || 'http://127.0.0.1:8787';
const BRIDGE_WS = `${BRIDGE_HTTP.replace(/^http/, 'ws')}/events`;
const CHANNEL_COLORS = ['#ff3366', '#00f5a0', '#00bbf9', '#fee440', '#9b5de5'];

// --- SHADER DEFINITION ---
const BloxMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color('#ff3366'),
    uGlitch: 0.0,
    uWireframe: 0.0,
  },
  `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float uTime;
    uniform float uGlitch;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
      vUv = uv;
      vPosition = position;
      vec3 pos = position;

      if (uGlitch > 0.0) {
        float noise = random(vec2(pos.y, uTime)) * 2.0 - 1.0;
        pos.x += noise * uGlitch * 0.1;
        pos.z += random(vec2(pos.x, uTime)) * uGlitch * 0.1;
      }

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uGlitch;
    uniform float uWireframe;

    void main() {
      vec3 color = uColor;

      float scanline = sin(vUv.y * 100.0 + uTime * 10.0) * 0.04;
      color -= scanline;

      if (uGlitch > 0.0) {
        float r = uColor.r + sin(uTime * 20.0) * uGlitch * 0.1;
        float b = uColor.b + cos(uTime * 15.0) * uGlitch * 0.1;
        color = vec3(r, color.g, b);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `
);

import { extend } from '@react-three/fiber';
extend({ BloxMaterial });

// --- 3D COMPONENT ---
const BlackBlox = ({ 
  color, 
  glitchLevel, 
  rotationSpeed, 
  scale, 
  isWireframe 
}: { 
  color: string; 
  glitchLevel: number; 
  rotationSpeed: number; 
  scale: number;
  isWireframe: boolean;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);

  const targetColor = useMemo(() => new THREE.Color(color), [color]);
  
  const targetRotation = useRef(rotationSpeed);
  const targetGlitch = useRef(glitchLevel);
  const beatGlitch = useRef(0);

  useEffect(() => {
    targetRotation.current = rotationSpeed;
    targetGlitch.current = glitchLevel;
  }, [rotationSpeed, glitchLevel]);

  // Listen for audio-reactive glitch events
  useEffect(() => {
    const handleBeat = (e: any) => {
      beatGlitch.current = e.detail.intensity / 10.0;
    };
    window.addEventListener('blox-beat', handleBeat);
    return () => window.removeEventListener('blox-beat', handleBeat);
  }, []);

  // Listen for body tracking events
  useEffect(() => {
    const handlePose = (e: any) => {
      const landmarks = e.detail;
      if (!landmarks) return;
      
      // 15 = Left Wrist, 16 = Right Wrist
      const leftWrist = landmarks[15];
      const rightWrist = landmarks[16];

      if (leftWrist && leftWrist.visibility > 0.5) {
        // Map Y (0 to 1) to glitch (10 to 0)
        targetGlitch.current = Math.max(0, Math.min(10, (1.0 - leftWrist.y) * 10));
      }
      if (rightWrist && rightWrist.visibility > 0.5) {
        // Map Y (0 to 1) to rotation (5 to -5)
        targetRotation.current = (0.5 - rightWrist.y) * 10;
      }
    };
    window.addEventListener('pose-data', handlePose);
    return () => window.removeEventListener('pose-data', handlePose);
  }, []);

  useFrame((state, delta) => {
    if (meshRef.current) {
      // Smooth rotation interpolation
      meshRef.current.userData.currentRotation = THREE.MathUtils.lerp(
         meshRef.current.userData.currentRotation || rotationSpeed,
         targetRotation.current,
         0.1
      );
      meshRef.current.rotation.x += meshRef.current.userData.currentRotation * delta;
      meshRef.current.rotation.y += meshRef.current.userData.currentRotation * delta * 0.8;
    }
    if (materialRef.current) {
      materialRef.current.uTime = state.clock.elapsedTime;
      
      // Decay beat glitch
      beatGlitch.current = THREE.MathUtils.lerp(beatGlitch.current, 0, 0.1);
      
      // Smooth base glitch interpolation
      materialRef.current.userData.currentGlitch = THREE.MathUtils.lerp(
         materialRef.current.userData.currentGlitch || (glitchLevel / 10.0),
         targetGlitch.current / 10.0,
         0.1
      );

      materialRef.current.uGlitch = materialRef.current.userData.currentGlitch + beatGlitch.current;
      materialRef.current.uColor.lerp(targetColor, 0.1);
    }
  });

  return (
    <mesh ref={meshRef} scale={scale}>
      <boxGeometry args={[1, 1, 1, 16, 16, 16]} />
      {/* @ts-ignore */}
      <bloxMaterial 
        ref={materialRef} 
        wireframe={isWireframe} 
        transparent 
        opacity={0.9} 
      />
    </mesh>
  );
};

// --- AUDIO ENGINE (Tidal/Strudel style) ---
function parsePattern(patternStr: string): any[] {
  // Tokenize: split by spaces, keep brackets as separate tokens
  const tokens = patternStr.replace(/\[/g, ' [ ').replace(/\]/g, ' ] ').trim().split(/\s+/);
  const stack: any[][] = [[]];
  
  for (const token of tokens) {
    if (token === '[') {
      const newGroup: any[] = [];
      stack[stack.length - 1].push(newGroup);
      stack.push(newGroup);
    } else if (token === ']') {
      if (stack.length > 1) {
        stack.pop();
      }
    } else {
      // Handle multipliers like hh*3 -> ["hh", "hh", "hh"] (subdivides the step)
      if (token.includes('*')) {
        const [note, countStr] = token.split('*');
        const count = parseInt(countStr) || 1;
        stack[stack.length - 1].push(Array(count).fill(note));
      } else {
        stack[stack.length - 1].push(token);
      }
    }
  }
  return stack[0];
}

class AudioEngine {
  synths: any = {};
  seq: Tone.Sequence | null = null;
  initialized = false;
  
  async init() {
    if (this.initialized) return;
    await Tone.start();
    this.synths = {
      bd: new Tone.MembraneSynth().toDestination(),
      sn: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0 } }).toDestination(),
      hh: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.1, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).toDestination(),
      synth: new Tone.Synth().toDestination()
    };
    Tone.Transport.bpm.value = 120;
    Tone.Transport.start();
    this.initialized = true;
  }

  play(pattern: string) {
    if (this.seq) this.seq.dispose();
    
    const parsedEvents = parsePattern(pattern);
    
    this.seq = new Tone.Sequence((time, note) => {
      if (note === 'bd') {
        this.synths.bd.triggerAttackRelease('C1', '8n', time);
        Tone.Draw.schedule(() => window.dispatchEvent(new CustomEvent('blox-beat', { detail: { intensity: 1.5 } })), time);
      }
      else if (note === 'sn') {
        this.synths.sn.triggerAttackRelease('16n', time);
        Tone.Draw.schedule(() => window.dispatchEvent(new CustomEvent('blox-beat', { detail: { intensity: 0.8 } })), time);
      }
      else if (note === 'hh') {
        this.synths.hh.triggerAttackRelease('32n', time, 0.3);
      }
      else if (note && note !== '~') {
        try { 
          this.synths.synth.triggerAttackRelease(note, '16n', time); 
          Tone.Draw.schedule(() => window.dispatchEvent(new CustomEvent('blox-beat', { detail: { intensity: 0.5 } })), time);
        } catch(e){}
      }
    }, parsedEvents, '4n').start(0);
  }
  
  stop() {
    if (this.seq) this.seq.dispose();
  }
  
  bpm(val: number) {
    Tone.Transport.bpm.value = val;
  }
}

const engine = new AudioEngine();

// --- VIM EDITOR COMPONENT ---
const VimEditor = ({ 
  code, 
  setCode, 
  onExecute, 
  onClose 
}: { 
  code: string, 
  setCode: (c: string) => void, 
  onExecute: (c: string) => void, 
  onClose: () => void 
}) => {
  const [mode, setMode] = useState<'NORMAL'|'INSERT'>('NORMAL');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, [mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mode === 'NORMAL') {
      e.preventDefault(); // Prevent typing
      const el = textareaRef.current;
      if (!el) return;
      
      if (e.key === 'i') setMode('INSERT');
      else if (e.key === 'a') {
        el.selectionStart++;
        el.selectionEnd = el.selectionStart;
        setMode('INSERT');
      }
      else if (e.key === 'h') { el.selectionStart = Math.max(0, el.selectionStart - 1); el.selectionEnd = el.selectionStart; }
      else if (e.key === 'l') { el.selectionStart++; el.selectionEnd = el.selectionStart; }
      else if (e.key === 'Escape') onClose();
    } else if (mode === 'INSERT') {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMode('NORMAL');
      }
    }
    
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      onExecute(code);
      setMode('NORMAL');
    }
  };

  return (
    <div className="absolute inset-0 bg-[#050505]/95 backdrop-blur-md z-50 p-8 flex flex-col font-mono text-gray-300">
       <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
         <div className="flex items-center gap-4">
           <span className={`px-2 py-1 text-xs font-bold ${mode === 'NORMAL' ? 'bg-green-500 text-black' : 'bg-red-500 text-black'}`}>
             -- {mode} --
           </span>
           <span className="text-gray-500 text-xs">VIM_MODE_ACTIVE</span>
         </div>
         <span className="text-xs text-gray-500">Shift+Enter to execute | ESC to {mode === 'NORMAL' ? 'close' : 'normal mode'}</span>
       </div>
       <textarea
         ref={textareaRef}
         value={code}
         onChange={e => setCode(e.target.value)}
         onKeyDown={handleKeyDown}
         className="flex-1 bg-transparent border-none outline-none resize-none text-lg text-gray-200 custom-scrollbar"
         spellCheck={false}
         autoFocus
       />
    </div>
  );
};

// --- POSE TRACKER COMPONENT ---
const PoseTracker = ({ isActive }: { isActive: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('INITIALIZING...');

  useEffect(() => {
    if (!isActive) return;
    let active = true;
    let landmarker: PoseLandmarker;
    let stream: MediaStream;

    const init = async () => {
      try {
        setStatus('LOADING MODEL...');
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          numPoses: 1
        });

        if (!active) return;
        setStatus('REQUESTING CAMERA...');

        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('TRACKING ACTIVE');

        let lastVideoTime = -1;
        const renderLoop = () => {
          if (!active) return;
          if (videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.currentTime !== lastVideoTime) {
            lastVideoTime = videoRef.current.currentTime;
            try {
              const result = landmarker.detectForVideo(videoRef.current, performance.now());
              
              // Draw landmarks
              const canvasCtx = canvasRef.current?.getContext('2d');
              if (canvasCtx && canvasRef.current && videoRef.current) {
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                
                if (result.landmarks && result.landmarks[0]) {
                  window.dispatchEvent(new CustomEvent('pose-data', { detail: result.landmarks[0] }));
                  
                  // Draw dots
                  canvasCtx.fillStyle = '#00ff00';
                  for (const landmark of result.landmarks[0]) {
                    canvasCtx.beginPath();
                    canvasCtx.arc(landmark.x * canvasRef.current.width, landmark.y * canvasRef.current.height, 3, 0, 2 * Math.PI);
                    canvasCtx.fill();
                  }
                }
              }
            } catch (e) {
              console.error("Detection error:", e);
            }
          }
          requestAnimationFrame(renderLoop);
        };
        renderLoop();
      } catch (err: any) {
        setStatus(`ERROR: ${err.message}`);
        console.error(err);
      }
    };
    init();

    return () => {
       active = false;
       if (landmarker) landmarker.close();
       if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="absolute top-16 right-4 w-48 bg-black/80 border border-green-500 p-2 z-40 flex flex-col gap-2 pointer-events-auto">
      <div className="text-green-500 text-[10px] flex justify-between">
        <span>BODY_TRACKING</span>
        <span className="animate-pulse">{status}</span>
      </div>
      <div className="relative w-full aspect-video">
        <video ref={videoRef} className="absolute inset-0 w-full h-full scale-x-[-1] opacity-50 object-cover" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none object-cover" />
      </div>
    </div>
  );
};

// --- MAIN APP ---
type LogEntry = {
  id: string;
  type: 'in' | 'out' | 'err' | 'sys';
  text: string;
};

export default function App() {
  const [history, setHistory] = useState<LogEntry[]>([
    { id: 'boot-1', type: 'sys', text: 'BLACK_BLOX.xr v3.0.0 INITIALIZED' },
    { id: 'boot-2', type: 'sys', text: `Bridge target: ${BRIDGE_HTTP}` },
    { id: 'boot-3', type: 'sys', text: 'Use official syntax (•N ~F >F !F ?F) or local function() commands.' },
  ]);
  
  // Terminal Input & History
  const [input, setInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorCode, setEditorCode] = useState('// Write your pattern here\nplay("bd hh sn hh")\ncolor("#ff3366")\nrotate(2)');

  // 3D State
  const [bloxColor, setBloxColor] = useState('#ff3366');
  const [glitchLevel, setGlitchLevel] = useState(0);
  const [rotationSpeed, setRotationSpeed] = useState(0.5);
  const [bloxScale, setBloxScale] = useState(1.5);
  const [isWireframe, setIsWireframe] = useState(false);
  const [isBodyTrackingEnabled, setIsBodyTrackingEnabled] = useState(false);
  
  // Audio State
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<'CONNECTING' | 'ONLINE' | 'OFFLINE'>('CONNECTING');
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const log = (text: string, type: 'in' | 'out' | 'err' | 'sys' = 'out') => {
    setHistory(prev => [...prev, { id: Math.random().toString(36).substring(2), type, text }]);
  };

  const ensureAudio = async () => {
    if (isAudioEnabled) return;
    await engine.init();
    setIsAudioEnabled(true);
  };

  const applyChannelToVisual = (ch: any) => {
    if (!ch || !ch.active) return;

    const freq = Number(ch.freq) || 0;
    const speed = Number(ch.speed) || 0.5;
    const glitch = Number(ch.glitch) || 0;
    const channelId = Number(ch.n) || 0;

    setRotationSpeed(speed);
    setGlitchLevel(Math.max(0, Math.min(10, Math.round(glitch * 10))));
    setBloxScale(Math.max(0.8, Math.min(2.8, 0.9 + freq / 300)));
    setBloxColor(CHANNEL_COLORS[Math.abs(channelId) % CHANNEL_COLORS.length]);
  };

  useEffect(() => {
    let alive = true;
    let reconnectTimer = 0;

    const scheduleReconnect = () => {
      if (!alive || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        connectBridge();
      }, 2000);
    };

    const connectBridge = async () => {
      try {
        const health = await fetch(`${BRIDGE_HTTP}/health`);
        if (!health.ok) throw new Error('bridge health check failed');
      } catch {
        if (!alive) return;
        setBridgeStatus('OFFLINE');
        scheduleReconnect();
        return;
      }

      if (!alive) return;
      const ws = new WebSocket(BRIDGE_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        setBridgeStatus('ONLINE');
      };

      ws.onmessage = (event) => {
        if (!alive) return;
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === 'state_snapshot' && msg.payload && Array.isArray(msg.payload.channels) && msg.payload.channels.length > 0) {
            applyChannelToVisual(msg.payload.channels[0]);
          }
          if (msg.type === 'channel_update' && msg.payload) {
            applyChannelToVisual(msg.payload);
          }
          if (msg.type === 'ai_injection' && msg.payload) {
            const delta = Number(msg.payload.delta) || 0;
            const sign = delta > 0 ? '+' : '';
            log(`[ai/${msg.payload.source || 'ai'}] •${msg.payload.ch} freq ${sign}${delta.toFixed(1)}`, 'sys');
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onerror = () => {
        if (!alive) return;
        setBridgeStatus('OFFLINE');
      };

      ws.onclose = () => {
        if (!alive) return;
        setBridgeStatus('OFFLINE');
        scheduleReconnect();
      };
    };

    connectBridge();

    return () => {
      alive = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const looksLikeCoreLanguage = (line: string) => {
    if (line.startsWith(':')) return true;
    return line.includes('•') || line.includes('~') || line.includes('>') || line.includes('!') || line.includes('?');
  };

  const executeBridgeLine = async (line: string) => {
    try {
      const response = await fetch(`${BRIDGE_HTTP}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        log(payload.error || `Bridge error (${response.status})`, 'err');
        return;
      }

      if (payload.type === 'help' && Array.isArray(payload.help)) {
        payload.help.forEach((entry: string) => log(entry, 'out'));
        return;
      }

      if (payload.type === 'llm' && payload.llm) {
        if (!payload.llm.enabled) {
          log(`[llm] disabled (${payload.llm.reason})`, 'sys');
          return;
        }
        log(`[llm] ${payload.llm.provider}:${payload.llm.model} timeout=${payload.llm.timeoutMs}ms`, 'sys');
        return;
      }

      if (payload.type === 'chat') {
        log(payload.answer || '(sem resposta)', 'out');
        return;
      }

      if (payload.rendered) log(payload.rendered, 'out');
      if (payload.message) log(payload.message, 'sys');
    } catch {
      setBridgeStatus('OFFLINE');
      log(`Bridge offline: ${BRIDGE_HTTP}`, 'err');
    }
  };

  const executeCommand = async (cmd: string, silent = false) => {
    if (!silent) log(`> ${cmd}`, 'in');
    
    const trimmed = cmd.trim();
    if (!trimmed || trimmed.startsWith('//')) return;

    if (looksLikeCoreLanguage(trimmed)) {
      await executeBridgeLine(trimmed);
      return;
    }

    const match = trimmed.match(/^([a-zA-Z0-9_]+)\s*\((.*)\)$/);
    
    if (!match) {
      if (trimmed === 'clear') {
        setHistory([]);
        return;
      }
      if (trimmed === 'editor') {
        setIsEditorOpen(true);
        return;
      }
      log(`SyntaxError: Invalid format. Use function(args) or type help()`, 'err');
      return;
    }

    const [_, func, argsStr] = match;
    const args = argsStr.split(',').map(s => s.trim().replace(/['"]/g, ''));

    try {
      switch (func) {
        case 'help':
          log('AVAILABLE COMMANDS:', 'sys');
          log('  •N ~F >F !F ?F - Official Black Blox syntax (sent to core bridge)', 'out');
          log('  :help :reset :llm :chat ... - Official bridge commands', 'out');
          log('  Local XR commands (below) are still available:', 'out');
          log('  play(pattern)  - Play rhythm (e.g., play("bd hh sn hh"))', 'out');
          log('  bpm(val)       - Set tempo (e.g., bpm(140))', 'out');
          log('  color(hex)     - Change blox color (e.g., color(#00ff00))', 'out');
          log('  glitch(level)  - Set shader glitch intensity 0-10', 'out');
          log('  rotate(speed)  - Set rotation speed (e.g., rotate(2.5))', 'out');
          log('  scale(size)    - Set blox scale (e.g., scale(2))', 'out');
          log('  wireframe(0|1) - Toggle wireframe mode', 'out');
          log('  body(0|1)      - Toggle body tracking via webcam', 'out');
          log('  editor()       - Open Vim-style multi-line editor', 'out');
          log('  test()         - Run BlackBlox diagnostics test', 'out');
          log('  stop()         - Stop audio', 'out');
          log('  clear          - Clear terminal', 'out');
          break;
        
        case 'test':
          await ensureAudio();
          log('Starting BlackBlox Diagnostics...', 'sys');
          const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
          
          (async () => {
            await delay(1000);
            setBloxColor('#00ff00');
            log('Test 1/5: Color change (#00ff00)', 'sys');

            await delay(1000);
            setBloxScale(2);
            log('Test 2/5: Scale change (2)', 'sys');

            await delay(1000);
            setRotationSpeed(5);
            log('Test 3/5: Rotation change (5)', 'sys');

            await delay(1000);
            setGlitchLevel(8);
            log('Test 4/5: Glitch effect (8)', 'sys');

            await delay(1000);
            engine.play("bd [sn hh*3] [~ bd] [C4 E4 G4]");
            log('Test 5/5: Advanced Audio (bd [sn hh*3] [~ bd] [C4 E4 G4])', 'sys');

            await delay(5000);
            engine.stop();
            setBloxColor('#ff3366');
            setBloxScale(1.5);
            setRotationSpeed(0.5);
            setGlitchLevel(0);
            log('Diagnostics complete. All systems nominal.', 'sys');
          })();
          break;

        case 'play':
          await ensureAudio();
          if (!args[0]) throw new Error('Missing pattern argument');
          engine.play(args[0]);
          log(`Playing pattern: ${args[0]}`);
          break;

        case 'bpm':
          await ensureAudio();
          const b = parseFloat(args[0]);
          if (isNaN(b)) throw new Error('BPM must be a number');
          engine.bpm(b);
          log(`BPM set to ${b}`);
          break;

        case 'color':
          if (!args[0]) throw new Error('Missing color argument');
          setBloxColor(args[0]);
          log(`Blox color set to ${args[0]}`);
          break;

        case 'glitch':
          const level = parseInt(args[0]);
          if (isNaN(level) || level < 0 || level > 10) throw new Error('Glitch level must be between 0 and 10');
          setGlitchLevel(level);
          log(`Shader glitch intensity set to ${level}`);
          break;

        case 'rotate':
          const speed = parseFloat(args[0]);
          if (isNaN(speed)) throw new Error('Speed must be a number');
          setRotationSpeed(speed);
          log(`Rotation speed set to ${speed}`);
          break;

        case 'scale':
          const s = parseFloat(args[0]);
          if (isNaN(s)) throw new Error('Scale must be a number');
          setBloxScale(s);
          log(`Scale set to ${s}`);
          break;

        case 'wireframe':
          const w = parseInt(args[0]);
          setIsWireframe(w === 1);
          log(`Wireframe mode ${w === 1 ? 'enabled' : 'disabled'}`);
          break;

        case 'body':
          const track = parseInt(args[0]);
          setIsBodyTrackingEnabled(track === 1);
          log(`Body tracking ${track === 1 ? 'enabled' : 'disabled'}`);
          break;

        case 'stop':
          engine.stop();
          log('Audio stopped');
          break;

        default:
          log(`ReferenceError: ${func} is not defined`, 'err');
      }
    } catch (err: any) {
      log(`Error: ${err.message}`, 'err');
    }
  };

  const executeScript = (script: string) => {
    log(`> Executing Editor Buffer...`, 'in');
    const lines = script.split('\n');
    lines.forEach(line => executeCommand(line, true));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (input.trim()) {
        setCmdHistory(prev => [...prev, input]);
        setHistoryIndex(-1);
        executeCommand(input);
      }
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < cmdHistory.length - 1) {
        const newIdx = historyIndex + 1;
        setHistoryIndex(newIdx);
        setInput(cmdHistory[cmdHistory.length - 1 - newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setInput(cmdHistory[cmdHistory.length - 1 - newIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  return (
    <div className="w-full h-screen bg-[#050505] font-mono text-gray-300 overflow-hidden relative">
      
      {/* 3D WebXR Canvas Background */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
          <XR store={store}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} />
            <BlackBlox 
              color={bloxColor} 
              glitchLevel={glitchLevel} 
              rotationSpeed={rotationSpeed}
              scale={bloxScale}
              isWireframe={isWireframe}
            />
            <OrbitControls enableZoom={false} />
          </XR>
        </Canvas>
      </div>

      {/* WebXR Enter Buttons */}
      <div className="absolute bottom-4 right-4 z-40 flex gap-2">
        <button 
          onClick={() => store.enterAR()}
          className="bg-black/80 text-green-500 border border-green-500 font-mono text-xs px-4 py-2 hover:bg-green-500 hover:text-black transition-colors cursor-pointer"
        >
          ENTER AR
        </button>
        <button 
          onClick={() => store.enterVR()}
          className="bg-black/80 text-red-500 border border-red-500 font-mono text-xs px-4 py-2 hover:bg-red-500 hover:text-black transition-colors cursor-pointer"
        >
          ENTER VR
        </button>
      </div>

      {/* Top Status Bar */}
      <header className="absolute top-0 left-0 right-0 border-b border-gray-800/50 bg-black/60 backdrop-blur-md z-40 p-3 flex justify-between items-center text-xs tracking-widest pointer-events-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-red-500 font-bold">
            <Terminal size={14} />
            BLACK_BLOX.xr
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span className={`flex items-center gap-2 ${bridgeStatus === 'ONLINE' ? 'text-cyan-400' : bridgeStatus === 'CONNECTING' ? 'text-yellow-500' : 'text-red-500'}`}>
            <Cpu size={14} className={bridgeStatus === 'ONLINE' ? 'animate-pulse' : ''} />
            BRIDGE_{bridgeStatus}
          </span>
          <span className="flex items-center gap-2 text-gray-500">
            {isAudioEnabled ? <Volume2 size={14} className="text-green-500" /> : <VolumeX size={14} />}
            AUDIO
          </span>
          <span className="flex items-center gap-2 text-green-500">
            <Radio size={14} className={isBodyTrackingEnabled ? "animate-ping text-red-500" : "animate-pulse"} />
            {isBodyTrackingEnabled ? 'TRACKING_ACTIVE' : 'XR_ACTIVE'}
          </span>
        </div>
      </header>

      {/* Body Tracking Overlay */}
      <PoseTracker isActive={isBodyTrackingEnabled} />

      {/* Terminal Overlay */}
      <main 
        className="absolute inset-0 pt-16 pb-16 px-4 sm:px-8 flex flex-col z-10 pointer-events-none"
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-end pointer-events-auto max-w-2xl bg-gradient-to-t from-black/80 to-transparent p-4 rounded-lg">
          <div className="space-y-1 pb-4">
            {history.map((entry) => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={entry.id}
                className={`text-sm sm:text-base drop-shadow-md ${
                  entry.type === 'in' ? 'text-gray-400' :
                  entry.type === 'err' ? 'text-red-500' :
                  entry.type === 'sys' ? 'text-green-500 font-bold' :
                  'text-gray-100'
                }`}
              >
                {entry.text}
              </motion.div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input Area */}
          <div className="flex items-center gap-2 border-t border-gray-800/80 pt-4 bg-transparent">
            <span className="text-red-500 font-bold animate-pulse">{'>'}</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent border-none outline-none text-white text-sm sm:text-base focus:ring-0 p-0"
              spellCheck="false"
              autoComplete="off"
            />
            <button 
              onClick={() => setIsEditorOpen(true)}
              className="text-gray-500 hover:text-white transition-colors"
              title="Open Editor Mode"
            >
              <Edit3 size={16} />
            </button>
          </div>
        </div>
      </main>

      {/* Vim Editor Overlay */}
      {isEditorOpen && (
        <VimEditor 
          code={editorCode} 
          setCode={setEditorCode} 
          onExecute={executeScript} 
          onClose={() => setIsEditorOpen(false)} 
        />
      )}
    </div>
  );
}
