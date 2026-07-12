/**
 * ============================================================
 *  01_UTILS.gs — Fungsi Bantu Umum
 * ============================================================
 */

/**
 * Ambil nama bulan dalam Bahasa Indonesia.
 * @param {number} m Angka bulan (1-12)
 * @return {string}
 */
function getMonthName_(m) {
  var names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return names[m - 1] || 'Bulan ' + m;
}

/**
 * Pad zero untuk angka 1-9 → 01-09.
 * @param {number} n
 * @return {string}
 */
function padZero_(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * Urutkan object { key: count } descending by count.
 * Return array [{ name, count }].
 * @param {Object} obj
 * @return {Array<{name: string, count: number}>}
 */
function sortObjectDesc_(obj) {
  var arr = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      arr.push({ name: key, count: obj[key] });
    }
  }
  arr.sort(function (a, b) { return b.count - a.count; });
  return arr;
}

/**
 * Filter array of rows berdasarkan tahun & bulan.
 * Kolom timestamp ada di index COL.TIMESTAMP (0).
 * @param {Array<Array>} rows Data baris (tanpa header)
 * @param {number} year
 * @param {number} month
 * @return {Array<Array>}
 */
function filterByMonth_(rows, year, month) {
  return rows.filter(function (row) {
    var ts = row[COL.TIMESTAMP];
    if (!ts) return false;

    var d = (ts instanceof Date) ? ts : new Date(ts);
    if (isNaN(d.getTime())) return false;

    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });
}

/**
 * Parse ukuran dari string metadata Telegram.
 * Contoh: "Size: 123.45 KB, Res: 1920x1080"
 *         "Size: 1.23 MB, Dur: 30s"
 * @param {string} metadata
 * @return {number} Ukuran dalam KB
 */
function parseSizeFromMetadata_(metadata) {
  if (!metadata || metadata === '-') return 0;
  var str = metadata.toString();

  // Cari "Size: X.XX MB"
  var mbMatch = str.match(/Size:\s*([\d.]+)\s*MB/i);
  if (mbMatch) return parseFloat(mbMatch[1]) * 1024;

  // Cari "Size: X.XX KB"
  var kbMatch = str.match(/Size:\s*([\d.]+)\s*KB/i);
  if (kbMatch) return parseFloat(kbMatch[1]);

  return 0;
}

/**
 * Format tanggal ke string (GMT+7 / WIB).
 * @param {Date} date
 * @param {string} format
 * @return {string}
 */
function formatDate_(date, format) {
  return Utilities.formatDate(date, 'GMT+7', format || 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Dapatkan tanggal sekarang di GMT+7.
 * @return {Date}
 */
function now_() {
  return new Date();
}
