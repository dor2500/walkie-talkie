/**
 * Tactical Walkie-Talkie - UI Controller & Visualizer
 * Manages tactical LCD panels, 60fps audio waveform, modals, and toasts.
 */

window.WalkieUI = (function () {
  let visualizerAnimId = null;
  let toastTimer = null;
  let qrScannerInstance = null;

  function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.remove('hidden');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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

  function renderQrCode(containerId, text, size = 170) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    new QRCode(container, {
      text: text,
      width: size,
      height: size,
      colorDark: '#090c12',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  function startQrScanner(onSuccess, onError) {
    const wrapper = document.getElementById('readerWrapper');
    const btnText = document.getElementById('scanBtnText');
    if (wrapper) wrapper.classList.remove('hidden');
    if (btnText) btnText.textContent = 'סגור מצלמה ✕';

    qrScannerInstance = new Html5Qrcode('reader');
    qrScannerInstance.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        stopQrScanner();
        if (onSuccess) onSuccess(decodedText);
      },
      (error) => {
        // frame scanning
      }
    ).catch((err) => {
      console.warn('Scanner camera error:', err);
      stopQrScanner();
      if (onError) onError(err);
    });
  }

  function stopQrScanner() {
    if (qrScannerInstance) {
      try {
        qrScannerInstance.stop().then(() => {
          qrScannerInstance.clear();
          qrScannerInstance = null;
        }).catch(() => {});
      } catch (e) {}
    }
    const wrapper = document.getElementById('readerWrapper');
    const btnText = document.getElementById('scanBtnText');
    if (wrapper) wrapper.classList.add('hidden');
    if (btnText) btnText.textContent = '📷 סרוק ברקוד QR במצלמה';
  }

  function setTransmissionState(state, speakerName = '') {
    // state: 'idle' | 'transmitting' | 'receiving'
    const banner = document.getElementById('transmissionBanner');
    const title = document.getElementById('whoTalk');
    const sub = document.getElementById('transSub');
    const pttRing = document.getElementById('pttOuterRing');
    const pttBtn = document.getElementById('pttButton');
    const pttMainText = document.getElementById('pttMainText');

    if (state === 'transmitting') {
      if (banner) banner.className = 'transmission-banner transmitting';
      if (sub) sub.textContent = 'משדר עכשיו:';
      if (title) title.textContent = `${speakerName} (אתה) 🎙️`;

      pttRing?.classList.add('transmitting');
      pttBtn?.classList.add('active');
      if (pttMainText) pttMainText.textContent = 'משדר...';
    } else if (state === 'receiving') {
      if (banner) banner.className = 'transmission-banner receiving';
      if (sub) sub.textContent = 'משדר בערוץ:';
      if (title) title.textContent = `${speakerName} 🔊`;

      pttRing?.classList.remove('transmitting');
      pttBtn?.classList.remove('active');
      if (pttMainText) pttMainText.textContent = 'מאזין...';
    } else {
      // idle
      if (banner) banner.className = 'transmission-banner idle';
      if (sub) sub.textContent = 'מצב ערוץ:';
      if (title) title.textContent = 'ערוץ פנוי להאזנה';

      pttRing?.classList.remove('transmitting');
      pttBtn?.classList.remove('active');
      if (pttMainText) pttMainText.textContent = 'לחץ ודבר';
    }
  }

  function renderPeersList(conns, names, myName, currentSpeaker, isTransmitting) {
    const peerCount = Object.keys(conns).length + 1;
    const cntEl = document.getElementById('cnt');
    const drawerCount = document.getElementById('drawerCount');
    if (cntEl) cntEl.textContent = peerCount;
    if (drawerCount) drawerCount.textContent = peerCount;

    const peersDiv = document.getElementById('peers');
    if (!peersDiv) return;

    let html = `
      <div class="peer-row ${isTransmitting ? 'is-talking' : ''}">
        <div class="peer-row-info">
          <div class="peer-row-avatar">${myName.charAt(0)}</div>
          <div>
            <span class="peer-row-name">${myName} (אתה)</span>
            <span class="peer-row-id">ערוץ מקומי</span>
          </div>
        </div>
        <span class="badge badge-amber">${isTransmitting ? 'משדר 🎙️' : 'מחובר'}</span>
      </div>
    `;

    Object.keys(conns).forEach((id) => {
      const pName = names[id] || `משתמש (${id.slice(-4)})`;
      const isSpeaking = currentSpeaker === pName;
      html += `
        <div class="peer-row ${isSpeaking ? 'is-talking' : ''}" id="peer-row-${id}">
          <div class="peer-row-info">
            <div class="peer-row-avatar">${pName.charAt(0)}</div>
            <div>
              <span class="peer-row-name">${pName}</span>
              <span class="peer-row-id">#${id.slice(-4)}</span>
            </div>
          </div>
          <span class="badge badge-cyan">${isSpeaking ? 'מדבר 🎙️' : 'מאזין 👂'}</span>
        </div>
      `;
    });

    peersDiv.innerHTML = html;
  }

  function startVisualizer(streamGetter, isLiveChecker) {
    const canvas = document.getElementById('visualizerCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let audioContext = null;
    let analyser = null;
    let source = null;

    function initAnalyser() {
      const stream = streamGetter();
      if (!stream) return;
      try {
        audioContext = window.WalkieAudio.getContext();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
      } catch (e) {
        console.warn('Analyser setup:', e);
      }
    }

    const bufferLength = 32;
    const dataArray = new Uint8Array(bufferLength);

    function loop() {
      visualizerAnimId = requestAnimationFrame(loop);

      if (!analyser && streamGetter()) {
        initAnalyser();
      }

      const activeState = isLiveChecker(); // 'transmitting' | 'receiving' | 'idle'

      if (analyser && activeState !== 'idle') {
        analyser.getByteFrequencyData(dataArray);
      } else {
        dataArray.fill(4);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 1.6;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const val = dataArray[i];
        const barHeight = Math.max(3, (val / 255) * canvas.height * 0.9);

        if (activeState === 'transmitting') {
          ctx.fillStyle = `rgba(239, 68, 68, ${0.4 + (val / 255) * 0.6})`;
        } else if (activeState === 'receiving') {
          ctx.fillStyle = `rgba(16, 185, 129, ${0.4 + (val / 255) * 0.6})`;
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        }

        ctx.fillRect(x, (canvas.height - barHeight) / 2, barWidth - 1.5, barHeight);
        x += barWidth;
      }
    }

    loop();
  }

  return {
    switchScreen,
    showToast,
    renderQrCode,
    startQrScanner,
    stopQrScanner,
    setTransmissionState,
    renderPeersList,
    startVisualizer
  };
})();
