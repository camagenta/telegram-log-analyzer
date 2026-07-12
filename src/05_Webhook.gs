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
 *
 * CARA KERJA:
 * 1. Jika pesan ini adalah system message `forum_topic_created` atau
 *    `forum_topic_edited`, baca nama langsung dari situ.
 * 2. Jika nama sudah pernah disimpan di PropertiesService, pakai itu.
 * 3. Jika tidak ada → '-'
 *
 * CATATAN: Telegram Bot API TIDAK BISA forward service messages,
 * jadi auto-discovery via forwardMessage tidak mungkin.
 * Solusi: gunakan manual naming (menu > Topics > Set Topic Name)
 * atau disable privacy mode di @BotFather agar bot menerima
 * event `forum_topic_created` langsung.
 *
 * @param {number|string} chatId
 * @param {string} topicId
 * @param {Object} msg Message object dari Telegram
 * @return {string} Nama topik
 */
function resolveTopicName_(chatId, topicId, msg) {
  if (topicId === '-') return '-';

  var props = PropertiesService.getScriptProperties();
  var savedName = props.getProperty('TOPIC_' + topicId);

  // 1. Cek apakah pesan ini berisi info pembuatan/editan topik
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

  return '-';
}

/**
 * Dapatkan daftar topik yang belum terresolve namanya (versi cepat).
 * Scan semua baris di sheet, cari Topic ID unik dengan nama '-'.
 * @param {Array<Array>} [rows] Opsional — data baris yg sudah dibaca, biar nggak baca 2×.
 * @return {Array<{chatId: string, topicId: string, groupName: string}>}
 */
function getUnresolvedTopics_(rows) {
  if (!rows) rows = getAllRows();
  var unresolved = {};
  var resolved = {};

  // Batch load semua PropertiesService keys sekaligus
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();

  rows.forEach(function (row) {
    var topicId = row[COL.TOPIC_ID];
    var topicName = row[COL.TOPIC_NAME];
    var chatId = row[COL.CHAT_ID];
    var groupName = row[COL.TITLE];

    if (topicId && topicId.toString() !== '' && topicId.toString() !== '-') {
      var key = topicId.toString().trim();
      var savedName = allProps['TOPIC_' + key];

      if (savedName && savedName !== '-') {
        resolved[key] = { name: savedName };
      } else if (!topicName || topicName === '-' || topicName.toString().trim() === '') {
        if (!unresolved[key]) {
          unresolved[key] = {
            chatId: chatId,
            topicId: key,
            groupName: groupName
          };
        }
      } else {
        resolved[key] = { name: topicName };
      }
    }
  });

  // Konversi ke array
  var result = [];
  for (var key in unresolved) {
    if (unresolved.hasOwnProperty(key) && !resolved[key]) {
      result.push(unresolved[key]);
    }
  }

  // Urutkan berdasarkan topicId (numeric)
  result.sort(function (a, b) {
    var na = parseInt(a.topicId) || 0;
    var nb = parseInt(b.topicId) || 0;
    return na - nb;
  });

  return result;
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
//  DIAGNOSTIC — Cek Grup & Topik (output ke sheet baru)
// ============================================================

/**
 * Cek grup yang terhubung — output ke sheet baru (batch).
 */
function checkLinkedGroups() {
  var rows = getAllRows();
  var groups = {};

  for (var di = 0; di < rows.length; di++) {
    var chatId = rows[di][COL.CHAT_ID].toString();
    var chatTitle = rows[di][COL.TITLE];
    if (chatId.indexOf('-') === 0 && !groups[chatId]) {
      groups[chatId] = chatTitle;
    }
  }

  var groupList = [];
  for (var id in groups) {
    if (groups.hasOwnProperty(id)) {
      groupList.push({ id: id, title: groups[id] });
    }
  }
  groupList.sort(function (a, b) { return a.title.localeCompare(b.title); });

  // Batch tulis
  var sheet = createOrReplaceSheet_('_GrupTerhubung');
  var output = [['No', 'Nama Grup', 'Chat ID']];
  groupList.forEach(function (g, i) {
    output.push([i + 1, g.title, g.id]);
  });

  sheet.getRange(1, 1, output.length, 3).setValues(output);

  // Styling
  sheet.getRange(1, 1, 1, 3)
    .setFontWeight('bold').setBackground('#4a86e8').setFontColor('white')
    .setHorizontalAlignment('center');
  if (output.length > 1) {
    sheet.getRange(2, 1, output.length - 1, 1).setHorizontalAlignment('center');
  }

  sheet.setColumnWidths(1, 1, 50);
  sheet.setColumnWidths(2, 1, 300);
  sheet.setColumnWidths(3, 1, 200);
  sheet.setFrozenRows(1);
  getSS().setActiveSheet(sheet);

  SpreadsheetApp.getUi().alert(
    '✅ Ditemukan ' + groupList.length + ' grup.\nDetail ada di sheet: _GrupTerhubung'
  );
}

/**
 * Validasi apakah string adalah numeric topic ID valid.
 * Topic ID dari Telegram selalu berupa angka positif.
 */
function isValidTopicId_(str) {
  if (!str || str.toString().trim() === '') return false;
  var s = str.toString().trim();
  // Harus angka positif, tidak boleh mengandung titik, slash, atau karakter non-digit
  return /^\d+$/.test(s) && s.length < 15;
}

/**
 * Scan topik/thread — output ke sheet baru (batch).
 */
function scanLinkedTopics() {
  var data = getAllRows();
  var topics = {};
  var props = PropertiesService.getScriptProperties();
  var allPropKeys = props.getProperties(); // Load sekaligus

  for (var di = 0; di < data.length; di++) {
    var row = data[di];
    var rawId = row[COL.TOPIC_ID];
    var threadName = row[COL.TOPIC_NAME];
    var groupName = row[COL.TITLE];

    // Validasi: Topic ID harus numeric
    if (!isValidTopicId_(rawId)) continue;

    var key = rawId.toString().trim();
    if (!topics[key]) {
      // Cek di PropertiesService dulu
      var cachedName = allPropKeys['TOPIC_' + key];
      var displayName = cachedName || 
        ((threadName && threadName !== '-') ? threadName : null);
      topics[key] = {
        name: displayName || 'Topik Tanpa Nama',
        group: groupName || '-'
      };
    }
  }

  var sortedIds = Object.keys(topics).sort(function (a, b) {
    return parseInt(a) - parseInt(b);
  });

  // Batch tulis
  var sheet = createOrReplaceSheet_('_ScanTopik');
  var output = [['No', 'Nama Topik', 'Topic ID', 'Grup']];
  var countNamed = 0;
  var countUnnamed = 0;

  sortedIds.forEach(function (id, idx) {
    var t = topics[id];
    output.push([idx + 1, t.name, id, t.group]);
    if (t.name === 'Topik Tanpa Nama') countUnnamed++;
    else countNamed++;
  });

  sheet.getRange(1, 1, output.length, 4).setValues(output);

  // Styling header
  sheet.getRange(1, 1, 1, 4)
    .setFontWeight('bold').setBackground('#4a86e8').setFontColor('white')
    .setHorizontalAlignment('center');

  // Alignment No
  if (output.length > 1) {
    sheet.getRange(2, 1, output.length - 1, 1).setHorizontalAlignment('center');
  }

  sheet.setColumnWidths(1, 1, 50);
  sheet.setColumnWidths(2, 1, 300);
  sheet.setColumnWidths(3, 1, 100);
  sheet.setColumnWidths(4, 1, 300);
  sheet.setFrozenRows(1);
  getSS().setActiveSheet(sheet);

  SpreadsheetApp.getUi().alert(
    '✅ Scan selesai!\n'
    + 'Total topik: ' + (countNamed + countUnnamed) + '\n'
    + '✓ Bernama: ' + countNamed + '\n'
    + '✗ Tanpa Nama: ' + countUnnamed + '\n\n'
    + 'Detail ada di sheet: _ScanTopik\n'
    + 'Gunakan 📌 Manajemen Topik untuk isi yang kosong.'
  );
}

// ============================================================
//  TOPIK MANAGEMENT — Manual Naming
// ============================================================

/**
 * ISI NAMA TOPIK VIA SHEET — cara paling gampang.
 *
 * CARA PAKAI:
 * 1. Jalankan "Siapkan Sheet Isian Nama Topik"
 * 2. Di sheet baru _IsiNamaTopik, isi kolom "Nama Baru" (E)
 * 3. Jalankan "Terapkan Nama dari Sheet"
 * 4. Selesai! Semua baris di log otomatis terupdate.
 */

/**
 * Step 1: Buat sheet isian nama topik (batch — cepat).
 * Optimasi: sekali baca data, sekali tulis data, minim API call.
 */
function prepareTopicNameSheet() {
  var ui = SpreadsheetApp.getUi();

  // Baca data SEKALI, dipakai untuk unresolved + sampling
  var data = getAllRows();
  var unresolved = getUnresolvedTopics_(data);
  var n = unresolved.length;

  if (n === 0) {
    ui.alert('✅ Semua topik sudah punya nama!');
    return;
  }

  // 1. Kumpulkan 2 contoh pesan per topic ID
  var sampleByTopic = {};
  for (var di = 0; di < data.length; di++) {
    var row = data[di];
    var tid = row[COL.TOPIC_ID];
    if (tid && tid.toString().trim() !== '' && tid.toString().trim() !== '-') {
      var key = tid.toString().trim();
      if (sampleByTopic[key] && sampleByTopic[key].length >= 2) continue;
      if (!sampleByTopic[key]) sampleByTopic[key] = [];
      var txt = row[COL.MESSAGE] || '';
      if (txt.length > 80) txt = txt.substring(0, 80) + '…';
      var date = (row[COL.TIMESTAMP] instanceof Date)
        ? formatDate_(row[COL.TIMESTAMP], 'dd/MM')
        : '';
      sampleByTopic[key].push(date + ' ' + txt);
    }
  }

  // 2. Cari Chat ID untuk setiap topic (buat link t.me)
  var chatIdByTopic = {};
  for (var di2 = 0; di2 < data.length; di2++) {
    var row2 = data[di2];
    var tid2 = row2[COL.TOPIC_ID];
    var cid = row2[COL.CHAT_ID];
    if (tid2 && tid2.toString().trim() !== '' && tid2.toString().trim() !== '-') {
      var key2 = tid2.toString().trim();
      if (!chatIdByTopic[key2] && cid) {
        // Simpan chat ID untuk bikin link
        chatIdByTopic[key2] = cid.toString().trim();
      }
    }
  }

  // 3. Buat sheet baru
  var sheet = createOrReplaceSheet_('_IsiNamaTopik');

  // 4. Batch tulis HEADER + DATA (sekali API call)
  var numCols = 7;
  var output = [];
  // Header
  output.push(['No', 'Topic ID', 'Nama Saat Ini', 'Grup',
    '🔗 Link Topik (klik untuk lihat)', '✏️ Nama Baru (isi di sini)', '📄 Contoh Pesan']);

  // Data rows
  for (var i = 0; i < n; i++) {
    var t = unresolved[i];
    var samples = sampleByTopic[t.topicId] || [];

    // Bikin link t.me
    var chatId = chatIdByTopic[t.topicId] || '';
    var link = '';
    if (chatId) {
      // Supergroup: -1001234567890 → t.me/c/1234567890/TOPIC_ID
      var cleanId = chatId.replace(/^-100/, '');
      link = 'https://t.me/c/' + cleanId + '/' + t.topicId;
    }

    output.push([
      i + 1,
      t.topicId,
      'Topik Tanpa Nama',
      t.groupName || '-',
      link, // 🔗 Link
      '', // Nama Baru — kosong, diisi user
      samples.length > 0 ? samples.join('\n') : '(tidak ada contoh)'
    ]);
  }

  // Satu kali tulis semua
  var dataRange = sheet.getRange(1, 1, output.length, numCols);
  dataRange.setValues(output);

  // 5. Batch styling header
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange
    .setFontWeight('bold')
    .setBackground('#4a86e8')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // 6. Styling kolom
  sheet.setColumnWidths(1, 1, 40);
  sheet.setColumnWidths(2, 1, 80);
  sheet.setColumnWidths(3, 1, 140);
  sheet.setColumnWidths(4, 1, 250);
  sheet.setColumnWidths(5, 1, 320); // Link column
  sheet.setColumnWidths(6, 1, 230); // Nama Baru
  sheet.setColumnWidths(7, 1, 350); // Contoh Pesan

  // 7. Wrap text kolom contoh
  sheet.getRange(2, 7, n, 1).setWrap(true);

  // 8. Highlight kolom input (kuning)
  sheet.getRange(2, 6, n, 1).setBackground('#fff3cd');

  // 9. Row height
  for (var ri = 0; ri < n; ri++) {
    sheet.setRowHeight(ri + 2, 40);
  }

  // 10. Freeze header + aktifkan
  sheet.setFrozenRows(1);
  getSS().setActiveSheet(sheet);

  // 11. Alert ringkas
  ui.alert(
    '✅ Sheet _IsiNamaTopik siap!\n\n'
    + n + ' topik tanpa nama terdaftar.\n\n'
    + 'Cara:\n'
    + '1. Klik kolom "🔗 Link Topik" — buka di browser/Telegram\n'
    + '2. Lihat nama topiknya di sana\n'
    + '3. Ketik nama di kolom kuning "✏️ Nama Baru"\n'
    + '4. Jalankan: ✅ Terapkan Nama dari Sheet'
  );
}

/**
 * Step 2: Baca sheet _IsiNamaTopik, simpan nama, update log.
 * Optimasi: baca data log sekali, update memory, tulis sekali.
 */
function applyTopicNamesFromSheet() {
  var ss = getSS();
  var ui = SpreadsheetApp.getUi();
  var sheet = ss.getSheetByName('_IsiNamaTopik');

  if (!sheet) {
    ui.alert(
      '❌ Sheet _IsiNamaTopik tidak ditemukan.\n\n'
      + 'Jalankan dulu: 📌 Manajemen Topik > Siapkan Sheet Isian Nama Topik'
    );
    return;
  }

  // Baca isian dari sheet _IsiNamaTopik
  var inputData = sheet.getDataRange().getValues();
  if (inputData.length < 2) {
    ui.alert('Sheet kosong.');
    return;
  }

  // Kumpulkan mapping Topic ID → Nama Baru
  // Kolom: 0=No, 1=TopicID, 2=Nama, 3=Grup, 4=Link, 5=Nama Baru, 6=Contoh
  var nameMap = {};
  for (var i = 1; i < inputData.length; i++) {
    var row = inputData[i];
    var topicId = row[1] ? row[1].toString().trim() : '';
    var newName = row[5] ? row[5].toString().trim() : '';
    if (topicId && newName) {
      nameMap[topicId] = newName;
    }
  }

  var topicIds = Object.keys(nameMap);
  if (topicIds.length === 0) {
    ui.alert(
      'ℹ️ Tidak ada nama baru ditemukan.\n\n'
      + 'Isi kolom "✏️ Nama Baru" di sheet _IsiNamaTopik,\n'
      + 'lalu jalankan ini lagi.'
    );
    return;
  }

  // Simpan ke PropertiesService (batch)
  var props = PropertiesService.getScriptProperties();
  topicIds.forEach(function (id) {
    props.setProperty('TOPIC_' + id, nameMap[id]);
  });

  // Update sheet log: baca SEKALI, update memory, tulis SEKALI
  var logSheet = getSheet();
  var logData = logSheet.getDataRange().getValues();

  // Safety: pastikan kolom cukup
  var expectedCols = COL.TOPIC_NAME + 1; // 16
  if (logData.length === 0 || logData[0].length < expectedCols) {
    ui.alert('❌ Struktur log sheet tidak sesuai. Jalankan:\n🤖 Dashboard Bot > 1. Setup Log Sheet');
    return;
  }

  var updatedCount = 0;

  for (var ri = 1; ri < logData.length; ri++) {
    var tid = logData[ri][COL.TOPIC_ID];
    if (tid) {
      var key = tid.toString().trim();
      if (nameMap[key]) {
        logData[ri][COL.TOPIC_NAME] = nameMap[key];
        updatedCount++;
      }
    }
  }

  // Tulis balik semua data log (sekali API call)
  logSheet.getRange(1, 1, logData.length, logData[0].length).setValues(logData);

  ui.alert(
    '✅ ' + topicIds.length + ' nama topik diterapkan!\n'
    + updatedCount + ' baris di log diupdate.\n\n'
    + 'Coba jalankan 📊 Analisa Bulanan untuk lihat hasilnya.'
  );
}

/**
 * Reset semua nama topik — bersihkan log + PropertiesService.
 * Gunakan kalau ada anomali/geser data.
 */
function resetAllTopicNames() {
  var ui = SpreadsheetApp.getUi();

  var confirm = ui.alert(
    '⚠️ Reset Semua Nama Topik',
    'Ini akan MENGHAPUS semua nama topik yang sudah kamu set.\n\n'
    + '• Cache PropertiesService dibersihkan\n'
    + '• Kolom Topic Name di log direset ke "-"\n'
    + '• Sheet _IsiNamaTopik & _ScanTopik dihapus\n'
    + 'LANJUTKAN?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var props = PropertiesService.getScriptProperties();
  var allKeys = props.getKeys();
  var cleared = 0;
  allKeys.forEach(function (k) {
    if (k.indexOf('TOPIC_') === 0) {
      props.deleteProperty(k);
      cleared++;
    }
  });

  // Hapus sheet
  var ss = getSS();
  ['_IsiNamaTopik', '_ScanTopik', '_GrupTerhubung'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh) ss.deleteSheet(sh);
  });

  // Reset kolom Topic Name di log
  var logSheet = getSheet();
  var logData = logSheet.getDataRange().getValues();
  var resetCount = 0;
  for (var ri = 1; ri < logData.length; ri++) {
    var tid = logData[ri][COL.TOPIC_ID];
    if (tid && tid.toString().trim() !== '' && tid.toString().trim() !== '-') {
      logData[ri][COL.TOPIC_NAME] = '-';
      resetCount++;
    }
  }
  logSheet.getRange(1, 1, logData.length, logData[0].length).setValues(logData);

  ui.alert(
    '✅ Reset selesai!\n\n'
    + '• ' + cleared + ' cache PropertiesService dihapus\n'
    + '• ' + resetCount + ' baris log direset\n\n'
    + 'Sekarang jalankan:\n'
    + '📌 Manajemen Topik > 📋 Siapkan Sheet Isian Nama Topik\n'
    + 'untuk mulai dari awal.'
  );
}

/**
 * Batch re-discover: scan topik yang masih '-' dari cache PropertiesService.
 */
function batchResolveTopicNames() {
  var data = getAllRows();
  var props = PropertiesService.getScriptProperties();
  var allKeys = props.getProperties();
  var resolved = {};
  for (var key in allKeys) {
    if (key.indexOf('TOPIC_') === 0) {
      resolved[key.replace('TOPIC_', '')] = allKeys[key];
    }
  }
  if (Object.keys(resolved).length === 0) {
    SpreadsheetApp.getUi().alert('ℹ️ Tidak ada nama topik di cache PropertiesService.');
    return;
  }

  var logSheet = getSheet();
  var logData = logSheet.getDataRange().getValues();
  var updated = 0;
  for (var ri = 1; ri < logData.length; ri++) {
    var tid = logData[ri][COL.TOPIC_ID];
    var curr = logData[ri][COL.TOPIC_NAME];
    if (tid) {
      var key = tid.toString().trim();
      if (resolved[key] && (!curr || curr === '-' || curr.toString().trim() === '')) {
        logData[ri][COL.TOPIC_NAME] = resolved[key];
        updated++;
      }
    }
  }
  if (updated > 0) {
    logSheet.getRange(1, 1, logData.length, logData[0].length).setValues(logData);
  }
  SpreadsheetApp.getUi().alert(
    updated > 0
      ? '✅ ' + updated + ' baris diupdate dari cache PropertiesService.'
      : 'ℹ️ Tidak ada yang perlu diupdate.'
  );
}
