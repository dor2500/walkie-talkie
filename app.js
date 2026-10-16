/**
 * Tactical PTT Walkie-Talkie
 * High-Performance WebRTC Mesh Voice Engine with Web Audio API Synthesis
 */

// Application State
let myName = '';
let peer = null;
let myStream = null;
let conns = {};          // peerId -> DataConnection
let calls = {};          // peerId -> MediaConnection
let names = {};          // peerId -> string
let roomCode = '';
let roomId = '';
let isHost = false;
let talking = false;
let talkMode = 'ptt';    // 'ptt' | 'lock'
let soundFxEnabled = true;
let speakerMuted = false;
let currentSpeakerName = null;

// Web Audio API & Visualizer Nodes
let audioCtx = null;
let micSourceNode = null;
let analyserNode = null;
let visualizerAnimationId = null;

// Scanner instance
let html5QrScanner = null;

/* ==========================================================================
   Initialization & Lifecycle
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Restore saved name if available
  const savedName = localStorage.getItem('walkie_user_name');
  if (savedName) {
    const nameInput = document.getElementById('myName');
    if (nameInput) nameInput.value = savedName;
  }

  // Restore sound FX preference
  const savedFx = localStorage.getItem('walkie_sound_fx');
  if (savedFx !== null) {
    soundFxEnabled = savedFx === 'true';
    updateSoundFxUI();
  }

  // Check URL params for direct join invitation
  checkUrlParams();

  // Setup Global Listeners
  setupPttEventListeners();
  setupKeyboardShortcuts();
  setupSoundFxButton();
});

// Detect direct join links: ?join=walkie-ABC123&code=ABC123
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || params.get('room');
  if (code) {
    const codeInput = document.getElementById('codeInput');
    if (codeInput) codeInput.value = code.trim().toUpperCase();
  }
}

/* ==========================================================================
   Web Audio API & Sound Synthesizer (Zero External Dependencies)
   ========================================================================== */

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Tactical PTT Chirp (Key-down beep)
function playPttStartBeep() {
  if (!soundFxEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Frequency chirp: 1100Hz jump to 1600Hz
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.setValueAtTime(1600, now + 0.035);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.06);
    gain.gain.linearRampToValueAtTime(0, now + 0.075);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch (e) {
    console.warn('Audio FX error:', e);
  }
}

// Tactical Roger Beep + Squelch Static Burst (Key-up squelch)
function playPttEndBeep() {
  if (!soundFxEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Roger Beep Tone (High clear pip)
    const osc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1050, now);
    toneGain.gain.setValueAtTime(0, now);
    toneGain.gain.linearRampToValueAtTime(0.15, now + 0.005);
    toneGain.gain.linearRampToValueAtTime(0, now + 0.06);
    osc.connect(toneGain);
    toneGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);

    // 2. White Noise Squelch Burst (Realistic radio static)
    const bufferSize = ctx.sampleRate * 0.12; // 120ms
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now + 0.05);
    filter.Q.setValueAtTime(1.8, now + 0.05);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.setValueAtTime(0, now + 0.05);
    noiseGain.gain.linearRampToValueAtTime(0.12, now + 0.06);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    whiteNoise.start(now + 0.05);
    whiteNoise.stop(now + 0.18);
  } catch (e) {
    console.warn('Audio FX error:', e);
  }
}

// Incoming Transmission Chirp (When another peer starts talking)
function playIncomingAlert() {
  if (!soundFxEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch (e) {}
}

// Tactile Haptic Vibration
function triggerHaptic(pattern = [25]) {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

// Sound FX button toggle
function setupSoundFxButton() {
  const btn = document.getElementById('soundFxBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    soundFxEnabled = !soundFxEnabled;
    localStorage.setItem('walkie_sound_fx', soundFxEnabled);
    updateSoundFxUI();
    showToast(soundFxEnabled ? 'צלילי קשר הופעלו 🔊' : 'צלילי קשר הושתקו 🔇');
    if (soundFxEnabled) playPttStartBeep();
  });
}

function updateSoundFxUI() {
  const onIcon = document.getElementById('soundFxOnIcon');
  const offIcon = document.getElementById('soundFxOffIcon');
  if (soundFxEnabled) {
    onIcon?.classList.remove('hidden');
    offIcon?.classList.add('hidden');
  } else {
    onIcon?.classList.add('hidden');
    offIcon?.classList.remove('hidden');
  }
}

/* ==========================================================================
   Navigation & Screen Transitions
   ========================================================================== */

function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.remove('hidden');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goWelcome() {
  const input = document.getElementById('myName');
  myName = input.value.trim();
  if (!myName) {
    showToast('נא להזין כינוי / שם');
    input.focus();
    return;
  }

  // Save to localStorage
  localStorage.setItem('walkie_user_name', myName);

  // Update UI Elements
  document.getElementById('helloName').textContent = myName;
  document.getElementById('welcomeAvatar').textContent = myName.charAt(0);
  document.getElementById('hName').textContent = myName;
  document.getElementById('jName').textContent = myName;
  document.getElementById('myShow').textContent = myName;

  // Check if we came with an invite link
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || params.get('room');
  if (code) {
    goJoin();
    return;
  }

  switchScreen('welcomeScreen');
  triggerHaptic([15]);
}

function goBackToName() {
  switchScreen('nameScreen');
}

function goBackToWelcome() {
  stopScanner();
  switchScreen('welcomeScreen');
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing 0/O, 1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/* ==========================================================================
   Host Screen Logic
   ========================================================================== */

function goHost() {
  isHost = true;
  switchScreen('hostScreen');
  roomCode = genCode();
  
  document.getElementById('roomCode').textContent = roomCode;
  document.getElementById('cMini').textContent = roomCode;
  document.getElementById('hostStatusText').textContent = 'מאתחל ערוץ מאובטח...';

  // Initialize PeerJS with public STUN servers for NAT Traversal
  initPeer('walkie-' + roomCode, (id) => {
    roomId = id;
    document.getElementById('hostStatusText').textContent = 'ערוץ מוכן לחיבור!';
    
    // Generate QR Code with Direct Join URL
    const joinUrl = `${window.location.origin}${window.location.pathname}?join=${id}&code=${roomCode}`;
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: joinUrl,
      width: 170,
      height: 170,
      colorDark: '#090c12',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  });
}

function copyRoomCode() {
  navigator.clipboard.writeText(roomCode).then(() => {
    showToast(`קוד ערוץ ${roomCode} הועתק! 📋`);
    triggerHaptic([20]);
  }).catch(() => {
    showToast(`קוד: ${roomCode}`);
  });
}

function shareViaWebShare() {
  const joinUrl = `${window.location.origin}${window.location.pathname}?join=walkie-${roomCode}&code=${roomCode}`;
  const shareData = {
    title: 'הזמנה לווקי-טוקי טקטי',
    text: `בוא לדבר איתי בקשר ווקי-טוקי! קוד ערוץ: ${roomCode}`,
    url: joinUrl
  };

  if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
    navigator.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(joinUrl).then(() => {
      showToast('הקישור לרשת הועתק ללוח! שתף בוואטסאפ');
    });
  }
}

/* ==========================================================================
   Join Screen Logic
   ========================================================================== */

function goJoin() {
  isHost = false;
  switchScreen('joinScreen');
  
  if (!peer) {
    initPeer(null, () => {
      console.log('Peer ready for client');
    });
  }

  // If code is already pre-filled from URL, focus the join button
  const codeInput = document.getElementById('codeInput');
  if (codeInput.value.trim()) {
    document.getElementById('joinSubmitBtn').focus();
  } else {
    setTimeout(() => codeInput.focus(), 300);
  }
}

function doJoin() {
  const codeInput = document.getElementById('codeInput');
  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    showToast('נא להזין קוד ערוץ');
    codeInput.focus();
    return;
  }

  stopScanner();
  roomCode = code;
  document.getElementById('cMini').textContent = roomCode;

  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('join') || ('walkie-' + code);

  showToast('מתחבר לערוץ הקשר...');
  connectTo(targetId);

  setTimeout(() => {
    goTalk();
  }, 1200);
}

/* ==========================================================================
   QR Code Scanner
   ========================================================================== */

function toggleScanner() {
  const wrapper = document.getElementById('readerWrapper');
  if (wrapper.classList.contains('hidden')) {
    startScanner();
  } else {
    stopScanner();
  }
}

function startScanner() {
  const wrapper = document.getElementById('readerWrapper');
  wrapper.classList.remove('hidden');
  document.getElementById('scanBtnText').textContent = 'סגור מצלמה ✕';

  html5QrScanner = new Html5Qrcode('reader');
  const config = { fps: 12, qrbox: { width: 220, height: 220 } };

  html5QrScanner.start(
    { facingMode: 'environment' },
    config,
    (decodedText) => {
      stopScanner();
      triggerHaptic([40, 20, 40]);
      try {
        const url = new URL(decodedText);
        const joinId = url.searchParams.get('join');
        const code = url.searchParams.get('code') || '';
        if (code) {
          document.getElementById('codeInput').value = code;
          roomCode = code;
          document.getElementById('cMini').textContent = code;
        }
        if (joinId) {
          showToast(`ברקוד נסרק! מתחבר... 📻`);
          connectTo(joinId);
          setTimeout(() => goTalk(), 1000);
          return;
        }
      } catch (e) {
        // Plain text code
        document.getElementById('codeInput').value = decodedText;
        doJoin();
      }
    },
    (errorMessage) => {
      // scanning frames...
    }
  ).catch(err => {
    showToast('שגיאה בהפעלת מצלמה');
    stopScanner();
  });
}

function stopScanner() {
  if (html5QrScanner) {
    try {
      html5QrScanner.stop().then(() => {
        html5QrScanner.clear();
        html5QrScanner = null;
      }).catch(() => {});
    } catch (e) {}
  }
  const wrapper = document.getElementById('readerWrapper');
  if (wrapper) wrapper.classList.add('hidden');
  const scanBtnText = document.getElementById('scanBtnText');
  if (scanBtnText) scanBtnText.textContent = '📷 סרוק ברקוד QR במצלמה';
}

/* ==========================================================================
   PeerJS Connection & WebRTC Mesh Engine
   ========================================================================== */

const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
};

function initPeer(customId, onReady) {
  if (peer && !peer.destroyed) {
    if (onReady) onReady(peer.id);
    return;
  }

  try {
    peer = customId ? new Peer(customId, PEER_CONFIG) : new Peer(PEER_CONFIG);

    peer.on('open', (id) => {
      console.log('Peer connected with ID:', id);
      setupPeerEvents();
      if (onReady) onReady(id);
    });

    peer.on('error', (err) => {
      console.warn('PeerJS error:', err.type, err);
      if (err.type === 'unavailable-id') {
        showToast('ערוץ תפוס, יוצר ערוץ חלופי...');
        roomCode = genCode();
        document.getElementById('roomCode').textContent = roomCode;
        initPeer('walkie-' + roomCode, onReady);
      } else {
        showToast('שגיאת רשת P2P');
      }
    });

  } catch (err) {
    console.error('Failed to instantiate Peer:', err);
  }
}

function setupPeerEvents() {
  if (!peer) return;

  // Handle incoming data connections
  peer.on('connection', (c) => {
    c.on('open', () => {
      conns[c.peer] = c;
      c.on('data', (data) => onDataReceived(data, c.peer));
      c.on('close', () => removePeer(c.peer));
      c.on('error', () => removePeer(c.peer));

      // Send our own metadata to newly connected peer
      c.send({ t: 'name', name: myName });
      
      // If we are host, broadcast peer mesh list to ensure full mesh
      if (isHost) {
        broadcastMesh();
      }
      renderPeers();
    });
  });

  // Handle incoming audio calls
  peer.on('call', async (c) => {
    calls[c.peer] = c;
    if (!myStream) {
      myStream = await getMic(true);
    }
    c.answer(myStream);
    c.on('stream', (remoteStream) => {
      addAudioStream(remoteStream, c.peer);
    });
    c.on('close', () => {
      removeAudioStream(c.peer);
    });
  });
}

// Connect to a peer and initiate audio call + data channel
async function connectTo(id) {
  if (!id || id === peer?.id || conns[id]) return;

  if (!myStream) {
    myStream = await getMic(true);
  }

  // Setup data connection
  const c = peer.connect(id, { reliable: true });
  c.on('open', () => {
    conns[id] = c;
    c.send({ t: 'name', name: myName });
    c.on('data', (d) => onDataReceived(d, id));
    c.on('close', () => removePeer(id));
    c.on('error', () => removePeer(id));

    broadcastMesh();
    renderPeers();
  });

  // Setup WebRTC audio call
  if (myStream) {
    const call = peer.call(id, myStream);
    calls[id] = call;
    call.on('stream', (remoteStream) => {
      addAudioStream(remoteStream, id);
    });
    call.on('close', () => removeAudioStream(id));
  }
}

function broadcastMesh() {
  const allPeerIds = [peer.id, ...Object.keys(conns)];
  Object.values(conns).forEach((c) => {
    try {
      c.send({ t: 'peers', peers: allPeerIds });
    } catch (e) {}
  });
  renderPeers();
}

function removePeer(id) {
  delete conns[id];
  delete calls[id];
  delete names[id];
  removeAudioStream(id);
  renderPeers();

  if (currentSpeakerName && names[id] === currentSpeakerName) {
    setSpeakingUI(null);
  }
}

/* ==========================================================================
   Data Signaling Handler
   ========================================================================== */

function onDataReceived(data, fromId) {
  if (!data || !data.t) return;

  switch (data.t) {
    case 'name':
      names[fromId] = data.name;
      renderPeers();
      break;

    case 'talk-s':
      // Remote peer started transmitting
      currentSpeakerName = data.name || names[fromId] || 'משתמש';
      playIncomingAlert();
      triggerHaptic([30]);
      setSpeakingUI(currentSpeakerName, false);
      highlightPeerTalking(fromId, true);
      break;

    case 'talk-e':
      // Remote peer stopped transmitting
      playPttEndBeep();
      setSpeakingUI(null);
      highlightPeerTalking(fromId, false);
      currentSpeakerName = null;
      break;

    case 'peers':
      // Mesh discovery: connect to all discovered peers
      if (Array.isArray(data.peers)) {
        data.peers.forEach((pId) => {
          if (pId !== peer.id && !conns[pId]) {
            connectTo(pId);
          }
        });
      }
      break;

    case 'leave':
      removePeer(fromId);
      break;
  }
}

/* ==========================================================================
   Microphone & Audio Processing
   ========================================================================== */

async function getMic(muteOnStart = true) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      },
      video: false
    });

    // Mute microphone track immediately so we only transmit when PTT is pressed
    if (stream.getAudioTracks().length > 0) {
      stream.getAudioTracks()[0].enabled = !muteOnStart;
    }

    // Connect to Web Audio API Analyser for live frequency visualization
    setupVisualizer(stream);

    return stream;
  } catch (err) {
    console.error('Microphone access denied:', err);
    showToast('נא לאשר גישה למיקרופון');
    return null;
  }
}

function addAudioStream(remoteStream, peerId) {
  const existing = document.getElementById('audio-' + peerId);
  if (existing) {
    existing.srcObject = remoteStream;
    return;
  }

  const audio = document.createElement('audio');
  audio.id = 'audio-' + peerId;
  audio.srcObject = remoteStream;
  audio.autoplay = true;
  audio.playsInline = true;
  audio.muted = speakerMuted;

  // Ensure playback starts on mobile
  audio.play().catch(() => {
    // Unlock on first tap
    document.body.addEventListener('click', () => audio.play(), { once: true });
  });

  document.getElementById('audios').appendChild(audio);
}

function removeAudioStream(peerId) {
  const audio = document.getElementById('audio-' + peerId);
  if (audio) {
    audio.srcObject = null;
    audio.remove();
  }
}

function toggleSpeakerMute() {
  speakerMuted = !speakerMuted;
  const audios = document.querySelectorAll('#audios audio');
  audios.forEach((a) => (a.muted = speakerMuted));

  const onIcon = document.getElementById('spkOn');
  const offIcon = document.getElementById('spkOff');
  if (speakerMuted) {
    onIcon?.classList.add('hidden');
    offIcon?.classList.remove('hidden');
    showToast('רמקול הושתק 🔇');
  } else {
    onIcon?.classList.remove('hidden');
    offIcon?.classList.add('hidden');
    showToast('רמקול פועל 🔊');
  }
}

/* ==========================================================================
   Live Audio Waveform Visualizer
   ========================================================================== */

function setupVisualizer(stream) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    micSourceNode = ctx.createMediaStreamSource(stream);
    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 64;
    micSourceNode.connect(analyserNode);

    renderVisualizer();
  } catch (e) {
    console.warn('Visualizer setup error:', e);
  }
}

function renderVisualizer() {
  const canvas = document.getElementById('visualizerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 32;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    visualizerAnimationId = requestAnimationFrame(draw);

    if (analyserNode && (talking || currentSpeakerName)) {
      analyserNode.getByteFrequencyData(dataArray);
    } else {
      dataArray.fill(4); // Flat baseline
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 1.6;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i];
      const barHeight = Math.max(3, (val / 255) * canvas.height * 0.9);

      // Color palette based on talking or receiving
      if (talking) {
        ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + (val / 255) * 0.6})`;
      } else if (currentSpeakerName) {
        ctx.fillStyle = `rgba(16, 185, 129, ${0.4 + (val / 255) * 0.6})`;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      }

      ctx.fillRect(x, (canvas.height - barHeight) / 2, barWidth - 1.5, barHeight);
      x += barWidth;
    }
  }

  draw();
}

/* ==========================================================================
   PTT & Voice Transmission Engine
   ========================================================================== */

function setupPttEventListeners() {
  const btn = document.getElementById('pttButton');
  if (!btn) return;

  // Pointer events handle both touch and mouse smoothly without lag
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (talkMode === 'ptt') {
      startTalk();
    } else {
      // Lock mode toggle
      if (talking) {
        stopTalk();
      } else {
        startTalk();
      }
    }
  });

  btn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (talkMode === 'ptt') {
      stopTalk();
    }
  });

  btn.addEventListener('pointercancel', (e) => {
    e.preventDefault();
    if (talkMode === 'ptt') stopTalk();
  });

  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

function setupKeyboardShortcuts() {
  let spaceDown = false;

  window.addEventListener('keydown', (e) => {
    // Avoid triggering when user is typing in an input
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!spaceDown) {
        spaceDown = true;
        if (talkMode === 'ptt') {
          startTalk();
        } else {
          talking ? stopTalk() : startTalk();
        }
      }
    }

    if (e.code === 'KeyM') {
      document.getElementById('soundFxBtn')?.click();
    }

    if (e.code === 'KeyL') {
      setTalkMode(talkMode === 'ptt' ? 'lock' : 'ptt');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      spaceDown = false;
      if (talkMode === 'ptt') {
        stopTalk();
      }
    }
  });
}

function setTalkMode(mode) {
  talkMode = mode;
  document.getElementById('modePttBtn')?.classList.toggle('active', mode === 'ptt');
  document.getElementById('modeLockBtn')?.classList.toggle('active', mode === 'lock');

  const subText = document.getElementById('pttSubText');
  if (subText) {
    subText.textContent = mode === 'ptt' ? 'החזק כדי לשדר' : 'לחיצה להתחלה/סיום';
  }

  showToast(mode === 'ptt' ? 'מצב PTT פעיל (החזק לשידור)' : 'מצב נעילה פעיל (לחיצה לשידור)');
}

async function startTalk() {
  if (talking) return;

  // Ensure AudioContext is running
  getAudioContext();

  if (!myStream) {
    myStream = await getMic(false);
  } else {
    const audioTrack = myStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = true;
  }

  talking = true;
  triggerHaptic([35]);
  playPttStartBeep();

  // Update UI to transmitting state
  setSpeakingUI(myName, true);

  // Broadcast talk-s (start) to all peers
  Object.values(conns).forEach((c) => {
    try {
      c.send({ t: 'talk-s', name: myName });
    } catch (e) {}
  });
}

function stopTalk() {
  if (!talking) return;
  talking = false;

  // Mute audio track
  if (myStream) {
    const audioTrack = myStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = false;
  }

  triggerHaptic([15, 30, 15]);
  playPttEndBeep();

  // Reset UI
  setSpeakingUI(null);

  // Broadcast talk-e (end) to all peers
  Object.values(conns).forEach((c) => {
    try {
      c.send({ t: 'talk-e' });
    } catch (e) {}
  });
}

function setSpeakingUI(speakerName, isSelf = false) {
  const banner = document.getElementById('transmissionBanner');
  const title = document.getElementById('whoTalk');
  const sub = document.getElementById('transSub');
  const pttRing = document.getElementById('pttOuterRing');
  const pttBtn = document.getElementById('pttButton');
  const pttMainText = document.getElementById('pttMainText');

  if (speakerName) {
    if (isSelf) {
      banner.className = 'transmission-banner transmitting';
      sub.textContent = 'משדר עכשיו:';
      title.textContent = `${speakerName} (אתה) 🎙️`;

      pttRingsActive(true);
      pttBtn.classList.add('active');
      pttMainText.textContent = 'משדר...';
    } else {
      banner.className = 'transmission-banner receiving';
      sub.textContent = 'משדר בערוץ:';
      title.textContent = `${speakerName} 🔊`;

      pttRingsActive(false);
      pttBtn.classList.remove('active');
      pttMainText.textContent = 'מאזין...';
    }
  } else {
    // Idle state
    banner.className = 'transmission-banner idle';
    sub.textContent = 'מצב ערוץ:';
    title.textContent = 'ערוץ פנוי להאזנה';

    pttRingsActive(false);
    pttBtn.classList.remove('active');
    pttMainText.textContent = 'לחץ ודבר';
  }
}

function pttRingsActive(active) {
  const ring = document.getElementById('pttOuterRing');
  if (ring) {
    ring.classList.toggle('transmitting', active);
  }
}

function highlightPeerTalking(peerId, isTalking) {
  const el = document.getElementById('peer-row-' + peerId);
  if (el) {
    el.classList.toggle('is-talking', isTalking);
  }
}

/* ==========================================================================
   Peers Rendering & Drawer Management
   ========================================================================== */

function renderPeers() {
  const peerCount = Object.keys(conns).length + 1; // Peers + Self
  
  const cntEl = document.getElementById('cnt');
  if (cntEl) cntEl.textContent = peerCount;
  
  const drawerCount = document.getElementById('drawerCount');
  if (drawerCount) drawerCount.textContent = peerCount;

  const peersDiv = document.getElementById('peers');
  if (!peersDiv) return;

  let html = '';

  // Render Self
  html += `
    <div class="peer-row ${talking ? 'is-talking' : ''}">
      <div class="peer-row-info">
        <div class="peer-row-avatar">${myName.charAt(0)}</div>
        <div>
          <span class="peer-row-name">${myName} (אתה)</span>
          <span class="peer-row-id">ערוץ מקומי</span>
        </div>
      </div>
      <span class="badge badge-amber">מחובר</span>
    </div>
  `;

  // Render Connected Peers
  Object.keys(conns).forEach((id) => {
    const peerName = names[id] || `משתמש (${id.slice(-4)})`;
    const isSpeaking = currentSpeakerName === peerName;
    html += `
      <div class="peer-row ${isSpeaking ? 'is-talking' : ''}" id="peer-row-${id}">
        <div class="peer-row-info">
          <div class="peer-row-avatar">${peerName.charAt(0)}</div>
          <div>
            <span class="peer-row-name">${peerName}</span>
            <span class="peer-row-id">#${id.slice(-4)}</span>
          </div>
        </div>
        <span class="badge badge-cyan">${isSpeaking ? 'מדבר 🎙️' : 'מאזין 👂'}</span>
      </div>
    `;
  });

  peersDiv.innerHTML = html;
}

function togglePeersDrawer() {
  const list = document.getElementById('peersListContainer');
  const chevron = document.getElementById('drawerChevron');
  if (list) {
    list.classList.toggle('collapsed');
    chevron?.classList.toggle('rotated');
  }
}

/* ==========================================================================
   Modals & Toast Helpers
   ========================================================================== */

function goTalk() {
  switchScreen('talkScreen');
  renderPeers();
  triggerHaptic([20]);
}

function openShareModal() {
  shareViaWebShare();
}

function openQrModal() {
  const modal = document.getElementById('qrModal');
  const codeSpan = document.getElementById('qrModalCode');
  codeSpan.textContent = roomCode;

  const joinUrl = `${window.location.origin}${window.location.pathname}?join=walkie-${roomCode}&code=${roomCode}`;
  const container = document.getElementById('modalQrCode');
  container.innerHTML = '';
  new QRCode(container, {
    text: joinUrl,
    width: 180,
    height: 180,
    colorDark: '#090c12',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });

  modal.classList.remove('hidden');
}

function closeQrModal(e) {
  if (e.target.id === 'qrModal') {
    document.getElementById('qrModal').classList.add('hidden');
  }
}
function closeQrModalDirect() {
  document.getElementById('qrModal').classList.add('hidden');
}

function copyDirectLink() {
  const joinUrl = `${window.location.origin}${window.location.pathname}?join=walkie-${roomCode}&code=${roomCode}`;
  navigator.clipboard.writeText(joinUrl).then(() => {
    showToast('הקישור הועתק בהצלחה! 📋');
    closeQrModalDirect();
  });
}

// Info Modal
document.getElementById('infoBtn')?.addEventListener('click', () => {
  document.getElementById('infoModal')?.classList.remove('hidden');
});

function closeInfoModal(e) {
  if (e.target.id === 'infoModal') {
    document.getElementById('infoModal').classList.add('hidden');
  }
}
function closeInfoModalDirect() {
  document.getElementById('infoModal').classList.add('hidden');
}

function confirmDisconnect() {
  if (confirm('האם להתנתק מרשת הקשר?')) {
    // Send leave message to peers
    Object.values(conns).forEach((c) => {
      try {
        c.send({ t: 'leave' });
      } catch (e) {}
    });

    // Close connections
    if (peer) {
      peer.destroy();
      peer = null;
    }
    if (myStream) {
      myStream.getTracks().forEach((t) => t.stop());
      myStream = null;
    }

    window.location.href = window.location.pathname;
  }
}

// Toast notification
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMsg');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2800);
}

// Clean up before leaving page
window.addEventListener('beforeunload', () => {
  Object.values(conns).forEach((c) => {
    try {
      c.send({ t: 'leave' });
    } catch (e) {}
  });
});
