/**
 * ============================================================
 *  02_TELEGRAM.gs — Komunikasi dengan Telegram Bot API
 * ============================================================
 *  Semua fungsi yang berinteraksi dengan Telegram API.
 *  Dependensi: 00_Config.gs (getToken)
 * ============================================================
 */

/**
 * Kirim pesan teks ke chat Telegram.
 * @param {number|string} chatId
 * @param {string} text
 * @param {Object} opts Opsional: parse_mode, reply_markup, dll
 */
function sendText(chatId, text, opts) {
  assertConfig();
  var url = 'https://api.telegram.org/bot' + getToken() + '/sendMessage';
  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: opts && opts.parse_mode ? opts.parse_mode : 'HTML'
  };

  // Merge optional params
  if (opts) {
    for (var key in opts) {
      if (opts.hasOwnProperty(key)) payload[key] = opts[key];
    }
  }

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };

  try {
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    console.error('sendText error:', e.toString());
  }
}

/**
 * Hapus pesan dari chat Telegram.
 * @param {number|string} chatId
 * @param {number} messageId
 */
function deleteMessage(chatId, messageId) {
  try {
    var url = 'https://api.telegram.org/bot' + getToken() + '/deleteMessage';
    var payload = {
      chat_id: chatId,
      message_id: messageId
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    // Ignore error delete (misal pesan sudah hilang)
    console.warn('deleteMessage warning:', e.toString());
  }
}

/**
 * Dapatkan link download file dari Telegram berdasarkan file_id.
 * @param {string} fileId
 * @return {string}
 */
function getFileLink(fileId) {
  try {
    var response = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + getToken() + '/getFile?file_id=' + fileId
    );
    var filePath = JSON.parse(response.getContentText()).result.file_path;
    return 'https://api.telegram.org/file/bot' + getToken() + '/' + filePath;
  } catch (e) {
    return 'Gagal mendapatkan link';
  }
}

/**
 * Forward pesan ke chat lain (dipakai untuk topic discovery).
 * @param {number|string} fromChatId
 * @param {number} messageId
 * @param {number|string} targetChatId
 * @return {Object|null} Response JSON dari Telegram
 */
function forwardMessage(fromChatId, messageId, targetChatId) {
  try {
    var url = 'https://api.telegram.org/bot' + getToken() + '/forwardMessage';
    var payload = {
      chat_id: targetChatId,
      from_chat_id: fromChatId,
      message_id: messageId
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    };
    var response = UrlFetchApp.fetch(url, options);
    return JSON.parse(response.getContentText());
  } catch (e) {
    console.error('forwardMessage error:', e.toString());
    return null;
  }
}

// ============================================================
//  WEBHOOK MANAGEMENT
// ============================================================

/**
 * Set webhook Telegram ke URL yang dimasukkan user.
 */
function setWebhook() {
  assertConfig();
  var urlWebID = Browser.inputBox(
    'Set Webhook',
    'Masukkan URL Web App (dari hasil Deploy):',
    Browser.Buttons.OK_CANCEL
  );
  if (urlWebID === 'cancel' || urlWebID === '') return;

  var response = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + getToken() + '/setWebhook?url=' + encodeURIComponent(urlWebID)
  );
  Browser.msgBox('Response Telegram:\n' + response.getContentText());
}

/**
 * Cek status webhook saat ini.
 */
function getWebhookInfo() {
  assertConfig();
  var response = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + getToken() + '/getWebhookInfo'
  );
  Browser.msgBox('Status Webhook:\n' + response.getContentText());
}

/**
 * Hapus webhook (nonaktifkan).
 */
function deleteWebhook() {
  assertConfig();
  var response = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + getToken() + '/deleteWebhook'
  );
  Browser.msgBox('Webhook dihapus:\n' + response.getContentText());
}
