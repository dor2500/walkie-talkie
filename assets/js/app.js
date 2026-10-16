/**
 * Tactical Walkie-Talkie - Application Entry Point & Controller
 * Integrates Audio, WebRTC, and UI modules with full lifecycle & PWA support.
 */

(function () {
  'use strict';

  // Global App State
  let myName = '';
  let roomCode = '';
  let isHost = false;
  let talking = false;
  let talkMode = 'ptt'; // 'ptt' | 'lock'
  let currentSpeaker = null;

  // Cache DOM elements
  const el = {};

  document.addEventListener('DOMContentLoaded', () => {
    cacheDomElements();
    restorePreferences();
    bindEvents();
    checkUrlInvitation();
    registerServiceWorker();
  });

  function cacheDomElements() {
    el.nameInput = document.getElementById('myName');
    el.helloName = document.getElementById('helloName');
    el.welcomeAvatar = document.getElementById('welcomeAvatar');
    el.hName = document.getElementById('hName');
    el.jName = document.getElementById('jName');
    el.myShow = document.getElementById('myShow');
    el.roomCode = document.getElementById('roomCode');
    el.cMini = document.getElementById('cMini');
    el.hostStatusText = document.getElementById('hostStatusText');
    el.codeInput = document.getElementById('codeInput');
    el.soundFxBtn = document.getElementById('soundFxBtn');
    el.soundFxOnIcon = document.getElementById('soundFxOnIcon');
    el.soundFxOffIcon = document.getElementById('soundFxOffIcon');
    el.pttButton = document.getElementById('pttButton');
    el.modePttBtn = document.getElementById('modePttBtn');
    el.modeLockBtn = document.getElementById('modeLockBtn');
    el.pttSubText = document.getElementById('pttSubText');
    el.infoBtn = document.getElementById('infoBtn');
    el.infoModal = document.getElementById('infoModal');
    el.qrModal = document.getElementById('qrModal');
    el.qrModalCode = document.getElementById('qrModalCode');
    el.peersListContainer = document.getElementById('peersListContainer');
    el.drawerChevron = document.getElementById('drawerChevron');
  }

  function restorePreferences() {
    const savedName = localStorage.getItem('walkie_user_name');
    if (savedName && el.nameInput) {
      el.nameInput.value = savedName;
    }

    const savedFx = localStorage.getItem('walkie_sound_fx');
    if (savedFx !== null) {
      const enabled = savedFx === 'true';
      window.WalkieAudio.setMuted(!enabled);
      updateSoundFxIcon(enabled);
    }
  }

  function checkUrlInvitation() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') || params.get('room');
    if (code && el.codeInput) {
      el.codeInput.value = code.trim().toUpperCase();
    }
  }

  function bindEvents() {
    // Sound FX Toggle
    el.soundFxBtn?.addEventListener('click', toggleSoundFx);

    // Info Modal
    el.infoBtn?.addEventListener('click', () => el.infoModal?.classList.remove('hidden'));

    // PTT Button Touch & Pointer Handlers
    if (el.pttButton) {
      el.pttButton.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (talkMode === 'ptt') {
          startTransmission();
        } else {
          talking ? stopTransmission() : startTransmission();
        }
      });

      el.pttButton.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (talkMode === 'ptt') stopTransmission();
      });

      el.pttButton.addEventListener('pointercancel', (e) => {
        e.preventDefault();
        if (talkMode === 'ptt') stopTransmission();
      });

      el.pttButton.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Keyboard Shortcuts
    let spaceHeld = false;
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!spaceHeld) {
          spaceHeld = true;
          if (talkMode === 'ptt') {
            startTransmission();
          } else {
            talking ? stopTransmission() : startTransmission();
          }
        }
      }

      if (e.code === 'KeyM') toggleSoundFx();
      if (e.code === 'KeyL') setTalkMode(talkMode === 'ptt' ? 'lock' : 'ptt');
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        spaceHeld = false;
        if (talkMode === 'ptt') stopTransmission();
      }
    });

    // Clean disconnect on page unload
    window.addEventListener('beforeunload', () => {
      window.WalkieWebRTC.disconnect();
    });
  }

  /* ==========================================================================
     Screen Handlers & Navigation
     ========================================================================== */

  window.goWelcome = function () {
    myName = el.nameInput.value.trim();
    if (!myName) {
      window.WalkieUI.showToast('נא להזין כינוי / שם');
      el.nameInput.focus();
      return;
    }

    localStorage.setItem('walkie_user_name', myName);

    el.helloName.textContent = myName;
    el.welcomeAvatar.textContent = myName.charAt(0);
    el.hName.textContent = myName;
    el.jName.textContent = myName;
    el.myShow.textContent = myName;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') || params.get('room');
    if (code) {
      window.goJoin();
      return;
    }

    window.WalkieUI.switchScreen('welcomeScreen');
    window.WalkieAudio.haptic([15]);
  };

  window.goBackToName = () => window.WalkieUI.switchScreen('nameScreen');
  window.goBackToWelcome = () => {
    window.WalkieUI.stopQrScanner();
    window.WalkieUI.switchScreen('welcomeScreen');
  };

  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  window.goHost = function () {
    isHost = true;
    window.WalkieUI.switchScreen('hostScreen');
    roomCode = genCode();

    el.roomCode.textContent = roomCode;
    el.cMini.textContent = roomCode;
    el.hostStatusText.textContent = 'מאתחל ערוץ מאובטח...';

    window.WalkieWebRTC.init('walkie-' + roomCode, myName, true, {
      onReady: (id) => {
        el.hostStatusText.textContent = 'ערוץ מוכן לחיבור!';
        const joinUrl = `${window.location.origin}${window.location.pathname}?join=${id}&code=${roomCode}`;
        window.WalkieUI.renderQrCode('qrcode', joinUrl, 170);
      },
      onData: handleWebRtcData,
      onPeersChange: refreshPeers,
      onError: (err) => {
        if (err.type === 'unavailable-id') {
          roomCode = genCode();
          window.goHost();
        }
      }
    });
  };

  window.goJoin = function () {
    isHost = false;
    window.WalkieUI.switchScreen('joinScreen');

    window.WalkieWebRTC.init(null, myName, false, {
      onData: handleWebRtcData,
      onPeersChange: refreshPeers,
      onError: () => window.WalkieUI.showToast('שגיאת חיבור ברשת')
    });

    if (el.codeInput.value.trim()) {
      document.getElementById('joinSubmitBtn')?.focus();
    } else {
      setTimeout(() => el.codeInput.focus(), 300);
    }
  };

  window.doJoin = function () {
    const code = el.codeInput.value.trim().toUpperCase();
    if (!code) {
      window.WalkieUI.showToast('נא להזין קוד ערוץ');
      el.codeInput.focus();
      return;
    }

    window.WalkieUI.stopQrScanner();
    roomCode = code;
    el.cMini.textContent = roomCode;

    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('join') || ('walkie-' + code);

    window.WalkieUI.showToast('מתחבר לערוץ הקשר...');
    window.WalkieWebRTC.connectToPeer(targetId);

    setTimeout(() => window.goTalk(), 1200);
  };

  window.toggleScanner = function () {
    const wrapper = document.getElementById('readerWrapper');
    if (wrapper.classList.contains('hidden')) {
      window.WalkieUI.startQrScanner((decodedText) => {
        window.WalkieAudio.haptic([40, 20, 40]);
        try {
          const url = new URL(decodedText);
          const joinId = url.searchParams.get('join');
          const code = url.searchParams.get('code') || '';
          if (code) {
            el.codeInput.value = code;
            roomCode = code;
            el.cMini.textContent = code;
          }
          if (joinId) {
            window.WalkieUI.showToast('ברקוד נסרק! מתחבר...');
            window.WalkieWebRTC.connectToPeer(joinId);
            setTimeout(() => window.goTalk(), 1000);
            return;
          }
        } catch (e) {
          el.codeInput.value = decodedText;
          window.doJoin();
        }
      }, () => window.WalkieUI.showToast('שגיאה בהפעלת מצלמה'));
    } else {
      window.WalkieUI.stopQrScanner();
    }
  };

  window.stopScanner = () => window.WalkieUI.stopQrScanner();

  window.goTalk = function () {
    window.WalkieUI.switchScreen('talkScreen');
    window.WalkieAudio.haptic([20]);

    // Start 60fps Visualizer
    window.WalkieUI.startVisualizer(
      () => window.WalkieWebRTC.getStream(),
      () => {
        if (talking) return 'transmitting';
        if (currentSpeaker) return 'receiving';
        return 'idle';
      }
    );
  };

  /* ==========================================================================
     Transmission Control (PTT & Lock)
     ========================================================================== */

  window.setTalkMode = function (mode) {
    talkMode = mode;
    el.modePttBtn?.classList.toggle('active', mode === 'ptt');
    el.modeLockBtn?.classList.toggle('active', mode === 'lock');
    if (el.pttSubText) {
      el.pttSubText.textContent = mode === 'ptt' ? 'החזק כדי לשדר' : 'לחיצה להתחלה/סיום';
    }
    window.WalkieUI.showToast(mode === 'ptt' ? 'מצב PTT (החזק לשידור)' : 'מצב נעילה (לחיצה לשידור)');
  };

  async function startTransmission() {
    if (talking) return;

    window.WalkieAudio.getContext(); // Unlock audio context
    talking = true;

    const stream = await window.WalkieWebRTC.getMicrophoneStream(false);
    if (stream) {
      window.WalkieWebRTC.setMicrophoneEnabled(true);
    }

    window.WalkieAudio.haptic([35]);
    window.WalkieAudio.playPttStart();

    window.WalkieUI.setTransmissionState('transmitting', myName);
    window.WalkieWebRTC.broadcast({ t: 'talk-s', name: myName });
  }

  function stopTransmission() {
    if (!talking) return;
    talking = false;

    window.WalkieWebRTC.setMicrophoneEnabled(false);
    window.WalkieAudio.haptic([15, 30, 15]);
    window.WalkieAudio.playPttEnd();

    window.WalkieUI.setTransmissionState('idle');
    window.WalkieWebRTC.broadcast({ t: 'talk-e' });
  }

  function handleWebRtcData(data, fromId) {
    if (data.t === 'talk-s') {
      currentSpeaker = data.name || 'משתמש';
      window.WalkieAudio.playIncomingAlert();
      window.WalkieAudio.haptic([30]);
      window.WalkieUI.setTransmissionState('receiving', currentSpeaker);
    } else if (data.t === 'talk-e') {
      window.WalkieAudio.playPttEnd();
      window.WalkieUI.setTransmissionState('idle');
      currentSpeaker = null;
    }
  }

  function refreshPeers(conns, names, selfName) {
    window.WalkieUI.renderPeersList(conns, names, selfName, currentSpeaker, talking);
  }

  /* ==========================================================================
     Toolbars, Modals & Sharing
     ========================================================================== */

  function toggleSoundFx() {
    const isMutedNow = !window.WalkieAudio.getMuted();
    window.WalkieAudio.setMuted(isMutedNow);
    localStorage.setItem('walkie_sound_fx', !isMutedNow);
    updateSoundFxIcon(!isMutedNow);
    window.WalkieUI.showToast(!isMutedNow ? 'צלילי קשר הופעלו 🔊' : 'צלילי קשר הושתקו 🔇');
    if (!isMutedNow) window.WalkieAudio.playPttStart();
  }

  function updateSoundFxIcon(enabled) {
    el.soundFxOnIcon?.classList.toggle('hidden', !enabled);
    el.soundFxOffIcon?.classList.toggle('hidden', enabled);
  }

  window.toggleSpeakerMute = function () {
    const isMuted = window.WalkieWebRTC.toggleSpeakerMute();
    document.getElementById('spkOn')?.classList.toggle('hidden', isMuted);
    document.getElementById('spkOff')?.classList.toggle('hidden', !isMuted);
    window.WalkieUI.showToast(isMuted ? 'רמקול הושתק 🔇' : 'רמקול פועל 🔊');
  };

  window.togglePeersDrawer = function () {
    el.peersListContainer?.classList.toggle('collapsed');
    el.drawerChevron?.classList.toggle('rotated');
  };

  window.copyRoomCode = function () {
    navigator.clipboard.writeText(roomCode).then(() => {
      window.WalkieUI.showToast(`קוד ערוץ ${roomCode} הועתק! 📋`);
      window.WalkieAudio.haptic([20]);
    });
  };

  window.shareViaWebShare = function () {
    const joinUrl = `${window.location.origin}${window.location.pathname}?join=walkie-${roomCode}&code=${roomCode}`;
    const data = {
      title: 'הזמנה לווקי-טוקי טקטי',
      text: `בוא לדבר איתי בקשר! קוד ערוץ: ${roomCode}`,
      url: joinUrl
    };

    if (navigator.share && navigator.canShare && navigator.canShare(data)) {
      navigator.share(data).catch(() => {});
    } else {
      navigator.clipboard.writeText(joinUrl).then(() => {
        window.WalkieUI.showToast('הקישור לרשת הועתק! שתף בוואטסאפ');
      });
    }
  };

  window.openShareModal = () => window.shareViaWebShare();

  window.openQrModal = function () {
    el.qrModalCode.textContent = roomCode;
    const joinUrl = `${window.location.origin}${window.location.pathname}?join=walkie-${roomCode}&code=${roomCode}`;
    window.WalkieUI.renderQrCode('modalQrCode', joinUrl, 180);
    el.qrModal?.classList.remove('hidden');
  };

  window.closeQrModal = (e) => {
    if (e.target.id === 'qrModal') el.qrModal?.classList.add('hidden');
  };
  window.closeQrModalDirect = () => el.qrModal?.classList.add('hidden');

  window.copyDirectLink = function () {
    const joinUrl = `${window.location.origin}${window.location.pathname}?join=walkie-${roomCode}&code=${roomCode}`;
    navigator.clipboard.writeText(joinUrl).then(() => {
      window.WalkieUI.showToast('הקישור הועתק בהצלחה! 📋');
      window.closeQrModalDirect();
    });
  };

  window.closeInfoModal = (e) => {
    if (e.target.id === 'infoModal') el.infoModal?.classList.add('hidden');
  };
  window.closeInfoModalDirect = () => el.infoModal?.classList.add('hidden');

  window.confirmDisconnect = function () {
    if (confirm('האם להתנתק מרשת הקשר?')) {
      window.WalkieWebRTC.disconnect();
      window.location.href = window.location.pathname;
    }
  };

  /* ==========================================================================
     Service Worker Registration for PWA Offline Cache
     ========================================================================== */

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.log('SW registration note:', err);
      });
    }
  }

})();
