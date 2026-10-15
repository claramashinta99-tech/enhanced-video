/* Photo Enhance — RVL HD
   Pure AI-grade Detail Enhance, Texture Smoothing & Resolution Upscale */
(() => {
  function ensurePhotoCss() {
    if (document.querySelector('#rvl-photo-enhance-style') || document.querySelector('link[href*="photo-enhance.css"]')) return;
    const l = document.createElement('link');
    l.id = 'rvl-photo-enhance-style';
    l.rel = 'stylesheet';
    l.href = '/assets/photo-enhance.css?v=3';
    document.head.appendChild(l);
  }
  ensurePhotoCss();

  const $ = id => document.getElementById(id);

  /* ── Elements ───────────────────────────────────────────── */
  const drop            = $('pe-drop');
  const fileInput       = $('pe-file-input');
  const pickBtn         = $('pe-pick-btn');
  const clearBtn        = $('pe-clear-btn');
  const fileBar         = $('pe-file-bar');
  const fileNameEl      = $('pe-file-name');
  const dimInfoEl       = $('pe-dim-info');
  const studio          = $('pe-studio');
  const compareBox      = $('pe-compare-box');
  const compareStage    = $('pe-compare-stage');
  const compareDivider  = $('pe-compare-divider');
  const canvasEnhanced  = $('pe-canvas-enhanced');
  const ctxEnhanced     = canvasEnhanced.getContext('2d', { willReadFrequently: true });
  const canvasOriginal  = $('pe-canvas-original');
  const ctxOriginal     = canvasOriginal.getContext('2d', { willReadFrequently: true });
  const holdBtn         = $('pe-hold-btn');
  const slEnhance       = $('sl-enhance');
  const slSmooth        = $('sl-smooth');
  const slPop           = $('sl-pop');
  const valEnhance      = $('val-enhance');
  const valSmooth       = $('val-smooth');
  const valPop          = $('val-pop');
  const outDimEl        = $('pe-out-dim');
  const downloadBtn     = $('pe-download-btn');
  const resetBtn        = $('pe-reset-btn');
  const dlLabel         = $('pe-dl-label');
  const renderProgress  = $('pe-render-progress');
  const renderFill      = $('pe-render-fill');
  const renderPct       = $('pe-render-pct');
  const renderStatus    = $('pe-render-status');
  const toastEl         = $('toast');

  /* ── State ──────────────────────────────────────────────── */
  let sourceImg = null;
  let sourceFile = null;
  let origW = 0, origH = 0;
  let previewW = 0, previewH = 0;
  let splitPercent = 50;
  let isDragging = false;
  let upscaleFactor = 2; // 1, 2, 4
  let renderScheduled = false;
  let previousSplit = 50;

  const MODES = {
    auto:    { enhance: 70, smooth: 45, pop: 30, scale: 2 },
    clarity: { enhance: 92, smooth: 20, pop: 45, scale: 4 },
    smooth:  { enhance: 40, smooth: 75, pop: 20, scale: 2 },
  };

  const state = {
    enhance: 70,
    smooth: 45,
    pop: 30,
  };

  /* ── i18n ───────────────────────────────────────────────── */
  const lang = () => localStorage.getItem('reyval-lang') || 'id';
  const text = (id, en) => lang() === 'en' ? en : id;

  function applyI18n() {
    const en = lang() === 'en';
    $('pe-title').textContent = en ? 'Photo Enhance & Upscale' : 'Photo Enhance & Upscale';
    $('pe-sub').textContent   = en ? 'Enhance micro-details, smooth skin & textures, and upscale resolution up to 4K Ultra HD.' : 'Enhance ketajaman detail, smoothing tekstur / kulit, dan perbesar resolusi foto sampai 4K Ultra HD.';
    $('pe-drop-title').textContent = en ? 'Choose or drop photo here' : 'Pilih atau drop foto di sini';
    $('pe-drop-sub').textContent   = en ? 'JPEG · PNG · WebP · max 25 MB' : 'JPEG · PNG · WebP · maks 25 MB';
    pickBtn.textContent            = en ? 'Choose photo' : 'Pilih foto';
    clearBtn.textContent           = en ? '✕ Change' : '✕ Ganti';
    holdBtn.textContent            = en ? 'Hold: View Original' : 'Tahan: Lihat Asli';
    $('lbl-enhance').textContent   = en ? 'Detail & Clarity' : 'Detail & Clarity';
    $('lbl-smooth').textContent    = en ? 'Smoothing & Denoise' : 'Smoothing & Denoise';
    $('lbl-pop').textContent       = en ? 'Dynamic Clarity Pop' : 'Dynamic Clarity Pop';
    resetBtn.textContent           = en ? 'Reset' : 'Reset';
    $('pe-notice-text').textContent = en ? 'Enhance, smoothing, and upscale run 100% locally in your browser with hardware acceleration. Secure & private.' : 'Pemrosesan Enhance, Smoothing, dan Upscale berjalan 100% lokal di browser Anda dengan akselerasi hardware. Aman dan privat.';
    updateDownloadLabel();
  }

  function updateDownloadLabel() {
    const en = lang() === 'en';
    const tag = upscaleFactor === 1 ? '1x Native' : (upscaleFactor === 2 ? '2x HD' : '4x Ultra 4K');
    dlLabel.textContent = en ? `Download Enhanced Photo (${tag}) ↓` : `Download Enhanced Photo (${tag}) ↓`;
  }

  /* ── Toast ──────────────────────────────────────────────── */
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  /* ── Clamp Helper ───────────────────────────────────────── */
  const clamp = (v, min = 0, max = 255) => Math.max(min, Math.min(max, v));

  /* ── File Loading ───────────────────────────────────────── */
  function loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast(text('File bukan gambar.', 'Not an image file.')); return; }
    if (file.size > 25 * 1024 * 1024) { toast(text('File melebihi 25 MB.', 'File exceeds 25 MB.')); return; }

    sourceFile = file;
    fileNameEl.textContent = file.name;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      sourceImg = img;
      origW = img.naturalWidth;
      origH = img.naturalHeight;
      dimInfoEl.textContent = `${origW} × ${origH}`;
      fileBar.classList.add('show');
      studio.removeAttribute('aria-hidden');
      downloadBtn.disabled = false;

      // Calculate preview dimensions (max 1200px max edge for butter-smooth live interaction)
      const MAX_PREVIEW = 1200;
      const scale = Math.min(1, MAX_PREVIEW / origW, MAX_PREVIEW / origH);
      previewW = Math.round(origW * scale);
      previewH = Math.round(origH * scale);

      // Set canvas dimensions
      canvasEnhanced.width = previewW;
      canvasEnhanced.height = previewH;
      canvasOriginal.width = previewW;
      canvasOriginal.height = previewH;

      // Draw original preview
      ctxOriginal.drawImage(sourceImg, 0, 0, previewW, previewH);

      updateOutputDimensions();
      setSplitPosition(50);
      scheduleRender();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      toast(text('Gagal membaca gambar.', 'Failed to load image.'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function clearFile() {
    sourceImg = null;
    sourceFile = null;
    fileBar.classList.remove('show');
    studio.setAttribute('aria-hidden', 'true');
    downloadBtn.disabled = true;
    fileInput.value = '';
  }

  function updateOutputDimensions() {
    if (!origW || !origH) {
      outDimEl.textContent = '—';
      return;
    }
    const outW = origW * upscaleFactor;
    const outH = origH * upscaleFactor;
    const tag = upscaleFactor === 1 ? 'Native' : (upscaleFactor === 2 ? 'HD' : '4K Ultra');
    outDimEl.textContent = `${outW} × ${outH} px (${tag})`;
    updateDownloadLabel();
  }

  /* ── Split Compare Logic ────────────────────────────────── */
  function setSplitPosition(pct) {
    splitPercent = Math.max(0, Math.min(100, pct));
    if (compareStage) {
      compareStage.style.setProperty('--pe-split', `${splitPercent}%`);
    }
  }

  function handlePointer(e) {
    const stage = compareStage || compareBox;
    const rect = stage.getBoundingClientRect();
    if (!rect.width) return;
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSplitPosition(pct);
  }

  compareBox.addEventListener('pointerdown', e => {
    isDragging = true;
    compareBox.setPointerCapture(e.pointerId);
    handlePointer(e);
  });

  compareBox.addEventListener('pointermove', e => {
    if (!isDragging) return;
    handlePointer(e);
  });

  compareBox.addEventListener('pointerup', e => {
    if (isDragging) {
      isDragging = false;
      try { compareBox.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  });

  compareBox.addEventListener('pointercancel', () => { isDragging = false; });

  // Hold to view original button
  holdBtn.addEventListener('pointerdown', () => {
    previousSplit = splitPercent;
    setSplitPosition(100);
  });
  const restoreSplit = () => setSplitPosition(previousSplit);
  holdBtn.addEventListener('pointerup', restoreSplit);
  holdBtn.addEventListener('pointerleave', restoreSplit);

  /* ── Core Enhance & Smoothing Algorithm ─────────────────── */
  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      renderPreview();
    });
  }

  function renderPreview() {
    if (!sourceImg || !previewW || !previewH) return;
    // Draw original
    ctxEnhanced.drawImage(sourceImg, 0, 0, previewW, previewH);
    applyEnhancePipeline(ctxEnhanced, previewW, previewH, state);
  }

  /* High performance edge-guided enhancement pipeline */
  function applyEnhancePipeline(targetCtx, w, h, { enhance, smooth, pop }) {
    const imgData = targetCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Fast separable gaussian approximation (radius based on dimensions)
    const blurRadius = Math.max(1, Math.round(Math.min(w, h) * 0.0035));
    const blurred = createBoxBlur(imgData, w, h, blurRadius);
    const blData = blurred.data;

    const smoothStrength = smooth / 100;    // 0..1
    const enhanceStrength = (enhance / 100) * 2.2; // 0..2.2
    const popAmount = (pop / 100) * 0.35;    // 0..0.35

    const edgeThreshold = 35 * (1 - smoothStrength * 0.45);

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i+1], b = data[i+2];
      const br = blData[i], bg = blData[i+1], bb = blData[i+2];

      // Difference between original and blur
      const dr = r - br;
      const dg = g - bg;
      const db = b - bb;
      const edgeDiff = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;

      // 1. Bilateral-like Edge-preserving smoothing
      if (smoothStrength > 0) {
        // Flat/low-gradient regions get smoothed; high-contrast borders stay intact
        const edgeWeight = Math.min(1, edgeDiff / edgeThreshold);
        const smoothBlend = (1 - edgeWeight) * smoothStrength * 0.85;
        r = r * (1 - smoothBlend) + br * smoothBlend;
        g = g * (1 - smoothBlend) + bg * smoothBlend;
        b = b * (1 - smoothBlend) + bb * smoothBlend;
      }

      // 2. Unsharp detail & texture enhancement (coring to prevent noise amplification)
      if (enhanceStrength > 0) {
        if (edgeDiff > 2.5) {
          r += dr * enhanceStrength;
          g += dg * enhanceStrength;
          b += db * enhanceStrength;
        }
      }

      // 3. Dynamic clarity pop (dehaze & micro-contrast)
      if (popAmount > 0) {
        r = (r - 128) * (1 + popAmount) + 128;
        g = (g - 128) * (1 + popAmount) + 128;
        b = (b - 128) * (1 + popAmount) + 128;
      }

      data[i]   = clamp(r);
      data[i+1] = clamp(g);
      data[i+2] = clamp(b);
    }

    targetCtx.putImageData(imgData, 0, 0);
  }

  /* Fast 2-pass box blur */
  function createBoxBlur(srcData, w, h, r) {
    const out = new ImageData(new Uint8ClampedArray(srcData.data), w, h);
    const d = out.data;
    const src = srcData.data;

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      const yw = y * w;
      for (let x = 0; x < w; x++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const idx = (yw + nx) * 4;
          rSum += src[idx];
          gSum += src[idx+1];
          bSum += src[idx+2];
          count++;
        }
        const oIdx = (yw + x) * 4;
        d[oIdx]   = rSum / count;
        d[oIdx+1] = gSum / count;
        d[oIdx+2] = bSum / count;
      }
    }

    // Vertical pass
    const temp = new Uint8ClampedArray(d);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let dy = -r; dy <= r; dy++) {
          const ny = Math.min(h - 1, Math.max(0, y + dy));
          const idx = (ny * w + x) * 4;
          rSum += temp[idx];
          gSum += temp[idx+1];
          bSum += temp[idx+2];
          count++;
        }
        const oIdx = (y * w + x) * 4;
        d[oIdx]   = rSum / count;
        d[oIdx+1] = gSum / count;
        d[oIdx+2] = bSum / count;
      }
    }

    return out;
  }

  /* ── Presets & Mode Switching ───────────────────────────── */
  function applyMode(modeKey) {
    const m = MODES[modeKey] || MODES.auto;
    state.enhance = m.enhance;
    state.smooth  = m.smooth;
    state.pop     = m.pop;
    upscaleFactor = m.scale;

    slEnhance.value = state.enhance; valEnhance.textContent = `${state.enhance}%`;
    slSmooth.value  = state.smooth;  valSmooth.textContent  = `${state.smooth}%`;
    slPop.value     = state.pop;     valPop.textContent     = `${state.pop}%`;

    // Active pill
    document.querySelectorAll('.pe-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === modeKey);
    });
    // Active upscale pill
    document.querySelectorAll('.pe-upscale-pill').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.scale) === upscaleFactor);
    });

    updateOutputDimensions();
    scheduleRender();
  }

  document.querySelectorAll('.pe-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => applyMode(btn.dataset.mode));
  });

  /* ── Sliders Event Binding ──────────────────────────────── */
  slEnhance.addEventListener('input', () => {
    state.enhance = Number(slEnhance.value);
    valEnhance.textContent = `${state.enhance}%`;
    document.querySelectorAll('.pe-mode-btn').forEach(b => b.classList.remove('active'));
    scheduleRender();
  });

  slSmooth.addEventListener('input', () => {
    state.smooth = Number(slSmooth.value);
    valSmooth.textContent = `${state.smooth}%`;
    document.querySelectorAll('.pe-mode-btn').forEach(b => b.classList.remove('active'));
    scheduleRender();
  });

  slPop.addEventListener('input', () => {
    state.pop = Number(slPop.value);
    valPop.textContent = `${state.pop}%`;
    document.querySelectorAll('.pe-mode-btn').forEach(b => b.classList.remove('active'));
    scheduleRender();
  });

  /* ── Upscale Pills Binding ──────────────────────────────── */
  document.querySelectorAll('.pe-upscale-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      upscaleFactor = Number(btn.dataset.scale) || 2;
      document.querySelectorAll('.pe-upscale-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateOutputDimensions();
    });
  });

  resetBtn.addEventListener('click', () => {
    applyMode('auto');
    setSplitPosition(50);
  });

  /* ── High-Resolution Export / Download ─────────────────── */
  downloadBtn.addEventListener('click', async () => {
    if (!sourceImg || !sourceFile) return;

    downloadBtn.disabled = true;
    renderProgress.style.display = 'block';
    renderFill.style.width = '15%';
    renderPct.textContent = '15%';
    renderStatus.textContent = text('Menyiapkan canvas resolusi tinggi…', 'Preparing high-res canvas…');

    await new Promise(r => setTimeout(r, 60));

    const outW = origW * upscaleFactor;
    const outH = origH * upscaleFactor;

    renderFill.style.width = '45%';
    renderPct.textContent = '45%';
    renderStatus.textContent = text(`Melakukan upscale (${outW} × ${outH})…`, `Upscaling to (${outW} × ${outH})…`);

    await new Promise(r => setTimeout(r, 60));

    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

    // High quality bicubic resampling
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';
    offCtx.drawImage(sourceImg, 0, 0, outW, outH);

    renderFill.style.width = '75%';
    renderPct.textContent = '75%';
    renderStatus.textContent = text('Menerapkan detail clarity & smoothing…', 'Applying detail clarity & smoothing…');

    await new Promise(r => setTimeout(r, 80));

    // Apply the enhancement pipeline at full scale
    applyEnhancePipeline(offCtx, outW, outH, state);

    renderFill.style.width = '95%';
    renderPct.textContent = '95%';
    renderStatus.textContent = text('Mengompres file gambar…', 'Compressing output image…');

    await new Promise(r => setTimeout(r, 60));

    // Export to PNG or high-quality JPEG
    offscreen.toBlob(blob => {
      renderFill.style.width = '100%';
      renderPct.textContent = '100%';
      renderStatus.textContent = text('Selesai!', 'Done!');

      setTimeout(() => {
        renderProgress.style.display = 'none';
        downloadBtn.disabled = false;
      }, 700);

      if (!blob) {
        toast(text('Gagal membuat file gambar.', 'Failed to create image file.'));
        return;
      }

      const rawName = sourceFile.name.replace(/\.[^.]+$/, '');
      const scaleTag = upscaleFactor === 1 ? 'enhanced' : (upscaleFactor === 2 ? '2x-hd' : '4x-ultra');
      const filename = `${rawName}_rvl-${scaleTag}.png`;

      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 4000);

      toast(text('Foto berhasil di-enhance & di-download!', 'Photo enhanced and downloaded!'));
    }, 'image/png');
  });

  /* ── Drag & Drop Listeners ──────────────────────────────── */
  pickBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
  });
  clearBtn.addEventListener('click', clearFile);

  ['dragenter', 'dragover'].forEach(ev => {
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(ev => {
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); });
  });
  drop.addEventListener('drop', e => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  window.addEventListener('reyval:lang', applyI18n);
  applyI18n();
})();
