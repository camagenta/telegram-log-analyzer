/**
 * ============================================================
 *  DEPLOYMENT OTOMATIS ke Google Apps Script
 * ============================================================
 *  
 *  CARA KERJA:
 *    1. Push ke GitHub → trigger GitHub Actions
 *    2. Action menjalankan clasp push → deploy otomatis
 *    
 *  PRASYARAT (SEKALI SETUP):
 *    a. Dapatkan Script ID dari GAS Editor:
 *       File > Project settings > Script ID
 *    b. Dapatkan clasp token dari `clasp login`:
 *       $ clasp login --no-localhost
 *       $ cat ~/.clasprc.json  → copy isinya
 *    c. Simpan ke GitHub Secrets:
 *       Settings > Secrets > Actions
 *       - CLASPRC_JSON: isi dari ~/.clasprc.json
 *       - GAS_SCRIPT_ID: Script ID dari GAS project
 *
 *  ALUR LENGKAP: lihat README.md bagian "🚀 Setup Automation"
 * ============================================================
 */

// clasp akan membaca .clasp.json untuk konfigurasi project
// dan meng-ignore file ini karena ekstensi .gs
