/**
 * ============================================================
 *  07_COMMANDS.gs — Bot Commands via Telegram
 * ============================================================
 *  Menangani perintah /start, /report, /stats, /groups, /help
 *  Tambahkan ini di doPost():
 *    if (msg.text && msg.text.indexOf('/') === 0) {
 *      handleTelegramCommand(msg);
 *      return;
 *    }
 *  (Sudah terintegrasi di 05_Webhook.gs)
 * ============================================================
 */

/**
 * Router utama untuk semua command Telegram.
 * @param {Object} msg Message object dari Telegram
 */
function handleTelegramCommand(msg) {
  assertConfig();
  var chatId = msg.chat.id;
  var text = (msg.text || '').trim().toLowerCase();

  if (text === '/start') {
    sendText(chatId,
      '🤖 *Bot Aktif!*\n\n'
      + 'Perintah yang tersedia:\n'
      + '/report — Laporan bulanan singkat\n'
      + '/stats — Statistik cepat\n'
      + '/groups — Daftar grup terhubung\n'
      + '/help — Bantuan'
    );
    return;
  }

  if (text === '/report' || text === '/report@' + getBotUsername_()) {
    sendTelegramMonthlyReport(chatId);
    return;
  }

  if (text === '/stats') {
    sendTelegramQuickStats(chatId);
    return;
  }

  if (text === '/groups') {
    sendTelegramGroupList(chatId);
    return;
  }

  if (text === '/help') {
    sendText(chatId,
      '📖 *Bantuan Bot*\n\n'
      + '/report — Laporan analisa bulan terakhir\n'
      + '/stats — Statistik cepat\n'
      + '/groups — Lihat grup yang terhubung\n'
      + '/start — Sambutan awal\n'
      + '/help — Bantuan ini\n\n'
      + '_Bot mencatat & menganalisa pesan grup._'
    );
    return;
  }

  // Command tidak dikenal
  sendText(chatId, '❌ Perintah tidak dikenal. Ketik /help untuk bantuan.');
}

/**
 * Kirim laporan bulanan via Telegram (dari command /report).
 * @param {number|string} chatId
 */
function sendTelegramMonthlyReport(chatId) {
  var available = getAvailableMonths();
  if (available.length === 0) {
    sendText(chatId, '❌ Belum ada data.');
    return;
  }

  var latest = available[0];
  var allRows = getAllRows();
  var filtered = filterByMonth_(allRows, latest.year, latest.month);

  if (filtered.length === 0) {
    sendText(chatId,
      '❌ Tidak ada data untuk ' + getMonthName_(latest.month) + ' ' + latest.year
    );
    return;
  }

  var report = buildFullReport_(filtered, allRows, latest.year, latest.month);
  var text = formatReportForTelegram_(report);

  // Potong jika > 4000 chars (limit Telegram)
  if (text.length > 4000) {
    text = text.substring(0, 3900) + '\n\n... _(laporan dipotong, lihat sheet lengkap)_';
  }

  sendText(chatId, text);
}

/**
 * Kirim statistik cepat via Telegram.
 * @param {number|string} chatId
 */
function sendTelegramQuickStats(chatId) {
  var rows = getAllRows();

  if (rows.length === 0) {
    sendText(chatId, '❌ Belum ada data.');
    return;
  }

  var total = rows.length;
  var todayStr = formatDate_(now_(), 'yyyy-MM-dd');

  var todayCount = 0;
  var todayUsers = {};

  rows.forEach(function (row) {
    var ts = row[COL.TIMESTAMP];
    var d = (ts instanceof Date) ? ts : new Date(ts);
    if (isNaN(d.getTime())) return;
    if (formatDate_(d, 'yyyy-MM-dd') === todayStr) {
      todayCount++;
      todayUsers[row[COL.SENDER] || 'Unknown'] = true;
    }
  });

  // Hitung grup unik
  var groupSet = {};
  rows.forEach(function (row) {
    groupSet[row[COL.TITLE] || 'Unknown'] = true;
  });

  var text = '';
  text += '📊 * STATISTIK CEPAT *\n';
  text += '━━━━━━━━━━━━━━━━━━━\n';
  text += '📝 *Total Pesan:* ' + total + '\n';
  text += '👥 *Grup Terpantau:* ' + Object.keys(groupSet).length + '\n';
  text += '📅 *Hari Ini:* ' + todayCount + ' pesan dari '
    + Object.keys(todayUsers).length + ' user\n';
  text += '━━━━━━━━━━━━━━━━━━━\n';
  text += '📌 Ketik /report untuk laporan bulanan.';

  sendText(chatId, text);
}

/**
 * Kirim daftar grup via Telegram.
 * @param {number|string} chatId
 */
function sendTelegramGroupList(chatId) {
  var rows = getAllRows();
  var groups = {};

  rows.forEach(function (row) {
    var chatIdRaw = row[COL.CHAT_ID];
    var groupName = row[COL.TITLE] || 'Unknown';
    var tipe = row[COL.TYPE] || '';
    if (tipe === 'group' || tipe === 'supergroup') {
      groups[chatIdRaw.toString()] = groupName;
    }
  });

  var text = '🔍 *Grup Terhubung:*\n\n';
  var count = 0;
  for (var id in groups) {
    if (groups.hasOwnProperty(id)) {
      count++;
      text += count + '. ' + groups[id] + '\n';
    }
  }
  if (count === 0) text += 'Belum ada grup terdeteksi.';

  sendText(chatId, text);
}

/**
 * Dapatkan username bot — coba dari getMe API.
 * @return {string}
 */
function getBotUsername_() {
  try {
    var response = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + getToken() + '/getMe'
    );
    var data = JSON.parse(response.getContentText());
    return data.result ? data.result.username.toLowerCase() : 'bot';
  } catch (e) {
    return 'bot';
  }
}
