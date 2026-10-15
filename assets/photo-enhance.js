/* Photo Enhance — RVL HD
   Canvas-based filter engine (client-side) + AI background removal (backend) */
(() => {
  /* ── Constants ─────────────────────────────────────────── */
  const API = 'https://enhanced-video-production.up.railway.app';
  function ensurePhotoCss() {
    if (document.querySelector('#rvl-photo-enhance-style') || document.querySelector('link[href*="photo-enhance.css"]')) return;
    const l = document.createElement('link');
    l.id = 'rvl-photo-enhance-style';
    l.rel = 'stylesheet';
    l.href = '/assets/photo-enhance.css?v=1';
    document.head.appendChild(l);
  }
  ensurePhotoCss();

  const PRESETS = {
    none:      { brightness: 100, contrast: 100, saturation: 100, sharpness: 100, warmth: 0,   vignette: 0  },
    autohd:    { brightness: 104, contrast: 114, saturation: 108, sharpness: 135, warmth: 6,   vignette: 0  },
    vivid:     { brightness: 108, contrast: 120, saturation: 150, sharpness: 130, warmth: 10,  vignette: 10 },
    cool:      { brightness: 102, contrast: 108, saturation: 90,  sharpness: 105, warmth: -30, vignette: 15 },
    warm:      { brightness: 108, contrast: 105, saturation: 110, sharpness: 100, warmth: 35,  vignette: 20 },
    mono:      { brightness: 100, contrast: 115, saturation: 0,   sharpness: 110, warmth: 0,   vignette: 25 },
    fade:      { brightness: 120, contrast: 75,  saturation: 70,  sharpness: 90,  warmth: 5,   vignette: 0  },
    cinematic: { brightness: 95,  contrast: 125, saturation: 80,  sharpness: 120, warmth: -10, vignette: 45 },
  };

  /* ── Elements ───────────────────────────────────────────── */
  const $  = id => document.getElementById(id);
  const qs = s  => document.querySelector(s);

  const drop         = $('pe-drop');
  const fileInput    = $('pe-file-input');
  const pickBtn      = $('pe-pick-btn');
  const clearBtn     = $('pe-clear-btn');
  const fileBar      = $('pe-file-bar');
  const fileNameEl   = $('pe-file-name');
  const tabs         = document.querySelectorAll('.pe-tab');
  const studio       = $('pe-studio');
  const canvas       = $('pe-canvas');
  const ctx          = canvas.getContext('2d');
  const canvasEmpty  = $('pe-canvas-empty');
  const panelFilter  = $('panel-filter');
  const panelRmbg    = $('panel-removebg');
  const rmbgBtn      = $('pe-rmbg-btn');
  const rmbgProg     = $('pe-rmbg-progress');
  const rmbgFill     = $('pe-rmbg-fill');
  const rmbgStatus   = $('pe-rmbg-status');
  const rmbgPct      = $('pe-rmbg-pct');
  const rmbgResult   = $('pe-rmbg-result');
  const rmbgPreview  = $('pe-rmbg-preview');
  const rmbgDl       = $('pe-rmbg-download');
  const dlFilter     = $('pe-download-filter');
  const resetFilter  = $('pe-reset-filter');
  const toastEl      = $('toast');

  const sliders = ['brightness','contrast','saturation','sharpness','warmth','vignette'];
  const sliderEls = {}, valEls = {};
  sliders.forEach(k => { sliderEls[k] = $(`sl-${k}`); valEls[k] = $(`val-${k}`); });

  /* ── State ──────────────────────────────────────────────── */
  let sourceImg = null;   // original HTMLImageElement
  let sourceFile = null;
  let currentTab = 'filter';
  let rmbgObjectURL = null;
  let renderScheduled = false;

  const filterState = { brightness: 100, contrast: 100, saturation: 100, sharpness: 100, warmth: 0, vignette: 0 };

  /* ── i18n helper ────────────────────────────────────────── */
  const lang  = () => localStorage.getItem('reyval-lang') || 'id';
  const text  = (id, en) => lang() === 'en' ? en : id;

  function applyCopy() {
    const en = lang() === 'en';
    $('pe-title').textContent  = 'Photo Enhance';
    $('pe-sub').textContent    = en ? 'Upload a photo — remove background, apply filters, or enhance right in your browser.' : 'Upload foto — hapus background, terapkan filter, atau enhance langsung di browser dan via AI.';
    $('pe-drop-title').textContent = en ? 'Choose or drop photo here' : 'Pilih atau drop foto di sini';
    $('pe-drop-sub').textContent   = en ? 'JPEG · PNG · WebP · max 20 MB' : 'JPEG · PNG · WebP · maks 20 MB';
    pickBtn.textContent        = en ? 'Choose photo' : 'Pilih foto';
    $('tab-filter').textContent    = en ? 'Filters' : 'Filter';
    $('tab-removebg').textContent  = en ? 'Remove Background' : 'Hapus Background';
    $('panel-filter-title').textContent  = en ? 'Filter & Adjustment' : 'Filter & Adjustment';
    $('panel-removebg-title').textContent = en ? 'Remove Background (AI)' : 'Hapus Background (AI)';
    $('pe-rmbg-desc').textContent  = en ? 'Your photo is processed by the AI backend. Result is a transparent PNG, ready to use.' : 'Foto diproses via backend AI. Hasilnya PNG transparan, siap dipakai.';
    $('pe-rmbg-privacy').innerHTML = `<span>●</span> ${en ? 'Photo is sent to the server for processing, then immediately deleted.' : 'Foto dikirim ke server untuk diproses, lalu langsung dihapus.'}`;
    rmbgBtn.textContent = en ? 'Remove Background' : 'Hapus Background';
    resetFilter.textContent = en ? 'Reset' : 'Reset';
    $('pe-notice-text').textContent = en ? 'Filters run 100% in your browser. Photos are never sent to a server unless AI features are used.' : 'Filter diproses 100% di browser lu. Foto tidak pernah dikirim ke server kecuali fitur AI diaktifkan.';
    $('lbl-brightness').textContent = 'Brightness';
    $('lbl-contrast').textContent   = 'Contrast';
    $('lbl-saturation').textContent = 'Saturation';
    $('lbl-sharpness').textContent  = en ? 'Sharpness' : 'Sharpness';
    $('lbl-warmth').textContent     = en ? 'Warmth' : 'Warmth';
    $('lbl-vignette').textContent   = 'Vignette';
    $('pe-presets-label').textContent = en ? 'Presets' : 'Preset';
    $('pe-empty-hint').textContent  = en ? 'Upload a photo first' : 'Upload foto dulu';
  }

  /* ── Toast ─────────────────────────────────────────────── */
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  /* ── File loading ───────────────────────────────────────── */
  function loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast(text('File bukan gambar.', 'Not an image file.')); return; }
    if (file.size > 20 * 1024 * 1024) { toast(text('File melebihi 20 MB.', 'File exceeds 20 MB.')); return; }
    sourceFile = file;
    fileNameEl.textContent = file.name;
    fileBar.classList.add('show');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      sourceImg = img;
      applyPreset('none');
      renderCanvas();
      canvasEmpty.style.display = 'none';
      canvas.style.display = 'block';
      studio.removeAttribute('aria-hidden');
      document.querySelectorAll('.pe-tab').forEach(t => t.removeAttribute('disabled'));
      dlFilter.disabled = false;
      rmbgBtn.disabled = false;
      // Reset rmbg panel state
      resetRmbg();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { toast(text('Gagal membaca gambar.', 'Failed to load image.')); URL.revokeObjectURL(url); };
    img.src = url;
  }

  function clearFile() {
    sourceImg = null;
    sourceFile = null;
    fileBar.classList.remove('show');
    fileNameEl.textContent = '';
    canvas.style.display = 'none';
    canvasEmpty.style.display = '';
    studio.setAttribute('aria-hidden', 'true');
    dlFilter.disabled = true;
    rmbgBtn.disabled = true;
    document.querySelectorAll('.pe-tab').forEach(t => t.disabled = true);
    applyPreset('none');
    resetRmbg();
    if (rmbgObjectURL) { URL.revokeObjectURL(rmbgObjectURL); rmbgObjectURL = null; }
    fileInput.value = '';
  }

  /* ── Canvas rendering ───────────────────────────────────── */
  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; renderCanvas(); });
  }

  function renderCanvas() {
    if (!sourceImg) return;
    const MAX_W = 1080, MAX_H = 1080;
    let w = sourceImg.naturalWidth, h = sourceImg.naturalHeight;
    const scale = Math.min(1, MAX_W / w, MAX_H / h);
    w = Math.round(w * scale); h = Math.round(h * scale);
    canvas.width = w; canvas.height = h;

    // Draw original
    ctx.drawImage(sourceImg, 0, 0, w, h);

    // Apply CSS filter (brightness, contrast, saturation, built-in sharp via CSS)
    const { brightness, contrast, saturation, sharpness, warmth, vignette } = filterState;
    const sharpPx = Math.round((sharpness - 100) / 20);  // -5..+5 px approx

    // Build CSS filter string for the context
    // Canvas 2D doesn't support CSS filters natively in all browsers for drawImage,
    // so we use an offscreen approach via a temporary canvas + CSS filter trick
    applyImageFilters(w, h, { brightness, contrast, saturation, sharpness, warmth, vignette });
  }

  function applyImageFilters(w, h, { brightness, contrast, saturation, sharpness, warmth, vignette }) {
    // Get pixel data
    let imgData = ctx.getImageData(0, 0, w, h);
    let data = imgData.data;
    const bFactor = brightness / 100;
    const cFactor = contrast / 100;
    const sFactor = saturation / 100;
    const wFactor = warmth;       // -100..100

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i+1], b = data[i+2];

      // Brightness
      r *= bFactor; g *= bFactor; b *= bFactor;

      // Contrast  (pivot at 128)
      r = (r - 128) * cFactor + 128;
      g = (g - 128) * cFactor + 128;
      b = (b - 128) * cFactor + 128;

      // Warmth (shift red/blue channel)
      if (wFactor !== 0) {
        const shift = Math.abs(wFactor) * 0.35;
        if (wFactor > 0) { r += shift * (wFactor / 100); b -= shift * (wFactor / 100); }
        else             { r -= shift * (Math.abs(wFactor) / 100); b += shift * (Math.abs(wFactor) / 100); }
      }

      // Saturation via luminance
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * sFactor;
      g = lum + (g - lum) * sFactor;
      b = lum + (b - lum) * sFactor;

      data[i]   = Math.max(0, Math.min(255, r));
      data[i+1] = Math.max(0, Math.min(255, g));
      data[i+2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(imgData, 0, 0);

    // Sharpness via unsharp mask (convolution)
    if (sharpness !== 100) {
      const amt = (sharpness - 100) / 100;  // -1..+1
      if (amt > 0) unsharpMask(ctx, w, h, amt * 1.5, 1);
    }

    // Vignette overlay
    if (vignette > 0) {
      const strength = vignette / 100;
      const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.35, w/2, h/2, Math.max(w,h)*0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${strength * 0.85})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /* Simple unsharp mask */
  function unsharpMask(ctx, w, h, amount, radius) {
    const src = ctx.getImageData(0, 0, w, h);
    const blurred = blurData(src, w, h, radius);
    const out = ctx.createImageData(w, h);
    const d = src.data, bl = blurred.data, od = out.data;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const diff = d[i+c] - bl[i+c];
        od[i+c] = Math.max(0, Math.min(255, d[i+c] + amount * diff));
      }
      od[i+3] = d[i+3];
    }
    ctx.putImageData(out, 0, 0);
  }

  function blurData(imgData, w, h, radius) {
    const out = new ImageData(new Uint8ClampedArray(imgData.data), w, h);
    const d = out.data;
    const r = Math.max(1, Math.round(radius));
    // Box blur horizontal
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rSum=0, gSum=0, bSum=0, cnt=0;
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(w-1, Math.max(0, x+dx));
          const idx = (y*w+nx)*4;
          rSum += imgData.data[idx]; gSum += imgData.data[idx+1]; bSum += imgData.data[idx+2]; cnt++;
        }
        const idx = (y*w+x)*4;
        d[idx]=rSum/cnt; d[idx+1]=gSum/cnt; d[idx+2]=bSum/cnt;
      }
    }
    return out;
  }

  /* ── Presets ────────────────────────────────────────────── */
  function applyPreset(name) {
    const preset = PRESETS[name] || PRESETS.none;
    Object.assign(filterState, preset);
    sliders.forEach(k => {
      sliderEls[k].value = filterState[k];
      valEls[k].textContent = filterState[k];
    });
    if (sourceImg) scheduleRender();
    // Update active preset button
    document.querySelectorAll('.pe-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === name);
    });
  }

  document.querySelectorAll('.pe-preset').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  /* ── Sliders ────────────────────────────────────────────── */
  sliders.forEach(k => {
    sliderEls[k].addEventListener('input', () => {
      filterState[k] = Number(sliderEls[k].value);
      valEls[k].textContent = filterState[k];
      if (sourceImg) scheduleRender();
      // Deselect any preset
      document.querySelectorAll('.pe-preset').forEach(b => b.classList.remove('active'));
      document.querySelector('.pe-preset[data-preset="none"]')?.classList.add('active');
    });
  });

  resetFilter.addEventListener('click', () => applyPreset('none'));

  /* ── Download filtered ──────────────────────────────────── */
  dlFilter.addEventListener('click', () => {
    if (!sourceImg) return;
    const ext = (sourceFile?.name.match(/\.\w+$/) || ['.jpg'])[0].toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    const quality = mime === 'image/jpeg' ? 0.94 : undefined;
    canvas.toBlob(blob => {
      if (!blob) { toast(text('Gagal membuat file.', 'Failed to create file.')); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (sourceFile?.name.replace(/\.\w+$/, '') || 'photo') + '_rvl-hd' + ext;
      a.click();
      URL.revokeObjectURL(a.href);
    }, mime, quality);
  });

  /* ── Tab switching ──────────────────────────────────────── */
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      panelFilter.style.display  = currentTab === 'filter'   ? '' : 'none';
      panelRmbg.style.display    = currentTab === 'removebg' ? '' : 'none';
    });
  });

  /* ── Background removal ─────────────────────────────────── */
  function resetRmbg() {
    rmbgProg.style.display = 'none';
    rmbgResult.style.display = 'none';
    rmbgPreview.style.display = 'none';
    rmbgPreview.src = '';
    rmbgDl.removeAttribute('href');
    if (rmbgObjectURL) { URL.revokeObjectURL(rmbgObjectURL); rmbgObjectURL = null; }
    setRmbgProgress(0, '');
  }

  function setRmbgProgress(pct, msg) {
    rmbgFill.style.width = pct + '%';
    rmbgPct.textContent  = pct + '%';
    if (msg) rmbgStatus.textContent = msg;
  }

  rmbgBtn.addEventListener('click', async () => {
    if (!sourceFile) return;
    resetRmbg();
    rmbgBtn.disabled = true;
    rmbgProg.style.display = 'block';
    const en = lang() === 'en';

    try {
      setRmbgProgress(15, en ? 'Sending to AI…' : 'Mengirim ke AI…');
      const form = new FormData();
      form.append('file', sourceFile, sourceFile.name);

      setRmbgProgress(30, en ? 'Processing…' : 'Memproses…');
      const res = await fetch(API + '/api/photo/remove-bg', { method: 'POST', body: form, cache: 'no-store' });

      setRmbgProgress(80, en ? 'Almost done…' : 'Hampir selesai…');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || (en ? 'Server error.' : 'Error server.'));
      }

      const blob = await res.blob();
      rmbgObjectURL = URL.createObjectURL(blob);
      rmbgPreview.src = rmbgObjectURL;
      rmbgPreview.style.display = 'block';
      rmbgDl.href = rmbgObjectURL;

      setRmbgProgress(100, en ? 'Done!' : 'Selesai!');
      rmbgResult.style.display = 'block';
    } catch (err) {
      console.error(err);
      setRmbgProgress(0, err.message || (en ? 'Failed.' : 'Gagal.'));
      toast(err.message || (en ? 'Background removal failed.' : 'Gagal hapus background.'));
    } finally {
      rmbgBtn.disabled = false;
    }
  });

  /* ── File drop & input ──────────────────────────────────── */
  pickBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  drop.addEventListener('click', () => { if (!sourceImg) fileInput.click(); });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) loadFile(f); });
  clearBtn.addEventListener('click', e => { e.stopPropagation(); clearFile(); });

  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f) loadFile(f); });

  /* ── Paste from clipboard ───────────────────────────────── */
  document.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { const f = item.getAsFile(); if (f) loadFile(f); }
  });

  /* ── Init ───────────────────────────────────────────────── */
  canvas.style.display = 'none';
  document.querySelectorAll('.pe-tab').forEach(t => t.disabled = true);
  window.addEventListener('reyval:lang', applyCopy);
  applyCopy();
})();
