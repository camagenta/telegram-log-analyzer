/**
 * ============================================================
 *  08_ANALYTICS.gs — Analisa Bulanan (8 Fitur)
 * ============================================================
 *  Fitur:
 *    1. Rekap per Grup / User / Tipe Chat
 *    2. Ranking Aktivitas User (Top 30)
 *    3. Distribusi Tipe Pesan + Persentase
 *    4. Aktivitas Harian (tren + rata-rata + hari tersibuk)
 *    5. Rekap Topik Forum
 *    6. Rekap File Tersimpan (jumlah + ukuran)
 *    7. Bandingan Month-over-Month
 *    8. Export ke Sheet Baru + Kirim Telegram
 * ============================================================
 *  Dependensi: Config, Utils, Sheet, Telegram
 * ============================================================
 */

// ============================================================
//  ENTRY POINT
// ============================================================

/**
 * Generate report — dipanggil dari HTML picker atau menu.
 * @param {number} year
 * @param {number} month
 * @return {string} JSON { success, sheetName, totalMessages, ... }
 */
function generateMonthlyReport(year, month) {
  try {
    assertConfig();

    if (!year || !month) {
      return JSON.stringify({ success: false, error: 'Tahun dan bulan harus diisi.' });
    }

    var monthNum = parseInt(month);
    var yearNum = parseInt(year);
    if (monthNum < 1 || monthNum > 12) {
      return JSON.stringify({ success: false, error: 'Bulan tidak valid (1-12).' });
    }
    if (yearNum < 2020 || yearNum > 2099) {
      return JSON.stringify({ success: false, error: 'Tahun tidak valid.' });
    }

    var allRows = getAllRows();
    if (allRows.length === 0) {
      return JSON.stringify({ success: false, error: 'Sheet utama masih kosong.' });
    }

    var filtered = filterByMonth_(allRows, yearNum, monthNum);
    if (filtered.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'Tidak ada data untuk ' + getMonthName_(monthNum) + ' ' + yearNum + '.'
      });
    }

    // Build full report
    var report = buildFullReport_(filtered, allRows, yearNum, monthNum);

    // Export ke sheet baru
    var sheetName = exportToSheet_(report);

    // Format untuk Telegram
    var telegramText = formatReportForTelegram_(report);

    var topUser = report.ranking.length > 0 ? report.ranking[0] : null;

    return JSON.stringify({
      success: true,
      sheetName: sheetName,
      totalMessages: filtered.length,
      summary: {
        groups: Object.keys(report.perGroup).length,
        users: Object.keys(report.perUser).length,
        types: report.distribusi.length,
        topUser: topUser ? topUser.name : '-',
        topUserCount: topUser ? topUser.count : 0
      },
      telegramText: telegramText
    });

  } catch (e) {
    console.error('generateMonthlyReport error:', e.toString());
    return JSON.stringify({ success: false, error: e.toString() });
  }
}

/**
 * Build full report object — reusable.
 */
function buildFullReport_(filtered, allRows, year, month) {
  return {
    period: { year: year, month: month },
    totalMessages: filtered.length,
    perGroup: buildRekapPerGroup_(filtered),
    perUser: buildRekapPerUser_(filtered),
    perType: buildRekapPerType_(filtered),
    ranking: buildRankingAktivitas_(filtered),
    distribusi: buildDistribusiTipe_(filtered),
    daily: buildAktivitasHarian_(filtered),
    topik: buildRekapTopik_(filtered),
    fileRecap: buildRekapFile_(filtered),
    comparison: buildMonthComparison_(allRows, year, month)
  };
}

/**
 * Build full report for custom date range (skip MoM comparison).
 */
function buildFullReportCustom_(filtered, allRows, startDate, endDate) {
  // For custom ranges, try to compare with previous period of same length
  var prevStart = new Date(startDate.getTime());
  var prevEnd = new Date(endDate.getTime());
  var rangeMs = endDate.getTime() - startDate.getTime();
  prevStart.setTime(prevStart.getTime() - rangeMs - 86400000); // day before start
  prevEnd.setTime(startDate.getTime() - 86400000); // day before start = previous period end

  var prevData = filterByDateRange_(allRows, prevStart, prevEnd);
  var comparison = prevData.length > 0 ? {
    hasPrevData: true,
    currentTotal: filtered.length,
    prevTotal: prevData.length,
    diff: filtered.length - prevData.length,
    percentChange: ((filtered.length - prevData.length) / prevData.length * 100).toFixed(1),
    direction: filtered.length >= prevData.length ? 'naik' : 'turun',
    groupComparison: []
  } : { hasPrevData: false, currentTotal: filtered.length, prevTotal: 0, message: 'Tidak ada data periode sebelumnya.' };

  return {
    period: {
      year: startDate.getFullYear(),
      month: startDate.getMonth() + 1,
      startDate: startDate,
      endDate: endDate
    },
    totalMessages: filtered.length,
    perGroup: buildRekapPerGroup_(filtered),
    perUser: buildRekapPerUser_(filtered),
    perType: buildRekapPerType_(filtered),
    ranking: buildRankingAktivitas_(filtered),
    distribusi: buildDistribusiTipe_(filtered),
    daily: buildAktivitasHarian_(filtered),
    topik: buildRekapTopik_(filtered),
    fileRecap: buildRekapFile_(filtered),
    comparison: comparison
  };
}

// ============================================================
//  CUSTOM DATE RANGE
// ============================================================

/**
 * Tampilkan dialog input tanggal untuk custom range report.
 */
function showCustomRangeDialog() {
  var ui = SpreadsheetApp.getUi();

  var startRes = ui.prompt(
    '📅 Custom Range — Tanggal Mulai',
    'Masukkan tanggal mulai (format: YYYY-MM-DD atau DD/MM/YYYY)\nContoh: 2026-06-12',
    ui.ButtonSet.OK_CANCEL
  );
  if (startRes.getSelectedButton() !== ui.Button.OK) return;
  var startDate = parseDate_(startRes.getResponseText().trim());
  if (!startDate) {
    ui.alert('❌ Format tanggal tidak valid. Gunakan YYYY-MM-DD atau DD/MM/YYYY.');
    return;
  }

  var endRes = ui.prompt(
    '📅 Custom Range — Tanggal Akhir',
    'Masukkan tanggal akhir (format: YYYY-MM-DD atau DD/MM/YYYY)\nContoh: 2026-07-11',
    ui.ButtonSet.OK_CANCEL
  );
  if (endRes.getSelectedButton() !== ui.Button.OK) return;
  var endDate = parseDate_(endRes.getResponseText().trim());
  if (!endDate) {
    ui.alert('❌ Format tanggal tidak valid.');
    return;
  }

  if (endDate < startDate) {
    ui.alert('❌ Tanggal akhir harus setelah tanggal mulai.');
    return;
  }

  // Execute
  var result = JSON.parse(generateCustomRangeReport(
    Utilities.formatDate(startDate, 'GMT+7', 'yyyy-MM-dd'),
    Utilities.formatDate(endDate, 'GMT+7', 'yyyy-MM-dd')
  ));

  if (result.success) {
    ui.alert(
      '✅ Report selesai!',
      '📄 Sheet: ' + result.sheetName + '\n'
      + '📝 Total: ' + result.totalMessages + ' pesan\n'
      + '📅 ' + result.label,
      ui.ButtonSet.OK
    );
  } else {
    ui.alert('❌ ' + result.error);
  }
}

/**
 * Generate report untuk custom date range.
 * @param {string} startDateStr Format YYYY-MM-DD
 * @param {string} endDateStr Format YYYY-MM-DD
 * @return {string} JSON { success, sheetName, totalMessages, ... }
 */
function generateCustomRangeReport(startDateStr, endDateStr) {
  try {
    assertConfig();

    if (!startDateStr || !endDateStr) {
      return JSON.stringify({ success: false, error: 'Tanggal mulai dan akhir harus diisi.' });
    }

    var startDate = parseDate_(startDateStr);
    var endDate = parseDate_(endDateStr);
    if (!startDate || !endDate) {
      return JSON.stringify({ success: false, error: 'Format tanggal tidak valid. Gunakan YYYY-MM-DD.' });
    }
    if (endDate < startDate) {
      return JSON.stringify({ success: false, error: 'Tanggal akhir harus setelah tanggal mulai.' });
    }

    var allRows = getAllRows();
    if (allRows.length === 0) {
      return JSON.stringify({ success: false, error: 'Sheet utama masih kosong.' });
    }

    var filtered = filterByDateRange_(allRows, startDate, endDate);
    if (filtered.length === 0) {
      return JSON.stringify({
        success: false,
        error: 'Tidak ada data dari ' + formatDate_(startDate, 'dd/MM/yyyy')
          + ' sampai ' + formatDate_(endDate, 'dd/MM/yyyy') + '.'
      });
    }

    // Build report
    var report = buildFullReportCustom_(filtered, allRows, startDate, endDate);

    // Label untuk sheet
    var label = formatDate_(startDate, 'dd MMM') + ' — ' + formatDate_(endDate, 'dd MMM yyyy');
    var sheetName = exportToSheet_(report, {
      customRange: true,
      label: label
    });

    var topUser = report.ranking.length > 0 ? report.ranking[0] : null;

    return JSON.stringify({
      success: true,
      sheetName: sheetName,
      totalMessages: filtered.length,
      label: label,
      summary: {
        groups: Object.keys(report.perGroup).length,
        users: Object.keys(report.perUser).length,
        types: report.distribusi.length,
        topUser: topUser ? topUser.name : '-',
        topUserCount: topUser ? topUser.count : 0
      }
    });

  } catch (e) {
    console.error('generateCustomRangeReport error:', e.toString());
    return JSON.stringify({ success: false, error: e.toString() });
  }
}

/**
 * Kirim laporan via Telegram — dipanggil dari menu.
 * Tanya dulu mau kirim ke Chat ID mana.
 */
function sendMonthlyReportToTelegram() {
  try {
    assertConfig();

    var available = getAvailableMonths();
    if (available.length === 0) {
      SpreadsheetApp.getUi().alert('Belum ada data.');
      return;
    }

    var latest = available[0];
    var allRows = getAllRows();
    var filtered = filterByMonth_(allRows, latest.year, latest.month);

    if (filtered.length === 0) {
      SpreadsheetApp.getUi().alert('Tidak ada data untuk ' + getMonthName_(latest.month) + ' ' + latest.year);
      return;
    }

    var report = buildFullReport_(filtered, allRows, latest.year, latest.month);
    var text = formatReportForTelegram_(report);

    if (text.length > 4000) {
      text = text.substring(0, 3900) + '\n\n... _(laporan dipotong, lihat sheet lengkap)_';
    }

    // Minta Chat ID tujuan
    var targetId = Browser.inputBox(
      '📤 Kirim ke Telegram',
      'Masukkan Chat ID tujuan (bisa ID grup atau user):\n' +
      '(Kosongkan untuk kirim ke SEMUA grup yang terdeteksi)',
      Browser.Buttons.OK_CANCEL
    );
    if (targetId === 'cancel') return;

    if (targetId && targetId.trim() !== '') {
      sendText(targetId.trim(), text);
      Browser.msgBox('✅ Laporan dikirim ke ' + targetId.trim());
    } else {
      // Kirim ke semua grup
      var chatIds = extractGroupChatIds_(allRows);
      var sent = 0;
      chatIds.forEach(function (id) {
        try {
          sendText(id, text);
          sent++;
        } catch (e) {
          console.error('Gagal kirim ke', id, e.toString());
        }
      });
      Browser.msgBox('✅ Laporan dikirim ke ' + sent + ' grup.');
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.toString());
  }
}

// ============================================================
//  FUNGSI ANALISA INTI
// ============================================================

/**
 * 1a. Rekap per Grup — kolom TITLE.
 */
function buildRekapPerGroup_(rows) {
  var groups = {};
  rows.forEach(function (row) {
    var name = row[COL.TITLE] || '(Tanpa Grup)';
    groups[name] = (groups[name] || 0) + 1;
  });
  return sortObjectDesc_(groups);
}

/**
 * 1b. Rekap per User — kolom SENDER.
 */
function buildRekapPerUser_(rows) {
  var users = {};
  rows.forEach(function (row) {
    var name = row[COL.SENDER] || '(Tanpa Nama)';
    users[name] = (users[name] || 0) + 1;
  });
  return sortObjectDesc_(users);
}

/**
 * 1c. Rekap per Tipe Chat — kolom TYPE (private/group/supergroup).
 */
function buildRekapPerType_(rows) {
  var types = {};
  rows.forEach(function (row) {
    var t = row[COL.TYPE] || 'unknown';
    types[t] = (types[t] || 0) + 1;
  });
  return sortObjectDesc_(types);
}

/**
 * 2. Ranking Aktivitas User — Top 30.
 */
function buildRankingAktivitas_(rows) {
  var users = {};
  rows.forEach(function (row) {
    var name = row[COL.SENDER] || '(Tanpa Nama)';
    users[name] = (users[name] || 0) + 1;
  });

  var sorted = [];
  for (var name in users) {
    if (users.hasOwnProperty(name)) {
      sorted.push({ name: name, count: users[name] });
    }
  }
  sorted.sort(function (a, b) { return b.count - a.count; });
  return sorted.slice(0, 30);
}

/**
 * 3. Distribusi Tipe Pesan — kolom MSG_TYPE.
 */
function buildDistribusiTipe_(rows) {
  var types = {};
  var total = rows.length;

  rows.forEach(function (row) {
    var tipe = row[COL.MSG_TYPE] || 'Unknown';
    // Normalisasi Document(filename) → Document
    if (tipe.indexOf('Document (') === 0) tipe = 'Document';
    types[tipe] = (types[tipe] || 0) + 1;
  });

  var result = [];
  for (var tipe in types) {
    if (types.hasOwnProperty(tipe)) {
      result.push({
        type: tipe,
        count: types[tipe],
        percentage: ((types[tipe] / total) * 100).toFixed(1)
      });
    }
  }
  result.sort(function (a, b) { return b.count - a.count; });
  return result;
}

/**
 * 4. Aktivitas Harian — group by tanggal.
 */
function buildAktivitasHarian_(rows) {
  var days = {};

  rows.forEach(function (row) {
    var ts = row[COL.TIMESTAMP];
    var d = (ts instanceof Date) ? ts : new Date(ts);
    if (isNaN(d.getTime())) return;

    var dateStr = formatDate_(d, 'yyyy-MM-dd');
    days[dateStr] = (days[dateStr] || 0) + 1;
  });

  var result = [];
  for (var dateStr in days) {
    if (days.hasOwnProperty(dateStr)) {
      result.push({ date: dateStr, count: days[dateStr] });
    }
  }
  result.sort(function (a, b) { return a.date.localeCompare(b.date); });

  var totalDays = result.length;
  var totalMsg = rows.length;

  var maxDay = result.length > 0
    ? result.reduce(function (a, b) { return a.count > b.count ? a : b; })
    : { date: '-', count: 0 };

  return {
    daily: result,
    totalDays: totalDays,
    avgPerDay: totalDays > 0 ? (totalMsg / totalDays).toFixed(1) : '0',
    maxDay: maxDay
  };
}

/**
 * 5. Rekap Topik Forum — kolom TOPIC_ID & TOPIC_NAME.
 * Hanya untuk pesan dari grup bertopik.
 */
function buildRekapTopik_(rows) {
  var topics = {};
  var props = PropertiesService.getScriptProperties();

  rows.forEach(function (row) {
    var topicId = row[COL.TOPIC_ID];
    var topicName = row[COL.TOPIC_NAME] || '-';
    var chatTitle = row[COL.TITLE] || '';

    if (topicId && topicId.toString() !== '' && topicId.toString() !== '-') {
      var key = topicId.toString();
      if (!topics[key]) {
        // Priority: 1) PropertiesService cache, 2) sheet, 3) fallback
        var cachedName = props.getProperty('TOPIC_' + key);
        var displayName = cachedName || 
          ((topicName && topicName !== '-') ? topicName : null);

        topics[key] = {
          name: displayName || 'Topik #' + key,
          group: chatTitle,
          count: 0
        };
      }
      topics[key].count++;
    }
  });

  var result = [];
  for (var id in topics) {
    if (topics.hasOwnProperty(id)) {
      result.push(topics[id]);
    }
  }
  result.sort(function (a, b) { return b.count - a.count; });
  return result;
}

/**
 * 6. Rekap File Tersimpan — kolom GDRIVE_LINK, MSG_TYPE, METADATA.
 */
function buildRekapFile_(rows) {
  var byType = {};
  var totalSizeBytes = 0;
  var fileCount = 0;

  rows.forEach(function (row) {
    var gdriveLink = row[COL.GDRIVE_LINK];
    var tipePesan = row[COL.MSG_TYPE] || '';
    var metadata = row[COL.METADATA] || '';

    if (gdriveLink && gdriveLink.toString() !== '' && gdriveLink.toString() !== '-') {
      fileCount++;
      var type = (tipePesan.indexOf('Document (') === 0) ? 'Document' : tipePesan;
      byType[type] = (byType[type] || 0) + 1;
      totalSizeBytes += parseSizeFromMetadata_(metadata) * 1024;
    }
  });

  var breakdown = [];
  for (var t in byType) {
    if (byType.hasOwnProperty(t)) {
      breakdown.push({
        type: t,
        count: byType[t],
        percentage: fileCount > 0 ? ((byType[t] / fileCount) * 100).toFixed(1) : '0'
      });
    }
  }
  breakdown.sort(function (a, b) { return b.count - a.count; });

  return {
    totalFiles: fileCount,
    totalSizeMB: totalSizeBytes / (1024 * 1024),
    breakdown: breakdown
  };
}

/**
 * 7. Bandingan Month-over-Month.
 */
function buildMonthComparison_(allRows, year, month) {
  var prevMonth = month - 1;
  var prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  var currentData = filterByMonth_(allRows, year, month);
  var prevData = filterByMonth_(allRows, prevYear, prevMonth);

  if (prevData.length === 0) {
    return {
      hasPrevData: false,
      currentTotal: currentData.length,
      prevTotal: 0,
      message: 'Tidak ada data bulan sebelumnya untuk perbandingan.'
    };
  }

  var diff = currentData.length - prevData.length;
  var percentChange = ((diff / prevData.length) * 100).toFixed(1);

  // Perbandingan per grup
  var currentGroups = buildRekapPerGroup_(currentData);
  var prevGroups = buildRekapPerGroup_(prevData);

  var groupMap = {};
  currentGroups.forEach(function (g) { groupMap[g.name] = { current: g.count, previous: 0 }; });
  prevGroups.forEach(function (g) {
    if (groupMap[g.name]) groupMap[g.name].previous = g.count;
    else groupMap[g.name] = { current: 0, previous: g.count };
  });

  var groupComparison = [];
  for (var name in groupMap) {
    if (groupMap.hasOwnProperty(name)) {
      var c = groupMap[name].current;
      var p = groupMap[name].previous;
      var gDiff = c - p;
      var gPct = p > 0 ? ((gDiff / p) * 100).toFixed(1) : '+∞';
      groupComparison.push({
        group: name,
        current: c,
        previous: p,
        diff: gDiff,
        percent: gPct
      });
    }
  }
  groupComparison.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });

  return {
    hasPrevData: true,
    currentTotal: currentData.length,
    prevTotal: prevData.length,
    diff: diff,
    percentChange: percentChange,
    direction: diff >= 0 ? 'naik' : 'turun',
    groupComparison: groupComparison.slice(0, 10)
  };
}

// ============================================================
//  EXPORT KE SHEET BARU
// ============================================================

function exportToSheet_(report, opt) {
  opt = opt || {};
  var isCustom = opt.customRange || false;

  var sheetName, headerTitle;
  if (isCustom && opt.label) {
    // Custom range → "Rekap_12Jun-11Jul_2026"
    sheetName = 'Rekap_Custom_' + opt.label.replace(/[^a-zA-Z0-9]/g, '_');
    if (sheetName.length > 50) sheetName = 'Rekap_Custom_' + new Date().getTime();
    headerTitle = '📊 REKAP: ' + opt.label;
  } else {
    // Default monthly
    var p = report.period;
    var monthName = getMonthName_(p.month);
    sheetName = 'Rekap_' + p.year + '_' + padZero_(p.month);
    headerTitle = '📊 REKAP BULANAN: ' + monthName + ' ' + p.year;
  }

  var newSheet = createOrReplaceSheet_(sheetName);
  var row = 1;

  // --- HEADER UTAMA ---
  newSheet.getRange(row, 1)
    .setValue(headerTitle)
    .setFontWeight('bold').setFontSize(14);
  newSheet.getRange(row, 2)
    .setValue('Total Pesan: ' + report.totalMessages)
    .setFontWeight('bold').setFontSize(12);
  row = 2;
  newSheet.getRange(row, 1)
    .setValue('Generated: ' + formatDate_(now_(), 'dd/MM/yyyy HH:mm:ss'))
    .setFontStyle('italic').setFontColor('#666');
  row = 4;

  // Style helper
  function writeHeaderRow(r, values) {
    var range = newSheet.getRange(r, 1, 1, values.length);
    range.setValues([values]);
    range.setFontWeight('bold').setBackground('#4a86e8').setFontColor('white')
      .setHorizontalAlignment('center');
  }

  function writeSection(r, title) {
    newSheet.getRange(r, 1).setValue(title).setFontWeight('bold').setFontSize(12);
    return r + 1;
  }

  // =========================================
  //  1. REKAP PER GRUP
  // =========================================
  row = writeSection(row, '1️⃣ REKAP PER GRUP');
  writeHeaderRow(row, ['Nama Grup', 'Jumlah Pesan']);
  row++;
  report.perGroup.forEach(function (item) {
    newSheet.getRange(row, 1).setValue(item.name);
    newSheet.getRange(row, 2).setValue(item.count).setHorizontalAlignment('center');
    row++;
  });
  row += 2;

  // =========================================
  //  2. REKAP PER USER (Top 20)
  // =========================================
  row = writeSection(row, '2️⃣ REKAP PER USER (Top 20)');
  writeHeaderRow(row, ['Nama Pengirim', 'Jumlah Pesan']);
  row++;
  report.perUser.slice(0, 20).forEach(function (item) {
    newSheet.getRange(row, 1).setValue(item.name);
    newSheet.getRange(row, 2).setValue(item.count).setHorizontalAlignment('center');
    row++;
  });
  row += 2;

  // =========================================
  //  3. DISTRIBUSI TIPE PESAN
  // =========================================
  row = writeSection(row, '3️⃣ DISTRIBUSI TIPE PESAN');
  writeHeaderRow(row, ['Tipe Pesan', 'Jumlah', 'Persentase']);
  row++;
  report.distribusi.forEach(function (item) {
    newSheet.getRange(row, 1).setValue(item.type);
    newSheet.getRange(row, 2).setValue(item.count).setHorizontalAlignment('center');
    newSheet.getRange(row, 3).setValue(item.percentage + '%').setHorizontalAlignment('center');
    row++;
  });
  row += 2;

  // =========================================
  //  4. RANKING AKTIVITAS (Top 10)
  // =========================================
  row = writeSection(row, '4️⃣ RANKING AKTIVITAS USER (Top 10)');
  writeHeaderRow(row, ['Peringkat', 'Nama', 'Jumlah Pesan']);
  row++;
  report.ranking.slice(0, 10).forEach(function (item, idx) {
    newSheet.getRange(row, 1).setValue(idx + 1).setHorizontalAlignment('center');
    newSheet.getRange(row, 2).setValue(item.name);
    newSheet.getRange(row, 3).setValue(item.count).setHorizontalAlignment('center');
    row++;
  });
  row += 2;

  // =========================================
  //  5. AKTIVITAS HARIAN
  // =========================================
  row = writeSection(row, '5️⃣ AKTIVITAS HARIAN');
  newSheet.getRange(row, 1)
    .setValue('Total Hari: ' + report.daily.totalDays + ' hari')
    .setFontStyle('italic');
  newSheet.getRange(row, 2)
    .setValue('Rata-rata: ' + report.daily.avgPerDay + ' pesan/hari')
    .setFontStyle('italic');
  newSheet.getRange(row, 3)
    .setValue('Hari Tersibuk: ' + report.daily.maxDay.date + ' (' + report.daily.maxDay.count + ' pesan)')
    .setFontStyle('italic');
  row++;
  writeHeaderRow(row, ['Tanggal', 'Jumlah Pesan']);
  row++;
  report.daily.daily.forEach(function (item) {
    newSheet.getRange(row, 1).setValue(item.date).setHorizontalAlignment('center');
    newSheet.getRange(row, 2).setValue(item.count).setHorizontalAlignment('center');
    row++;
  });
  row += 2;

  // =========================================
  //  6. REKAP TOPIK FORUM
  // =========================================
  row = writeSection(row, '6️⃣ REKAP TOPIK FORUM');
  if (report.topik.length > 0) {
    writeHeaderRow(row, ['Nama Topik', 'Grup', 'Jumlah Pesan']);
    row++;
    report.topik.forEach(function (item) {
      newSheet.getRange(row, 1).setValue(item.name);
      newSheet.getRange(row, 2).setValue(item.group);
      newSheet.getRange(row, 3).setValue(item.count).setHorizontalAlignment('center');
      row++;
    });
  } else {
    newSheet.getRange(row, 1)
      .setValue('Tidak ada data topik/forum untuk periode ini.')
      .setFontStyle('italic').setFontColor('#666');
    row++;
  }
  row += 2;

  // =========================================
  //  7. REKAP FILE TERSIMPAN
  // =========================================
  row = writeSection(row, '7️⃣ REKAP FILE TERSIMPAN');
  if (report.fileRecap.totalFiles > 0) {
    newSheet.getRange(row, 1)
      .setValue('Total File: ' + report.fileRecap.totalFiles + ' file')
      .setFontWeight('bold');
    newSheet.getRange(row, 2)
      .setValue('Total Ukuran: ' + report.fileRecap.totalSizeMB.toFixed(2) + ' MB')
      .setFontWeight('bold');
    row++;
    writeHeaderRow(row, ['Tipe File', 'Jumlah', 'Persentase']);
    row++;
    report.fileRecap.breakdown.forEach(function (item) {
      newSheet.getRange(row, 1).setValue(item.type);
      newSheet.getRange(row, 2).setValue(item.count).setHorizontalAlignment('center');
      newSheet.getRange(row, 3).setValue(item.percentage + '%').setHorizontalAlignment('center');
      row++;
    });
  } else {
    newSheet.getRange(row, 1)
      .setValue('Tidak ada file tersimpan untuk periode ini.')
      .setFontStyle('italic').setFontColor('#666');
    row++;
  }
  row += 2;

  // =========================================
  //  8. BANDINGAN MONTH-OVER-MONTH
  // =========================================
  row = writeSection(row, '8️⃣ BANDINGAN MONTH-OVER-MONTH');
  if (report.comparison.hasPrevData) {
    var prevMonth = report.period.month - 1;
    var prevYear = report.period.year;
    if (prevMonth === 0) { prevMonth = 12; prevYear--; }
    var prevLabel = getMonthName_(prevMonth) + ' ' + prevYear;

    newSheet.getRange(row, 1).setValue('Bulan Ini: ' + report.comparison.currentTotal + ' pesan');
    newSheet.getRange(row, 2).setValue('Bulan Lalu (' + prevLabel + '): ' + report.comparison.prevTotal + ' pesan');
    row++;
    var diffText = (report.comparison.diff >= 0 ? '+' : '') + report.comparison.diff;
    var directionEmoji = report.comparison.diff >= 0 ? '📈' : '📉';
    newSheet.getRange(row, 1)
      .setValue(directionEmoji + ' Perubahan: ' + diffText + ' pesan (' + report.comparison.percentChange + '%)')
      .setFontWeight('bold');
    row++;

    if (report.comparison.groupComparison.length > 0) {
      row++;
      newSheet.getRange(row, 1).setValue('Perbandingan per Grup:').setFontWeight('bold');
      row++;
      writeHeaderRow(row, ['Grup', 'Bulan Ini', 'Bulan Lalu', 'Selisih', 'Perubahan']);
      row++;
      report.comparison.groupComparison.forEach(function (item) {
        newSheet.getRange(row, 1).setValue(item.group);
        newSheet.getRange(row, 2).setValue(item.current).setHorizontalAlignment('center');
        newSheet.getRange(row, 3).setValue(item.previous).setHorizontalAlignment('center');
        newSheet.getRange(row, 4)
          .setValue((item.diff >= 0 ? '+' : '') + item.diff).setHorizontalAlignment('center');
        newSheet.getRange(row, 5)
          .setValue(typeof item.percent === 'string' ? item.percent : item.percent + '%')
          .setHorizontalAlignment('center');
        row++;
      });
    }
  } else {
    newSheet.getRange(row, 1)
      .setValue(report.comparison.message || 'Tidak ada data bulan sebelumnya.')
      .setFontStyle('italic').setFontColor('#666');
    row++;
  }

  // --- Set lebar kolom ---
  newSheet.setColumnWidths(1, 1, 220);
  newSheet.setColumnWidths(2, 1, 160);
  newSheet.setColumnWidths(3, 1, 130);
  newSheet.setColumnWidths(4, 1, 130);
  newSheet.setColumnWidths(5, 1, 130);

  // Aktifkan sheet baru
  getSS().setActiveSheet(newSheet);

  return sheetName;
}

// ============================================================
//  FORMAT LAPORAN UNTUK TELEGRAM
// ============================================================

/**
 * Format laporan singkat untuk dikirim via Telegram (Markdown).
 */
function formatReportForTelegram_(report) {
  var p = report.period;
  var monthName = getMonthName_(p.month);
  var lb = '\n';

  var text = '';
  text += '📊 *LAPORAN AKTIVITAS SIJADWAL KAJIAN TELEGRAM*' + lb;
  text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' + lb;
  text += '🗓️ ' + monthName + ' ' + p.year + lb + lb;
  text += '━━━━━━━━━━━━━━━━━━━' + lb;
  text += '📝 *Total Pesan:* ' + report.totalMessages + lb + lb;

  // 1. Grup
  text += '━ *1. REKAP PER GRUP*' + lb;
  report.perGroup.slice(0, 5).forEach(function (g) {
    text += '  ▫ ' + g.name + ': *' + g.count + '* pesan' + lb;
  });
  if (report.perGroup.length > 5) {
    text += '  ...dan ' + (report.perGroup.length - 5) + ' grup lainnya' + lb;
  }
  text += lb;

  // 2. Distribusi Tipe
  text += '━ *2. TIPE PESAN*' + lb;
  report.distribusi.forEach(function (t) {
    text += '  ▫ ' + t.type + ': *' + t.count + '* (' + t.percentage + '%)' + lb;
  });
  text += lb;

  // 3. Top 5 User
  text += '━ *3. TOP 5 USER*' + lb;
  report.ranking.slice(0, 5).forEach(function (u, i) {
    text += '  ' + (i + 1) + '. ' + u.name + ': *' + u.count + '* pesan' + lb;
  });
  text += lb;

  // 4. Harian
  text += '━ *4. AKTIVITAS HARIAN*' + lb;
  text += '  ▫ Total hari: *' + report.daily.totalDays + '* hari' + lb;
  text += '  ▫ Rata-rata: *' + report.daily.avgPerDay + '* pesan/hari' + lb;
  text += '  ▫ Tersibuk: ' + report.daily.maxDay.date + ' (*' + report.daily.maxDay.count + '* pesan)' + lb;
  text += lb;

  // 5. File
  if (report.fileRecap.totalFiles > 0) {
    text += '━ *5. FILE TERSIMPAN*' + lb;
    text += '  ▫ Total: *' + report.fileRecap.totalFiles + '* file' + lb;
    text += '  ▫ Ukuran: *' + report.fileRecap.totalSizeMB.toFixed(1) + '* MB' + lb;
    text += lb;
  }

  // 6. MoM
  if (report.comparison.hasPrevData) {
    text += '━ *6. BANDINGAN BULAN LALU*' + lb;
    text += '  ▫ Sebelumnya: *' + report.comparison.prevTotal + '* pesan' + lb;
    var arrow = report.comparison.diff >= 0 ? '📈' : '📉';
    text += '  ▫ ' + arrow + ' *' + (report.comparison.diff >= 0 ? '+' : '') + report.comparison.diff
      + '* (' + report.comparison.percentChange + '%)' + lb;
  } else {
    text += '━ *6. BANDINGAN*' + lb;
    text += '  ▫ Belum ada data bulan sebelumnya.' + lb;
  }

  return text;
}

/**
 * Ekstrak daftar Chat ID grup dari data.
 */
function extractGroupChatIds_(rows) {
  var ids = {};
  rows.forEach(function (row) {
    var chatId = row[COL.CHAT_ID];
    var tipe = row[COL.TYPE];
    if (chatId && (tipe === 'group' || tipe === 'supergroup')) {
      ids[chatId.toString()] = true;
    }
  });
  return Object.keys(ids);
}

// ============================================================
//  JADWAL REPORT BULANAN (Tiap tanggal 12)
// ============================================================

/**
 * Setup konfigurasi target report & trigger jadwal.
 */
function setupScheduledReport() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  // 1. Chat ID / Username tujuan
  var chatId = props.getProperty('SCHEDULE_CHAT_ID') || '@sijadwalkajian';
  var chatRes = ui.prompt(
    '📤 Target Chat Report',
    'Chat ID / username tujuan:\n(Cth: @sijadwalkajian atau numeric ID)',
    ui.ButtonSet.OK_CANCEL
  );
  if (chatRes.getSelectedButton() !== ui.Button.OK) return;
  var newChatId = chatRes.getResponseText().trim();
  if (newChatId) props.setProperty('SCHEDULE_CHAT_ID', newChatId);

  // 2. Topic ID (message_thread_id)
  var topicId = props.getProperty('SCHEDULE_TOPIC_ID') || '192';
  var topicRes = ui.prompt(
    '📌 Topic / Thread ID',
    'Message Thread ID tujuan:\n(Cth: 192 untuk t.me/c/sijadwalkajian/192)',
    ui.ButtonSet.OK_CANCEL
  );
  if (topicRes.getSelectedButton() !== ui.Button.OK) return;
  var newTopicId = topicRes.getResponseText().trim();
  if (newTopicId) props.setProperty('SCHEDULE_TOPIC_ID', newTopicId);

  // 3. Header kustom
  var header = props.getProperty('SCHEDULE_HEADER') || 'LAPORAN AKTIVITAS SIJADWAL KAJIAN TELEGRAM';
  var headerRes = ui.prompt(
    '📝 Header Report',
    'Teks header laporan:',
    ui.ButtonSet.OK_CANCEL
  );
  if (headerRes.getSelectedButton() !== ui.Button.OK) return;
  var newHeader = headerRes.getResponseText().trim();
  if (newHeader) props.setProperty('SCHEDULE_HEADER', newHeader);

  // 4. Hari dalam bulan
  var day = props.getProperty('SCHEDULE_DAY') || '12';
  var dayRes = ui.prompt(
    '📅 Tanggal Eksekusi',
    'Tanggal setiap bulan (1-28):',
    ui.ButtonSet.OK_CANCEL
  );
  if (dayRes.getSelectedButton() !== ui.Button.OK) return;
  var newDay = dayRes.getResponseText().trim();
  if (newDay) props.setProperty('SCHEDULE_DAY', newDay);

  ui.alert(
    '✅ Konfigurasi tersimpan!\n\n'
    + 'Target: ' + (newChatId || chatId) + '\n'
    + 'Topic ID: ' + (newTopicId || topicId) + '\n'
    + 'Tanggal: setiap tgl ' + (newDay || day) + '\n\n'
    + 'Sekarang pasang trigger:\n📊 Analisa Bulanan > Pasang Trigger Jadwal'
  );
}

/**
 * Kirim teks panjang (split >4000 chars).
 * @return {Object} {ok: bool, sent: number, error: string}
 */
function sendLongText_(chatId, text, opts) {
  var maxLen = 4000;
  if (text.length <= maxLen) {
    var res = sendText(chatId, text, opts);
    return { ok: res && res.ok, sent: res && res.ok ? 1 : 0, error: res && !res.ok ? JSON.stringify(res) : '' };
  }

  var parts = [];
  var remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    // Cari newline terdekat sebelum maxLen biar gak potong kalimat
    var cutAt = remaining.lastIndexOf('\n', maxLen);
    if (cutAt < 100) cutAt = maxLen; // fallback kalau gada newline
    parts.push(remaining.substring(0, cutAt));
    remaining = remaining.substring(cutAt).trim();
  }

  var sent = 0;
  var lastError = '';
  parts.forEach(function (part, i) {
    if (i > 0) {
      part = '_(lanjutan)_\n' + part;
    }
    if (i < parts.length - 1) {
      part += '\n\n_(bersambung...)__';
    }
    var res = sendText(chatId, part, opts);
    if (res && res.ok) {
      sent++;
    } else {
      lastError = res ? JSON.stringify(res) : 'no response';
    }
  });

  return { ok: sent > 0, sent: sent, error: lastError };
}

/**
 * Generate report bulan lalu + kirim ke Telegram.
 * Fungsi ini dipanggil oleh trigger otomatis.
 * @return {Object} {ok, error?, sent?, sheetName?}
 */
function generateAndSendScheduledReport() {
  var props = PropertiesService.getScriptProperties();
  var targetChat = props.getProperty('SCHEDULE_CHAT_ID') || '';
  var targetTopic = props.getProperty('SCHEDULE_TOPIC_ID') || '';
  var customHeader = props.getProperty('SCHEDULE_HEADER') || 'LAPORAN AKTIVITAS SIJADWAL KAJIAN TELEGRAM';

  // Validasi konfigurasi
  if (!targetChat) {
    return { ok: false, error: 'SCHEDULE_CHAT_ID belum di-set. Jalankan Setup Target & Header dulu.' };
  }

  // Dapatkan bulan terakhir yg punya data
  var available = getAvailableMonths();
  if (available.length === 0) {
    return { ok: false, error: 'Tidak ada data log.' };
  }

  var latest = available[0];
  var allRows = getAllRows();
  var filtered = filterByMonth_(allRows, latest.year, latest.month);

  if (filtered.length === 0) {
    return { ok: false, error: 'Data kosong untuk ' + latest.year + '-' + latest.month };
  }

  // 1. Generate sheet (artefak)
  var sheetResult = JSON.parse(generateMonthlyReport(latest.year, latest.month));
  if (!sheetResult.success) {
    return { ok: false, error: 'Gagal generate sheet: ' + sheetResult.error };
  }

  // 2. Build text report
  var report = buildFullReport_(filtered, allRows, latest.year, latest.month);
  var text = formatReportForTelegram_(report);

  // 3. Ganti header dengan custom header
  text = text.replace(/^📊.*$/m, '📊 *' + customHeader + '*');
  text = text.replace(/^━━.*$/m, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 4. Kirim ke Telegram (split if needed)
  var opts = {
    parse_mode: 'Markdown'
  };
  if (targetTopic) {
    opts.message_thread_id = parseInt(targetTopic) || targetTopic;
  }

  var sendResult = sendLongText_(targetChat, text, opts);

  if (!sendResult.ok) {
    return {
      ok: false,
      error: 'Gagal kirim ke Telegram. Response: ' + sendResult.error,
      sheetName: sheetResult.sheetName
    };
  }

  return {
    ok: true,
    sent: sendResult.sent,
    sheetName: sheetResult.sheetName,
    target: targetChat + (targetTopic ? ' (topic:' + targetTopic + ')' : '')
  };
}

/**
 * Pasang trigger jadwal bulanan.
 */
function installMonthlyReportTrigger() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var day = parseInt(props.getProperty('SCHEDULE_DAY')) || 12;

  // Hapus trigger lama dulu
  removeMonthlyReportTrigger_();

  ScriptApp.newTrigger('generateAndSendScheduledReport')
    .timeBased()
    .onMonthDay(day)
    .atHour(8)
    .nearMinute(0)
    .inTimezone('Asia/Jakarta')
    .create();

  ui.alert(
    '✅ Trigger terpasang!\n\n'
    + 'Report akan otomatis dikirim setiap tanggal ' + day
    + ' pukul 08:00 WIB.\n\n'
    + 'Gunakan "Hapus Trigger" untuk menonaktifkan.'
  );
}

/**
 * Hapus semua trigger report bulanan.
 */
function removeMonthlyReportTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'generateAndSendScheduledReport') {
      ScriptApp.deleteTrigger(t);
    }
  });
}
function removeMonthlyReportTrigger() {
  removeMonthlyReportTrigger_();
  SpreadsheetApp.getUi().alert('✅ Trigger jadwal report dihapus.');
}

/**
 * Test generate & kirim report (untuk bulan terakhir).
 */
function testScheduledReport() {
  var ui = SpreadsheetApp.getUi();
  var result = generateAndSendScheduledReport();

  if (result.ok) {
    ui.alert(
      '✅ Report terkirim!\n\n'
      + 'Tujuan: ' + result.target + '\n'
      + 'Pesan terkirim: ' + result.sent + '\n'
      + 'Sheet: ' + result.sheetName + '\n\n'
      + 'Cek Telegram sekarang.'
    );
  } else {
    ui.alert(
      '❌ Gagal:\n\n' + result.error
    );
  }
}
