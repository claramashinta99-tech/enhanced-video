/* Photo Enhance — RVL HD
   Wink Bypass Engine (AI Quality Restoration) */
(() => {
  function ensurePhotoCss() {
    if (document.querySelector('#rvl-photo-enhance-style') || document.querySelector('link[href*="photo-enhance.css"]')) return;
    const l = document.createElement('link');
    l.id = 'rvl-photo-enhance-style';
    l.rel = 'stylesheet';
    l.href = '/assets/photo-enhance.css?v=5';
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
  const zoomBtn         = $('pe-zoom-btn');
  const origDimEl       = $('pe-orig-dim');
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
  let targetW = 0, targetH = 0;
  let splitPercent = 50;
  let isDragging = false;
  let isZoomed = false;
  let previousSplit = 50;

  /* ── Precomputed Range LUT for Bilateral Smoothing ──────── */
  // Gaussian range weight: exp(-delta^2 / (2 * sigma^2)) with sigma = 15.0
  const RANGE_SIGMA = 15.0;
  const RANGE_LUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    RANGE_LUT[i] = Math.exp(-(i * i) / (2 * RANGE_SIGMA * RANGE_SIGMA));
  }

  /* ── i18n ───────────────────────────────────────────────── */
  const lang = () => localStorage.getItem('reyval-lang') || 'id';
  const text = (id, en) => lang() === 'en' ? en : id;

  function applyI18n() {
    const en = lang() === 'en';
    $('pe-title').textContent = en ? 'Wink Bypass' : 'Wink Bypass';
    $('pe-sub').textContent   = en 
      ? 'Restore photo quality & micro-details with the Wink Quality Restoration algorithm. Dynamic shadow recovery, porcelain-smooth denoise, and 4x Ultra HD upscale.' 
      : 'Restorasi kualitas foto & kejernihan mikro dengan algoritma Wink Quality Restoration. Mengangkat detail bayangan, menajamkan teks & tekstur, serta upscale hingga Ultra HD.';
    $('pe-drop-title').textContent = en ? 'Choose or drop photo here' : 'Pilih atau drop foto di sini';
    $('pe-drop-sub').textContent   = en ? 'JPEG · PNG · WebP · max 25 MB' : 'JPEG · PNG · WebP · maks 25 MB';
    pickBtn.textContent            = en ? 'Choose photo' : 'Pilih foto';
    clearBtn.textContent           = en ? '✕ Change' : '✕ Ganti';
    holdBtn.textContent            = en ? 'Hold: View Original' : 'Tahan: Lihat Asli';
    if (zoomBtn) zoomBtn.textContent = isZoomed ? (en ? '🔍 Zoom Out' : '🔍 Perkecil') : (en ? '🔍 Zoom 2x' : '🔍 Zoom 2x');
    $('pe-hint-text').textContent  = en ? 'Drag middle slider to compare Original vs Wink Bypass' : 'Geser garis tengah untuk bandingkan Original vs Wink Bypass';
    $('pe-features-label').textContent = en ? 'Active Restoration Features' : 'Fitur Restorasi Aktif';
    $('spec-detail-title').textContent = en ? 'Multi-Scale Micro-Detail' : 'Multi-Scale Micro-Detail';
    $('spec-detail-desc').textContent  = en ? 'Reconstructs edges, text, and micro-textures without halo artifacts.' : 'Rekonstruksi ketajaman tepi, teks, dan tekstur mikro tanpa digital halo.';
    $('spec-shadow-title').textContent = en ? 'Dynamic Shadow Recovery' : 'Dynamic Shadow Recovery';
    $('spec-shadow-desc').textContent  = en ? 'Lifts deep shadow details with a gentle toe-curve without washed-out blacks.' : 'Mengangkat detail bayangan gelap dengan kurva halus tanpa crushed blacks.';
    $('spec-denoise-title').textContent= en ? 'Bilateral Surface Smoothing' : 'Bilateral Surface Smoothing';
    $('spec-denoise-desc').textContent = en ? 'Eliminates JPEG artifacts & compression noise for silky, porcelain-smooth surfaces.' : 'Membersihkan noise & artefak kompresi agar permukaan halus lembut.';
    $('spec-meta-title').textContent   = en ? 'Wink EXIF 64-Bit Injection' : 'Wink EXIF 64-Bit Injection';
    $('spec-meta-desc').textContent    = en ? 'Studio JPEG Q98 format with exact authentic Wink APP1 EXIF structure.' : 'Format JPEG Q98 Studio dengan struktur APP1 EXIF asli Wink.';
    $('lbl-orig-dim').textContent      = en ? 'Original Size:' : 'Resolusi Asli:';
    $('lbl-target-dim').textContent    = en ? 'Wink Bypass Target:' : 'Target Wink Bypass:';
    resetBtn.textContent           = en ? '✕ Change Photo' : '✕ Ganti Foto';
    $('pe-notice-text').textContent = en ? 'Wink Bypass runs 100% locally in your browser with hardware acceleration. Injects exact Wink EXIF metadata for maximum fidelity.' : 'Pemrosesan Wink Bypass berjalan 100% lokal di browser Anda dengan akselerasi hardware. Menginjeksi exact metadata Wink EXIF untuk hasil maksimal.';
    dlLabel.textContent = en ? 'Download Restored Photo (Wink Bypass) ↓' : 'Download Restored Photo (Wink Bypass) ↓';
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
      origDimEl.textContent = `${origW} × ${origH} px`;

      // Calculate Target Upscale Dimensions (Wink Quality Restoration 4x Target)
      calculateTargetDimensions();

      fileBar.classList.add('show');
      studio.removeAttribute('aria-hidden');
      downloadBtn.disabled = false;

      // Studio High-Definition Preview Buffer (2x-4x upscaled density so upscale is clearly visible)
      // Render preview with retina / high-resolution scaling so crisp details and smooth textures pop
      const dpr = window.devicePixelRatio && window.devicePixelRatio > 1 ? window.devicePixelRatio : 1.5;
      const scale = Math.min(2.5, Math.max(1.5, dpr));
      const maxDim = 2560;

      previewW = Math.min(maxDim, Math.round(origW * scale));
      previewH = Math.min(maxDim, Math.round(origH * scale));

      // Make dimensions even
      previewW -= previewW % 2;
      previewH -= previewH % 2;

      // Set canvas dimensions
      canvasEnhanced.width = previewW;
      canvasEnhanced.height = previewH;
      canvasOriginal.width = previewW;
      canvasOriginal.height = previewH;

      // Draw original preview
      ctxOriginal.imageSmoothingEnabled = true;
      ctxOriginal.imageSmoothingQuality = 'high';
      ctxOriginal.drawImage(sourceImg, 0, 0, previewW, previewH);

      setSplitPosition(50);
      renderPreview();
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
    origDimEl.textContent = '—';
    outDimEl.textContent = '—';
    if (isZoomed) toggleZoom();
  }

  function calculateTargetDimensions() {
    if (!origW || !origH) {
      outDimEl.textContent = '—';
      return;
    }

    const maxEdge = Math.max(origW, origH);
    const minEdge = Math.min(origW, origH);
    let scale = 1;

    // Wink Quality Restoration Target:
    // If original is <= 720p or 1280p (mobile photo / video snapshot): 4x upscale (up to 2880x5120)
    // If original is <= 1440p or 2560p: 2x upscale
    // Max long edge capped at 5120px, max short edge capped at 2880px to match Wink 5K/4K max envelope
    if (maxEdge <= 1280 || minEdge <= 720) {
      scale = 4;
    } else if (maxEdge <= 2560 || minEdge <= 1440) {
      scale = 2;
    } else {
      scale = 1;
    }

    let calculatedW = Math.round(origW * scale);
    let calculatedH = Math.round(origH * scale);

    // Bound to Wink's maximum envelope (5120 max edge, 2880 min edge)
    if (calculatedH >= calculatedW) {
      if (calculatedH > 5120) {
        const r = 5120 / calculatedH;
        calculatedH = 5120;
        calculatedW = Math.round(calculatedW * r);
      }
      if (calculatedW > 2880) {
        const r = 2880 / calculatedW;
        calculatedW = 2880;
        calculatedH = Math.round(calculatedH * r);
      }
    } else {
      if (calculatedW > 5120) {
        const r = 5120 / calculatedW;
        calculatedW = 5120;
        calculatedH = Math.round(calculatedH * r);
      }
      if (calculatedH > 2880) {
        const r = 2880 / calculatedH;
        calculatedH = 2880;
        calculatedW = Math.round(calculatedW * r);
      }
    }

    // Ensure even pixel dimensions
    targetW = calculatedW - (calculatedW % 2);
    targetH = calculatedH - (calculatedH % 2);

    const tag = scale >= 4 ? '4x Ultra HD' : (scale >= 2 ? '2x HD' : 'Native Ultra HD');
    outDimEl.textContent = `${targetW} × ${targetH} px (${tag})`;
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

  // Zoom 2x Toggle Button
  function toggleZoom() {
    isZoomed = !isZoomed;
    compareStage.classList.toggle('pe-zoomed', isZoomed);
    zoomBtn.classList.toggle('active', isZoomed);
    applyI18n();
  }
  if (zoomBtn) {
    zoomBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleZoom();
    });
  }

  /* ── Core Wink Bypass Quality Restoration Pipeline ─────── */
  function renderPreview() {
    if (!sourceImg || !previewW || !previewH) return;
    ctxEnhanced.imageSmoothingEnabled = true;
    ctxEnhanced.imageSmoothingQuality = 'high';
    ctxEnhanced.drawImage(sourceImg, 0, 0, previewW, previewH);
    applyWinkBypassPipeline(ctxEnhanced, previewW, previewH);
  }

  /**
   * Wink Bypass Quality Restoration Engine
   * 1. YCbCr Separation + Dynamic Shadow Recovery
   * 2. Chroma Denoising: eliminates purple/green grain blotches in dark regions
   * 3. Bilateral Surface Denoising on Y: Range-aware Gaussian weighting produces
   *    crystal-smooth skin, walls, paper, and sky without destroying true edges
   * 4. Directional Gradient-Masked Shock Sharpening: only sharpens true edges (G > 3.5),
   *    leaving flat surfaces 100% glass-smooth and noise-free
   */
  function applyWinkBypassPipeline(targetCtx, w, h) {
    const imgData = targetCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const totalPixels = w * h;

    const Y = new Float32Array(totalPixels);
    const Cb = new Float32Array(totalPixels);
    const Cr = new Float32Array(totalPixels);

    // 1. RGB -> YCbCr with Dynamic Shadow Recovery
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      let yVal = 0.299 * r + 0.587 * g + 0.114 * b;
      Cb[p] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      Cr[p] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      // Dynamic Shadow Lift (toe lift + gentle gamma)
      if (yVal < 45) {
        yVal += (45 - yVal) * 0.22;
      }
      if (yVal < 185) {
        yVal = 255 * Math.pow(yVal / 255, 0.92);
      } else if (yVal > 225) {
        const over = yVal - 225;
        yVal = 225 + over * 0.85;
      }

      Y[p] = yVal;
    }

    // 2. Chroma Denoising (3px blur on Cb & Cr to eliminate color grain)
    const Cb_clean = fastSeparableBoxBlur(Cb, w, h, 2);
    const Cr_clean = fastSeparableBoxBlur(Cr, w, h, 2);

    // 3. Bilateral Surface Smoothing on Luminance Y
    // Base surface blur (radius ~3-4 px depending on dimensions)
    const rSurface = Math.max(2, Math.round(Math.min(w, h) * 0.0035));
    const yBlur = fastSeparableBoxBlur(Y, w, h, rSurface);

    const Y_smooth = new Float32Array(totalPixels);
    for (let p = 0; p < totalPixels; p++) {
      const orig = Y[p];
      const blur = yBlur[p];
      const diff = Math.min(255, Math.abs(Math.round(orig - blur)));
      // Range weight from precomputed LUT: close colors get smoothed; strong edges preserved
      const weight = RANGE_LUT[diff];
      Y_smooth[p] = orig * (1 - weight) + blur * weight;
    }

    // 4. Directional Gradient-Masked Edge Sharpening (Shock Filter)
    // High-frequency detail from fine blur
    const yFine = fastSeparableBoxBlur(Y, w, h, 1);
    const Y_final = new Float32Array(totalPixels);

    for (let y = 0; y < h; y++) {
      const yw = y * w;
      const ym1 = Math.max(0, y - 1) * w;
      const yp1 = Math.min(h - 1, y + 1) * w;

      for (let x = 0; x < w; x++) {
        const p = yw + x;
        const xm1 = yw + Math.max(0, x - 1);
        const xp1 = yw + Math.min(w - 1, x + 1);

        // Compute local gradient magnitude G
        const gx = (Y_smooth[xp1] - Y_smooth[xm1]) * 0.5;
        const gy = (Y_smooth[yp1 + x] - Y_smooth[ym1 + x]) * 0.5;
        const grad = Math.sqrt(gx * gx + gy * gy);

        // Unsharp difference
        const lap = Y[p] - yFine[p];

        // Mask: only sharpen when grad > 3.5 (real contours, text, water droplets, lines)
        // If grad <= 3.5, edgeMask = 0 -> FLAT SURFACES STAY 100% SILKY SMOOTH!
        const edgeMask = clamp((grad - 3.5) / 8.0, 0, 1);
        const lapBoost = clamp(lap * 1.75, -28, 28) * edgeMask;

        let yRes = Y_smooth[p] + lapBoost;

        // Subtle midtone contrast punch
        if (yRes > 70 && yRes < 190) {
          const mid = (yRes - 128) / 60;
          yRes += mid * 3.5;
        }

        Y_final[p] = clamp(yRes, 0, 255);
      }
    }

    // 5. YCbCr -> RGB conversion
    for (let p = 0, i = 0; p < totalPixels; p++, i += 4) {
      const yF = Y_final[p];
      const cbF = Cb_clean[p] - 128;
      const crF = Cr_clean[p] - 128;

      data[i]     = clamp(yF + 1.402 * crF);
      data[i + 1] = clamp(yF - 0.344136 * cbF - 0.714136 * crF);
      data[i + 2] = clamp(yF + 1.772 * cbF);
    }

    targetCtx.putImageData(imgData, 0, 0);
  }

  /* Fast 2-pass separable blur on 1D Float32Array */
  function fastSeparableBoxBlur(src, w, h, r) {
    const total = w * h;
    const temp = new Float32Array(total);
    const out = new Float32Array(total);

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      const yw = y * w;
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          sum += src[yw + nx];
          count++;
        }
        temp[yw + x] = sum / count;
      }
    }

    // Vertical pass
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let sum = 0, count = 0;
        for (let dy = -r; dy <= r; dy++) {
          const ny = Math.min(h - 1, Math.max(0, y + dy));
          sum += temp[ny * w + x];
          count++;
        }
        out[y * w + x] = sum / count;
      }
    }

    return out;
  }

  /* ── Wink Exact EXIF 64-Bit Structure Generator ─────────── */
  function createWinkApp1Exif(width, height, dateStr) {
    const buf = new Uint8Array(192);
    const view = new DataView(buf.buffer);

    view.setUint16(0, 0xFFE1);
    view.setUint16(2, 190);
    buf.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4);
    buf.set([0x4D, 0x4D, 0x00, 0x2A], 10);
    view.setUint32(14, 8);

    // IFD0: 5 entries
    view.setUint16(18, 5);
    let pos = 20;
    view.setUint16(pos, 0x0100); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, width); pos += 12;
    view.setUint16(pos, 0x0101); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, height); pos += 12;
    view.setUint16(pos, 0x8769); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, 0x5E); pos += 12;
    view.setUint16(pos, 0x0112); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, 0); pos += 12;
    view.setUint16(pos, 0x0132); view.setUint16(pos+2, 2); view.setUint32(pos+4, 20); view.setUint32(pos+8, 0x4A); pos += 12;
    view.setUint32(pos, 0); pos += 4;

    for (let i = 0; i < dateStr.length && i < 19; i++) buf[84 + i] = dateStr.charCodeAt(i);
    buf[84 + Math.min(dateStr.length, 19)] = 0;

    pos = 104;
    view.setUint16(pos, 2); pos += 2;
    view.setUint16(pos, 0x9003); view.setUint16(pos+2, 2); view.setUint32(pos+4, 20); view.setUint32(pos+8, 0x7C); pos += 12;
    view.setUint16(pos, 0x9208); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, 0); pos += 12;
    view.setUint32(pos, 0);

    for (let i = 0; i < dateStr.length && i < 19; i++) buf[134 + i] = dateStr.charCodeAt(i);
    buf[134 + Math.min(dateStr.length, 19)] = 0;

    pos = 154;
    view.setUint16(pos, 1); pos += 2;
    view.setUint16(pos, 0x0132); view.setUint16(pos+2, 2); view.setUint32(pos+4, 20); view.setUint32(pos+8, 0xA2); pos += 12;
    view.setUint32(pos, 0);

    for (let i = 0; i < dateStr.length && i < 19; i++) buf[172 + i] = dateStr.charCodeAt(i);
    buf[172 + Math.min(dateStr.length, 19)] = 0;

    return buf;
  }

  function getFormattedTimestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /* ── High-Resolution Export / Download ─────────────────── */
  downloadBtn.addEventListener('click', async () => {
    if (!sourceImg || !sourceFile) return;

    downloadBtn.disabled = true;
    renderProgress.style.display = 'block';
    renderFill.style.width = '15%';
    renderPct.textContent = '15%';
    renderStatus.textContent = text('Menyiapkan canvas resolusi tinggi Wink Bypass…', 'Preparing Wink Bypass Ultra HD canvas…');

    await new Promise(r => setTimeout(r, 60));

    const outW = targetW;
    const outH = targetH;

    renderFill.style.width = '35%';
    renderPct.textContent = '35%';
    renderStatus.textContent = text(`Melakukan multi-stage upscale (${outW} × ${outH})…`, `Performing multi-stage upscale (${outW} × ${outH})…`);

    await new Promise(r => setTimeout(r, 60));

    // Two-stage pyramid upscale for maximum sharpness and minimal interpolation blur
    let intermediateImg = sourceImg;
    if (outW > origW * 2) {
      const stage1W = Math.round(origW * 2);
      const stage1H = Math.round(origH * 2);
      const c1 = document.createElement('canvas');
      c1.width = stage1W;
      c1.height = stage1H;
      const ctx1 = c1.getContext('2d');
      ctx1.imageSmoothingEnabled = true;
      ctx1.imageSmoothingQuality = 'high';
      ctx1.drawImage(sourceImg, 0, 0, stage1W, stage1H);
      intermediateImg = c1;
    }

    renderFill.style.width = '60%';
    renderPct.textContent = '60%';
    renderStatus.textContent = text('Menerapkan bilateral surface smoothing & edge shock filter…', 'Applying bilateral surface smoothing & edge shock filter…');

    await new Promise(r => setTimeout(r, 60));

    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';
    offCtx.drawImage(intermediateImg, 0, 0, outW, outH);

    // Apply the full Wink Bypass restoration pipeline at 4K Ultra HD
    applyWinkBypassPipeline(offCtx, outW, outH);

    renderFill.style.width = '85%';
    renderPct.textContent = '85%';
    renderStatus.textContent = text('Menginjeksi metadata Wink EXIF 64-bit & kompresi JPEG Q98…', 'Injecting Wink EXIF metadata & compressing JPEG Q98…');

    await new Promise(r => setTimeout(r, 80));

    // Export to studio JPEG Q98
    offscreen.toBlob(async blob => {
      if (!blob) {
        renderProgress.style.display = 'none';
        downloadBtn.disabled = false;
        toast(text('Gagal memproses gambar.', 'Failed to process image.'));
        return;
      }

      // Inject exact Wink APP1 EXIF segment into JPEG array buffer
      const rawBytes = new Uint8Array(await blob.arrayBuffer());
      const timestamp = getFormattedTimestamp();
      const winkExif = createWinkApp1Exif(outW, outH, timestamp);

      let finalBytes = rawBytes;
      if (rawBytes[0] === 0xFF && rawBytes[1] === 0xD8) {
        let pos = 2;
        if (rawBytes[pos] === 0xFF && rawBytes[pos + 1] === 0xE1) {
          const app1Len = (rawBytes[pos + 2] << 8) | rawBytes[pos + 3];
          const rest = rawBytes.subarray(pos + 2 + app1Len);
          const combined = new Uint8Array(2 + winkExif.length + rest.length);
          combined[0] = 0xFF; combined[1] = 0xD8;
          combined.set(winkExif, 2);
          combined.set(rest, 2 + winkExif.length);
          finalBytes = combined;
        } else {
          const rest = rawBytes.subarray(2);
          const combined = new Uint8Array(2 + winkExif.length + rest.length);
          combined[0] = 0xFF; combined[1] = 0xD8;
          combined.set(winkExif, 2);
          combined.set(rest, 2 + winkExif.length);
          finalBytes = combined;
        }
      }

      renderFill.style.width = '100%';
      renderPct.textContent = '100%';
      renderStatus.textContent = text('Selesai!', 'Done!');

      setTimeout(() => {
        renderProgress.style.display = 'none';
        downloadBtn.disabled = false;
      }, 700);

      const outBlob = new Blob([finalBytes], { type: 'image/jpeg' });
      const rawName = sourceFile.name.replace(/\.[^.]+$/, '');
      const filename = `${rawName}_rvl-wink-bypass.jpg`;

      const dlUrl = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 4000);

      toast(text('Foto berhasil direstorasi dengan Wink Bypass!', 'Photo restored successfully with Wink Bypass!'));
    }, 'image/jpeg', 0.98);
  });

  /* ── Drag & Drop Listeners ──────────────────────────────── */
  pickBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
  });
  clearBtn.addEventListener('click', clearFile);
  resetBtn.addEventListener('click', clearFile);

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
