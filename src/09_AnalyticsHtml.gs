/**
 * ============================================================
 *  09_ANALYTICSHTML.gs — HTML Picker untuk Dialog Bulanan
 * ============================================================
 *  Karena GAS tidak bisa buat file HTML via script,
 *  kita embed HTML sebagai string dan tampilkan via dialog.
 *  
 *  Setup: Jalankan "🔧 Setup HTML Picker" dari menu, ikuti
 *         instruksi untuk buat file MonthPicker.html manual.
 * ============================================================
 */

/**
 * Tampilkan dialog pemilih bulan & tahun.
 */
function showMonthlyReportPicker() {
  assertConfig();

  // Coba baca dari file HTML project dulu
  var htmlContent = getHtmlContent_();

  if (htmlContent) {
    var html = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(420)
      .setHeight(520)
      .setTitle('📊 Analisa Bulanan');
    SpreadsheetApp.getUi().showModalDialog(html, '📊 Analisa Bulanan');
  } else {
    // Fallback: pake Browser.inputBox
    simpleMonthPicker_();
  }
}

/**
 * Fallback: pilih bulan via Browser.inputBox (tanpa HTML).
 */
function simpleMonthPicker_() {
  var ui = SpreadsheetApp.getUi();

  var monthRes = ui.prompt(
    '📊 Analisa Bulanan',
    'Masukkan nomor bulan (1-12):',
    ui.ButtonSet.OK_CANCEL
  );
  if (monthRes.getSelectedButton() !== ui.Button.OK) return;
  var month = parseInt(monthRes.getResponseText());
  if (isNaN(month) || month < 1 || month > 12) {
    ui.alert('Bulan tidak valid.');
    return;
  }

  var yearRes = ui.prompt(
    '📊 Analisa Bulanan',
    'Masukkan tahun (contoh: 2026):',
    ui.ButtonSet.OK_CANCEL
  );
  if (yearRes.getSelectedButton() !== ui.Button.OK) return;
  var year = parseInt(yearRes.getResponseText());
  if (isNaN(year) || year < 2020 || year > 2099) {
    ui.alert('Tahun tidak valid.');
    return;
  }

  var result = JSON.parse(generateMonthlyReport(year, month));
  if (result.success) {
    ui.alert(
      '✅ Report ' + getMonthName_(month) + ' ' + year + ' selesai!\n\n'
      + '📄 Sheet: ' + result.sheetName + '\n'
      + '📝 Total: ' + result.totalMessages + ' pesan'
    );
  } else {
    ui.alert('❌ ' + result.error);
  }
}

/**
 * Baca konten HTML — coba dari project file, fallback ke embedded string.
 * @return {string|null}
 */
function getHtmlContent_() {
  try {
    // Coba baca file HTML dari project GAS
    var html = HtmlService.createHtmlOutputFromFile('MonthPicker');
    return html.getContent();
  } catch (e) {
    // File HTML tidak ada
    return getMonthPickerHtmlEmbedded_();
  }
}

/**
 * Embedded HTML picker — tidak perlu file terpisah.
 * @return {string}
 */
function getMonthPickerHtmlEmbedded_() {
  // Build options for months that have data
  var availableMonths = [];
  try {
    availableMonths = getAvailableMonths();
  } catch (e) {
    availableMonths = [];
  }

  var monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  // Generate month options with data indicators
  var monthDataMap = {};
  availableMonths.forEach(function (m) {
    var key = m.year + '-' + m.month;
    monthDataMap[key] = m.count;
  });

  // Build year options from available data
  var yearSet = {};
  availableMonths.forEach(function (m) { yearSet[m.year] = true; });
  var years = Object.keys(yearSet).map(Number).sort(function (a, b) { return b - a; });
  if (years.length === 0) {
    var currentYear = new Date().getFullYear();
    years = [currentYear, currentYear - 1];
  }

  var html = '<!DOCTYPE html><html><head><base target="_top"><style>';
  html += 'body{font-family:Arial,sans-serif;padding:20px;background:#f8f9fa;margin:0}';
  html += '.container{max-width:360px;margin:0 auto}';
  html += 'h2{color:#1a73e8;margin-bottom:4px;font-size:18px}';
  html += '.sub{color:#666;font-size:13px;margin-bottom:20px}';
  html += 'label{display:block;margin:12px 0 4px;font-weight:600;color:#333;font-size:13px}';
  html += 'select{width:100%;padding:10px;border:2px solid #dadce0;border-radius:8px;font-size:14px;background:#fff;box-sizing:border-box}';
  html += 'select:focus{border-color:#1a73e8;outline:none}';
  html += '.btn{width:100%;padding:12px;margin-top:20px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}';
  html += '.btn:hover{background:#1557b0}';
  html += '.btn:disabled{background:#ccc;cursor:not-allowed}';
  html += '.status{margin-top:12px;padding:12px;border-radius:6px;display:none;font-size:13px;line-height:1.5}';
  html += '.status.loading{display:block;background:#e8f0fe;color:#1a73e8}';
  html += '.status.error{display:block;background:#fce8e6;color:#d93025}';
  html += '.status.success{display:block;background:#e6f4ea;color:#137333}';
  html += '.badge{display:inline-block;background:#e8f0fe;color:#1a73e8;border-radius:10px;padding:1px 8px;font-size:11px;margin-left:4px}';
  html += '.footer{margin-top:16px;text-align:center;font-size:11px;color:#999}';
  html += '</style></head><body><div class="container">';
  html += '<h2>📊 Analisa Bulanan</h2>';
  html += '<div class="sub">Pilih periode untuk generate report</div>';

  // Month select
  html += '<label for="monthSelect">Bulan</label>';
  html += '<select id="monthSelect">';
  var now = new Date();
  var currentMonth = now.getMonth() + 1;
  for (var i = 0; i < 12; i++) {
    var selected = (i + 1 === currentMonth) ? 'selected' : '';
    html += '<option value="' + (i + 1) + '" ' + selected + '>' + monthNames[i] + '</option>';
  }
  html += '</select>';

  // Year select
  html += '<label for="yearSelect">Tahun</label>';
  html += '<select id="yearSelect">';
  for (var y = 0; y < years.length; y++) {
    var selectedYear = (years[y] === currentMonth <= 1 ? now.getFullYear() - 1 : now.getFullYear()) ? '' : '';
    // Just select the most recent year
    if (y === 0) selectedYear = 'selected';
    html += '<option value="' + years[y] + '" ' + (y === 0 ? 'selected' : '') + '>' + years[y] + '</option>';
  }
  // Add current year if not in list
  if (years.indexOf(now.getFullYear()) === -1) {
    html += '<option value="' + now.getFullYear() + '">' + now.getFullYear() + '</option>';
  }
  html += '</select>';

  // Generate button
  html += '<button class="btn" id="generateBtn">🔍 Generate Report</button>';
  html += '<div class="status" id="status"></div>';
  html += '<div class="footer">Telegram Bot Log Analyzer</div>';
  html += '</div>';

  // Script
  html += '<script>';
  html += 'document.getElementById("generateBtn").onclick = function(){';
  html += '  var btn=this; btn.disabled=true; btn.textContent="⏳ Memproses...";';
  html += '  var st=document.getElementById("status");';
  html += '  st.className="status loading"; st.textContent="⏳ Menganalisa data..."; st.style.display="block";';
  html += '  var month=document.getElementById("monthSelect").value;';
  html += '  var year=document.getElementById("yearSelect").value;';
  html += '  google.script.run';
  html += '    .withSuccessHandler(function(r){';
  html += '      var d=JSON.parse(r);';
  html += '      if(d.success){';
  html += '        st.className="status success";';
  html += '        st.innerHTML="✅ Report selesai!<br>📝 "+d.totalMessages+" pesan dianalisa<br>📄 Sheet: "+d.sheetName;';
  html += '        btn.textContent="✅ Selesai";';
  html += '      } else {';
  html += '        st.className="status error"; st.textContent="❌ "+d.error;';
  html += '        btn.disabled=false; btn.textContent="🔍 Generate Report";';
  html += '      }';
  html += '    })';
  html += '    .withFailureHandler(function(e){';
  html += '      st.className="status error"; st.textContent="❌ Error: "+e;';
  html += '      btn.disabled=false; btn.textContent="🔍 Generate Report";';
  html += '    })';
  html += '    .generateMonthlyReport(parseInt(year),parseInt(month));';
  html += '};';
  html += '</script></body></html>';

  return html;
}

/**
 * Setup HTML Picker — buat file MonthPicker.html.
 * Jalankan sekali dari menu.
 */
function setupHtmlPicker() {
  var ui = SpreadsheetApp.getUi();

  // Coba simpan sebagai file di Drive (sebagai referensi)
  var htmlContent = getMonthPickerHtmlEmbedded_();
  var blob = Utilities.newBlob(htmlContent, 'text/html', 'MonthPicker.html');

  try {
    var folder = DriveApp.getFolderById(getFolderId());
    var files = folder.getFilesByName('MonthPicker.html');

    if (files.hasNext()) {
      var file = files.next();
      file.setContent(htmlContent);
      ui.alert(
        '✅ File MonthPicker.html sudah diupdate di Drive.',
        'File HTML picker tersimpan di folder Drive.\n\n'
        + '📌 NOTE: Untuk menggunakan dialog HTML yang proper,\n'
        + 'buat file HTML di editor GAS:\n'
        + '1. File > New > HTML file\n'
        + '2. Nama: MonthPicker\n'
        + '3. Paste konten dari file MonthPicker.html di Drive\n\n'
        + 'Atau cukup gunakan fallback dialog bawaan (input box).',
        ui.ButtonSet.OK
      );
    } else {
      folder.createFile(blob);
      ui.alert(
        '✅ File MonthPicker.html dibuat di Drive.',
        '📌 Instruksi:\n'
        + '1. Buka editor GAS (Tools > Script Editor)\n'
        + '2. File > New > HTML file, nama: MonthPicker\n'
        + '3. Buka file MonthPicker.html di Drive, copy paste\n\n'
        + 'Atau abaikan — fallback dialog akan otomatis dipakai.',
        ui.ButtonSet.OK
      );
    }
  } catch (e) {
    // Fallback: sekadar kasih info
    ui.alert(
      'ℹ️ Setup HTML Picker',
      'HTML picker sudah siap digunakan secara embedded.\n'
      + 'Dialog akan tampil dengan UI modern tanpa file terpisah.\n\n'
      + 'Tidak perlu setup tambahan.',
      ui.ButtonSet.OK
    );
  }
}

// ============================================================
//  DATE RANGE PICKER (HTML dengan input type="date")
// ============================================================

/**
 * Tampilkan dialog date range picker dengan input type="date".
 */
function showDateRangePicker() {
  assertConfig();
  var html = HtmlService.createHtmlOutput(getDateRangePickerHtml_())
    .setWidth(420)
    .setHeight(480)
    .setTitle('📅 Custom Range Report');
  SpreadsheetApp.getUi().showModalDialog(html, '📅 Pilih Rentang Tanggal');
}

/**
 * Embedded HTML untuk date range picker.
 */
function getDateRangePickerHtml_() {
  // Default: 30 hari kebelakang dari hari ini
  var now = new Date();
  var defaultEnd = Utilities.formatDate(now, 'GMT+7', 'yyyy-MM-dd');
  var past = new Date(now.getTime() - 30 * 86400000);
  var defaultStart = Utilities.formatDate(past, 'GMT+7', 'yyyy-MM-dd');

  var html = '<!DOCTYPE html><html><head><base target="_top"><style>';
  html += 'body{font-family:Arial,sans-serif;padding:20px;background:#f8f9fa;margin:0}';
  html += '.container{max-width:360px;margin:0 auto}';
  html += 'h2{color:#1a73e8;margin-bottom:4px;font-size:18px}';
  html += '.sub{color:#666;font-size:13px;margin-bottom:20px}';
  html += 'label{display:block;margin:16px 0 4px;font-weight:600;color:#333;font-size:13px}';
  html += 'input[type=date]{width:100%;padding:10px;border:2px solid #dadce0;border-radius:8px;font-size:14px;background:#fff;box-sizing:border-box}';
  html += 'input[type=date]:focus{border-color:#1a73e8;outline:none}';
  html += '.row{display:flex;gap:12px}';
  html += '.row>div{flex:1}';
  html += '.btn{width:100%;padding:12px;margin-top:20px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}';
  html += '.btn:hover{background:#1557b0}';
  html += '.btn:disabled{background:#ccc;cursor:not-allowed}';
  html += '.status{margin-top:12px;padding:12px;border-radius:6px;display:none;font-size:13px;line-height:1.5}';
  html += '.status.loading{display:block;background:#e8f0fe;color:#1a73e8}';
  html += '.status.error{display:block;background:#fce8e6;color:#d93025}';
  html += '.status.success{display:block;background:#e6f4ea;color:#137333}';
  html += '.quick{margin-top:16px;display:flex;gap:6px;flex-wrap:wrap}';
  html += '.quick button{flex:1;min-width:70px;padding:6px 10px;border:1px solid #dadce0;border-radius:6px;background:#fff;font-size:12px;cursor:pointer}';
  html += '.quick button:hover{background:#e8f0fe;border-color:#1a73e8}';
  html += '.footer{margin-top:16px;text-align:center;font-size:11px;color:#999}';
  html += '</style></head><body><div class="container">';
  html += '<h2>📅 Custom Range</h2>';
  html += '<div class="sub">Pilih tanggal mulai & akhir</div>';

  // Quick presets
  html += '<div class="quick">';
  html += '<button onclick="setRange(7)">7 hari</button>';
  html += '<button onclick="setRange(14)">14 hari</button>';
  html += '<button onclick="setRange(30)">30 hari</button>';
  html += '<button onclick="setThisMonth()">Bulan ini</button>';
  html += '<button onclick="setLastMonth()">Bulan lalu</button>';
  html += '</div>';

  // Date inputs side by side
  html += '<div class="row">';
  html += '<div><label for="startDate">Dari</label>';
  html += '<input type="date" id="startDate" value="' + defaultStart + '"></div>';
  html += '<div><label for="endDate">Sampai</label>';
  html += '<input type="date" id="endDate" value="' + defaultEnd + '"></div>';
  html += '</div>';

  html += '<button class="btn" id="generateBtn">🔍 Generate Report</button>';
  html += '<div class="status" id="status"></div>';
  html += '<div class="footer">Telegram Bot Log Analyzer</div>';
  html += '</div>';

  html += '<script>';
  html += 'function setRange(days){';
  html += '  var e=new Date(); var s=new Date(e.getTime()-days*86400000);';
  html += '  document.getElementById("startDate").value=s.toISOString().slice(0,10);';
  html += '  document.getElementById("endDate").value=e.toISOString().slice(0,10);';
  html += '}';
  html += 'function setThisMonth(){';
  html += '  var n=new Date(); var s=new Date(n.getFullYear(),n.getMonth(),1);';
  html += '  document.getElementById("startDate").value=s.toISOString().slice(0,10);';
  html += '  document.getElementById("endDate").value=n.toISOString().slice(0,10);';
  html += '}';
  html += 'function setLastMonth(){';
  html += '  var n=new Date(); var s=new Date(n.getFullYear(),n.getMonth()-1,1);';
  html += '  var e=new Date(n.getFullYear(),n.getMonth(),0);';
  html += '  document.getElementById("startDate").value=s.toISOString().slice(0,10);';
  html += '  document.getElementById("endDate").value=e.toISOString().slice(0,10);';
  html += '}';
  html += 'document.getElementById("generateBtn").onclick=function(){';
  html += '  var btn=this; btn.disabled=true; btn.textContent="⏳ Memproses...";';
  html += '  var st=document.getElementById("status");';
  html += '  st.className="status loading"; st.textContent="⏳ Menganalisa data..."; st.style.display="block";';
  html += '  var s=document.getElementById("startDate").value;';
  html += '  var e=document.getElementById("endDate").value;';
  html += '  if(!s||!e){st.className="status error";st.textContent="❌ Pilih tanggal mulai dan akhir.";btn.disabled=false;btn.textContent="🔍 Generate Report";return;}';
  html += '  if(e<s){st.className="status error";st.textContent="❌ Tanggal akhir harus setelah tanggal mulai.";btn.disabled=false;btn.textContent="🔍 Generate Report";return;}';
  html += '  google.script.run';
  html += '    .withSuccessHandler(function(r){';
  html += '      var d=JSON.parse(r);';
  html += '      if(d.success){';
  html += '        st.className="status success";';
  html += '        st.innerHTML="✅ Report selesai!<br>📝 "+d.totalMessages+" pesan<br>📄 "+d.sheetName;';
  html += '        btn.textContent="✅ Selesai";';
  html += '      }else{';
  html += '        st.className="status error";st.textContent="❌ "+d.error;';
  html += '        btn.disabled=false;btn.textContent="🔍 Generate Report";';
  html += '      }';
  html += '    })';
  html += '    .withFailureHandler(function(e){';
  html += '      st.className="status error";st.textContent="❌ Error: "+e;';
  html += '      btn.disabled=false;btn.textContent="🔍 Generate Report";';
  html += '    })';
  html += '    .generateCustomRangeReport(s,e);';
  html += '};';
  html += '</script></body></html>';

  return html;
}
