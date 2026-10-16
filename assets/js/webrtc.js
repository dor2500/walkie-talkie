/**
 * Tactical Walkie-Talkie - WebRTC Mesh Engine
 * Powered by PeerJS with Google STUN Fallbacks.
 */

window.WalkieWebRTC = (function () {
  const STUN_CONFIG = {
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

  let peer = null;
  let myStream = null;
  let conns = {};          // peerId -> DataConnection
  let calls = {};          // peerId -> MediaConnection
  let names = {};          // peerId -> string
  let myName = '';
  let isHost = false;
  let speakerMuted = false;
  let heartbeatTimer = null;

  // Event callbacks
  let callbacks = {
    onReady: null,
    onData: null,
    onPeersChange: null,
    onError: null
  };

  function init(customId, userNickname, isHostMode, cbs) {
    myName = userNickname;
    isHost = isHostMode;
    callbacks = Object.assign(callbacks, cbs);

    // Reset old peer if we need a different ID
    if (peer && !peer.destroyed) {
      if (customId && peer.id === customId) {
        if (callbacks.onReady) callbacks.onReady(peer.id);
        return;
      }
      try {
        peer.destroy();
      } catch (e) {}
      peer = null;
      conns = {};
      calls = {};
      names = {};
    }

    try {
      peer = customId ? new Peer(customId, STUN_CONFIG) : new Peer(STUN_CONFIG);

      peer.on('open', (id) => {
        setupIncomingHandlers();
        startHeartbeat();
        if (callbacks.onReady) callbacks.onReady(id);
      });

      peer.on('error', (err) => {
        console.warn('PeerJS Network Error:', err.type, err);
        if (callbacks.onError) callbacks.onError(err);
      });

      peer.on('disconnected', () => {
        console.log('Peer disconnected from signaling server, reconnecting...');
        try {
          peer.reconnect();
        } catch (e) {}
      });
    } catch (e) {
      console.error('Peer instantiation error:', e);
    }
  }

  function setupIncomingHandlers() {
    if (!peer) return;

    // Incoming Data Connection
    peer.on('connection', (c) => {
      c.on('open', () => {
        conns[c.peer] = c;
        c.on('data', (d) => handleIncomingData(d, c.peer));
        c.on('close', () => removePeer(c.peer));
        c.on('error', () => removePeer(c.peer));

        // Exchange profile
        c.send({ t: 'name', name: myName });

        if (isHost) {
          broadcastMesh();
        }
        notifyPeersChange();
      });
    });

    // Incoming Voice Call
    peer.on('call', async (c) => {
      calls[c.peer] = c;
      const stream = await getMicrophoneStream(true);
      if (stream) {
        c.answer(stream);
      }
      c.on('stream', (remoteStream) => {
        attachAudioElement(remoteStream, c.peer);
      });
      c.on('close', () => detachAudioElement(c.peer));
    });
  }

  async function connectToPeer(id) {
    if (!id || id === peer?.id || conns[id]) return;

    const stream = await getMicrophoneStream(true);

    const c = peer.connect(id, { reliable: true });
    c.on('open', () => {
      conns[id] = c;
      c.send({ t: 'name', name: myName });
      c.on('data', (d) => handleIncomingData(d, id));
      c.on('close', () => removePeer(id));
      c.on('error', () => removePeer(id));

      broadcastMesh();
      notifyPeersChange();
    });

    if (stream) {
      const call = peer.call(id, stream);
      calls[id] = call;
      call.on('stream', (remoteStream) => {
        attachAudioElement(remoteStream, id);
      });
      call.on('close', () => detachAudioElement(id));
    }
  }

  function handleIncomingData(data, fromId) {
    if (!data || !data.t) return;

    if (data.t === 'name') {
      names[fromId] = data.name;
      notifyPeersChange();
    } else if (data.t === 'peers' && Array.isArray(data.peers)) {
      data.peers.forEach((pId) => {
        if (pId !== peer?.id && !conns[pId]) {
          connectToPeer(pId);
        }
      });
    } else if (data.t === 'leave') {
      removePeer(fromId);
    }

    if (callbacks.onData) {
      callbacks.onData(data, fromId);
    }
  }

  function broadcast(data) {
    Object.values(conns).forEach((c) => {
      try {
        c.send(data);
      } catch (e) {}
    });
  }

  function broadcastMesh() {
    const all = [peer.id, ...Object.keys(conns)];
    broadcast({ t: 'peers', peers: all });
    notifyPeersChange();
  }

  function removePeer(id) {
    delete conns[id];
    delete calls[id];
    delete names[id];
    detachAudioElement(id);
    notifyPeersChange();
  }

  function notifyPeersChange() {
    if (callbacks.onPeersChange) {
      callbacks.onPeersChange(conns, names, myName);
    }
  }

  /**
   * Acquires the persistent microphone stream ONCE and caches it.
   * Audio track starts muted (enabled = false) until PTT is pressed.
   */
  async function getMicrophoneStream(muteOnStart = true) {
    if (myStream && myStream.active && myStream.getAudioTracks().length > 0) {
      if (muteOnStart) {
        myStream.getAudioTracks()[0].enabled = false;
      }
      return myStream;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      if (stream.getAudioTracks().length > 0) {
        stream.getAudioTracks()[0].enabled = !muteOnStart;
      }

      myStream = stream;
      return stream;
    } catch (e) {
      console.warn('Microphone permission or hardware error:', e);
      return null;
    }
  }

  /**
   * Instantly toggles the active microphone track (0ms delay)
   */
  function setMicrophoneEnabled(enabled) {
    if (myStream && myStream.getAudioTracks().length > 0) {
      myStream.getAudioTracks()[0].enabled = enabled;
      return true;
    }
    return false;
  }

  function attachAudioElement(remoteStream, peerId) {
    const rack = document.getElementById('audios');
    if (!rack) return;

    let audio = document.getElementById('audio-' + peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'audio-' + peerId;
      audio.setAttribute('autoplay', 'autoplay');
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = 1.0;
      audio.muted = speakerMuted;
      rack.appendChild(audio);
    }
    audio.srcObject = remoteStream;

    audio.play().catch(() => {
      ['click', 'touchstart', 'touchend', 'pointerdown'].forEach((evt) => {
        document.addEventListener(evt, () => audio.play().catch(() => {}), { once: true });
      });
    });

    // Also connect to Web Audio API for guaranteed fidelity
    try {
      const ctx = window.WalkieAudio.getContext();
      if (ctx && !speakerMuted) {
        const streamSource = ctx.createMediaStreamSource(remoteStream);
        streamSource.connect(ctx.destination);
      }
    } catch (e) {}
  }

  function detachAudioElement(peerId) {
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
    return speakerMuted;
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      broadcast({ t: 'ping', time: Date.now() });
    }, 5000);
  }

  function disconnect() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    broadcast({ t: 'leave' });
    if (peer) {
      try {
        peer.destroy();
      } catch (e) {}
      peer = null;
    }
    if (myStream) {
      myStream.getTracks().forEach((t) => t.stop());
      myStream = null;
    }
    conns = {};
    calls = {};
    names = {};
  }

  return {
    init,
    connectToPeer,
    broadcast,
    getMicrophoneStream,
    setMicrophoneEnabled,
    toggleSpeakerMute,
    disconnect,
    getPeerId: () => peer?.id || '',
    getStream: () => myStream,
    getConns: () => conns,
    getNames: () => names
  };
})();
