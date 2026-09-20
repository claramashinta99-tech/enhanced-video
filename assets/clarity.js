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
   MP4 Atom Manipulation & Dual-Track Pulse Patch
========================================================= */
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts', 'udta', 'meta', 'ilst']);

function strToBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 255;
  return out;
}

function bytesToStr(buf, start = 0, end = buf.length) {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(buf[i]);
  return s;
}

function r32(buf, off) {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(off, false);
}

function w32(buf, val, off) {
  new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setUint32(off, val >>> 0, false);
}

function r64(buf, off) {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getBigUint64(off, false);
}

function w64(buf, val, off) {
  new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setBigUint64(off, BigInt(val), false);
}

function concat(arrays) {
  const total = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const arr of arrays) {
    out.set(arr, off);
    off += arr.length;
  }
  return out;
}

function spliceBytes(buf, start, delLen, insertBuf) {
  return concat([buf.subarray(0, start), insertBuf, buf.subarray(start + delLen)]);
}

function* iterBoxes(buf, start = 0, end = buf.length) {
  let cur = start;
  while (cur + 8 <= end) {
    let sz = r32(buf, cur);
    const tag = bytesToStr(buf, cur + 4, cur + 8);
    let payload = cur + 8;
    if (sz === 1) {
      sz = Number(r64(buf, cur + 8));
      payload = cur + 16;
    } else if (sz === 0) {
      sz = end - cur;
      payload = cur + 8;
    }
    if (tag === 'meta') payload = cur + 12;
    yield { tag, start: cur, size: sz, payload, end: cur + sz };
    cur += sz;
  }
}

function findBoxByPath(buf, path, start = 0, end = buf.length) {
  if (!path.length) return null;
  for (const b of iterBoxes(buf, start, end)) {
    if (b.tag === path[0]) {
      if (path.length === 1) return b;
      const sub = findBoxByPath(buf, path.slice(1), b.payload, b.end);
      if (sub) return sub;
    }
  }
  return null;
}

function findAllBoxes(buf, tag, start = 0, end = buf.length, out = []) {
  for (const b of iterBoxes(buf, start, end)) {
    if (b.tag === tag) out.push(b);
    if (CONTAINER_BOXES.has(b.tag)) findAllBoxes(buf, tag, b.payload, b.end, out);
  }
  return out;
}

function getBoxAncestors(buf, targetOffset, start = 0, end = buf.length, ancestors = []) {
  for (const b of iterBoxes(buf, start, end)) {
    if (b.size === 0) {
      if (b.start <= targetOffset && targetOffset < end) ancestors.push(b.start);
      continue;
    }
    if (b.start <= targetOffset && targetOffset < b.end) {
      ancestors.push(b.start);
      getBoxAncestors(buf, targetOffset, b.payload, b.end, ancestors);
      break;
    }
  }
  return ancestors;
}

function getStcoBox(buf, trakBox) {
  return findBoxByPath(buf, ['mdia', 'minf', 'stbl', 'stco'], trakBox.payload, trakBox.end) ||
         findBoxByPath(buf, ['mdia', 'minf', 'stbl', 'co64'], trakBox.payload, trakBox.end);
}

function readChunkOffsets(buf, stcoBox) {
  const count = r32(buf, stcoBox.payload + 4);
  const entrySize = stcoBox.tag === 'co64' ? 8 : 4;
  const offsets = [];
  let off = stcoBox.payload + 8;
  for (let i = 0; i < count; i++) {
    offsets.push(entrySize === 8 ? Number(r64(buf, off)) : r32(buf, off));
    off += entrySize;
  }
  return { count, offsets, entrySize };
}

function adjustAllChunkOffsets(buf, delta) {
  for (const b of [...findAllBoxes(buf, 'stco'), ...findAllBoxes(buf, 'co64')]) {
    const { count, entrySize } = readChunkOffsets(buf, b);
    let off = b.payload + 8;
    for (let i = 0; i < count; i++) {
      if (entrySize === 8) {
        w64(buf, Number(r64(buf, off)) + delta, off);
      } else {
        w32(buf, r32(buf, off) + delta, off);
      }
      off += entrySize;
    }
  }
}

function replaceBoxAndUpdateAncestors(buf, oldBox, newBytes) {
  const diff = newBytes.length - oldBox.size;
  const spliced = spliceBytes(buf, oldBox.start, oldBox.size, newBytes);
  const ancestors = getBoxAncestors(spliced, oldBox.start).slice(0, -1);
  for (const anc of ancestors) {
    w32(spliced, r32(spliced, anc) + diff, anc);
  }
  return spliced;
}

function makeBox(tag, payload) {
  const tagBytes = typeof tag === 'string' ? strToBytes(tag) : tag;
  const out = new Uint8Array(8 + payload.length);
  w32(out, out.length, 0);
  out.set(tagBytes, 4);
  out.set(payload, 8);
  return out;
}

function getAudioTrack(buf, index = 0) {
  const tracks = findAllBoxes(buf, 'trak');
  const audioTracks = [];
  const audioCodecs = [strToBytes('mp4a'), strToBytes('ac-3'), strToBytes('ec-3'), strToBytes('Opus')];
  for (const trk of tracks) {
    const stsd = findBoxByPath(buf, ['mdia', 'minf', 'stbl', 'stsd'], trk.payload, trk.end);
    if (!stsd) continue;
    const stsdPayload = buf.subarray(stsd.payload, stsd.end);
    const hasAudioCodec = audioCodecs.some(c => {
      for (let i = 0; i <= stsdPayload.length - c.length; i++) {
        let match = true;
        for (let j = 0; j < c.length; j++) {
          if (stsdPayload[i + j] !== c[j]) { match = false; break; }
        }
        if (match) return true;
      }
      return false;
    });
    if (hasAudioCodec) audioTracks.push(trk);
  }
  const idx = index < 0 ? audioTracks.length + index : index;
  return audioTracks[idx] || null;
}

function getTrackIdOffset(buf, tkhdBox) {
  return buf[tkhdBox.payload] === 1 ? tkhdBox.payload + 20 : tkhdBox.payload + 12;
}

function applyVaguePulsePatch(buffer, factor = 10, artist = 'transcode.vague-infinity.com') {
  let p = buffer;

  // 1. Remove free and skip boxes
  p = (t => {
    const mdat = findBoxByPath(t, ['mdat']);
    const mdatStart = mdat ? mdat.start : Infinity;
    for (const b of [...iterBoxes(t, 0, t.length)].reverse()) {
      if (b.tag !== 'free' && b.tag !== 'skip') continue;
      const isBeforeMdat = b.start < mdatStart;
      t = spliceBytes(t, b.start, b.size, new Uint8Array(0));
      if (isBeforeMdat) adjustAllChunkOffsets(t, -b.size);
    }
    return t;
  })(p);

  // 2. Normalize hdlr to VideoHandle / SoundHandle
  p = (t => {
    const hdlrs = [];
    for (const b of findAllBoxes(t, 'hdlr')) {
      const htype = bytesToStr(t, b.payload + 8, b.payload + 12);
      if (htype === 'vide' || htype === 'soun') hdlrs.push({ box: b, type: htype });
    }
    hdlrs.sort((a, b) => b.box.start - a.box.start);
    for (const { box, type } of hdlrs) {
      const fixedName = type === 'vide' ? strToBytes('VideoHandle\0') : strToBytes('SoundHandle\0');
      const nameStart = box.payload + 24;
      let len = 0;
      while (nameStart + len < t.length && t[nameStart + len] !== 0) len++;
      const curLen = len + 1;
      if (curLen === fixedName.length) continue;
      const diff = curLen - fixedName.length;
      t = spliceBytes(t, nameStart + fixedName.length, diff, new Uint8Array(0));
      t.set(fixedName, nameStart);
      w32(t, box.size - diff, box.start);
      for (const anc of getBoxAncestors(t, box.start).slice(0, -1)) {
        w32(t, r32(t, anc) - diff, anc);
      }
      adjustAllChunkOffsets(t, -diff);
    }
    return t;
  })(p);

  // 3. Strip edts from all tracks
  p = (t => {
    const traks = findAllBoxes(t, 'trak');
    traks.sort((a, b) => b.start - a.start);
    for (const trk of traks) {
      const edts = findBoxByPath(t, ['trak', 'edts'], trk.start, trk.end);
      if (edts) {
        t = spliceBytes(t, edts.start, edts.size, new Uint8Array(0));
        w32(t, trk.size - edts.size, trk.start);
        for (const anc of getBoxAncestors(t, trk.start).slice(0, -1)) {
          w32(t, r32(t, anc) - edts.size, anc);
        }
        adjustAllChunkOffsets(t, -edts.size);
      }
    }
    return t;
  })(p);

  // 4. Duplicate audio track 0 as Track 3
  p = (t => {
    const audioTrack = getAudioTrack(t, 0);
    const moov = findBoxByPath(t, ['moov']);
    if (!audioTrack || !moov) return t;
    let maxTrackId = 0;
    for (const trk of findAllBoxes(t, 'trak')) {
      const tkhd = findBoxByPath(t, ['tkhd'], trk.payload, trk.end);
      if (tkhd) maxTrackId = Math.max(maxTrackId, r32(t, getTrackIdOffset(t, tkhd)));
    }
    const nextTrackId = maxTrackId + 1;
    const cloneBytes = t.slice(audioTrack.start, audioTrack.end);
    const cloneTkhd = findBoxByPath(cloneBytes, ['tkhd'], 8, cloneBytes.length);
    if (!cloneTkhd) throw new Error('Audio clone missing tkhd');
    w32(cloneBytes, nextTrackId, getTrackIdOffset(cloneBytes, cloneTkhd));

    t = spliceBytes(t, moov.end, 0, cloneBytes);
    w32(t, moov.size + cloneBytes.length, moov.start);
    adjustAllChunkOffsets(t, cloneBytes.length);

    const mvhd = findBoxByPath(t, ['moov', 'mvhd']);
    if (mvhd) {
      const nextTrackOff = t[mvhd.payload] === 1 ? mvhd.payload + 108 : mvhd.payload + 96;
      w32(t, nextTrackId + 1, nextTrackOff);
    }
    return t;
  })(p);

  // 5. Strip edts from duplicated track
  p = ((t, trackIndex = -1) => {
    const trk = getAudioTrack(t, trackIndex);
    if (!trk) return t;
    const edts = findBoxByPath(t, ['edts'], trk.payload, trk.end);
    if (!edts) return t;
    t = spliceBytes(t, edts.start, edts.size, new Uint8Array(0));
    for (const anc of getBoxAncestors(t, edts.start).slice(0, -1)) {
      w32(t, r32(t, anc) - edts.size, anc);
    }
    adjustAllChunkOffsets(t, -edts.size);
    return t;
  })(p, -1);

  // 6. Factor patch on Track 3 (appends trailing samples & chunk)
  p = ((t, mult = 10, trackIndex = -1) => {
    let trk = getAudioTrack(t, trackIndex);
    if (!trk) return t;
    const stsz = findBoxByPath(t, ['mdia', 'minf', 'stbl', 'stsz'], trk.payload, trk.end);
    const stsc = findBoxByPath(t, ['mdia', 'minf', 'stbl', 'stsc'], trk.payload, trk.end);
    const stco = getStcoBox(t, trk);
    if (!stsz || !stsc || !stco) return t;

    const sampleSize = r32(t, stsz.payload + 4);
    const sampleCount = r32(t, stsz.payload + 8);
    const { count: chunkCount, entrySize } = readChunkOffsets(t, stco);
    const stscEntryCount = r32(t, stsc.payload + 4);
    if (sampleSize !== 0) return t;

    const extraSamples = sampleCount * (mult - 1);
    if (extraSamples <= 0) return t;

    // Expand stsz
    let delta = 0;
    const origStsz = t.subarray(stsz.start, stsz.end);
    const newStsz = new Uint8Array(origStsz.length + 4 * extraSamples);
    newStsz.set(origStsz);
    w32(newStsz, sampleCount + extraSamples, 16);
    for (let i = origStsz.length; i < newStsz.length; i += 4) {
      w32(newStsz, 8, i); // sample size = 8 bytes
    }
    t = replaceBoxAndUpdateAncestors(t, stsz, newStsz);
    delta += newStsz.length - origStsz.length;

    // Expand stco
    trk = getAudioTrack(t, trackIndex);
    const curStco = getStcoBox(t, trk);
    const origStco = t.subarray(curStco.start, curStco.end);
    const newStco = new Uint8Array(origStco.length + entrySize);
    newStco.set(origStco);
    w32(newStco, chunkCount + 1, 12);
    if (entrySize === 8) {
      w64(newStco, 0, origStco.length);
    } else {
      w32(newStco, 0, origStco.length);
    }
    t = replaceBoxAndUpdateAncestors(t, curStco, newStco);
    delta += entrySize;

    // Expand stsc
    trk = getAudioTrack(t, trackIndex);
    const curStsc = findBoxByPath(t, ['mdia', 'minf', 'stbl', 'stsc'], trk.payload, trk.end);
    const origStsc = t.subarray(curStsc.start, curStsc.end);
    const newStsc = new Uint8Array(origStsc.length + 12);
    newStsc.set(origStsc);
    w32(newStsc, stscEntryCount + 1, 12);
    w32(newStsc, chunkCount + 1, origStsc.length);
    w32(newStsc, extraSamples, origStsc.length + 4);
    w32(newStsc, 1, origStsc.length + 8);
    t = replaceBoxAndUpdateAncestors(t, curStsc, newStsc);
    delta += 12;
    adjustAllChunkOffsets(t, delta);

    // Append trailing payload at end of mdat
    const mdat = findBoxByPath(t, ['mdat']);
    trk = getAudioTrack(t, trackIndex);
    const finalStco = getStcoBox(t, trk);
    if (!mdat || !finalStco) return t;

    const mdatEnd = mdat.end;
    const isCo64 = finalStco.tag === 'co64';
    const lastChunkPos = finalStco.payload + 8 + chunkCount * (isCo64 ? 8 : 4);
    if (isCo64) {
      w64(t, mdatEnd, lastChunkPos);
    } else {
      w32(t, mdatEnd, lastChunkPos);
    }

    const trailingPayload = new Uint8Array(8 * extraSamples);
    for (let i = 0; i < extraSamples; i++) {
      w32(trailingPayload, 4, 8 * i);
      w32(trailingPayload, 0, 8 * i + 4);
    }
    return spliceBytes(t, mdatEnd, 0, trailingPayload);
  })(p, factor, -1);

  // 7. Update Track 3 stts
  p = ((t, trackIndex = -1) => {
    const trk = getAudioTrack(t, trackIndex);
    if (!trk) return t;
    const stts = findBoxByPath(t, ['mdia', 'minf', 'stbl', 'stts'], trk.payload, trk.end);
    const stsz = findBoxByPath(t, ['mdia', 'minf', 'stbl', 'stsz'], trk.payload, trk.end);
    if (!stts || !stsz) return t;

    const totalSamples = r32(t, stsz.payload + 8);
    const sttsCount = r32(t, stts.payload + 4);
    const entries = [];
    let sumSamples = 0;
    let ptr = stts.payload + 8;
    for (let i = 0; i < sttsCount; i++) {
      const sc = r32(t, ptr), sd = r32(t, ptr + 4);
      entries.push([sc, sd]);
      sumSamples += sc;
      ptr += 8;
    }
    const remaining = totalSamples - sumSamples;
    if (remaining <= 0) return t;

    const newEntries = [];
    let rem = sumSamples;
    for (const [sc, sd] of entries) {
      if (rem <= 0) break;
      const count = Math.min(sc, rem);
      newEntries.push([count, sd]);
      rem -= count;
    }
    newEntries.push([remaining, 1]);

    const origStts = t.subarray(stts.start, stts.end);
    const newStts = new Uint8Array(16 + 8 * newEntries.length);
    newStts.set(origStts.subarray(0, Math.min(origStts.length, newStts.length)));
    w32(newStts, newEntries.length, 12);
    ptr = 16;
    for (const [sc, sd] of newEntries) {
      w32(newStts, sc, ptr);
      w32(newStts, sd, ptr + 4);
      ptr += 8;
    }
    t = replaceBoxAndUpdateAncestors(t, stts, newStts);
    adjustAllChunkOffsets(t, newStts.length - origStts.length);
    return t;
  })(p, -1);

  // 8. Remove old udta
  p = (t => {
    const moov = findBoxByPath(t, ['moov']);
    if (!moov) return t;
    const udta = findBoxByPath(t, ['moov', 'udta']);
    if (!udta) return t;
    t = spliceBytes(t, udta.start, udta.size, new Uint8Array(0));
    w32(t, moov.size - udta.size, moov.start);
    adjustAllChunkOffsets(t, -udta.size);
    return t;
  })(p);

  // 9. Inject clean udta metadata
  const udtaPayload = (() => {
    const artistBytes = new TextEncoder().encode(artist);
    const dataBox = makeBox('data', concat([new Uint8Array([0, 0, 0, 1]), new Uint8Array(4), artistBytes]));
    const artBox = makeBox(new Uint8Array([169, 65, 82, 84]), dataBox);
    const ilstBox = makeBox('ilst', artBox);
    const hdlrBox = makeBox('hdlr', concat([new Uint8Array(8), strToBytes('mdir'), new Uint8Array(12), strToBytes('appl\0')]));
    const metaBox = makeBox('meta', concat([new Uint8Array(4), hdlrBox, ilstBox]));
    return makeBox('udta', metaBox);
  })();

  const moov = findBoxByPath(p, ['moov']);
  if (moov) {
    p = spliceBytes(p, moov.end, 0, udtaPayload);
    w32(p, moov.size + udtaPayload.length, moov.start);
    adjustAllChunkOffsets(p, udtaPayload.length);
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
    const patchedBytes = applyVaguePulsePatch(rawBytes, 10, 'transcode.vague-infinity.com');

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
