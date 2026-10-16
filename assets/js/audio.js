/**
 * Tactical Walkie-Talkie - Audio Synthesis & Haptics Engine
 * Uses Web Audio API for zero-asset analog radio simulation.
 */

window.WalkieAudio = (function () {
  let audioCtx = null;
  let isMuted = false;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function setMuted(muted) {
    isMuted = muted;
  }

  function getMuted() {
    return isMuted;
  }

  /**
   * Tactical PTT Chirp (Key-down beep)
   * Dual-tone ascending chirp: 1100Hz -> 1600Hz
   */
  function playPttStart() {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
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
      console.warn('Audio FX playPttStart error:', e);
    }
  }

  /**
   * Tactical Roger Beep + Squelch Static Burst
   * 1050Hz pip + filtered white noise burst simulating radio squelch
   */
  function playPttEnd() {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 1. Roger Beep Pip
      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1050, now);
      toneGain.gain.setValueAtTime(0, now);
      toneGain.gain.linearRampToValueAtTime(0.16, now + 0.005);
      toneGain.gain.linearRampToValueAtTime(0.16, now + 0.055);
      toneGain.gain.linearRampToValueAtTime(0, now + 0.065);
      osc.connect(toneGain);
      toneGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);

      // 2. White Noise Squelch Burst
      const bufferSize = ctx.sampleRate * 0.12;
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
      console.warn('Audio FX playPttEnd error:', e);
    }
  }

  /**
   * Alert chime when another peer starts talking
   */
  function playIncomingAlert() {
    if (isMuted) return;
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

  /**
   * Haptic vibration feedback
   */
  function haptic(pattern = [25]) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  /**
   * Unlock Audio on mobile browsers (iOS Safari / Android Chrome)
   */
  function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (ctx) {
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch (e) {}
    }
  }

  // Auto-unlock on first user tap/click
  ['click', 'touchstart', 'touchend', 'pointerdown'].forEach((evt) => {
    document.addEventListener(evt, unlockAudio, { once: true, passive: true });
  });

  return {
    getContext: getAudioContext,
    unlockAudio,
    setMuted,
    getMuted,
    playPttStart,
    playPttEnd,
    playIncomingAlert,
    haptic
  };
})();
