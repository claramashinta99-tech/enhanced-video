# Reyval Tools

Static site untuk `reyval.web.id`.

## Struktur

- `/` — Reyval Tools homepage
- `/clarity/` — Clarity video optimizer (Referensi, HQ, Turbo)
- `/tiktok-downloader/` — Coming Soon
- `/youtube-downloader/` — Coming Soon

## GitHub Pages

Publish dari branch `main` folder `/(root)`. File `CNAME` sudah berisi `reyval.web.id`.

## Clarity

- Turbo: file asli, tanpa proses.
- HQ: stream-copy/remux ke MP4 + faststart; tidak re-encode.
- Referensi: stream-copy/remux + metadata dibersihkan + faststart; tidak re-encode.

FFmpeg WebAssembly dimuat hanya saat mode HQ/Referensi diproses. Video tetap diproses di browser dan tidak diunggah ke server Reyval.
