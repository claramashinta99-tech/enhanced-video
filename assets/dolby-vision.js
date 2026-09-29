(()=>{
  const qs = s => document.querySelector(s);
  const qsa = s => [...document.querySelectorAll(s)];

  const fileInput = qs('#dolby-file');
  const drop = qs('#dolby-drop');
  const pick = qs('#dolby-pick');
  const processBtn = qs('#dolby-process-btn');
  const fileLine = qs('#dolby-file-line');
  const fileNameEl = qs('#dolby-file-name');
  const fileInfoEl = qs('#dolby-file-info');
  const fileBadge = qs('#dolby-file-badge');
  const statusBox = qs('#dolby-status-box');
  const statusText = qs('#dolby-status-text');
  const progressFill = qs('#dolby-progress-fill');
  const resultCard = qs('#dolby-result-card');
  const resultVideo = qs('#dolby-result-video');
  const downloadLink = qs('#dolby-download-link');

  if (!fileInput || !drop || !processBtn) return;

  const API = 'https://enhanced-video-production.up.railway.app';
  let file = null;
  let fileDuration = 0;
  let pollTimer = null;
  let currentJobId = null;

  // Inject UI Styles
  if (!document.querySelector('#rvl-dolby-vision-style')) {
    const s = document.createElement('style');
    s.id = 'rvl-dolby-vision-style';
    s.textContent = `
      .dolby-mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
      .dolby-mode-card { border: 2px solid #35446a; background: #10172b; padding: 14px; border-radius: 6px; cursor: pointer; transition: .18s; display: block; position: relative; }
      .dolby-mode-card:hover { border-color: #7b96db; background: #141d37; }
      .dolby-mode-card.active { border-color: #77e8c1; background: #122824; box-shadow: 0 0 12px rgba(119, 232, 193, 0.15); }
      .dolby-mode-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
      .dolby-mode-head b { font-size: 13px; color: #fff; }
      .dolby-badge { font-size: 9px; padding: 2px 7px; border-radius: 999px; border: 1px solid #35446a; color: #aab5d3; text-transform: uppercase; font-weight: 700; }
      .dolby-badge.rec { border-color: #315d50; color: #77e8c1; background: #0e221b; }
      .dolby-mode-card p { margin: 0; font-size: 11px; color: #aab5d3; line-height: 1.45; }
      
      .dolby-status-box { display: none; margin-top: 14px; border: 2px solid #35446a; background: #10172b; border-radius: 5px; padding: 14px; }
      .dolby-status-box.show { display: block; }
      .dolby-progress-bar { height: 7px; background: #0b1122; border-radius: 999px; overflow: hidden; border: 1px solid #232e4d; }
      .dolby-progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #77e8c1, #aa8cff); transition: width .25s ease; }
      .dolby-status-text { margin-top: 10px; font-size: 12px; color: #dce6ff; display: flex; justify-content: space-between; align-items: center; }
      .dolby-status-text.error { color: #ff9d9d; }

      .dolby-result-card { display: none; margin-top: 20px; border: 2px solid #315d50; background: #0e1e18; border-radius: 6px; padding: 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
      .dolby-result-card.show { display: block; animation: rvlFadeIn .3s ease; }
      .dolby-result-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .dolby-success-icon { width: 34px; height: 34px; border-radius: 50%; background: #1a4235; border: 2px solid #77e8c1; color: #77e8c1; display: grid; place-items: center; font-weight: 800; font-size: 16px; flex-shrink: 0; }
      .dolby-result-header b { font-size: 14px; color: #fff; display: block; }
      .dolby-result-header p { margin: 3px 0 0; font-size: 11px; color: #8ba793; }

      .dolby-preview-wrap { aspect-ratio: 9/16; max-height: 480px; margin: 12px auto; background: #000; border: 2px solid #35446a; border-radius: 6px; overflow: hidden; }
      .dolby-preview-wrap video { width: 100%; height: 100%; object-fit: contain; }

      .dolby-guide-box { margin-top: 16px; border-top: 1px solid #233c32; padding-top: 14px; }
      .dolby-guide-box span { color: #77e8c1; }
      .dolby-guide-box ol { margin: 8px 0 0; padding-left: 20px; font-size: 12px; color: #c4d7cb; line-height: 1.6; }
      .dolby-guide-box li { margin-bottom: 4px; }

      @keyframes rvlFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

      @media(max-width: 640px) {
        .dolby-mode-grid { grid-template-columns: 1fr; }
        .dolby-preview-wrap { max-height: 380px; }
      }
    `;
    document.head.appendChild(s);
  }

  const lang = () => localStorage.getItem('reyval-lang') || 'id';
  const isEn = () => lang() === 'en';

  const fmtBytes = n => {
    n = Number(n) || 0;
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
  };

  // Profile Selection
  qsa('.dolby-mode-card').forEach(card => {
    card.addEventListener('click', () => {
      qsa('.dolby-mode-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  function getSelectedMode() {
    const checked = qs('input[name="hdr-mode"]:checked');
    return checked ? checked.value : 'hlg';
  }

  function setProgress(pct, msg = '', isError = false) {
    statusBox.classList.add('show');
    progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    statusText.textContent = msg;
    statusText.className = 'dolby-status-text' + (isError ? ' error' : '');
  }

  function hideProgress() {
    statusBox.classList.remove('show');
  }

  // Probe Video Duration via HTML5 Video element
  function probeDuration(f) {
    return new Promise(resolve => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      const url = URL.createObjectURL(f);
      v.src = url;
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(v.duration || 0);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
    });
  }

  async function handleFile(next) {
    file = next || null;
    resultCard.classList.remove('show');
    hideProgress();
    if (pollTimer) clearInterval(pollTimer);

    if (!file) {
      fileLine.classList.remove('show');
      processBtn.disabled = true;
      return;
    }

    fileNameEl.textContent = file.name;
    fileInfoEl.textContent = `${fmtBytes(file.size)} · membaca durasi...`;
    fileBadge.textContent = 'CHECKING...';
    fileBadge.style.color = '#aa8cff';
    fileLine.classList.add('show');
    processBtn.disabled = true;

    // Check duration client-side
    fileDuration = await probeDuration(file);

    if (fileDuration > 30.5) {
      fileInfoEl.textContent = `${fmtBytes(file.size)} · Durasi ${fileDuration.toFixed(1)}s (MELEBIHI 30 DETIK)`;
      fileBadge.textContent = 'OVER LIMIT';
      fileBadge.style.color = '#ff9d9d';
      setProgress(
        0,
        isEn()
          ? `Video duration (${fileDuration.toFixed(1)}s) exceeds the 30-second limit. Please trim your video.`
          : `Durasi video (${fileDuration.toFixed(1)}s) melebihi batas 30 detik. Silakan potong video Anda.`,
        true
      );
      processBtn.disabled = true;
      return;
    }

    const durText = fileDuration > 0 ? ` · ${fileDuration.toFixed(1)}s` : '';
    fileInfoEl.textContent = `${fmtBytes(file.size)}${durText}`;
    fileBadge.textContent = 'READY';
    fileBadge.style.color = '#77e8c1';
    processBtn.disabled = false;
  }

  async function pollJob(jobId) {
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/dolby/jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Job status check failed');
        const data = await res.json();

        if (data.state === 'working') {
          const pct = Math.max(30, data.progress || 35);
          setProgress(pct, data.stage || (isEn() ? 'Encoding 10-bit HEVC & injecting HDR profile...' : 'Meng-encode 10-bit HEVC & menyuntikkan profil HDR...'));
        } else if (data.state === 'ready') {
          clearInterval(pollTimer);
          setProgress(100, isEn() ? 'Complete · RVL HD Ready' : 'Selesai · RVL HD Ready');
          showResult(jobId, data.filename);
          processBtn.disabled = false;
        } else if (data.state === 'error') {
          clearInterval(pollTimer);
          setProgress(0, data.error || (isEn() ? 'Dolby Vision processing failed.' : 'Proses Dolby Vision gagal.'), true);
          processBtn.disabled = false;
        }
      } catch (err) {
        console.error('Dolby poll error:', err);
      }
    }, 1200);
  }

  function showResult(jobId, filename) {
    const fileUrl = `${API}/api/dolby/jobs/${jobId}/file`;
    downloadLink.href = fileUrl;
    downloadLink.setAttribute('download', filename);

    resultVideo.src = `${fileUrl}?preview=1`;
    resultCard.classList.add('show');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function startProcess() {
    if (!file || fileDuration > 30.5) return;

    processBtn.disabled = true;
    resultCard.classList.remove('show');
    const mode = getSelectedMode();

    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('mode', mode);

    setProgress(5, isEn() ? 'Uploading video to Railway backend...' : 'Mengunggah video ke server Railway...');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/api/dolby/jobs`);

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 25);
        setProgress(pct, isEn() ? `Uploading: ${Math.round((e.loaded / e.total) * 100)}%` : `Mengunggah: ${Math.round((e.loaded / e.total) * 100)}%`);
      }
    };

    xhr.onload = () => {
      try {
        const resp = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && resp.job_id) {
          currentJobId = resp.job_id;
          setProgress(25, isEn() ? 'Processing on Railway FFmpeg engine...' : 'Memproses di engine FFmpeg Railway...');
          pollJob(resp.job_id);
        } else {
          throw new Error(resp.detail || resp.error || (isEn() ? 'Failed to start processing.' : 'Gagal memulai proses.'));
        }
      } catch (err) {
        setProgress(0, err.message, true);
        processBtn.disabled = false;
      }
    };

    xhr.onerror = () => {
      setProgress(0, isEn() ? 'Network error connecting to backend.' : 'Terjadi kesalahan koneksi ke server backend.', true);
      processBtn.disabled = false;
    };

    xhr.send(formData);
  }

  function applyCopy() {
    const en = isEn();
    const sub = qs('#dolby-page-sub');
    const dropTitle = qs('#dolby-drop-title');
    const dropSub = qs('#dolby-drop-sub');
    const pickBtn = qs('#dolby-pick');
    const btn = qs('#dolby-process-btn');

    if (sub) sub.textContent = en
      ? 'Inject HDR10 / Dolby Vision (10-bit HEVC) metadata so viewer screens auto-glow on TikTok. Maximum duration: 30 seconds.'
      : 'Suntik metadata HDR10 / Dolby Vision (10-bit HEVC) agar layar penonton di TikTok otomatis menyala terang (auto-glow). Maksimal durasi 30 detik.';
    if (dropTitle) dropTitle.textContent = en ? 'Drop video here' : 'Drop video di sini';
    if (dropSub) dropSub.textContent = en ? 'MP4 or MOV · Max 30 seconds' : 'MP4 atau MOV · Maksimal 30 detik';
    if (pickBtn) pickBtn.textContent = en ? 'Choose Video' : 'Pilih Video';
    if (btn) btn.textContent = en ? 'Optimize Dolby Vision (RVL HD)' : 'Optimasi Dolby Vision (RVL HD)';
  }

  // Event Listeners
  pick.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0] || null));
  processBtn.addEventListener('click', startProcess);

  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault();
    drop.classList.add('drag');
  }));

  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault();
    drop.classList.remove('drag');
  }));

  drop.addEventListener('drop', e => {
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  window.addEventListener('reyval:lang', applyCopy);
  applyCopy();
})();
