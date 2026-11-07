/**
 * RVL HD - My Love (Birthday Edition for Elnitha)
 * Interactive Script
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const stageEnvelope = document.getElementById('stageEnvelope');
  const stageLogin = document.getElementById('stageLogin');
  const stageCelebration = document.getElementById('stageCelebration');

  const envelope = document.getElementById('interactiveEnvelope');
  const loginForm = document.getElementById('loginForm');
  const passwordInput = document.getElementById('passwordInput');
  const togglePassBtn = document.getElementById('togglePassword');
  const hintBtn = document.getElementById('hintBtn');
  const hintModal = document.getElementById('hintModal');
  const closeHintBtn = document.getElementById('closeHintBtn');
  const loginCard = document.getElementById('loginCard');
  const loginCat = document.getElementById('loginCat');
  const loginErrorMessage = document.getElementById('loginErrorMessage');

  // Voice Cinema Modal Elements
  const voiceCinemaModal = document.getElementById('voiceCinemaModal');
  const btnCloseVoiceModal = document.getElementById('btnCloseVoiceModal');
  const btnOpenVoiceModal = document.getElementById('btnOpenVoiceModal');
  const btnToggleVoicePlayback = document.getElementById('btnToggleVoicePlayback');
  const voiceToggleIcon = document.getElementById('voiceToggleIcon');
  const voiceAudio = document.getElementById('voiceAudio');
  const voiceCatImg = document.getElementById('voiceCatImg');
  const voiceCatCaption = document.getElementById('voiceCatCaption');
  const voiceWaveform = document.getElementById('voiceWaveform');
  const voiceProgressTrack = document.getElementById('voiceProgressTrack');
  const voiceProgressFill = document.getElementById('voiceProgressFill');
  const voiceCurrentTime = document.getElementById('voiceCurrentTime');
  const voiceDurationTime = document.getElementById('voiceDurationTime');

  // Cake & Interactive Elements
  const cakeBox = document.getElementById('interactiveCake');
  const cakeStatus = document.getElementById('cakeStatus');
  const btnBurstLove = document.getElementById('btnBurstLove');
  const loveCounterText = document.getElementById('loveCounter');

  // Lightbox
  const photoLightbox = document.getElementById('photoLightbox');
  const lightboxImg = document.getElementById('lightboxImg');

  // Music Player Elements
  const musicPlayer = document.getElementById('musicPlayer');
  const bgAudio = document.getElementById('bgAudio');
  const vinylRecord = document.getElementById('vinylRecord');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playPauseIcon = document.getElementById('playPauseIcon');
  const progressFill = document.getElementById('progressFill');
  const progressTrack = document.getElementById('progressTrack');
  const currentTimeDisplay = document.getElementById('currentTime');
  const durationTimeDisplay = document.getElementById('durationTime');

  // State
  let isBgmPlaying = false;
  let bgmUserInitiated = false;
  let isVoicePlaying = false;
  let candlesBlown = false;
  let isFallingCat = false;

  // Persistent Peluk & Cium Count (Requirement 9)
  const STORAGE_KEY = 'mylove_elnitha_peluk_cium';
  let loveCount = parseInt(localStorage.getItem(STORAGE_KEY), 10) || 0;
  loveCounterText.textContent = `${loveCount} Peluk & Cium Terkirim! 💕`;

  // ==========================================
  // Web Audio Synth Sound FX (Zero Lag & Lightweight)
  // ==========================================
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function resumeAudioContext() {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Chime Sound
  function playChime() {
    resumeAudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + index * 0.1);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + index * 0.1 + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + index * 0.1);
      osc.stop(audioCtx.currentTime + index * 0.1 + 0.6);
    });
  }

  // Bonk / Falling Sound when password is wrong
  function playFallingBonk() {
    resumeAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.5);

    setTimeout(() => {
      const bonkOsc = audioCtx.createOscillator();
      const bonkGain = audioCtx.createGain();
      bonkOsc.type = 'triangle';
      bonkOsc.frequency.setValueAtTime(160, audioCtx.currentTime);
      bonkOsc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.25);
      bonkGain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      bonkGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      bonkOsc.connect(bonkGain);
      bonkGain.connect(audioCtx.destination);
      bonkOsc.start(audioCtx.currentTime);
      bonkOsc.stop(audioCtx.currentTime + 0.25);
    }, 450);
  }

  // Festive Fanfare for Candle Blow
  function playFestiveFanfare() {
    resumeAudioContext();
    const fanfareNotes = [
      { f: 523.25, d: 0.18, t: 0.0 },   // C5
      { f: 523.25, d: 0.18, t: 0.2 },   // C5
      { f: 587.33, d: 0.35, t: 0.4 },   // D5
      { f: 523.25, d: 0.35, t: 0.8 },   // C5
      { f: 698.46, d: 0.35, t: 1.2 },   // F5
      { f: 659.25, d: 0.65, t: 1.6 },   // E5
      { f: 783.99, d: 0.80, t: 2.3 }    // G5
    ];

    fanfareNotes.forEach(note => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, audioCtx.currentTime + note.t);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime + note.t);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + note.t + note.d);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + note.t);
      osc.stop(audioCtx.currentTime + note.t + note.d);
    });
  }

  function playPopSound() {
    resumeAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.08);
  }

  // ==========================================
  // Autoplay BGM on first click anywhere
  // ==========================================
  function startBgmOnFirstInteraction() {
    if (!bgmUserInitiated && !isVoicePlaying) {
      bgAudio.play().then(() => {
        bgmUserInitiated = true;
        isBgmPlaying = true;
        vinylRecord.classList.add('spinning');
        updatePlayBtnIcon(true);
      }).catch(err => {
        // Retry on next tap
      });
    }
  }

  document.addEventListener('click', startBgmOnFirstInteraction, { passive: true });
  document.addEventListener('touchstart', startBgmOnFirstInteraction, { passive: true });

  // ==========================================
  // Stage 1: Interactive Envelope
  // ==========================================
  envelope.addEventListener('click', () => {
    if (envelope.classList.contains('open')) return;
    envelope.classList.add('open');
    playChime();
    triggerSparkles(window.innerWidth / 2, window.innerHeight / 2);

    setTimeout(() => {
      stageEnvelope.classList.add('hidden');
      stageLogin.classList.remove('hidden');
      passwordInput.focus();
    }, 1300);
  });

  // ==========================================
  // Stage 2: Login Panel & Cat Falling
  // ==========================================
  togglePassBtn.addEventListener('click', () => {
    const isPass = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPass ? 'text' : 'password');
    togglePassBtn.innerHTML = isPass ? 
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : 
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="3" r="3"></circle></svg>`;
  });

  hintBtn.addEventListener('click', () => {
    playPopSound();
    hintModal.classList.add('active');
  });

  closeHintBtn.addEventListener('click', () => {
    hintModal.classList.remove('active');
  });

  hintModal.addEventListener('click', (e) => {
    if (e.target === hintModal) {
      hintModal.classList.remove('active');
    }
  });

  // Strict Password Validation: holysmol8
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const entered = passwordInput.value.trim().toLowerCase();

    if (entered !== 'holysmol8') {
      triggerCatFalling();
      return;
    }

    // Success!
    playChime();
    triggerCelebrationConfetti();

    stageLogin.classList.add('hidden');
    stageCelebration.classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Play BGM if not already playing
    if (!isBgmPlaying && !isVoicePlaying) {
      bgAudio.play().then(() => {
        isBgmPlaying = true;
        vinylRecord.classList.add('spinning');
        updatePlayBtnIcon(true);
      }).catch(err => console.log(err));
    }
  });

  function triggerCatFalling() {
    if (isFallingCat) return;
    isFallingCat = true;

    playFallingBonk();

    loginCard.classList.remove('shake');
    void loginCard.offsetWidth;
    loginCard.classList.add('shake');

    loginErrorMessage.style.display = 'block';

    loginCat.src = './assets/struggle.gif';
    loginCat.classList.add('cat-falling');

    setTimeout(() => {
      loginCat.classList.remove('cat-falling');
      loginCat.src = './assets/taps.gif';
      isFallingCat = false;
    }, 3200);
  }

  // ==========================================
  // Voice Cinema Modal (Fullscreen Blur, Sitting Cat, Exit X Button, Cat Kabur)
  // ==========================================
  btnOpenVoiceModal.addEventListener('click', () => {
    openVoiceModal();
  });

  btnCloseVoiceModal.addEventListener('click', () => {
    closeVoiceModal();
  });

  function openVoiceModal() {
    // 1. Pause BGM smoothly
    if (isBgmPlaying) {
      bgAudio.pause();
      isBgmPlaying = false;
      vinylRecord.classList.remove('spinning');
      updatePlayBtnIcon(false);
    }

    // 2. Reset Voice Cat to sitting state
    voiceCatImg.src = './assets/sit.gif';
    voiceCatImg.classList.remove('cat-kabur');
    voiceCatCaption.textContent = 'Duduk manis dengerin suara sayang... 🐱💕';

    // 3. Open Modal with blur
    voiceCinemaModal.classList.add('active');
    playPopSound();

    // 4. Start Playing Voice Note
    startVoicePlayback();
  }

  function closeVoiceModal() {
    // Pause voice note
    pauseVoicePlayback();

    // Close modal
    voiceCinemaModal.classList.remove('active');

    // Resume BGM smoothly
    bgAudio.play().then(() => {
      isBgmPlaying = true;
      vinylRecord.classList.add('spinning');
      updatePlayBtnIcon(true);
    }).catch(err => console.log(err));
  }

  btnToggleVoicePlayback.addEventListener('click', () => {
    if (isVoicePlaying) {
      pauseVoicePlayback();
    } else {
      startVoicePlayback();
    }
  });

  function startVoicePlayback() {
    voiceAudio.play().then(() => {
      isVoicePlaying = true;
      voiceToggleIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
      voiceWaveform.style.visibility = 'visible';
    }).catch(err => {
      console.log('Voice audio play blocked:', err);
    });
  }

  function pauseVoicePlayback() {
    voiceAudio.pause();
    isVoicePlaying = false;
    voiceToggleIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
  }

  voiceAudio.addEventListener('timeupdate', () => {
    if (voiceAudio.duration) {
      const pct = (voiceAudio.currentTime / voiceAudio.duration) * 100;
      voiceProgressFill.style.width = `${pct}%`;
      voiceCurrentTime.textContent = formatTime(voiceAudio.currentTime);
      voiceDurationTime.textContent = formatTime(voiceAudio.duration);
    }
  });

  voiceAudio.addEventListener('loadedmetadata', () => {
    voiceDurationTime.textContent = formatTime(voiceAudio.duration);
  });

  voiceProgressTrack.addEventListener('click', (e) => {
    const rect = voiceProgressTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    if (voiceAudio.duration) {
      voiceAudio.currentTime = (clickX / width) * voiceAudio.duration;
    }
  });

  // When Voice Note Finishes: Cat Runs Away ("Kabur")!
  voiceAudio.addEventListener('ended', () => {
    isVoicePlaying = false;
    voiceToggleIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;

    // Cat switches to running GIF & animates dashing away
    voiceCatImg.src = './assets/run.gif';
    voiceCatImg.classList.add('cat-kabur');
    voiceCatCaption.textContent = 'Kucingnya kabur! Wuuush~ 💨😹';

    triggerCelebrationConfetti();
    playPopSound();

    // After 2.5s, close modal & resume BGM
    setTimeout(() => {
      closeVoiceModal();
    }, 2500);
  });

  // ==========================================
  // Festive Candle Blowing
  // ==========================================
  cakeBox.addEventListener('click', () => {
    if (candlesBlown) return;
    candlesBlown = true;

    document.querySelectorAll('.candle').forEach(c => c.classList.add('blown'));
    playFestiveFanfare();

    if (typeof confetti === 'function') {
      confetti({
        particleCount: 80,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.7 },
        colors: ['#ff4d88', '#ffccd9', '#ffffff', '#ffd700']
      });
      confetti({
        particleCount: 80,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.7 },
        colors: ['#ff4d88', '#ffccd9', '#ffffff', '#ffd700']
      });
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 100,
          origin: { y: 0.55 },
          colors: ['#ff2a70', '#ff85a2', '#ffffff', '#ffd166', '#ff007f']
        });
      }, 300);
    }

    cakeStatus.innerHTML = `🎉 <strong>Lilin sudah tertiup & harapanmu terkirim ke langit!</strong><br><span style="color:#ff4d88; font-weight:700;">Semoga semua impian & kebahagiaan selalu menyertai Elnitha sayang! Amin 💖🎂✨</span>`;
  });

  // ==========================================
  // Persistent Peluk & Cium Counter
  // ==========================================
  btnBurstLove.addEventListener('click', (e) => {
    loveCount += 1;
    localStorage.setItem(STORAGE_KEY, loveCount);
    loveCounterText.textContent = `${loveCount} Peluk & Cium Terkirim! 💕`;
    playPopSound();

    const rect = btnBurstLove.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;

    for (let i = 0; i < 5; i++) {
      createFloatingHeart(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 30);
    }
  });

  // ==========================================
  // Photo Lightbox Preview
  // ==========================================
  document.querySelectorAll('.polaroid-card').forEach(card => {
    card.addEventListener('click', () => {
      const src = card.getAttribute('data-src');
      if (src) {
        lightboxImg.src = src;
        photoLightbox.classList.add('active');
        playPopSound();
      }
    });
  });

  photoLightbox.addEventListener('click', () => {
    photoLightbox.classList.remove('active');
  });

  // ==========================================
  // Single BGM Player Controls
  // ==========================================
  function updatePlayBtnIcon(playing) {
    if (playing) {
      playPauseIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
    } else {
      playPauseIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
    }
  }

  playPauseBtn.addEventListener('click', () => {
    if (isBgmPlaying) {
      bgAudio.pause();
      isBgmPlaying = false;
      vinylRecord.classList.remove('spinning');
      updatePlayBtnIcon(false);
    } else {
      if (isVoicePlaying) {
        pauseVoicePlayback();
      }
      bgAudio.play().then(() => {
        isBgmPlaying = true;
        vinylRecord.classList.add('spinning');
        updatePlayBtnIcon(true);
      }).catch(e => console.log(e));
    }
  });

  bgAudio.addEventListener('loadedmetadata', () => {
    durationTimeDisplay.textContent = formatTime(bgAudio.duration);
  });

  bgAudio.addEventListener('timeupdate', () => {
    if (bgAudio.duration) {
      const pct = (bgAudio.currentTime / bgAudio.duration) * 100;
      progressFill.style.width = `${pct}%`;
      currentTimeDisplay.textContent = formatTime(bgAudio.currentTime);
      durationTimeDisplay.textContent = formatTime(bgAudio.duration);
    }
  });

  progressTrack.addEventListener('click', (e) => {
    const rect = progressTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    if (bgAudio.duration) {
      bgAudio.currentTime = (clickX / width) * bgAudio.duration;
    }
  });

  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // ==========================================
  // Confetti & Particle Effects
  // ==========================================
  function triggerCelebrationConfetti() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#ff4d88', '#ff7fa8', '#ffccd9', '#ffffff', '#ffd700']
      });
    }
  }

  function triggerSparkles(x, y) {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 30,
        spread: 45,
        origin: { x: x / window.innerWidth, y: y / window.innerHeight },
        colors: ['#ff4d88', '#ffffff', '#ffccd9']
      });
    }
  }

  function createFloatingHeart(x, y) {
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.innerHTML = ['💖', '💕', '🌸', '✨', '💗', '🥰'][Math.floor(Math.random() * 6)];
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    heart.style.fontSize = `${Math.floor(Math.random() * 16 + 20)}px`;
    document.body.appendChild(heart);

    setTimeout(() => {
      heart.remove();
    }, 2400);
  }

  // ==========================================
  // Canvas Ambient Floating Hearts
  // ==========================================
  const canvas = document.getElementById('heartCanvas');
  const ctx = canvas.getContext('2d');
  let hearts = [];

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  class AmbientHeart {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = canvas.height + Math.random() * 50;
      this.size = Math.random() * 14 + 10;
      this.speed = Math.random() * 0.9 + 0.5;
      this.opacity = Math.random() * 0.4 + 0.15;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotSpeed = (Math.random() - 0.5) * 0.02;
    }
    update() {
      this.y -= this.speed;
      this.rotation += this.rotSpeed;
      if (this.y < -30) {
        this.reset();
      }
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = '#ff4d88';
      ctx.beginPath();
      const topCurveHeight = this.size * 0.3;
      ctx.moveTo(0, topCurveHeight);
      ctx.bezierCurveTo(0, 0, -this.size / 2, 0, -this.size / 2, topCurveHeight);
      ctx.bezierCurveTo(-this.size / 2, (this.size + topCurveHeight) / 2, 0, this.size, 0, this.size);
      ctx.bezierCurveTo(0, this.size, this.size / 2, (this.size + topCurveHeight) / 2, this.size / 2, topCurveHeight);
      ctx.bezierCurveTo(this.size / 2, 0, 0, 0, 0, topCurveHeight);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = 0; i < 22; i++) {
    hearts.push(new AmbientHeart());
  }

  function animateCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hearts.forEach(h => {
      h.update();
      h.draw();
    });
    requestAnimationFrame(animateCanvas);
  }
  animateCanvas();
});
