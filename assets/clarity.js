/* RVL Engine - CompressBase Ultra-HD TikTok Ingestion Patch
   (c) 2026 RVL Media / Enhanced Video */

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
    process: 'Optimasi Video (CompressBase HD)',
    preview: 'Preview',
    empty: 'Pilih video dulu.',
    safe: 'Area aman',
    original: 'Asli',
    result: 'Hasil',
    resolution: 'Resolusi',
    duration: 'Durasi',
    size: 'Ukuran',
    notice: 'TikTok tetap bisa melakukan kompresi setelah upload. TikTok Method menyiapkan struktur MP4 (CompressBase Atom Hook) agar melewati re-encode berlebihan.',
    loading: 'Menyiapkan engine lokal…',
    processing: 'Memproses transcode & patching wadah MP4…',
    ready: 'Selesai.',
    download: 'Download MP4 ↓',
    failed: 'Proses gagal. Gunakan file video MP4 atau MOV.',
    statusSuccess: 'Selesai · CompressBase HD Ready',
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
    process: 'Optimize Video (CompressBase HD)',
    preview: 'Preview',
    empty: 'Choose a video first.',
    safe: 'Safe area',
    original: 'Original',
    result: 'Result',
    resolution: 'Resolution',
    duration: 'Duration',
    size: 'Size',
    notice: 'TikTok may still compress media after upload. TikTok Method prepares MP4 atoms (CompressBase Hook) to avoid aggressive re-encoding.',
    loading: 'Loading local engine…',
    processing: 'Transcoding & applying container patch…',
    ready: 'Done.',
    download: 'Download MP4 ↓',
    failed: 'Processing failed. Use an MP4 or MOV file.',
    statusSuccess: 'Done · CompressBase HD Ready',
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
   CompressBase Exact Binary Atom Engine
========================================================= */
const y = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf", "edts", "udta", "meta", "ilst"]);

function v(t) {
  const e = new Uint8Array(t.length);
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
  const e = new Uint8Array(t.reduce((acc, cur) => acc + cur.length, 0));
  let r = 0;
  for (const n of t) {
    e.set(n, r);
    r += n.length;
  }
  return e;
}
function V(t, e, r, n) {
  return k([t.subarray(0, e), n, t.subarray(e + r)]);
}
function* j(t, e = 0, r = t.length) {
  let n = e;
  while (n + 8 <= r) {
    let size = T(t, n);
    const btype = E(t, n + 4, n + 8);
    let cstart = n + 8;
    if (size < 8 && size !== 0 && size !== 1) break;
    if (size === 1) {
      size = Number(R(t, n + 8));
      cstart = n + 16;
    } else if (size === 0) {
      size = r - n;
      cstart = n + 8;
    }
    if (btype === "meta") {
      cstart = n + 12;
    }
    yield { btype, p: n, size, cstart, cend: n + size };
    n += size;
  }
}
function W(t, e, r = 0, n = t.length) {
  if (!e.length) return null;
  for (const i of j(t, r, n)) {
    if (i.btype === e[0]) {
      if (e.length === 1) return i;
      const res = W(t, e.slice(1), i.cstart, i.cend);
      if (res) return res;
    }
  }
  return null;
}
function findNodes(t, e, r = 0, n = t.length, i = []) {
  for (const o of j(t, r, n)) {
    if (o.btype === e) i.push(o);
    if (y.has(o.btype)) findNodes(t, e, o.cstart, o.cend, i);
  }
  return i;
}
function q(t, e, r = 0, n = t.length, i = []) {
  for (const o of j(t, r, n)) {
    if (o.size === 0) {
      if (o.p <= e && e < n) i.push(o.p);
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
  const r = T(t, e.cstart + 4);
  const n = [];
  const i = "co64" === e.btype ? 8 : 4;
  let o = e.cstart + 8;
  for (let idx = 0; idx < r; idx += 1) {
    n.push(i === 8 ? Number(R(t, o)) : T(t, o));
    o += i;
  }
  return { count: r, offsets: n, entrySize: i };
}
function Z(t, e) {
  return t[e.cstart] === 1 ? e.cstart + 20 : e.cstart + 12;
}
function H(t, e) {
  for (const r of [...findNodes(t, "stco"), ...findNodes(t, "co64")]) {
    const { count: n, entrySize: i } = Y(t, r);
    let o = r.cstart + 8;
    for (let idx = 0; idx < n; idx += 1) {
      if (i === 8) {
        L(t, Number(R(t, o)) + e, o);
      } else {
        F(t, T(t, o) + e, o);
      }
      o += i;
    }
  }
}
function K(t, e, r) {
  const o = r.length - e.size;
  t = V(t, e.p, e.size, r);
  F(t, r.length, e.p);
  for (const a of q(t, e.p).slice(0, -1)) {
    F(t, T(t, a) + o, a);
  }
  return t;
}
function Q(t, e = 0) {
  const audioTracks = [];
  const tracks = findNodes(t, "trak");
  const audioCodecs = [v("mp4a"), v("ac-3"), v("ec-3"), v("Opus")];
  for (const trk of tracks) {
    const stsd = W(t, ["mdia", "minf", "stbl", "stsd"], trk.cstart, trk.cend);
    if (!stsd) continue;
    const o = t.subarray(stsd.cstart, stsd.cend);
    const hasAudio = audioCodecs.some(codec => {
      if (!codec.length) return false;
      for (let idx = 0; idx <= o.length - codec.length; idx += 1) {
        let match = true;
        for (let c = 0; c < codec.length; c += 1) {
          if (o[idx + c] !== codec[c]) { match = false; break; }
        }
        if (match) return true;
      }
      return false;
    });
    if (hasAudio) audioTracks.push(trk);
  }
  const n = e < 0 ? audioTracks.length + e : e;
  return audioTracks[n] || null;
}

function applyCompressBasePatch(buffer, factor = 10) {
  let p = buffer;

  // 1. Remove free and skip boxes
  const mdatNode = W(p, ["mdat"]);
  const mdatPos = mdatNode ? mdatNode.p : Infinity;
  for (const box of [...j(p, 0, p.length)].reverse()) {
    if (box.btype !== "free" && box.btype !== "skip") continue;
    const isBeforeMdat = box.p < mdatPos;
    p = V(p, box.p, box.size, new Uint8Array(0));
    if (isBeforeMdat) H(p, -box.size);
  }

  // 2. Normalize hdlr to VideoHandler / SoundHandler
  const hdlrList = [];
  for (const box of findNodes(p, "hdlr")) {
    const subtype = E(p, box.cstart + 8, box.cstart + 12);
    if (subtype === "vide" || subtype === "soun") {
      hdlrList.push({ box, type: subtype });
    }
  }
  hdlrList.sort((a, b) => b.box.p - a.box.p);
  for (const { box, type } of hdlrList) {
    if (box.size === 41) continue; // Already exact VideoHandler/SoundHandler
    const targetName = type === "vide" ? v("VideoHandler\0") : v("SoundHandler\0");
    const strStart = box.p + 28;
    let currLen = 0;
    while (strStart + currLen < p.length && p[strStart + currLen] !== 0) currLen += 1;
    currLen += 1; // include null terminator
    if (currLen !== targetName.length) {
      const delta = currLen - targetName.length;
      p = V(p, strStart + targetName.length, delta, new Uint8Array(0));
      p.set(targetName, strStart);
      F(p, box.size - delta, box.p);
      for (const anc of q(p, box.p).slice(0, -1)) {
        F(p, T(p, anc) - delta, anc);
      }
      H(p, -delta);
    } else {
      p.set(targetName, strStart);
    }
  }

  // 3. Inject CompressBase udta into Track 1 (Video Track)
  const allTracks = findNodes(p, "trak");
  const vidTrack = allTracks.find(trk => {
    const hdlr = W(p, ["mdia", "hdlr"], trk.cstart, trk.cend);
    return hdlr && E(p, hdlr.cstart + 8, hdlr.cstart + 12) === "vide";
  }) || allTracks[0];

  if (vidTrack) {
    // Strip existing udta inside video track if any
    const existingUdta = W(p, ["udta"], vidTrack.cstart, vidTrack.cend);
    if (existingUdta) {
      p = V(p, existingUdta.p, existingUdta.size, new Uint8Array(0));
      F(p, vidTrack.size - existingUdta.size, vidTrack.p);
      for (const anc of q(p, vidTrack.p).slice(0, -1)) {
        F(p, T(p, anc) - existingUdta.size, anc);
      }
      H(p, -existingUdta.size);
    }

    // Exact CompressBase UDTA Box (171 bytes)
    const hexToBytes = hex => new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const CB_UDTA = hexToBytes("000000ab75647461000000a36d657461000000000000002168646c7200000000000000006d6469720000000000000000000000000000000076696c73740000003aa9746f6f00000032646174610000000100000000436f6d707265737362617365205175616c697479204d6574686f64202b204670730000000034a9636d740000002c6461746100000001000000005061746368656420627920436f6d7072657373626173652e636f6d00");

    // Refind vidTrack after potential shifts
    const freshVidTrack = findNodes(p, "trak").find(trk => {
      const hdlr = W(p, ["mdia", "hdlr"], trk.cstart, trk.cend);
      return hdlr && E(p, hdlr.cstart + 8, hdlr.cstart + 12) === "vide";
    }) || findNodes(p, "trak")[0];

    // Append CB_UDTA at the end of Track 1
    p = V(p, freshVidTrack.cend, 0, CB_UDTA);
    F(p, freshVidTrack.size + CB_UDTA.length, freshVidTrack.p);
    for (const anc of q(p, freshVidTrack.p).slice(0, -1)) {
      F(p, T(p, anc) + CB_UDTA.length, anc);
    }
    H(p, CB_UDTA.length);
  }

  // 4. Strip any udta directly under moov
  const moovUdta = W(p, ["moov", "udta"]);
  if (moovUdta) {
    const moovBox = W(p, ["moov"]);
    p = V(p, moovUdta.p, moovUdta.size, new Uint8Array(0));
    F(p, moovBox.size - moovUdta.size, moovBox.p);
    H(p, -moovUdta.size);
  }

  // 5. Duplicate audio track as Track 3 (Keeping edts on Track 1 & Track 2!)
  const origAudio = Q(p, 0);
  const moovNode = W(p, ["moov"]);
  if (!origAudio || !moovNode) return p;

  let maxTrackId = 0;
  for (const trk of findNodes(p, "trak")) {
    const tkhd = W(p, ["tkhd"], trk.cstart, trk.cend);
    if (tkhd) maxTrackId = Math.max(maxTrackId, T(p, Z(p, tkhd)));
  }
  const newTrackId = maxTrackId + 1; // 3

  // Slice audio track and strip edts & udta from duplicated track
  let track3Bytes = p.slice(origAudio.p, origAudio.cend);
  const edtsInTrack3 = W(track3Bytes, ["edts"], 8, track3Bytes.length);
  if (edtsInTrack3) {
    track3Bytes = V(track3Bytes, edtsInTrack3.p, edtsInTrack3.size, new Uint8Array(0));
    F(track3Bytes, track3Bytes.length, 0);
  }
  const udtaInTrack3 = W(track3Bytes, ["udta"], 8, track3Bytes.length);
  if (udtaInTrack3) {
    track3Bytes = V(track3Bytes, udtaInTrack3.p, udtaInTrack3.size, new Uint8Array(0));
    F(track3Bytes, track3Bytes.length, 0);
  }

  // Set Track 3 tkhd track_id
  const tkhdInTrack3 = W(track3Bytes, ["tkhd"], 8, track3Bytes.length);
  if (!tkhdInTrack3) return p;
  F(track3Bytes, newTrackId, Z(track3Bytes, tkhdInTrack3));

  // Insert Track 3 at moov.cend
  const freshMoov = W(p, ["moov"]);
  p = V(p, freshMoov.cend, 0, track3Bytes);
  F(p, freshMoov.size + track3Bytes.length, freshMoov.p);
  H(p, track3Bytes.length);

  // 6. Factor 10 patch on Track 3
  const track3Node = Q(p, -1);
  if (!track3Node) return p;

  const stszBox = W(p, ["mdia", "minf", "stbl", "stsz"], track3Node.cstart, track3Node.cend);
  const stscBox = W(p, ["mdia", "minf", "stbl", "stsc"], track3Node.cstart, track3Node.cend);
  const stcoBox = X(p, track3Node);
  if (!stszBox || !stscBox || !stcoBox) return p;

  const sampleSize = T(p, stszBox.cstart + 4);
  const sampleCount = T(p, stszBox.cstart + 8);
  const stcoInfo = Y(p, stcoBox);
  const origChunks = stcoInfo.count;
  const entrySize = stcoInfo.entrySize;
  const stscEntries = T(p, stscBox.cstart + 4);

  if (sampleSize !== 0) return p; // Must be variable sample size
  const extraSamples = sampleCount * (factor - 1); // e.g. count * 9
  if (extraSamples <= 0) return p;

  let totalMoovGrowth = 0;

  // A. Expand stsz in Track 3
  const origStszBytes = p.subarray(stszBox.p, stszBox.cend);
  const newStszBytes = new Uint8Array(origStszBytes.length + 4 * extraSamples);
  newStszBytes.set(origStszBytes);
  F(newStszBytes, sampleCount + extraSamples, 16); // new total sample count
  for (let off = origStszBytes.length; off < newStszBytes.length; off += 4) {
    F(newStszBytes, 8, off); // sample size = 8
  }
  p = K(p, stszBox, newStszBytes);
  totalMoovGrowth += newStszBytes.length - origStszBytes.length;

  // B. Expand stco / co64 in Track 3 (add 1 chunk pointing to mdat_end)
  let curT3 = Q(p, -1);
  let curStco = X(p, curT3);
  const origStcoBytes = p.subarray(curStco.p, curStco.cend);
  const newStcoBytes = new Uint8Array(origStcoBytes.length + entrySize);
  newStcoBytes.set(origStcoBytes);
  F(newStcoBytes, origChunks + 1, 12); // count + 1
  if (entrySize === 8) L(newStcoBytes, 0, origStcoBytes.length);
  else F(newStcoBytes, 0, origStcoBytes.length);
  p = K(p, curStco, newStcoBytes);
  totalMoovGrowth += entrySize;

  // C. Expand stsc in Track 3
  curT3 = Q(p, -1);
  const curStsc = W(p, ["mdia", "minf", "stbl", "stsc"], curT3.cstart, curT3.cend);
  const origStscBytes = p.subarray(curStsc.p, curStsc.cend);
  const newStscBytes = new Uint8Array(origStscBytes.length + 12);
  newStscBytes.set(origStscBytes);
  F(newStscBytes, stscEntries + 1, 12); // entries count + 1
  F(newStscBytes, origChunks + 1, origStscBytes.length); // first_chunk = origChunks + 1
  F(newStscBytes, extraSamples, origStscBytes.length + 4); // samples_per_chunk = extraSamples
  F(newStscBytes, 1, origStscBytes.length + 8); // sample_description_index = 1
  p = K(p, curStsc, newStscBytes);
  totalMoovGrowth += 12;

  // D. Update stts in Track 3
  curT3 = Q(p, -1);
  const curStts = W(p, ["mdia", "minf", "stbl", "stts"], curT3.cstart, curT3.cend);
  const origSttsBytes = p.subarray(curStts.p, curStts.cend);
  const origSttsCount = T(p, curStts.cstart + 4);
  const newSttsBytes = new Uint8Array(origSttsBytes.length + 8);
  newSttsBytes.set(origSttsBytes);
  F(newSttsBytes, origSttsCount + 1, 12); // entry count + 1
  F(newSttsBytes, extraSamples, origSttsBytes.length); // sample_count = extraSamples
  F(newSttsBytes, 1, origSttsBytes.length + 4); // sample_delta = 1
  p = K(p, curStts, newSttsBytes);
  totalMoovGrowth += 8;

  // Shift chunk offsets for the growth of stsz, stco, stsc, stts
  H(p, totalMoovGrowth);

  // 7. Update mvhd to Version 1 64-bit with duration = 0xFFFFFFFFFFFFFFFF
  const mvhdBox = W(p, ["moov", "mvhd"]);
  if (mvhdBox) {
    const newMvhd = new Uint8Array(120);
    F(newMvhd, 120, 0);
    newMvhd.set(v("mvhd"), 4);
    newMvhd[8] = 1; // version 1
    F(newMvhd, 1000, 28); // timescale = 1000
    L(newMvhd, 0xffffffffffffffffn, 32); // duration = UINT64_MAX
    F(newMvhd, 0x00010000, 40); // rate 1.0
    newMvhd[44] = 1; newMvhd[45] = 0; // volume 1.0
    // Identity matrix at offset 56
    newMvhd.set([
      0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00
    ], 56);
    F(newMvhd, 4, 116); // next_track_id = 4

    const mvhdDelta = newMvhd.length - mvhdBox.size;
    p = K(p, mvhdBox, newMvhd);
    H(p, mvhdDelta);
  }

  // 8. Point the last chunk of Track 3 to mdat.cend
  curT3 = Q(p, -1);
  curStco = X(p, curT3);
  const mdatNodeNow = W(p, ["mdat"]);
  if (curT3 && curStco && mdatNodeNow) {
    const mdatEnd = mdatNodeNow.cend;
    const is64 = curStco.btype === "co64";
    const entryByteSize = is64 ? 8 : 4;
    const targetOffset = curStco.cstart + 8 + origChunks * entryByteSize;
    if (is64) L(p, mdatEnd, targetOffset);
    else F(p, mdatEnd, targetOffset);
  }

  // 9. Append the crash buffer at mdat.cend (matching CompressBase: pattern 00 00 00 04 00 00 00 00 ending with 'free' atom)
  const mdatFinal = W(p, ["mdat"]);
  if (mdatFinal) {
    const crashSampleBytes = extraSamples * 8;
    const totalAppend = crashSampleBytes + 8;
    const crashBuf = new Uint8Array(totalAppend);
    for (let i = 0; i < crashSampleBytes; i += 8) {
      F(crashBuf, 4, i);
      F(crashBuf, 0, i + 4);
    }
    // Trailing 8 bytes: '\x00\x00\x00\x08free'
    F(crashBuf, 8, crashSampleBytes);
    crashBuf.set(v("free"), crashSampleBytes + 4);

    p = V(p, mdatFinal.cend, 0, crashBuf);
  }

  return p;
}

function outputName() {
  const base = file.name.replace(/\.[^.]+$/, '');
  return `${base}-compressbase-hd.mp4`;
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
        '-f', 'mp4',
        tempOutput
      ]);
      remuxSuccess = true;
    }

    if (!remuxSuccess) throw new Error('Remux stage failed');

    setProgress(85, 'Menerapkan patch CompressBase MP4…');

    // 2. Read remux output & apply bit-level CompressBase patch
    const rawOut = await ffmpeg.readFile(tempOutput);
    const rawBytes = rawOut instanceof Uint8Array ? rawOut : new Uint8Array(rawOut);
    let patchedBytes = rawBytes;
    try {
      patchedBytes = applyCompressBasePatch(rawBytes, 10);
    } catch (patchErr) {
      console.warn('CompressBase patch fallback to clean faststart MP4:', patchErr);
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