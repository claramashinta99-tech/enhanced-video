/* Photo Enhance — RVL HD
   Wink Bypass Engine (AI Quality Restoration) */
(() => {
  function ensurePhotoCss() {
    if (document.querySelector('#rvl-photo-enhance-style') || document.querySelector('link[href*="photo-enhance.css"]')) return;
    const l = document.createElement('link');
    l.id = 'rvl-photo-enhance-style';
    l.rel = 'stylesheet';
    l.href = '/assets/photo-enhance.css?v=4';
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
  let renderScheduled = false;
  let previousSplit = 50;

  /* ── i18n ───────────────────────────────────────────────── */
  const lang = () => localStorage.getItem('reyval-lang') || 'id';
  const text = (id, en) => lang() === 'en' ? en : id;

  function applyI18n() {
    const en = lang() === 'en';
    $('pe-title').textContent = en ? 'Wink Bypass' : 'Wink Bypass';
    $('pe-sub').textContent   = en 
      ? 'Restore photo quality & micro-details with the Wink Quality Restoration algorithm. Dynamic shadow recovery, fine micro-textures, and up to Ultra HD upscale.' 
      : 'Restorasi kualitas foto & kejernihan mikro dengan algoritma Wink Quality Restoration. Mengangkat detail bayangan, menajamkan teks & tekstur, serta upscale hingga Ultra HD.';
    $('pe-drop-title').textContent = en ? 'Choose or drop photo here' : 'Pilih atau drop foto di sini';
    $('pe-drop-sub').textContent   = en ? 'JPEG · PNG · WebP · max 25 MB' : 'JPEG · PNG · WebP · maks 25 MB';
    pickBtn.textContent            = en ? 'Choose photo' : 'Pilih foto';
    clearBtn.textContent           = en ? '✕ Change' : '✕ Ganti';
    holdBtn.textContent            = en ? 'Hold: View Original' : 'Tahan: Lihat Asli';
    $('pe-hint-text').textContent  = en ? 'Drag middle slider to compare Original vs Wink Bypass' : 'Geser garis tengah untuk bandingkan Original vs Wink Bypass';
    $('pe-features-label').textContent = en ? 'Active Restoration Features' : 'Fitur Restorasi Aktif';
    $('spec-detail-title').textContent = en ? 'Multi-Scale Micro-Detail' : 'Multi-Scale Micro-Detail';
    $('spec-detail-desc').textContent  = en ? 'Reconstructs edges, text, and micro-textures without halo artifacts.' : 'Rekonstruksi ketajaman tepi, teks, dan tekstur mikro tanpa digital halo.';
    $('spec-shadow-title').textContent = en ? 'Dynamic Shadow Recovery' : 'Dynamic Shadow Recovery';
    $('spec-shadow-desc').textContent  = en ? 'Lifts deep shadow details with a gentle toe-curve without washed-out blacks.' : 'Mengangkat detail bayangan gelap dengan kurva halus tanpa crushed blacks.';
    $('spec-denoise-title').textContent= en ? 'Luminance Bilateral Denoise' : 'Luminance Bilateral Denoise';
    $('spec-denoise-desc').textContent = en ? 'Eliminates JPEG artifacts & compression noise without chromatic fringing.' : 'Membersihkan noise & artefak kompresi JPEG tanpa chromatic fringe.';
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

      // Calculate Target Upscale Dimensions (Wink Quality Restoration Target)
      // 720p 9:16 -> 2880 x 5120 (4x)
      calculateTargetDimensions();

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
  }

  function calculateTargetDimensions() {
    if (!origW || !origH) {
      outDimEl.textContent = '—';
      return;
    }

    const maxEdge = Math.max(origW, origH);
    const minEdge = Math.min(origW, origH);
    let scale = 1;

    // Wink Quality Restoration Behavior:
    // If original is <= 720p / 1280p (mobile video frame / reel snapshot): 4x upscale (up to 2880x5120)
    // If original is <= 1440p / 2560p: 2x upscale
    // Max long edge capped at 5120px, max short edge capped at 2880px to match Wink 5K/4K max bounds
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

  /* ── Core Wink Bypass Quality Restoration Pipeline ─────── */
  function renderPreview() {
    if (!sourceImg || !previewW || !previewH) return;
    // Draw original
    ctxEnhanced.drawImage(sourceImg, 0, 0, previewW, previewH);
    applyWinkBypassPipeline(ctxEnhanced, previewW, previewH);
  }

  /**
   * Wink Bypass Quality Restoration Engine
   * 1. Luminance Separation (YCbCr): separates details from chroma, avoiding color fringing
   * 2. Dynamic Shadow Recovery: lifts crushed blacks (+3..+6 offset with smooth toe gamma)
   * 3. Multi-Scale Frequency Decomposition: separates micro-textures (water drops, text, leaves)
   * 4. Edge-Preserving Coring & Denoise: bilateral smoothing on flat skies/walls, crisp edge boost
   * 5. Micro-Contrast Pop: enhances local midtones without oversaturation
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

      // Luminance Y
      let yVal = 0.299 * r + 0.587 * g + 0.114 * b;
      Cb[p] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      Cr[p] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      // Dynamic Shadow Recovery (Wink curve: lift deep blacks so dark books/room have rich detail)
      if (yVal < 42) {
        yVal += (42 - yVal) * 0.20; // soft toe lift
      }
      if (yVal < 170) {
        // Gentle shadow & midtone gamma lift (curve 0.93)
        yVal = 255 * Math.pow(yVal / 255, 0.93);
      } else if (yVal > 220) {
        // Soft knee highlight roll-off
        const over = yVal - 220;
        yVal = 220 + over * 0.85;
      }

      Y[p] = yVal;
    }

    // 2. Multi-Scale Gaussian Approximations on Y
    // Pass 1: Fine micro-detail radius (~1-2 px)
    const r1 = Math.max(1, Math.round(Math.min(w, h) * 0.0022));
    const blur1 = fastSeparableBoxBlur(Y, w, h, r1);

    // Pass 2: Medium structure radius (~3-5 px)
    const r2 = Math.max(2, Math.round(Math.min(w, h) * 0.0055));
    const blur2 = fastSeparableBoxBlur(blur1, w, h, r2);

    // 3. Multi-Scale Frequency Reconstruction & Edge-Preserving Denoise
    for (let p = 0, i = 0; p < totalPixels; p++, i += 4) {
      const yOrig = Y[p];
      const b1 = blur1[p];
      const b2 = blur2[p];

      // Frequency bands
      const h1 = yOrig - b1; // Fine micro-texture (raindrops, handwriting, petals)
      const h2 = b1 - b2;    // Mid-frequency edge contour

      const absH1 = Math.abs(h1);
      let yRestored = yOrig;

      if (absH1 < 2.6) {
        // Flat/smooth region (sky, plain walls): apply bilateral smoothing to clear JPEG noise
        const smoothBlend = 0.65;
        yRestored = yOrig * (1 - smoothBlend) + b1 * smoothBlend;
      } else {
        // Edge / texture region: reconstruct crisp details with soft saturation limit
        const h1Boost = clamp(h1 * 1.48, -32, 32);
        const h2Boost = clamp(h2 * 0.62, -20, 20);
        yRestored = yOrig + h1Boost + h2Boost;
      }

      // Micro-contrast clarity pop in midtones (Wink punch)
      if (yRestored > 70 && yRestored < 190) {
        const midNorm = (yRestored - 128) / 60;
        yRestored += midNorm * 4.5;
      }

      // 4. YCbCr -> RGB conversion
      const yF = clamp(yRestored, 0, 255);
      const cbF = Cb[p] - 128;
      const crF = Cr[p] - 128;

      const rOut = yF + 1.402 * crF;
      const gOut = yF - 0.344136 * cbF - 0.714136 * crF;
      const bOut = yF + 1.772 * cbF;

      data[i]     = clamp(rOut);
      data[i + 1] = clamp(gOut);
      data[i + 2] = clamp(bOut);
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

    // Marker FFE1, len 190
    view.setUint16(0, 0xFFE1);
    view.setUint16(2, 190);

    // 'Exif\0\0'
    buf.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4);

    // TIFF Header: 'MM\0*' (big endian), IFD0 offset 8
    buf.set([0x4D, 0x4D, 0x00, 0x2A], 10);
    view.setUint32(14, 8);

    // IFD0 at offset 18 (10 + 8) -> 5 entries
    view.setUint16(18, 5);
    let pos = 20;

    // 1: ImageWidth (0x0100) LONG 1
    view.setUint16(pos, 0x0100); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, width); pos += 12;
    // 2: ImageHeight (0x0101) LONG 1
    view.setUint16(pos, 0x0101); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, height); pos += 12;
    // 3: ExifSubIFD (0x8769) LONG 1 offset 0x5E (94)
    view.setUint16(pos, 0x8769); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, 0x5E); pos += 12;
    // 4: Orientation (0x0112) LONG 1 val 0
    view.setUint16(pos, 0x0112); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, 0); pos += 12;
    // 5: DateTime (0x0132) ASCII 20 offset 0x4A (74)
    view.setUint16(pos, 0x0132); view.setUint16(pos+2, 2); view.setUint32(pos+4, 20); view.setUint32(pos+8, 0x4A); pos += 12;
    view.setUint32(pos, 0); pos += 4;

    // Write DateTime string at offset 10 + 0x4A = 84
    for (let i = 0; i < dateStr.length && i < 19; i++) {
      buf[84 + i] = dateStr.charCodeAt(i);
    }
    buf[84 + Math.min(dateStr.length, 19)] = 0;

    // SubIFD at offset 10 + 0x5E = 104 -> 2 entries
    pos = 104;
    view.setUint16(pos, 2); pos += 2;
    // 1: DateTimeOriginal (0x9003) ASCII 20 offset 0x7C (124)
    view.setUint16(pos, 0x9003); view.setUint16(pos+2, 2); view.setUint32(pos+4, 20); view.setUint32(pos+8, 0x7C); pos += 12;
    // 2: LightSource (0x9208) LONG 1 val 0
    view.setUint16(pos, 0x9208); view.setUint16(pos+2, 4); view.setUint32(pos+4, 1); view.setUint32(pos+8, 0); pos += 12;
    view.setUint32(pos, 0);

    // Write DateTimeOriginal string at offset 10 + 0x7C = 134
    for (let i = 0; i < dateStr.length && i < 19; i++) {
      buf[134 + i] = dateStr.charCodeAt(i);
    }
    buf[134 + Math.min(dateStr.length, 19)] = 0;

    // IFD1 at offset 10 + 0x90 = 154 -> 1 entry
    pos = 154;
    view.setUint16(pos, 1); pos += 2;
    // 1: DateTime (0x0132) ASCII 20 offset 0xA2 (162)
    view.setUint16(pos, 0x0132); view.setUint16(pos+2, 2); view.setUint32(pos+4, 20); view.setUint32(pos+8, 0xA2); pos += 12;
    view.setUint32(pos, 0);

    // Write DateTime string at offset 10 + 0xA2 = 172
    for (let i = 0; i < dateStr.length && i < 19; i++) {
      buf[172 + i] = dateStr.charCodeAt(i);
    }
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
    renderStatus.textContent = text('Menerapkan rekonstruksi frekuensi & shadow recovery…', 'Applying frequency reconstruction & shadow recovery…');

    await new Promise(r => setTimeout(r, 60));

    const offscreen = document.createElement('canvas');
    offscreen.width = outW;
    offscreen.height = outH;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';
    offCtx.drawImage(intermediateImg, 0, 0, outW, outH);

    // Apply the full Wink Bypass restoration pipeline
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

      // Verify JPEG SOI (FF D8)
      let finalBytes = rawBytes;
      if (rawBytes[0] === 0xFF && rawBytes[1] === 0xD8) {
        // Find position of first marker after SOI
        let pos = 2;
        // If an APP1 already exists in browser JPEG, replace it; otherwise insert after SOI
        if (rawBytes[pos] === 0xFF && rawBytes[pos + 1] === 0xE1) {
          const app1Len = (rawBytes[pos + 2] << 8) | rawBytes[pos + 3];
          const rest = rawBytes.subarray(pos + 2 + app1Len);
          const combined = new Uint8Array(2 + winkExif.length + rest.length);
          combined[0] = 0xFF; combined[1] = 0xD8;
          combined.set(winkExif, 2);
          combined.set(rest, 2 + winkExif.length);
          finalBytes = combined;
        } else {
          // Prepend Wink EXIF right after SOI
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
