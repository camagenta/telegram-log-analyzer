# 🤖 Telegram Bot Log Analyzer — Google Apps Script

Bot Telegram yang mencatat semua pesan grup/channel ke **Google Sheets**, menyimpan file media ke **Google Drive**, dan menyediakan **analisa bulanan otomatis** (8 fitur rekap).

## ✨ Fitur Utama

### 📝 Logging Otomatis
| Fitur | Detail |
|-------|--------|
| Auto-log | Semua pesan (text, photo, video, document, voice, GIF) tercatat otomatis |
| File save | Media otomatis tersimpan ke Google Drive + link tercatat |
| Forward info | Deteksi sumber forward (user, channel, grup hidden) |
| Topic support | Support penuh Telegram Forum Topic |

### 📊 Analisa Bulanan (8 Fitur)
| # | Fitur | Output |
|---|-------|--------|
| 1 | Rekap per Grup/User/Tipe | Total pesan per kategori |
| 2 | Ranking Aktivitas | Top 30 user paling aktif |
| 3 | Distribusi Tipe Pesan | Text/Photo/Video/Document + % |
| 4 | Aktivitas Harian | Tren per hari, rata-rata, hari tersibuk |
| 5 | Rekap Topik Forum | Topik paling aktif |
| 6 | Rekap File | Total file tersimpan + ukuran (MB) |
| 7 | Bandingan MoM | vs bulan sebelumnya, naik/turun % |
| 8 | Export + Telegram | Sheet baru + kirim laporan ke Telegram |

### 🤖 Bot Commands (via Telegram)
- `/report` — Laporan bulanan singkat
- `/stats` — Statistik cepat hari ini
- `/groups` — Daftar grup terhubung
- `/help` — Bantuan

## 🏗️ Struktur Proyek

```
telegram-log-analyzer/
├── src/
│   ├── 00_Config.gs          # 🔐 Konfigurasi via PropertiesService
│   ├── 01_Utils.gs           # 🔧 Helper functions
│   ├── 02_Telegram.gs        # 📡 Telegram API calls
│   ├── 03_Drive.gs           # 💾 Google Drive operations
│   ├── 04_Sheet.gs           # 📊 Spreadsheet operations
│   ├── 05_Webhook.gs         # 🚀 Main doPost() handler
│   ├── 06_Menu.gs            # 🧩 Google Sheets menu
│   ├── 07_Commands.gs        # 🤖 Bot commands (/report, /stats)
│   ├── 08_Analytics.gs       # 📈 Monthly analysis engine
│   └── 09_AnalyticsHtml.gs   # 🖥️ HTML Picker dialog
├── appsscript.json           # GAS manifest
├── .clasp.json               # clasp config (local dev)
├── .gitignore
└── README.md
```

## 🚀 Cara Install

### 1. Buat Google Apps Script Project
1. Buka [Google Sheets](https://sheets.new)
2. Extensions > Apps Script
3. Beri nama project: `Telegram Log Analyzer`

### 2. Copy semua file `src/*.gs`
1. Di editor GAS: **File > New > Script**, beri nama sesuai (misal: `00_Config`)
2. Copy paste isi setiap file dari repo ini
3. Ulangi untuk semua 10 file

### 3. Set OAuth Scopes (appsscript.json)
1. Di editor GAS: **View > Show manifest file**
2. Paste isi `appsscript.json`
3. Simpan

### 4. Konfigurasi Awal
1. **Refresh** spreadsheet
2. Menu > **🔐 Config > Setup Token & Folder**
3. Masukkan **Bot Token** dari [@BotFather](https://t.me/BotFather)
4. Masukkan **Folder ID** Google Drive (untuk menyimpan file media)

### 5. Setup Webhook
1. **Deploy > New deployment** → Pilih **Web app**
   - Execute as: **Me**
   - Access: **Anyone**
2. Copy URL deployment
3. Menu > **🔧 Manajemen Webhook > Set Webhook**
4. Paste URL

### 6. Setup Log Sheet
1. Menu > **🤖 Dashboard Bot > 1. Setup Log Sheet**
2. Selesai! Bot siap menerima pesan.

## 📊 Cara Analisa Bulanan

1. Menu > **📊 Analisa Bulanan > Generate Report (Pilih Bulan)**
2. Pilih bulan & tahun
3. Sheet baru `Rekap_2026_07` muncul dengan 8 section analisa
4. Atau ketik `/report` di Telegram untuk laporan singkat

## 🚀 Setup Automation (clasp + GitHub Actions)

Dengan automation ini kamu **gak perlu copy-paste manual** ke editor GAS. Cukup push ke GitHub, otomatis terdeploy.

### 1. Install clasp + Login (SEKALI)

```bash
# Dari folder project
npm install
npm run login   # Akan buka browser untuk OAuth login
```

### 2. Dapatkan Script ID

Buka [script.google.com](https://script.google.com) → project kamu → **File > Project settings > Script ID**

### 3. Update .clasp.json

```json
{
  "scriptId": "1abc...YOUR_SCRIPT_ID...xyz",
  "rootDir": "./src"
}
```

### 4. Deploy Manual via Terminal

```bash
npm run push     # Push semua file ke GAS
npm run deploy   # Push + buat deployment baru
npm run open     # Buka GAS editor di browser
```

Setelah ini, kapan pun kamu ubah kode dan jalankan `npm run push`, GAS project langsung terupdate 🎉

---

### 🤖 GitHub Actions — Auto Deploy on Push

Biar setiap kali push ke `main` otomatis terdeploy, kita pakai GitHub Actions.

#### Setup Secrets (SEKALI)

1. Dapatkan token clasp:

```bash
clasp login --no-localhost
cat ~/.clasprc.json    # Copy seluruh isinya
```

2. Buka repo GitHub → **Settings > Secrets and variables > Actions**
3. Tambah 2 secrets:

| Secret | Isi |
|--------|-----|
| `CLASPRC_JSON` | Isi file `~/.clasprc.json` (hasil `clasp login`) |
| `GAS_SCRIPT_ID` | Script ID dari GAS project |

4. **Selesai!** Setiap push ke `main` akan trigger workflow `.github/workflows/deploy-gas.yml`

### Workflow yang sudah disiapkan

```yaml
# .github/workflows/deploy-gas.yml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install -g @google/clasp
      - run: echo "${{ secrets.CLASPRC_JSON }}" > ~/.clasprc.json
      - run: sed -i "s/YOUR_SCRIPT_ID_HERE/${{ secrets.GAS_SCRIPT_ID }}/g" .clasp.json
      - run: clasp push -f
```

## 🔐 Keamanan

- **Token bot** disimpan di `PropertiesService` (bukan hardcoded)
- File `.clasp.json` ada di `.gitignore` (jangan commit Script ID)
- OAuth scopes minimal: drive, spreadsheet, external_request

## 📄 Lisensi

MIT — Gunakan, modifikasi, sebarkan bebas.

---

_Dibuat dengan Google Apps Script + Telegram Bot API_
