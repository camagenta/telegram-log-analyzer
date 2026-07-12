/**
 * ============================================================
 *  04_SHEET.gs — Operasi Spreadsheet
 * ============================================================
 *  Setup sheet, baca/tulis data, dll.
 *  Dependensi: 00_Config.gs (getSheet, getSS)
 *              01_Utils.gs (formatDate_, filterByMonth_)
 * ============================================================
 */

/**
 * HEADERS sheet sesuai urutan kolom.
 * Cocokkan dengan konstanta COL di 00_Config.gs
 */
var SHEET_HEADERS = [
  'Timestamp',      // 0
  'Chat ID',        // 1
  'User ID',        // 2
  'Tipe',           // 3
  'Title',          // 4
  'Nama Grup/User', // 5
  'Username',       // 6
  'Pengirim',       // 7
  'Isi Pesan',      // 8
  'Tipe Pesan',     // 9
  'Download Link',  // 10
  'Metadata',       // 11
  'Link',           // 12
  'Forward Info',   // 13
  'Topic ID',       // 14
  'Topic Name'      // 15
];

/**
 * Setup sheet awal — buat header, styling, frozen row.
 * Jalankan sekali dari menu "🤖 Dashboard Bot > 1. Setup Log Sheet"
 */
function setupSheet() {
  var sheet = getSheet();
  var headers = [SHEET_HEADERS];

  // Tulis header
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);

  // Styling header
  var headerRange = sheet.getRange(1, 1, 1, headers[0].length);
  headerRange
    .setFontWeight('bold')
    .setBackground('#4a86e8')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // Freeze baris header
  sheet.setFrozenRows(1);

  // Lebar kolom
  sheet.setColumnWidths(1, 1, 180);   // Timestamp
  sheet.setColumnWidths(5, 1, 350);   // Isi Pesan

  SpreadsheetApp.getUi().alert('✅ Sheet Log Berhasil Disiapkan!\n\n' +
    headers[0].length + ' kolom telah dibuat.');
}

/**
 * Ambil semua data dari sheet utama (termasuk header).
 * @return {Array<Array>}
 */
function getAllData() {
  return getSheet().getDataRange().getValues();
}

/**
 * Ambil semua baris data (tanpa header).
 * @return {Array<Array>}
 */
function getAllRows() {
  var data = getAllData();
  return data.length > 1 ? data.slice(1) : [];
}

/**
 * Ambil daftar bulan yang punya data — untuk UI picker.
 * @return {Array<{year: number, month: number, count: number}>}
 */
function getAvailableMonths() {
  var rows = getAllRows();
  var monthsMap = {};

  rows.forEach(function (row) {
    var ts = row[COL.TIMESTAMP];
    if (!ts) return;
    var d = (ts instanceof Date) ? ts : new Date(ts);
    if (isNaN(d.getTime())) return;

    var key = d.getFullYear() + '-' + (d.getMonth() + 1);
    if (!monthsMap[key]) {
      monthsMap[key] = {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        count: 0
      };
    }
    monthsMap[key].count++;
  });

  // Urut descending (terbaru dulu)
  var result = [];
  for (var key in monthsMap) {
    if (monthsMap.hasOwnProperty(key)) {
      result.push(monthsMap[key]);
    }
  }
  result.sort(function (a, b) {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  return result;
}

/**
 * Tulis baris baru ke sheet.
 * @param {Array} rowData
 */
function appendRowToSheet(rowData) {
  getSheet().appendRow(rowData);
}

/**
 * Buat sheet baru dengan nama tertentu.
 * Jika sudah ada, hapus dulu lalu buat ulang.
 * @param {string} name
 * @return {SpreadsheetApp.Sheet}
 */
function createOrReplaceSheet_(name) {
  var ss = getSS();
  var existing = ss.getSheetByName(name);
  if (existing) ss.deleteSheet(existing);
  return ss.insertSheet(name);
}
