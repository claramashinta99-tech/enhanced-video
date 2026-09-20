const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let file = null, previewURL = null, resultURL = null, target = 'feed', ffmpeg = null, ffmpegLoaded = false, lang = localStorage.getItem('reyval-lang') || 'id', currentPreview = 'original', busy = false;

const copy = {
  id: {
    sub: 'Alat untuk menyiapkan video sebelum upload ke TikTok supaya kualitasnya tetap semaksimal mungkin dan terlihat jernih / HD.',
    source: 'Video',
    local: 'PROSES LOKAL',
    drop: 'Pilih video',
    dropSub: 'MP4 atau MOV · bisa drag & drop',
    target: 'Preview untuk',
    targetHint: 'Cuma mengubah panduan preview.',
    safeTop: 'Area aman',
    safeHint: 'Biar UI platform nggak nutup bagian penting.',
    privacy: 'Video tetap di perangkat lu.',
    process: 'Optimasi Video',
    preview: 'Preview',
    empty: 'Pilih video dulu.',
    safe: 'Area aman',
    original: 'Asli',
    result: 'Hasil',
    resolution: 'Resolusi',
    duration: 'Durasi',
    size: 'Ukuran',
    notice: 'TikTok tetap bisa melakukan kompresi setelah upload. TikTok Method membantu menyiapkan wadah MP4 agar kompatibel dengan jalur HD platform.',
    loading: 'Menyiapkan engine lokal…',
    processing: 'Memproses transcode & patching wadah MP4…',
    ready: 'Selesai.',
    download: 'Download MP4 ↓',
    failed: 'Proses gagal. Gunakan file video MP4 atau MOV.',
    statusSuccess: 'Selesai · HD Ready',
    invalid: 'Pilih file MP4 atau MOV.'
  },
  en: {
    sub: 'Prepare video before uploading to TikTok so the quality stays clean / HD.',
    source: 'Video',
    local: 'LOCAL PROCESSING',
    drop: 'Choose a video',
    dropSub: 'MP4 or MOV · drag & drop works too',
    target: 'Preview for',
    targetHint: 'Only changes the preview guide.',
    safeTop: 'Safe area',
    safeHint: 'Keeps important content clear of platform UI.',
    privacy: 'Your video stays on your device.',
    process: 'Optimize Video',
    preview: 'Preview',
    empty: 'Choose a video first.',
    safe: 'Safe area',
    original: 'Original',
    result: 'Result',
    resolution: 'Resolution',
    duration: 'Duration',
    size: 'Size',
    notice: 'TikTok may still compress media after upload. TikTok Method formats the MP4 container for HD ingestion.',
    loading: 'Loading local engine…',
    processing: 'Transcoding & applying container patch…',
    ready: 'Done.',
    download: 'Download MP4 ↓',
    failed: 'Processing failed. Use an MP4 or MOV file.',
    statusSuccess: 'Done · HD Ready',
    invalid: 'Choose an MP4 or MOV file.'
  }
};

function t() { return copy[lang] || copy.id; }

function applyLang() {
  lang = localStorage.getItem('reyval-lang') || 'id';
  const c = t();
  const setTxt = (sel, val) => { const el = $(sel); if (el && val) el.textContent = val; };
  setTxt('#clarity-sub', c.sub);
  setTxt('#source-title', c.source);
  setTxt('#local-only', c.local);
  setTxt('#drop-title', c.drop);
  setTxt('#drop-sub', c.dropSub);
  setTxt('#target-label', c.target);
  setTxt('#target-hint', c.targetHint);
  setTxt('#safe-label-top', c.safeTop);
  setTxt('#safe-hint', c.safeHint);
  setTxt('#privacy-note', c.privacy);
  setTxt('#process-label', c.process);
  setTxt('#preview-title', c.preview);
  setTxt('#preview-empty-text', c.empty);
  setTxt('#safe-label', c.safe);
  setTxt('#show-original', c.original);
  setTxt('#show-result', c.result);
  setTxt('#spec-resolution-label', c.resolution);
  setTxt('#spec-duration-label', c.duration);
  setTxt('#spec-size-label', c.size);
  setTxt('#notice', c.notice);
  if ($('#result')?.classList.contains('show')) {
    setTxt('#download', c.download);
  }
}
window.addEventListener('reyval:lang', applyLang);
document.addEventListener('DOMContentLoaded', applyLang);

function formatBytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function formatDuration(s) {
  if (!isFinite(s)) return '—';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2300);
}

function setProgress(pct, text) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  const fill = $('#progress-fill');
  const pctEl = $('#progress-pct');
  const txtEl = $('#progress-text');
  if (fill) fill.style.width = safe + '%';
  if (pctEl) pctEl.textContent = safe + '%';
  if (txtEl && text) txtEl.textContent = text;
}

function showPreview(source) {
  if (source === 'result' && !resultURL) return;
  const v = $('#preview');
  if (!v) return;
  const nextURL = source === 'result' ? resultURL : previewURL;
  if (!nextURL) return;
  const time = isFinite(v.currentTime) ? v.currentTime : 0;
  const wasPlaying = !v.paused;
  currentPreview = source;
  $$('#preview-source-toggle button').forEach(b => b.classList.toggle('active', b.dataset.source === source));
  v.src = nextURL;
  v.classList.add('show');
  v.onloadedmetadata = () => {
    try { v.currentTime = Math.min(time, Math.max(0, (v.duration || time) - .05)); } catch {}
    if (source === 'original') {
      const res = $('#resolution'), dur = $('#duration');
      if (res) res.textContent = `${v.videoWidth} × ${v.videoHeight}`;
      if (dur) dur.textContent = formatDuration(v.duration);
    }
    if (wasPlaying) v.play().catch(() => {});
  };
}

function resetResult() {
  if (resultURL) {
    URL.revokeObjectURL(resultURL);
    resultURL = null;
  }
  $('#result')?.classList.remove('show');
  $('#progress-wrap')?.classList.remove('show');
  setProgress(0);
  const showRes = $('#show-result');
  if (showRes) showRes.disabled = true;
  if (currentPreview === 'result' && previewURL) showPreview('original');
}

function clearFile() {
  if (busy) return;
  file = null;
  resetResult();
  const fi = $('#file-input'); if (fi) fi.value = '';
  $('#file-meta')?.classList.remove('show');
  const proc = $('#process'); if (proc) proc.disabled = true;
  const v = $('#preview');
  if (v) {
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.classList.remove('show');
  }
  const ep = $('#empty-preview'); if (ep) ep.style.display = 'block';
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null;
  currentPreview = 'original';
  const res = $('#resolution'), dur = $('#duration'), sz = $('#size');
  if (res) res.textContent = '—';
  if (dur) dur.textContent = '—';
  if (sz) sz.textContent = '—';
  $$('#preview-source-toggle button').forEach(b => b.classList.toggle('active', b.dataset.source === 'original'));
}

function loadFile(f) {
  if (!f || busy) return;
  if (!/\.(mp4|mov|mkv|webm)$/i.test(f.name)) {
    toast(t().invalid);
    return;
  }
  file = f;
  resetResult();
  const fn = $('#file-name'), fi = $('#file-info'), sz = $('#size');
  if (fn) fn.textContent = f.name;
  if (fi) fi.textContent = formatBytes(f.size);
  $('#file-meta')?.classList.add('show');
  const proc = $('#process'); if (proc) proc.disabled = false;
  if (sz) sz.textContent = formatBytes(f.size);
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = URL.createObjectURL(f);
  const ep = $('#empty-preview'); if (ep) ep.style.display = 'none';
  showPreview('original');
}

$('#dropzone')?.addEventListener('click', () => { if (!busy) $('#file-input')?.click(); });
$('#dropzone')?.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && !busy) {
    e.preventDefault();
    $('#file-input')?.click();
  }
});
$('#file-input')?.addEventListener('change', e => loadFile(e.target.files[0]));
$('#clear-file')?.addEventListener('click', e => { e.stopPropagation(); clearFile(); });

['dragenter', 'dragover'].forEach(evt => $('#dropzone')?.addEventListener(evt, e => {
  e.preventDefault();
  if (!busy) $('#dropzone')?.classList.add('drag');
}));
['dragleave', 'drop'].forEach(evt => $('#dropzone')?.addEventListener(evt, e => {
  e.preventDefault();
  $('#dropzone')?.classList.remove('drag');
}));
$('#dropzone')?.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));

$$('#target button').forEach(btn => btn.addEventListener('click', () => {
  if (busy) return;
  target = btn.dataset.target;
  $$('#target button').forEach(x => x.classList.toggle('active', x === btn));
  const pml = $('#preview-mode-label'); if (pml) pml.textContent = target.toUpperCase();
}));

function setSafeArea(on) {
  $('#safe-guides')?.classList.toggle('show', on);
  $('#safe-toggle')?.classList.toggle('on', on);
  $$('#safe-segment button').forEach(b => b.classList.toggle('active', (b.dataset.safe === 'on') === on));
}
$('#safe-toggle')?.addEventListener('click', () => setSafeArea(!$('#safe-toggle')?.classList.contains('on')));
$$('#safe-segment button').forEach(btn => btn.addEventListener('click', () => setSafeArea(btn.dataset.safe === 'on')));
$$('#preview-source-toggle button').forEach(btn => btn.addEventListener('click', () => showPreview(btn.dataset.source)));

/* =========================================================
   FFmpeg WebAssembly Loader
========================================================= */
async function toBlobURL(url, mimeType) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const b = await r.blob();
  return URL.createObjectURL(new Blob([b], { type: mimeType }));
}

async function toPatchedBlobURL(url, mimeType) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  let js = await r.text();
  js = js.replace('new URL(e.p+e.u(814),e.b)', 'r.workerLoadURL');
  return URL.createObjectURL(new Blob([js], { type: mimeType }));
}

async function loadFFmpegFrom(baseMain, baseCore) {
  if (!window.FFmpegWASM) {
    const mainURL = await toPatchedBlobURL(`${baseMain}/ffmpeg.js`, 'text/javascript');
    await import(mainURL);
  }
  if (!window.FFmpegWASM?.FFmpeg) throw new Error('FFmpegWASM global missing');
  ffmpeg = new window.FFmpegWASM.FFmpeg();
  ffmpeg.on('progress', ({ progress }) => setProgress(Math.max(10, Math.min(85, (progress || 0) * 100))));
  const workerLoadURL = await toBlobURL(`${baseMain}/814.ffmpeg.js`, 'text/javascript');
  const coreURL = await toBlobURL(`${baseCore}/ffmpeg-core.js`, 'text/javascript');
  const wasmURL = await toBlobURL(`${baseCore}/ffmpeg-core.wasm`, 'application/wasm');
  await ffmpeg.load({ workerLoadURL, coreURL, wasmURL });
}

async function ensureFFmpeg() {
  if (ffmpegLoaded) return;
  const sources = [
    ['https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/dist/umd', 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.3/dist/umd'],
    ['https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/dist/umd', 'https://unpkg.com/@ffmpeg/core@0.12.3/dist/umd']
  ];
  let lastErr;
  for (const [main, core] of sources) {
    try {
      await loadFFmpegFrom(main, core);
      ffmpegLoaded = true;
      return;
    } catch (err) {
      console.warn('FFmpeg source fallback:', main, err);
      lastErr = err;
      try { ffmpeg?.terminate?.(); } catch {}
      ffmpeg = null;
    }
  }
  throw lastErr || new Error('Unable to load FFmpeg engine');
}

async function execChecked(args) {
  const code = await ffmpeg.exec(args);
  if (typeof code === 'number' && code !== 0) throw new Error(`FFmpeg error (code ${code})`);
}

async function deleteLocal(name) {
  try { await ffmpeg.deleteFile(name); } catch {}
}

/* =========================================================
   Bit-Perfect Vague Pulse MP4 Atom Engine
========================================================= */
const y = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf", "edts", "udta", "meta", "ilst"]);
const w = [v("avc1"), v("hvc1"), v("hev1"), v("vp09"), v("av01")];

function v(t) {
  let e = new Uint8Array(t.length);
  for (let r = 0; r < t.length; r += 1) e[r] = 255 & t.charCodeAt(r);
  return e;
}
function E(t, e = 0, r = t.length) {
  let n = "";
  for (let i = e; i < r; i += 1) n += String.fromCharCode(t[i]);
  return n;
}
function T(t, e) {
  return new DataView(t.buffer, t.byteOffset, t.byteLength).getUint32(e, false);
}
function F(t, e, r) {
  new DataView(t.buffer, t.byteOffset, t.byteLength).setUint32(r, e >>> 0, false);
}
function R(t, e) {
  return new DataView(t.buffer, t.byteOffset, t.byteLength).getBigUint64(e, false);
}
function L(t, e, r) {
  new DataView(t.buffer, t.byteOffset, t.byteLength).setBigUint64(r, BigInt(e), false);
}
function k(t) {
  let e = new Uint8Array(t.reduce((t, e) => t + e.length, 0)), r = 0;
  for (let n of t) e.set(n, r), r += n.length;
  return e;
}
function V(t, e, r, n) {
  return k([t.subarray(0, e), n, t.subarray(e + r)]);
}
function* j(t, e = 0, r = t.length) {
  let n = e;
  for (; n + 8 <= r; ) {
    let e, i = T(t, n), o = E(t, n + 4, n + 8);
    if (i < 8 && i !== 0 && i !== 1) break;
    1 === i ? (i = Number(R(t, n + 8)), e = n + 16) : (0 === i && (i = r - n), e = n + 8);
    "meta" === o && (e = n + 12);
    yield { btype: o, p: n, size: i, cstart: e, cend: n + i };
    n += i;
  }
}
function W(t, e, r = 0, n = t.length) {
  if (!e.length) return null;
  for (let i of j(t, r, n)) {
    if (i.btype === e[0]) {
      if (1 === e.length) return i;
      let r = W(t, e.slice(1), i.cstart, i.cend);
      if (r) return r;
    }
  }
  return null;
}
function findNodes(t, e, r = 0, n = t.length, i = []) {
  for (let o of j(t, r, n)) {
    o.btype === e && i.push(o);
    y.has(o.btype) && findNodes(t, e, o.cstart, o.cend, i);
  }
  return i;
}
function q(t, e, r = 0, n = t.length, i = []) {
  for (let o of j(t, r, n)) {
    if (0 === o.size) {
      o.p <= e && e < n && i.push(o.p);
      continue;
    }
    if (o.p <= e && e < o.cend) {
      i.push(o.p);
      q(t, e, o.cstart, o.cend, i);
      break;
    }
  }
  return i;
}
function X(t, e) {
  return W(t, ["mdia", "minf", "stbl", "stco"], e.cstart, e.cend) || W(t, ["mdia", "minf", "stbl", "co64"], e.cstart, e.cend);
}
function Y(t, e) {
  let r = T(t, e.cstart + 4), n = [], i = "co64" === e.btype ? 8 : 4, o = e.cstart + 8;
  for (let e = 0; e < r; e += 1) n.push(8 === i ? Number(R(t, o)) : T(t, o)), o += i;
  return { count: r, offsets: n, entrySize: i };
}
function Z(t, e) {
  return 1 === t[e.cstart] ? e.cstart + 20 : e.cstart + 12;
}
function H(t, e) {
  for (let r of [...findNodes(t, "stco"), ...findNodes(t, "co64")]) {
    let { count: n, entrySize: i } = Y(t, r), o = r.cstart + 8;
    for (let r = 0; r < n; r += 1) 8 === i ? L(t, Number(R(t, o)) + e, o) : F(t, T(t, o) + e, o), o += i;
  }
}
function K(t, e, r) {
  var n, i;
  let o = r.length - e.size;
  for (let a of (n = t = V(t, e.p, e.size, r), i = e.p, F(n, r.length, i), q(t, e.p).slice(0, -1))) {
    F(t, T(t, a) + o, a);
  }
  return t;
}
function J(t, e) {
  let r = "string" == typeof t ? v(t) : t, n = new Uint8Array(8 + e.length);
  return F(n, n.length, 0), n.set(r, 4), n.set(e, 8), n;
}
function Q(t, e = 0) {
  let r = function(t) {
    let e = [], r = findNodes(t, "trak"), n = [v("mp4a"), v("ac-3"), v("ec-3"), v("Opus")];
    for (let i of r) {
      let r = W(t, ["mdia", "minf", "stbl", "stsd"], i.cstart, i.cend);
      if (!r) continue;
      let o = t.subarray(r.cstart, r.cend);
      n.some(t => {
        if (!t.length) return false;
        for (let e = 0; e <= o.length - t.length; e += 1) {
          let r = true;
          for (let n = 0; n < t.length; n += 1) if (o[e + n] !== t[n]) { r = false; break; }
          if (r) return true;
        }
        return false;
      }) && e.push(i);
    }
    return e;
  }(t);
  let n = e < 0 ? r.length + e : e;
  return r[n] || null;
}

function applyVaguePulsePatch(buffer, factor = 10, artist = "transcode.vague-infinity.com") {
  let p = buffer;

  // 1. Remove free and skip boxes
  p = function(t) {
    let e = W(t, ["mdat"]), r = e ? e.p : 1 / 0;
    for (let e of [...j(t, 0, t.length)].reverse()) {
      if ("free" !== e.btype && "skip" !== e.btype) continue;
      let n = e.p < r;
      t = V(t, e.p, e.size, new Uint8Array(0));
      n && H(t, -e.size);
    }
    return t;
  }(p);

  // 2. Normalize hdlr to VideoHandle / SoundHandle
  p = function(t) {
    var e, r, n;
    let i = [];
    for (let e of findNodes(t, "hdlr")) {
      let r = E(t, e.cstart + 8, e.cstart + 12);
      ("vide" === r || "soun" === r) && i.push({ box: e, type: r });
    }
    for (let { box: o, type: a } of (i.sort((t, e) => e.box.p - t.box.p), i)) {
      let i = "vide" === a ? v("VideoHandle\0") : v("SoundHandle\0");
      let s = o.cstart + 24, f = 0;
      for (; s + f < t.length && 0 !== t[s + f]; ) f += 1;
      let u = f + 1;
      if (u === i.length) continue;
      let l = u - i.length;
      for (let a of ((t = V(t, s + i.length, l, new Uint8Array(0))).set(i, s), e = t, r = o.p, F(e, o.size - l, r), q(t, o.p).slice(0, -1)))
        n = t, F(n, T(t, a) - l, a);
      H(t, -l);
    }
    return t;
  }(p);

  // 3. Strip edts from all tracks
  p = function(t) {
    let e = findNodes(t, "trak");
    for (let o of (e.sort((t, e) => e.p - t.p), e)) {
      let e = W(t, ["trak", "edts"], o.p, o.cend);
      if (e) {
        var r, n, i;
        for (let a of (r = t = V(t, e.p, e.size, new Uint8Array(0)), n = o.p, F(r, o.size - e.size, n), q(t, o.p).slice(0, -1)))
          i = t, F(i, T(t, a) - e.size, a);
        H(t, -e.size);
      }
    }
    return t;
  }(p);

  // 4. Duplicate audio track as Track 3
  p = function(t) {
    var e, r;
    let n = Q(t, 0), i = W(t, ["moov"]);
    if (!n || !i) return t;
    let o = findNodes(t, "trak"), a = 0;
    for (let e of o) {
      let r = W(t, ["tkhd"], e.cstart, e.cend);
      r && (a = Math.max(a, T(t, Z(t, r))));
    }
    let s = a + 1, f = t.slice(n.p, n.cend), u = W(f, ["tkhd"], 8, f.length);
    if (!u) return t;
    F(f, s, Z(f, u));
    e = t = V(t, i.cend, 0, f);
    r = i.p;
    F(e, i.size + f.length, r);
    H(t, f.length);
    let l = W(t, ["moov", "mvhd"]);
    if (l) {
      let e = 1 === t[l.cstart] ? l.cstart + 108 : l.cstart + 96;
      F(t, s + 1, e);
    }
    return t;
  }(p);

  // 5. Strip edts from duplicated track
  p = function(t, e = 0) {
    let r = Q(t, e);
    if (!r) return t;
    let n = W(t, ["edts"], r.cstart, r.cend);
    if (!n) return t;
    for (let e of q(t = V(t, n.p, n.size, new Uint8Array(0)), n.p).slice(0, -1)) {
      var i;
      i = t, F(i, T(t, e) - n.size, e);
    }
    return H(t, -n.size), t;
  }(p, -1);

  // 6. Factor 10 patch on Track 3
  p = function(t, e = 10, r = -1) {
    var n;
    let i, o, a = Q(t, r);
    if (!a) return t;
    let s = W(t, ["mdia", "minf", "stbl", "stsz"], a.cstart, a.cend),
        f = W(t, ["mdia", "minf", "stbl", "stsc"], a.cstart, a.cend),
        u = X(t, a);
    if (!s || !f || !u) return t;
    let l = T(t, s.cstart + 4), c = T(t, s.cstart + 8),
        h = Y(t, u), p_chunks = h.count, d = h.entrySize, y_val = T(t, f.cstart + 4);
    if (0 !== l) return t;
    let g = c * (e - 1);
    if (g <= 0) return t;
    let m = 0, b = t.subarray(s.p, s.cend), w_box = new Uint8Array(b.length + 4 * g);
    w_box.set(b);
    F(w_box, c + g, 16);
    for (let t = b.length; t < w_box.length; t += 4) F(w_box, 8, t);
    t = K(t, s, w_box);
    m += w_box.length - b.length;

    let v_trk = Q(t, r);
    if (!v_trk) return t;
    let E_stco = X(t, v_trk);
    if (!E_stco) return t;
    let A = t.subarray(E_stco.p, E_stco.cend), U = new Uint8Array(A.length + d);
    U.set(A);
    F(U, p_chunks + 1, 12);
    8 === d ? L(U, 0, A.length) : F(U, 0, A.length);
    t = K(t, E_stco, U);
    m += d;

    v_trk = Q(t, r);
    if (!v_trk) return t;
    let B = W(t, ["mdia", "minf", "stbl", "stsc"], v_trk.cstart, v_trk.cend);
    if (!B) return t;
    let R_box = t.subarray(B.p, B.cend), k_box = new Uint8Array(R_box.length + 12);
    k_box.set(R_box);
    F(k_box, y_val + 1, 12);
    F(k_box, p_chunks + 1, R_box.length);
    F(k_box, g, R_box.length + 4);
    F(k_box, 1, R_box.length + 8);
    t = K(t, B, k_box);
    H(t, m += 12);

    let x = W(t, ["mdat"]);
    v_trk = Q(t, r);
    if (!v_trk) return t;
    let M = X(t, v_trk);
    if (!x || !M) return t;
    let O = x.cend;
    n = t;
    i = "co64" === M.btype ? 8 : 4;
    o = M.cstart + 8 + p_chunks * i;
    8 === i ? L(n, O, o) : F(n, O, o);
    let S = new Uint8Array(8 * g);
    for (let t = 0; t < g; t += 1) F(S, 4, 8 * t), F(S, 0, 8 * t + 4);
    return V(t, O, 0, S);
  }(p, factor, -1);

  // 7. Update stts for Track 3
  p = function(t, e = -1) {
    let r = Q(t, e);
    if (!r) return t;
    let n = W(t, ["mdia", "minf", "stbl", "stts"], r.cstart, r.cend),
        i = W(t, ["mdia", "minf", "stbl", "stsz"], r.cstart, r.cend);
    if (!n || !i) return t;
    let o = T(t, i.cstart + 8), a = T(t, n.cstart + 4), s = [], f = 0, u = n.cstart + 8;
    for (let e = 0; e < a; e += 1) {
      let e = T(t, u), r = T(t, u + 4);
      s.push([e, r]);
      f += e;
      u += 8;
    }
    let l = o - f;
    if (l <= 0) return t;
    let c = [], h = f;
    for (let [t, e] of s) {
      if (h <= 0) break;
      let r = Math.min(t, h);
      c.push([r, e]);
      h -= r;
    }
    c.push([l, 1]);
    let d = new Uint8Array(16 + 8 * c.length);
    let orig = t.subarray(n.p, n.cend);
    d.set(orig.subarray(0, Math.min(orig.length, d.length)));
    F(d, c.length, 12);
    u = 16;
    for (let [t, e] of c) {
      F(d, t, u);
      F(d, e, u + 4);
      u += 8;
    }
    t = K(t, n, d);
    H(t, d.length - orig.length);
    return t;
  }(p, -1);

  // 8. Strip old udta
  p = function(t) {
    var e, r;
    let n = W(t, ["moov"]);
    if (!n) return t;
    let i = W(t, ["moov", "udta"]);
    if (!i) return t;
    e = t = V(t, i.p, i.size, new Uint8Array(0));
    r = n.p;
    F(e, n.size - i.size, r);
    H(t, -i.size);
    return t;
  }(p);

  // 9. Inject udta
  let udta = function(t = artist) {
    let e = new TextEncoder().encode(t),
        r = J("data", k([new Uint8Array([0, 0, 0, 1]), new Uint8Array(4), e])),
        n = J(new Uint8Array([169, 65, 82, 84]), r),
        i = J("ilst", n),
        o = J("hdlr", k([new Uint8Array(8), v("mdir"), new Uint8Array(12), v("appl\0")])),
        a = J("meta", k([new Uint8Array(4), o, i]));
    return J("udta", a);
  }(artist);

  let moov = W(p, ["moov"]);
  if (moov) {
    let g = p = V(p, moov.cend, 0, udta);
    F(g, moov.size + udta.length, moov.p);
    H(p, udta.length);
  }

  return p;
}

function outputName() {
  const base = file.name.replace(/\.[^.]+$/, '');
  return `${base}-hd-ready.mp4`;
}

/* =========================================================
   Execution Handler
========================================================= */
$('#process')?.addEventListener('click', async () => {
  if (!file || busy) return;
  resetResult();
  const c = t();
  busy = true;
  const procBtn = $('#process');
  if (procBtn) procBtn.disabled = true;
  $('#progress-wrap')?.classList.add('show');
  setProgress(5, c.loading);

  let input = null;
  const tempOutput = 'temp_output.mp4';

  try {
    await ensureFFmpeg();
    setProgress(15, c.processing);

    const ext = file.name.split('.').pop().toLowerCase() || 'mp4';
    input = `input_${Date.now()}.${ext}`;
    await ffmpeg.writeFile(input, new Uint8Array(await file.arrayBuffer()));

    // 1. Remux with FFmpeg: copy video directly, standardize audio to 48kHz AAC, faststart isom
    let remuxSuccess = false;
    try {
      await execChecked([
        '-y',
        '-i', input,
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '346k',
        '-ar', '48000',
        '-ac', '2',
        '-movflags', '+faststart',
        '-brand', 'isom',
        '-map_metadata', '-1',
        '-metadata', 'artist=transcode.vague-infinity.com',
        '-f', 'mp4',
        tempOutput
      ]);
      remuxSuccess = true;
    } catch (errRemux) {
      console.warn('Video has no primary audio track, generating silent fallback stream:', errRemux);
      await deleteLocal(tempOutput);
      await execChecked([
        '-y',
        '-i', input,
        '-f', 'lavfi',
        '-t', '10',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '346k',
        '-ar', '48000',
        '-ac', '2',
        '-movflags', '+faststart',
        '-brand', 'isom',
        '-map_metadata', '-1',
        '-metadata', 'artist=transcode.vague-infinity.com',
        '-f', 'mp4',
        tempOutput
      ]);
      remuxSuccess = true;
    }

    if (!remuxSuccess) throw new Error('Remux stage failed');

    setProgress(85, 'Menerapkan patch struktur container HD…');

    // 2. Read remux output & apply bit-level dual-track pulse patch
    const rawOut = await ffmpeg.readFile(tempOutput);
    const rawBytes = rawOut instanceof Uint8Array ? rawOut : new Uint8Array(rawOut);
    let patchedBytes = rawBytes;
    try {
      patchedBytes = applyVaguePulsePatch(rawBytes, 10, 'transcode.vague-infinity.com');
    } catch (patchErr) {
      console.warn('Pulse patch fallback to clean faststart MP4:', patchErr);
    }

    // 3. Build downloadable Blob
    const blob = new Blob([patchedBytes], { type: 'video/mp4' });
    setProgress(100, c.ready);

    resultURL = URL.createObjectURL(blob);
    const dl = $('#download');
    if (dl) {
      dl.href = resultURL;
      dl.download = outputName();
      dl.textContent = c.download;
    }
    const rt = $('#result-title'), rm = $('#result-meta');
    if (rt) rt.textContent = c.ready;
    if (rm) rm.textContent = `${c.statusSuccess} · ${formatBytes(blob.size)}`;
    $('#result')?.classList.add('show');
    const sr = $('#show-result');
    if (sr) sr.disabled = false;
  } catch (err) {
    console.error('Clarity Processing Error:', err);
    toast(c.failed);
    const pt = $('#progress-text');
    if (pt) pt.textContent = `${c.failed} (${err.message || err})`;
  } finally {
    if (input) await deleteLocal(input);
    await deleteLocal(tempOutput);
    busy = false;
    if (procBtn) procBtn.disabled = !file;
  }
});
