/**
 * ============================================================
 *  00_CONFIG.gs — Konfigurasi Aplikasi
 * ============================================================
 *  Version: 1.0.0 (Test GitHub Actions auto-deploy)
 *  Semua token & ID disimpan di PropertiesService (AMAN).
 *  Jalankan setupConfig() sekali saja dari menu untuk mengisi.
 *  
 *  Cara manual:
 *    View > Show manifest file → edit appsscript.json
 *    Atau jalankan setupConfig() dari menu "🔧 Config > Setup Token & Folder"
 * ============================================================
 *  @OnlyCurrentDoc
 *  OAuth Scopes:
 *    - https://www.googleapis.com/auth/drive
 *    - https://www.googleapis.com/auth/spreadsheets
 *    - https://www.googleapis.com/auth/script.external_request
 * ============================================================
 */

// ============================================================
//  INDEX KOLOM — Biar gak perlu hafal angka
//  Cocokkan dengan header sheet yang sudah di-setup:
//    Timestamp | Chat ID | User ID | Tipe | Title | Nama Grup/User
//    | Username | Pengirim | Isi Pesan | Tipe Pesan | Download Link
//    | Metadata | Link | Forward Info | Topic ID | Topic Name
// ============================================================
var COL = {
  TIMESTAMP:    0,
  CHAT_ID:      1,
  USER_ID:      2,
  TYPE:         3,     // private / group / supergroup
  TITLE:        4,     // Nama grup / "Private Chat"
  FULL_NAME:    5,     // Nama lengkap user
  USERNAME:     6,
  SENDER:       7,     // Pengirim (nama first + last)
  MESSAGE:      8,     // Isi pesan
  MSG_TYPE:     9,     // Tipe pesan: Text, Photo, Video, dll
  DOWNLOAD_LINK: 10,   // Link download dari Telegram
  METADATA:     11,    // Info ukuran, resolusi, durasi
  GDRIVE_LINK:  12,    // Link Google Drive hasil save
  FORWARD_INFO: 13,    // Info forward (jika ada)
  TOPIC_ID:     14,
  TOPIC_NAME:   15
};

// ============================================================
//  GETTER — Baca konfigurasi dari PropertiesService
//  GAS bersifat stateless, jadi setiap panggilan fungsi
//  akan membaca ulang PropertiesService.
// ============================================================

/**
 * Ambil Telegram Bot Token dari PropertiesService.
 * @return {string}
 */
function getToken() {
  return PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
}

/**
 * Ambil Google Drive Folder ID dari PropertiesService.
 * @return {string}
 */
function getFolderId() {
  return PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
}

/**
 * Ambil active spreadsheet (container-bound).
 * @return {SpreadsheetApp.Spreadsheet}
 */
function getSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Ambil sheet pertama sebagai sheet utama.
 * @return {SpreadsheetApp.Sheet}
 */
function getSheet() {
  return getSS().getSheets()[0];
}

/**
 * Cek apakah konfigurasi sudah lengkap.
 * @return {boolean}
 */
function isConfigReady() {
  return getToken() !== null && getFolderId() !== null;
}

/**
 * Validasi konfigurasi — lempar error jika belum di-set.
 */
function assertConfig() {
  if (!getToken()) {
    throw new Error(
      '❌ BOT_TOKEN belum dikonfigurasi.\n\n' +
      'Jalankan: Menu > 🔧 Config > Setup Token & Folder'
    );
  }
  if (!getFolderId()) {
    throw new Error(
      '❌ FOLDER_ID belum dikonfigurasi.\n\n' +
      'Jalankan: Menu > 🔧 Config > Setup Token & Folder'
    );
  }
}

// ============================================================
//  SETUP — Dialog untuk mengisi token & folder ID
// ============================================================

/**
 * Setup awal: isi BOT_TOKEN dan FOLDER_ID via dialog.
 * Panggil sekali dari menu "🔧 Config > Setup Token & Folder"
 */
function setupConfig() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  // 1. Token
  var existingToken = props.getProperty('BOT_TOKEN') || '';
  var tokenRes = ui.prompt(
    '🔐 Setup Token',
    'Masukkan Telegram Bot Token dari @BotFather:\n(Current: ' + maskToken_(existingToken) + ')',
    ui.ButtonSet.OK_CANCEL
  );
  if (tokenRes.getSelectedButton() !== ui.Button.OK) return;
  var newToken = tokenRes.getResponseText().trim();
  if (newToken) props.setProperty('BOT_TOKEN', newToken);

  // 2. Folder ID
  var existingFolder = props.getProperty('FOLDER_ID') || '';
  var folderRes = ui.prompt(
    '📁 Setup Folder Drive',
    'Masukkan Google Drive Folder ID:\n(Current: ' + existingFolder + ')',
    ui.ButtonSet.OK_CANCEL
  );
  if (folderRes.getSelectedButton() !== ui.Button.OK) return;
  var newFolder = folderRes.getResponseText().trim();
  if (newFolder) props.setProperty('FOLDER_ID', newFolder);

  // 3. Konfirmasi
  var savedToken = props.getProperty('BOT_TOKEN');
  var savedFolder = props.getProperty('FOLDER_ID');

  ui.alert(
    '✅ Konfigurasi tersimpan!',
    'BOT_TOKEN: ' + maskToken_(savedToken) + '\nFOLDER_ID: ' + savedFolder,
    ui.ButtonSet.OK
  );
}

function maskToken_(token) {
  if (!token) return '(kosong)';
  if (token.length < 8) return '***';
  return token.substring(0, 4) + '****' + token.substring(token.length - 4);
}

/**
 * Lihat konfigurasi saat ini (token dimask).
 */
function viewConfig() {
  var ui = SpreadsheetApp.getUi();
  var token = getToken();
  var folder = getFolderId();

  ui.alert(
    '📋 Konfigurasi Saat Ini',
    'BOT_TOKEN: ' + (token ? maskToken_(token) : '❌ Belum di-set') +
    '\nFOLDER_ID: ' + (folder || '❌ Belum di-set') +
    '\n\nGunakan "🔧 Config > Setup Token & Folder" untuk mengubah.',
    ui.ButtonSet.OK
  );
}
