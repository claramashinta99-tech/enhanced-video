/**
 * RVL HD - My Love (Birthday Edition)
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

  const cakeBox = document.getElementById('interactiveCake');
  const cakeStatus = document.getElementById('cakeStatus');
  const btnBurstLove = document.getElementById('btnBurstLove');
  const loveCounterText = document.getElementById('loveCounter');

  // Music Player Elements
  const musicPlayer = document.getElementById('musicPlayer');
  const audio = document.getElementById('bgAudio');
  const vinylRecord = document.getElementById('vinylRecord');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevTrackBtn = document.getElementById('prevTrackBtn');
  const nextTrackBtn = document.getElementById('nextTrackBtn');
  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');
  const progressFill = document.getElementById('progressFill');
  const progressTrack = document.getElementById('progressTrack');
  const currentTimeDisplay = document.getElementById('currentTime');
  const durationTimeDisplay = document.getElementById('durationTime');
  const togglePlaylistBtn = document.getElementById('togglePlaylistBtn');
  const playlistMenu = document.getElementById('playlistMenu');
  const customAudioInput = document.getElementById('customAudioInput');
  const uploadCustomAudioBtn = document.getElementById('uploadCustomAudioBtn');

  // State
  let currentTrackIndex = 0;
  let isPlaying = false;
  let loveCount = 0;
  let candlesBlown = false;

  // 90s Romantic Curated Playlist
  const playlist = [
    {
      title: "Kiss Me",
      artist: "Sixpence None The Richer (1997)",
      url: "https://archive.org/download/Sixpence_None_The_Richer_Kiss_Me/Sixpence%20None%20The%20Richer%20-%20Kiss%20Me.mp3"
    },
    {
      title: "Truly Madly Deeply",
      artist: "Savage Garden (1997)",
      url: "https://archive.org/download/romanticas90/Savage%20Garden%20-%20Truly%20Madly%20Deeply.mp3"
    },
    {
      title: "More Than Words",
      artist: "Extreme (1990)",
      url: "https://archive.org/download/romanticas90/Extreme%20-%20More%20Than%20Words.mp3"
    },
    {
      title: "(Everything I Do) I Do It For You",
      artist: "Bryan Adams (1991)",
      url: "https://archive.org/download/romanticas90/Bryan%20Adams%20-%20%28Everything%20I%20Do%29%20I%20Do%20It%20For%20You.mp3"
    }
  ];

  // ==========================================
  // Web Audio Synth Sound Effects (Zero Lag)
  // ==========================================
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playChime() {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
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

  function playPopSound() {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.08);
  }

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
  // Stage 2: Login Panel & Hint
  // ==========================================
  togglePassBtn.addEventListener('click', () => {
    const isPass = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPass ? 'text' : 'password');
    togglePassBtn.innerHTML = isPass ? 
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : 
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  });

  // Show Hint Modal
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

  // Login Submit Logic
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const enteredPassword = passwordInput.value.trim();

    if (!enteredPassword) {
      // Empty input: Shake card gently & alert nicely
      loginCard.classList.remove('shake');
      void loginCard.offsetWidth; // trigger reflow
      loginCard.classList.add('shake');
      alert("Passwordnya jangan dikosongin sayang! Cek petunjuk kalau lupa yaa 🥺💖");
      return;
    }

    // Unlocked!
    playChime();
    triggerCelebrationConfetti();

    stageLogin.classList.add('hidden');
    stageCelebration.classList.remove('hidden');
    musicPlayer.classList.add('active');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Autoplay music
    loadTrack(currentTrackIndex);
    playTrack();
  });

  // ==========================================
  // Stage 3: Interactive Birthday Cake
  // ==========================================
  cakeBox.addEventListener('click', () => {
    if (candlesBlown) return;
    candlesBlown = true;

    // Blow candles
    document.querySelectorAll('.candle').forEach(c => c.classList.add('blown'));
    playChime();
    triggerCelebrationConfetti();

    cakeStatus.innerHTML = `🎉 <strong>Permintaanmu sudah tersimpan di bintang-bintang!</strong><br><span style="color:#ff4d88; font-weight:600;">Semoga semua impian & kebahagiaan selalu menyertai langkahmu, sayang! Amin 💖🎂</span>`;
  });

  // Interactive Love Burst Button
  btnBurstLove.addEventListener('click', (e) => {
    loveCount += 1;
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
  // Music Player Implementation
  // ==========================================
  function loadTrack(index) {
    const track = playlist[index];
    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;
    audio.src = track.url;
    progressFill.style.width = '0%';
    currentTimeDisplay.textContent = '0:00';
    updatePlaylistActiveItem();
  }

  function playTrack() {
    audio.play().then(() => {
      isPlaying = true;
      vinylRecord.classList.add('spinning');
      playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    }).catch(err => {
      console.log("Autoplay blocked by browser, user interaction required:", err);
    });
  }

  function pauseTrack() {
    audio.pause();
    isPlaying = false;
    vinylRecord.classList.remove('spinning');
    playPauseBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
  }

  playPauseBtn.addEventListener('click', () => {
    if (isPlaying) {
      pauseTrack();
    } else {
      playTrack();
    }
  });

  prevTrackBtn.addEventListener('click', () => {
    currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    loadTrack(currentTrackIndex);
    playTrack();
  });

  nextTrackBtn.addEventListener('click', () => {
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    loadTrack(currentTrackIndex);
    playTrack();
  });

  audio.addEventListener('loadedmetadata', () => {
    durationTimeDisplay.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      const pct = (audio.currentTime / audio.duration) * 100;
      progressFill.style.width = `${pct}%`;
      currentTimeDisplay.textContent = formatTime(audio.currentTime);
      durationTimeDisplay.textContent = formatTime(audio.duration);
    }
  });

  audio.addEventListener('ended', () => {
    nextTrackBtn.click();
  });

  progressTrack.addEventListener('click', (e) => {
    const rect = progressTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    if (audio.duration) {
      audio.currentTime = (clickX / width) * audio.duration;
    }
  });

  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // Toggle Playlist Drawer
  togglePlaylistBtn.addEventListener('click', () => {
    playlistMenu.classList.toggle('active');
  });

  function renderPlaylistMenu() {
    playlistMenu.innerHTML = '';
    playlist.forEach((track, i) => {
      const item = document.createElement('div');
      item.className = `playlist-item ${i === currentTrackIndex ? 'active' : ''}`;
      item.innerHTML = `<span><strong>${track.title}</strong> — ${track.artist}</span><span>🎵</span>`;
      item.addEventListener('click', () => {
        currentTrackIndex = i;
        loadTrack(currentTrackIndex);
        playTrack();
        playlistMenu.classList.remove('active');
      });
      playlistMenu.appendChild(item);
    });
  }

  function updatePlaylistActiveItem() {
    const items = playlistMenu.querySelectorAll('.playlist-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === currentTrackIndex);
    });
  }

  renderPlaylistMenu();

  // Custom Audio Upload Handler
  uploadCustomAudioBtn.addEventListener('click', () => {
    customAudioInput.click();
  });

  customAudioInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      playlist.unshift({
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Lagu Pilihan Spesial Kita 💖",
        url: fileUrl
      });
      currentTrackIndex = 0;
      renderPlaylistMenu();
      loadTrack(0);
      playTrack();
      alert(`Berhasil memuat lagu: ${file.name} 🎵`);
    }
  });

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
  // Canvas Floating Ambient Hearts (Background)
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
