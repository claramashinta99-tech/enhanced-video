# Project Memory & Developer Guidelines — RVL HD (enhanced-video)

Dokumen ini berisi riwayat lengkap percakapan, keputusan arsitektur, preferensi kerja, dan aturan penting dari owner project. Dokumen ini dibaca secara otomatis oleh AI assistant agar konteks tetap terjaga utuh meskipun sesi chat sebelumnya dihapus.

---

## 1. Identitas & Arsitektur Proyek
- **Nama Brand / Web:** **RVL HD** (bukan CompressBase).
- **Domain & Hosting:**
  - **Frontend:** GitHub Pages (`enhanced-video.com` via `CNAME`).
  - **Backend:** Railway (dan Render backup).
  - **Repository:** `claramashinta99-tech/enhanced-video` (branch `main`).
- **Fitur Utama:**
  1. **Clarity Method (TikTok & IG HD Bypass):** Menggunakan teknik injeksi MP4 64-bit atom patch agar hasil upload ke TikTok/Instagram tetap jernih/HD tanpa hancur oleh recompression server.
  2. **YouTube Downloader Suite:** Download video reguler (hingga 4K), YouTube Shorts, dan audio MP3 melalui backend Railway yt-dlp.
  3. **Universal & Social Downloader:** Instagram, TikTok, Facebook, X (Twitter), dan Media Inspector.

---

## 2. Aturan Kerja Wajib (User Rules)

1. **JANGAN UBAH APAPUN SELAIN YANG DISURUH (Strict Scope)**
   - Jangan pernah melakukan refactoring liar atau mengubah file/fitur yang tidak diminta.
   - Jika diminta memperbaiki satu hal spesifik, perbaiki HANYA hal itu saja ("fix yg itu aja jgn yg lain karena yg lain sudah perfectly working").

2. **OTOMATIS COMMIT & PUSH KE GITHUB**
   - Setiap kali selesai mengerjakan perbaikan atau task, **langsung git commit dan git push ke branch main**.
   - Tidak perlu bertanya izin lagi ("mulai sekarang langsung commit push aja, jgn nanya lagi").

3. **PEMBERITAHUAN DEPLOY RAILWAY**
   - Jika perubahan menyentuh file **backend** (`backend/app.py`, `backend/youtube_engine_app.py`, `backend/render_engine.py`, dll.) yang membutuhkan deploy ulang:
   - Beritahu user secara jelas: *"Perubahan backend sudah di-push. Silakan lakukan Deploy Latest Commit di dashboard Railway."*

4. **BRANDING & NAMING STANDARD (RVL HD)**
   - Dilarang keras memunculkan teks/nama `CompressBase` di UI, copy status, notification, ataupun penamaan file output.
   - Suffix hasil unduhan video clarity adalah `[nama_file]_rvl-hd.mp4`.
   - Brand yang ditampilkan kepada pengguna selalu **RVL HD**.

5. **KEAMANAN & OBFUSCATION KODE**
   - Script inti clarity engine (`assets/clarity.js`) WAJIB selalu dalam bentuk ter-obfuscate / terenkripsi saat di-push ke GitHub untuk mencegah plagiasi/inspect oleh pihak luar.
   - File sumber yang belum diobfuscate (`assets/clarity.source.js`) hanya disimpan di lokal dan dilindungi oleh `.gitignore`.

6. **TESTING SEBELUM KONFIRMASI**
   - Selalu validasi syntax, script, atau endpoint sebelum memberitahu user agar tidak ada broken deployment.

---

## 3. Riwayat Masalah & Solusi Teknis (Technical History)

### A. Clarity Engine (TikTok HD Bypass)
- **Problem Awal:** Video yang diproses web buram saat diunggah ke TikTok.
- **Solusi Ditemukan:** Berdasarkan riset mendalam terhadap CompressBase (`compressbase.com/upload-method`) dan vague-infinity, TikTok mendeteksi struktur MP4 atom tertentu. Solusi yang bekerja 100% HD adalah implementasi **exact 64-bit atom patch** pada container MP4.
- **Bug yang Pernah Diselesaikan:**
  - Stuck di 85% (`cannot read properties of null reading 'status'`) -> Berhasil difix.
  - Video hasil proses blank / durasi 00:00 -> Berhasil difix.
  - Suffix download sebelumnya bertuliskan `compressbase` -> Diganti menjadi `rvl-hd`.
  - Semua copy teks CompressBase dibersihkan dan diganti `RVL HD`.
  - Background desktop & mobile diatur menggunakan `rvl-bg-desktop-hd` dan asset RVL HD.
### B. YouTube Downloader & Backend Railway
- **Problem Awal:**
  - Link YouTube lambat terdeteksi / loading terus-menerus.
  - Opsi download hanya muncul 360p, tidak muncul opsi HD / 4K.
  - Error: *"Gagal menyiapkan file YouTube. Pastikan link publik dan coba lagi"*.
- **Solusi yang Diterapkan di `backend/youtube_engine_app.py` & `backend/render_engine.py`:**
  - Menghapus parameter `process=False` pada `ydl.extract_info()` agar semua format dan resolusi tinggi (1080p, 1440p, 4K) terekstraksi penuh.
  - Filter format storyboard (thumbnail preview) agar tidak terbaca sebagai format video playable.
  - Multi-client fallback strategy: `combined-public` (`mweb`, `android_vr`, `web_safari`, `default`, `web`), `mweb-pot-public`, `embedded-public`, `web-pot-public`.
  - Menambahkan pengecekan batas ukuran file server (maksimal 500 MB).
  - Canonicalization URL Shorts dan sanitasi input regex.

### C. TikTok Dolby Vision / HDR Tool (Fitur Baru)
- **Tujuan:** Mengonversi video ke format Dolby Vision / HDR10 10-bit HEVC agar saat diupload ke TikTok, layar ponsel penonton otomatis meningkat kecerahannya (auto-glow / peak brightness).
- **Arsitektur:**
  - Terpisah total dari Clarity Method agar tidak mengganggu fitur yang sudah ada.
  - Frontend: `/dolby-vision/index.html` dan `assets/dolby-vision.js`.
  - Backend: `backend/dolby_vision_app.py` diproses via FFmpeg di Railway.
  - Suffix unduhan: `[nama_file]_hdr-dolby_rvl-hd.mp4`.
  - Batasan durasi: Maksimal 30 detik (dicek di client & server).
  - Mode profil: Apple HLG (BT.2020 10-bit HLG) sebagai rekomendasi aman & HDR10 PQ (SMPTE 2084).
