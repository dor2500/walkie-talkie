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

    if (peer && !peer.destroyed) {
      if (callbacks.onReady) callbacks.onReady(peer.id);
      return;
    }

    try {
      peer = customId ? new Peer(customId, STUN_CONFIG) : new Peer(STUN_CONFIG);

      peer.on('open', (id) => {
        setupIncomingHandlers();
        if (callbacks.onReady) callbacks.onReady(id);
      });

      peer.on('error', (err) => {
        console.warn('PeerJS Network Error:', err.type, err);
        if (callbacks.onError) callbacks.onError(err);
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
      if (!myStream) {
        myStream = await getMicrophoneStream(true);
      }
      c.answer(myStream);
      c.on('stream', (remoteStream) => {
        attachAudioElement(remoteStream, c.peer);
      });
      c.on('close', () => detachAudioElement(c.peer));
    });
  }

  async function connectToPeer(id) {
    if (!id || id === peer?.id || conns[id]) return;

    if (!myStream) {
      myStream = await getMicrophoneStream(true);
    }

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

    if (myStream) {
      const call = peer.call(id, myStream);
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

  async function getMicrophoneStream(muteOnStart = true) {
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

  function setMicrophoneEnabled(enabled) {
    if (myStream && myStream.getAudioTracks().length > 0) {
      myStream.getAudioTracks()[0].enabled = enabled;
    }
  }

  function attachAudioElement(remoteStream, peerId) {
    const rack = document.getElementById('audios');
    if (!rack) return;

    let audio = document.getElementById('audio-' + peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'audio-' + peerId;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.muted = speakerMuted;
      rack.appendChild(audio);
    }
    audio.srcObject = remoteStream;
    audio.play().catch(() => {
      document.body.addEventListener('click', () => audio.play(), { once: true });
    });
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

  function disconnect() {
    broadcast({ t: 'leave' });
    if (peer) {
      peer.destroy();
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
    getStream: () => myStream
  };
})();
