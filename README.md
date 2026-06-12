# 🌦️ CuacaKu — Weather Journal

> Aplikasi cuaca real-time berbasis React Native (Expo) dengan fitur jurnal mood harian dan perbandingan dua kota. Dibangun menggunakan Open-Meteo API — tanpa API key, tanpa biaya.

---

## ✨ Deskripsi

**CuacaKu** bukan sekadar aplikasi cuaca biasa. Selain menampilkan data cuaca real-time, CuacaKu memungkinkan kamu untuk:

- 🔍 **Mencari cuaca** kota mana saja di seluruh dunia
- ⚖️ **Membandingkan 2 kota** secara side-by-side (suhu, min/maks, angin)
- 📓 **Mencatat mood harian** berdasarkan cuaca saat itu (Weather Journal)
- ★ **Menyimpan kota favorit** dengan AsyncStorage agar tetap ada setelah app ditutup

---

## 📋 Daftar Fitur

### 🟢 Level 1 — Core (Wajib)
- [x] TextInput controlled (`value` + `onChangeText`) untuk pencarian kota
- [x] Debounce **500ms** dengan `setTimeout` + `clearTimeout`
- [x] `useEffect` dengan dependency array `[query]`
- [x] Fetch 2 langkah: **Geocoding → Forecast** (Open-Meteo)
- [x] 4 kondisi UI: Kosong · Loading (spinner) · Error (pesan merah) · Sukses (kartu cuaca)
- [x] `AbortController` di cleanup function untuk batalkan request lama
- [x] Mapping WMO weathercode → label + emoji (23 kode cuaca)
- [x] Tampilkan: nama kota, negara, suhu °C, kondisi cuaca

### 🟡 Level 2 — Pengembangan (Semua diimplementasikan)
- [x] 🧭 **Arah & Kecepatan Angin** — `windspeed` + `winddirection` ke arah mata angin (U/TL/T/...)
- [x] 🌙 **Indikator Siang/Malam** — Field `is_day` (0/1) untuk ganti badge + emoji ☀️ vs 🌙
- [x] 🌡️ **Suhu Min/Maks Harian** — Parameter `daily=temperature_2m_max,temperature_2m_min`
- [x] 🕘 **Riwayat Pencarian** — 6 kota terakhir sebagai chip yang bisa di-tap
- [x] 🔄 **Tombol Refresh** — Fetch ulang semua kota aktif tanpa mengetik ulang
- [x] 🎨 **Background Dinamis** — Warna latar berubah sesuai kondisi cuaca kota pertama

### 🔴 Level 3 — Bonus
- [x] **Multi-kota** — Tampilkan hingga 2 kota sekaligus
- [x] **Kota Favorit** — Simpan dengan AsyncStorage, tetap ada setelah app ditutup
- [x] **Pull-to-Refresh** — Tarik layar ke bawah untuk refresh data (`RefreshControl`)
- [x] **Animasi Fade-in** — Kartu cuaca muncul dengan Animated API (fade + slide-up)

### 🌟 BONUS EKSKLUSIF
- [x] **⚖️ Compare Mode** — Bandingkan 2 kota side-by-side (suhu, maks, min, angin) dengan indikator pemenang
- [x] **📓 Weather Journal** — Catat mood harian (6 pilihan: Senang, Tenang, Murung, Semangat, Lelah, Cemas) berdasarkan cuaca saat itu, lengkap dengan catatan teks bebas. Disimpan ke AsyncStorage
- [x] **🌤️ Mini Forecast 3 Hari** — Prakiraan cuaca 3 hari ke depan di dalam kartu cuaca

---

## Screenshot Aplikasi

| Kosong | Loading | Sukses | Error |
|---------|---------|---------|---------|
| ![](/assets/empty.png) | ![](/assets/loading.png) | ![](/assets/succes.png) | ![](/assets/error.png) |

## 🚀 Cara Menjalankan

### Prasyarat
- Node.js ≥ 18
- Expo Go (install di HP dari App Store / Play Store)

### Instalasi

```bash
# 1. Clone repository
git clone https://github.com/username/Cuacaku.git
cd Cuacaku

# 2. Install dependencies
npm install

# 3. Install AsyncStorage
npx expo install @react-native-async-storage/async-storage

# 4. Jalankan development server
npx expo start
```

### Cara pakai
1. Scan QR code yang muncul di terminal menggunakan aplikasi **Expo Go** di HP
2. Ketik nama kota di kolom pencarian
3. Tap ★ untuk simpan ke favorit
4. Tap **✏️ Catat Mood** untuk menulis jurnal cuaca
5. Buka tab **⚖️ Banding** untuk membandingkan 2 kota

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Framework | React Native + Expo |
| API | [Open-Meteo](https://open-meteo.com/) (gratis, tanpa API key) |
| Storage | AsyncStorage (`@react-native-async-storage/async-storage`) |
| Animasi | React Native Animated API |
| State | React Hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`) |

---

## 🔗 Links

- **Expo Snack**: _(https://snack.expo.dev/@mikaelll/mikael-cuacaku)_
- **GitHub Repo**: _(https://github.com/mikaelllp/Cuacaku.git)_

---

## 📝 Conventional Commits

```
feat: tambah fitur weather journal dengan mood log
feat: tambah compare mode untuk bandingkan 2 kota
feat: tambah mini forecast 3 hari ke depan
feat: implementasi multi-kota maksimal 2 dengan replace otomatis
feat: tambah pull-to-refresh dengan RefreshControl
feat: simpan favorit dan riwayat dengan AsyncStorage
feat: animasi fade-in dan slide-up pada kartu cuaca
feat: background dinamis berdasarkan kondisi cuaca
feat: tampilkan arah angin dengan konversi derajat ke mata angin
feat: indikator siang/malam dari field is_day Open-Meteo
```

---

## 👤 Developer

**Mikael** — React Native / Expo  
Dibuat sebagai tugas praktikum · Open-Meteo API · 2026