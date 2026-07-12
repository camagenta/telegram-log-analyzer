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
 * Dapatkan daftar topik yang belum terresolve namanya.
 * Scan semua baris di sheet, cari Topic ID unik dengan nama '-'.
 * @return {Array<{chatId: string, topicId: string, groupName: string}>}
 */
function getUnresolvedTopics_() {
  var rows = getAllRows();
  var unresolved = {};
  var resolved = {};

  // Kumpulin semua topik beserta statusnya
  rows.forEach(function (row) {
    var topicId = row[COL.TOPIC_ID];
    var topicName = row[COL.TOPIC_NAME];
    var chatId = row[COL.CHAT_ID];
    var groupName = row[COL.TITLE];

    if (topicId && topicId.toString() !== '' && topicId.toString() !== '-') {
      var key = topicId.toString().trim();

      // Cek apakah nama sudah di-set di PropertiesService
      var savedName = PropertiesService.getScriptProperties().getProperty('TOPIC_' + key);

      if (savedName && savedName !== '-') {
        resolved[key] = { name: savedName };
      } else if (!topicName || topicName === '-' || topicName.toString().trim() === '') {
        if (!unresolved[key]) {
          unresolved[key] = {
            chatId: chatId,
            topicId: key,
            groupName: groupName,
            exampleName: '' // akan diisi dari baris lain
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
 * Cek grup yang terhubung — output ke sheet baru.
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

  var groupList = [];
  for (var id in groups) {
    if (groups.hasOwnProperty(id)) {
      groupList.push({ id: id, title: groups[id] });
    }
  }
  groupList.sort(function (a, b) { return a.title.localeCompare(b.title); });

  // Output ke sheet baru
  var sheet = createOrReplaceSheet_('_GrupTerhubung');
  var row = 1;
  sheet.getRange(row, 1, 1, 3)
    .setValues([['No', 'Nama Grup', 'Chat ID']])
    .setFontWeight('bold').setBackground('#4a86e8').setFontColor('white');
  row++;
  groupList.forEach(function (g, i) {
    sheet.getRange(row, 1).setValue(i + 1).setHorizontalAlignment('center');
    sheet.getRange(row, 2).setValue(g.title);
    sheet.getRange(row, 3).setValue(g.id);
    row++;
  });
  sheet.setColumnWidths(1, 1, 50);
  sheet.setColumnWidths(2, 1, 300);
  sheet.setColumnWidths(3, 1, 200);
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
 * Scan topik/thread — output ke sheet baru + alert ringkasan.
 */
function scanLinkedTopics() {
  var rows = getAllRows();
  var topics = {};

  rows.forEach(function (row) {
    var rawId = row[COL.TOPIC_ID];
    var threadName = row[COL.TOPIC_NAME];
    var groupName = row[COL.TITLE];

    // Validasi: Topic ID harus numeric, bukan file ID / URL / metadata
    if (!isValidTopicId_(rawId)) return;

    var key = rawId.toString().trim();
    if (!topics[key]) {
      topics[key] = {
        name: (threadName && threadName !== '-') ? threadName : 'Topik Tanpa Nama',
        group: groupName || '-'
      };
    } else {
      // Update name jika sebelumnya '-' dan sekarang ada
      if (topics[key].name === 'Topik Tanpa Nama' && threadName && threadName !== '-') {
        topics[key].name = threadName;
      }
    }
  });

  // Output ke sheet baru
  var sheet = createOrReplaceSheet_('_ScanTopik');
  var row = 1;
  sheet.getRange(row, 1, 1, 4)
    .setValues([['No', 'Nama Topik', 'Topic ID', 'Grup']])
    .setFontWeight('bold').setBackground('#4a86e8').setFontColor('white');
  row++;

  var sortedIds = Object.keys(topics).sort(function (a, b) {
    return parseInt(a) - parseInt(b);
  });

  var countNamed = 0;
  var countUnnamed = 0;

  sortedIds.forEach(function (id) {
    var t = topics[id];
    sheet.getRange(row, 1).setValue(row - 1).setHorizontalAlignment('center');
    sheet.getRange(row, 2).setValue(t.name);
    sheet.getRange(row, 3).setValue(id);
    sheet.getRange(row, 4).setValue(t.group);
    if (t.name === 'Topik Tanpa Nama') countUnnamed++;
    else countNamed++;
    row++;
  });

  sheet.setColumnWidths(1, 1, 50);
  sheet.setColumnWidths(2, 1, 300);
  sheet.setColumnWidths(3, 1, 100);
  sheet.setColumnWidths(4, 1, 300);
  getSS().setActiveSheet(sheet);

  SpreadsheetApp.getUi().alert(
    '✅ Scan selesai!\n'
    + 'Total topik: ' + (countNamed + countUnnamed) + '\n'
    + '✓ Bernama: ' + countNamed + '\n'
    + '✗ Tanpa Nama: ' + countUnnamed + '\n\n'
    + 'Detail ada di sheet: _ScanTopik\n'
    + 'Gunakan 📌 Manajemen Topik > Set Topic Name untuk isi yang kosong.'
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
 * Step 1: Buat sheet dengan daftar topik tanpa nama + kolom isian
 * + contoh pesan dari setiap topik biar bisa dikenali.
 */
function prepareTopicNameSheet() {
  var unresolved = getUnresolvedTopics_();
  var ui = SpreadsheetApp.getUi();
  var data = getAllRows();

  // Kumpulkan 2 contoh pesan per topic ID untuk referensi
  var sampleByTopic = {};
  data.forEach(function (row) {
    var tid = row[COL.TOPIC_ID];
    if (tid && tid.toString().trim() !== '' && tid.toString().trim() !== '-') {
      var key = tid.toString().trim();
      if (!sampleByTopic[key]) sampleByTopic[key] = [];
      if (sampleByTopic[key].length < 2) {
        var txt = row[COL.TEXT] || '';
        if (txt.length > 80) txt = txt.substring(0, 80) + '…';
        var date = (row[COL.TIMESTAMP] instanceof Date)
          ? formatDate_(row[COL.TIMESTAMP], 'dd/MM')
          : '';
        sampleByTopic[key].push(date + ' ' + txt);
      }
    }
  });

  var sheet = createOrReplaceSheet_('_IsiNamaTopik');

  // Header
  var headers = ['No', 'Topic ID', 'Nama Saat Ini', 'Grup', '✏️ Nama Baru (isi di sini)', '📄 Contoh Pesan'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#4a86e8').setFontColor('white')
    .setHorizontalAlignment('center');

  // Isi data
  if (unresolved.length === 0) {
    sheet.getRange(2, 1).setValue('✅ Semua topik sudah punya nama!');
    sheet.getRange(2, 2).setValue('Tidak ada data');
    getSS().setActiveSheet(sheet);
    ui.alert('✅ Semua topik sudah punya nama!');
    return;
  }

  unresolved.forEach(function (t, i) {
    var r = i + 2;
    sheet.getRange(r, 1).setValue(i + 1).setHorizontalAlignment('center');
    sheet.getRange(r, 2).setValue(t.topicId).setHorizontalAlignment('center');
    sheet.getRange(r, 3).setValue('Topik Tanpa Nama');
    sheet.getRange(r, 4).setValue(t.groupName || '-');
    sheet.getRange(r, 5).setValue(''); // kosong, diisi user

    // Sample messages
    var samples = sampleByTopic[t.topicId] || [];
    sheet.getRange(r, 6).setValue(samples.length > 0 ? samples.join('\n') : '(tidak ada contoh)');
  });

  // Styling
  sheet.setColumnWidths(1, 1, 40);
  sheet.setColumnWidths(2, 1, 80);
  sheet.setColumnWidths(3, 1, 140);
  sheet.setColumnWidths(4, 1, 250);
  sheet.setColumnWidths(5, 1, 230);
  sheet.setColumnWidths(6, 1, 350);

  // Wrapping untuk kolom contoh
  var sampleRange = sheet.getRange(2, 6, unresolved.length, 1);
  sampleRange.setWrap(true);

  // Highlight kolom isian (kuning)
  var inputRange = sheet.getRange(2, 5, unresolved.length, 1);
  inputRange.setBackground('#fff3cd');

  // Set row height biar cukup untuk 2 baris teks
  for (var i = 0; i < unresolved.length; i++) {
    sheet.setRowHeight(i + 2, 40);
  }

  // Freeze header
  sheet.setFrozenRows(1);

  getSS().setActiveSheet(sheet);

  ui.alert(
    '✅ Sheet _IsiNamaTopik siap!\n\n'
    + 'Cara isi:\n'
    + '1. Lihat kolom "📄 Contoh Pesan" — itu contoh chat dari topik tsb\n'
    + '2. Dari contoh, kamu bisa tebak nama kotanya\n'
    + '3. Ketik nama di kolom kuning "✏️ Nama Baru"\n'
    + '   Contoh: Kajian Jakarta\n'
    + '4. Setelah semua diisi, jalankan:\n'
    + '   📌 Manajemen Topik > Terapkan Nama dari Sheet\n'
    + '5. Nama otomatis terisi di log & report.'
  );
}

/**
 * Step 2: Baca sheet _IsiNamaTopik, simpan nama, update log.
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

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    ui.alert('Sheet kosong.');
    return;
  }

  var applied = 0;
  var errors = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var topicId = row[1]; // Kolom B: Topic ID
    var newName = row[4]; // Kolom E: Nama Baru

    if (topicId && newName && newName.toString().trim() !== '') {
      topicId = topicId.toString().trim();
      newName = newName.toString().trim();

      // Simpan ke PropertiesService
      PropertiesService.getScriptProperties().setProperty('TOPIC_' + topicId, newName);

      // Update sheet log
      var updated = updateTopicNameInSheet_(topicId, newName);
      applied++;
    }
  }

  if (applied === 0) {
    ui.alert(
      'ℹ️ Tidak ada nama baru ditemukan.\n\n'
      + 'Isi kolom "✏️ Nama Baru" di sheet _IsiNamaTopik,\n'
      + 'lalu jalankan ini lagi.'
    );
    return;
  }

  ui.alert(
    '✅ ' + applied + ' nama topik berhasil diterapkan!\n\n'
    + 'Semua baris di log & report sudah terupdate.\n'
    + 'Coba jalankan 📊 Analisa Bulanan untuk lihat hasilnya.'
  );
}

/**
 * Update nama topik di semua baris sheet yang punya Topic ID tertentu.
 * @param {string} topicId
 * @param {string} newName
 * @return {number} Jumlah baris yang diupdate
 */
function updateTopicNameInSheet_(topicId, newName) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var updatedCount = 0;

  // Kolom Topic Name = index 15 (COL.TOPIC_NAME)
  for (var i = 1; i < data.length; i++) { // mulai dari baris 2 (skip header)
    var rowTopicId = data[i][COL.TOPIC_ID];
    if (rowTopicId && rowTopicId.toString() === topicId) {
      sheet.getRange(i + 1, COL.TOPIC_NAME + 1).setValue(newName);
      updatedCount++;
    }
  }

  return updatedCount;
}

/**
 * Batch re-discover: scan semua topik yang masih '-' dan coba resolve.
 * Untuk topik yang sudah ada nama di PropertiesService, update sheet.
 */
function batchResolveTopicNames() {
  var rows = getAllRows();
  var props = PropertiesService.getScriptProperties();
  var resolved = {};
  var updated = 0;

  rows.forEach(function (row, idx) {
    var topicId = row[COL.TOPIC_ID];
    var topicName = row[COL.TOPIC_NAME];

    if (topicId && topicId.toString() !== '' && topicId.toString() !== '-') {
      var key = topicId.toString().trim();
      var savedName = props.getProperty('TOPIC_' + key);

      if (savedName && savedName !== '-' && (!topicName || topicName === '-')) {
        // Ada di PropertiesService tapi belum di sheet → update
        resolved[key] = savedName;
      }
    }
  });

  // Update sheet
  for (var key in resolved) {
    if (resolved.hasOwnProperty(key)) {
      var n = updateTopicNameInSheet_(key, resolved[key]);
      updated += n;
    }
  }

  SpreadsheetApp.getUi().alert(
    updated > 0
      ? '✅ ' + updated + ' baris diupdate dari PropertiesService.'
      : 'ℹ️ Tidak ada data baru. Gunakan "Set Topic Name" untuk input manual.'
  );
}
