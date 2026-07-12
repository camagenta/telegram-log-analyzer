/**
 * ============================================================
 *  05_WEBHOOK.gs — Handler Utama Webhook Telegram
 * ============================================================
 *  doPost() adalah entry point untuk semua pesan masuk.
 *  Juga: topic discovery via forward-pancingan.
 *  
 *  Dependensi: Semua file sebelumnya (Config, Utils, Telegram, Drive, Sheet)
 * ============================================================
 */

/**
 * Handler utama — dipanggil oleh Telegram setiap ada pesan baru.
 * @param {Object} e Event object dari doPost
 */
function doPost(e) {
  try {
    assertConfig();
    var contents = JSON.parse(e.postData.contents);
    if (!contents.message) return;

    var msg = contents.message;

    // ---------------------
    // HANDLE BOT COMMANDS
    // ---------------------
    if (msg.text && msg.text.indexOf('/') === 0) {
      handleTelegramCommand(msg);
      return; // Stop — command gak perlu di-log
    }

    var timestamp = new Date();

    // --- DATA CHAT & GRUP ---
    var chatId = msg.chat.id;
    var chatType = msg.chat.type; // 'private', 'group', atau 'supergroup'
    var chatTitle = msg.chat.title || 'Private Chat';

    // --- DATA TOPIK (FORUM) ---
    var topicId = msg.message_thread_id || '';
    if (topicId === '') topicId = '-';
    var topicName = resolveTopicName_(chatId, topicId, msg);

    // --- DATA PENGIRIM ---
    var userId = msg.from ? msg.from.id : '-';
    var username = msg.from ? (msg.from.username || '-') : '-';
    var senderName = msg.from
      ? ((msg.from.first_name || '') + ' ' + (msg.from.last_name || '')).trim()
      : '-';

    // --- DATA FORWARD ---
    var forwardInfo = parseForwardInfo_(msg);

    // --- DATA PESAN ---
    var textLog = '';
    var typeLog = '';
    var fileId = '';
    var metadata = '-';
    var fileName = '';
    var timeString = formatDate_(timestamp, 'yyyyMMdd_HHmmss');

    // --- DETEKSI JENIS PESAN (berlapis) ---
    if (msg.forum_topic_created) {
      typeLog = 'System (Topic Created)';
      textLog = 'Topik Baru: ' + topicName;
    }
    else if (msg.text) {
      typeLog = 'Text';
      textLog = msg.text;
    }
    else if (msg.photo) {
      typeLog = 'Photo';
      var p = msg.photo[msg.photo.length - 1];
      fileId = p.file_id;
      fileName = 'IMG_' + timeString + '.jpg';
      textLog = msg.caption || '[Photo tanpa caption]';
      metadata = 'Size: ' + (p.file_size / 1024).toFixed(2) + ' KB, Res: ' + p.width + 'x' + p.height;
    }
    else if (msg.video) {
      typeLog = 'Video';
      fileId = msg.video.file_id;
      fileName = msg.video.file_name || 'VID_' + timeString + '.mp4';
      textLog = msg.caption || '[Video: ' + (msg.video.file_name || 'tanpa nama') + ']';
      metadata = 'Size: ' + (msg.video.file_size / 1048576).toFixed(2)
        + ' MB, Dur: ' + msg.video.duration + 's, Res: ' + msg.video.width + 'x' + msg.video.height;
    }
    else if (msg.animation) {
      typeLog = 'Animation/GIF';
      fileId = msg.animation.file_id;
      fileName = 'GIF_' + timeString + '.mp4';
      textLog = msg.caption || '[GIF/Animation]';
      var sizeMB = (msg.animation.file_size / 1048576).toFixed(2);
      metadata = 'Size: ' + sizeMB + ' MB, Res: ' + msg.animation.width + 'x'
        + msg.animation.height + ', Dur: ' + msg.animation.duration + 's';
    }
    else if (msg.voice) {
      typeLog = 'Voice';
      fileId = msg.voice.file_id;
      fileName = 'VOICE_' + timeString + '.ogg';
      textLog = '[Voice Message]';
      metadata = 'Size: ' + (msg.voice.file_size / 1024).toFixed(2) + ' KB, Dur: ' + msg.voice.duration + 's';
    }
    else if (msg.document) {
      typeLog = 'Document (' + (msg.document.file_name || 'file') + ')';
      fileId = msg.document.file_id;
      fileName = msg.document.file_name || 'DOC_' + timeString;
      textLog = msg.caption || '[Document: ' + (msg.document.file_name || 'tanpa nama') + ']';
      metadata = 'Size: ' + (msg.document.file_size / 1024).toFixed(2) + ' KB, Mime: ' + msg.document.mime_type;
    }
    else {
      typeLog = 'Unknown/Other';
      textLog = 'Tipe pesan tidak didukung';
    }

    // --- SIMPAN FILE KE DRIVE (jika ada) ---
    var finalLink = '-';
    var downloadLink = '-';
    if (fileId !== '') {
      downloadLink = getFileLink(fileId);
      finalLink = saveToDrive(fileId, fileName);
    }

    // --- KIRIM KONFIRMASI KE TELEGRAM ---
    if (fileId !== '') {
      sendText(chatId, '✅ ' + typeLog + ' berhasil disimpan ke Google Drive.');
    }

    // --- SIMPAN KE SHEET ---
    var rowData = [
      timestamp, chatId, userId,
      chatType,
      chatTitle,
      senderName, username, senderName,
      textLog, typeLog, downloadLink, metadata,
      finalLink, forwardInfo, topicId, topicName
    ];
    appendRowToSheet(rowData);

  } catch (err) {
    console.error('doPost error: ' + err.toString());
  }
}

// ============================================================
//  TOPIC DISCOVERY
// ============================================================

/**
 * Resolve nama topik dari message thread.
 * Simpan nama yang ditemukan ke PropertiesService.
 * @param {number|string} chatId
 * @param {string} topicId
 * @param {Object} msg Message object dari Telegram
 * @return {string} Nama topik
 */
function resolveTopicName_(chatId, topicId, msg) {
  if (topicId === '-') return '-';

  var props = PropertiesService.getScriptProperties();
  var savedName = props.getProperty('TOPIC_' + topicId);

  // 1. Cek apakah ada perubahan nama topik
  var newNameDetected = '';
  if (msg.forum_topic_created) {
    newNameDetected = msg.forum_topic_created.name;
  } else if (msg.forum_topic_edited && msg.forum_topic_edited.name) {
    newNameDetected = msg.forum_topic_edited.name;
  }

  if (newNameDetected !== '') {
    props.setProperty('TOPIC_' + topicId, newNameDetected);
    return newNameDetected;
  }

  // 2. Jika sudah pernah disimpan, pakai itu
  if (savedName) return savedName;

  // 3. DISCOVERY MODE: forward pancingan
  var discoveredName = fetchTopicNameByForwarding_(chatId, topicId, msg.from ? msg.from.id : chatId);
  if (discoveredName) {
    props.setProperty('TOPIC_' + topicId, discoveredName);
    return discoveredName;
  }

  return '-';
}

/**
 * Discovery nama topik dengan forward pancingan.
 * Forward pesan pembuatan topik ke user, baca responsenya, lalu hapus.
 * @param {number|string} fromChatId
 * @param {number} messageIdToForward
 * @param {number|string} targetChatId
 * @return {string|null}
 */
function fetchTopicNameByForwarding_(fromChatId, messageIdToForward, targetChatId) {
  try {
    console.log('=== DISCOVERY START ===');
    console.log('From Chat:', fromChatId, 'Message ID:', messageIdToForward);

    var data = forwardMessage(fromChatId, messageIdToForward, targetChatId);
    if (!data || !data.ok || !data.result) {
      console.error('Forward Failed:', JSON.stringify(data));
      return null;
    }

    var forwardedMsg = data.result;
    var discoveredName = null;

    if (forwardedMsg.forum_topic_created) {
      discoveredName = forwardedMsg.forum_topic_created.name;
      console.log('✅ Topic Name Found:', discoveredName);
    } else {
      console.log('❌ No forum_topic_created in forwarded message');
    }

    // Hapus pesan pancingan
    deleteMessage(targetChatId, forwardedMsg.message_id);

    console.log('=== DISCOVERY END:', discoveredName || 'FAILED', '===');
    return discoveredName;

  } catch (e) {
    console.error('Discovery error:', e.toString());
    return null;
  }
}

// ============================================================
//  FORWARD INFO PARSER
// ============================================================

/**
 * Parse informasi forward dari message object.
 * Support API baru (forward_origin) dan legacy (forward_from*).
 * @param {Object} msg
 * @return {string}
 */
function parseForwardInfo_(msg) {
  // API Baru: forward_origin
  if (msg.forward_origin) {
    var origin = msg.forward_origin;

    if (origin.type === 'user') {
      var fwdUser = origin.sender_user;
      return '👤 User: ' + (fwdUser.first_name || '') + ' ' + (fwdUser.last_name || '')
        + ' (@' + (fwdUser.username || 'no_username') + ')';
    } else if (origin.type === 'hidden_user') {
      return '🔒 Hidden User: ' + (origin.sender_user_name || 'Unknown');
    } else if (origin.type === 'chat' || origin.type === 'channel') {
      var fwdChat = origin.chat;
      var result = '📢 ' + (fwdChat.type === 'channel' ? 'Channel' : 'Group')
        + ': ' + (fwdChat.title || 'Unknown') + ' (ID: ' + fwdChat.id + ')';
      if (origin.author_signature) result += ' | By: ' + origin.author_signature;
      return result;
    }
  }

  // Legacy API
  if (msg.forward_from) {
    var fUser = msg.forward_from;
    return '👤 User: ' + (fUser.first_name || '') + ' ' + (fUser.last_name || '')
      + ' (@' + (fUser.username || 'no_username') + ')';
  } else if (msg.forward_from_chat) {
    var fChat = msg.forward_from_chat;
    var result = '📢 ' + (fChat.type === 'channel' ? 'Channel' : 'Group')
      + ': ' + (fChat.title || 'Unknown') + ' (ID: ' + fChat.id + ')';
    if (msg.forward_signature) result += ' | By: ' + msg.forward_signature;
    return result;
  } else if (msg.forward_sender_name) {
    return '🔒 Hidden User: ' + msg.forward_sender_name;
  }

  return '-';
}

// ============================================================
//  DIAGNOSTIC — Cek Grup & Topik
// ============================================================

/**
 * Cek grup yang terhubung — tampilkan alert.
 */
function checkLinkedGroups() {
  var rows = getAllRows();
  var groups = {};

  rows.forEach(function (row) {
    var chatId = row[COL.CHAT_ID].toString();
    var chatTitle = row[COL.TITLE];

    if (chatId.indexOf('-') === 0) {
      if (!groups[chatId]) {
        groups[chatId] = chatTitle;
      }
    }
  });

  var output = 'Daftar Grup yang Terhubung:\n\n';
  var count = 0;
  for (var id in groups) {
    if (groups.hasOwnProperty(id)) {
      output += (count + 1) + '. ' + groups[id] + ' (ID: ' + id + ')\n';
      count++;
    }
  }

  SpreadsheetApp.getUi().alert(
    count === 0 ? 'Belum ada data grup yang tercatat di log.' : output
  );
}

/**
 * Scan topik/thread yang terdeteksi.
 */
function scanLinkedTopics() {
  var rows = getAllRows();
  var topics = {};

  rows.forEach(function (row) {
    var threadId = row[COL.TOPIC_ID];
    var threadName = row[COL.TOPIC_NAME];
    var groupName = row[COL.TITLE];

    if (threadId && threadId.toString() !== '' && threadId.toString() !== '-') {
      var key = threadId.toString();
      if (!topics[key] || (topics[key].name === '-' && threadName !== '-' && threadName)) {
        topics[key] = {
          name: (threadName && threadName !== '-') ? threadName : 'Topik Tanpa Nama',
          group: groupName
        };
      }
    }
  });

  var output = 'Daftar Topik/Thread yang Terdeteksi:\n\n';
  var count = 0;
  for (var id in topics) {
    if (topics.hasOwnProperty(id)) {
      output += (count + 1) + '. ' + topics[id].name + ' (ID: ' + id + ')\n   Grup: ' + topics[id].group + '\n';
      count++;
    }
  }

  SpreadsheetApp.getUi().alert(
    count === 0
      ? 'Belum ada data topik yang terdeteksi. Pastikan kolom Topic ID sudah terisi.'
      : output
  );
}
