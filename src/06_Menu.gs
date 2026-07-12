/**
 * ============================================================
 *  06_MENU.gs — Menu Google Sheets
 * ============================================================
 *  onOpen() dipicu otomatis saat spreadsheet dibuka.
 *  Juga: fungsi quick action, refresh, dll.
 * ============================================================
 */

/**
 * Setup menu — otomatis jalan saat spreadsheet dibuka.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  // -------------------------
  //  MENU UTAMA: 🤖 Dashboard Bot
  // -------------------------
  var mainMenu = ui.createMenu('🤖 Dashboard Bot');

  // Setup
  mainMenu.addItem('1. Setup Log Sheet', 'setupSheet');
  mainMenu.addSeparator();

  // Diagnostik
  mainMenu.addItem('🔍 Cek Grup Terhubung', 'checkLinkedGroups');
  mainMenu.addItem('📑 Scan Topik Grup', 'scanLinkedTopics');
  mainMenu.addSeparator();

  // Submenu: Analisa Bulanan
  var subAnalisa = ui.createMenu('📊 Analisa Bulanan');
  subAnalisa.addItem('📋 Per Bulan (Pilih Bulan)', 'showMonthlyReportPicker');
  subAnalisa.addItem('📈 Bulan Terakhir', 'quickLastMonthReport');
  subAnalisa.addSeparator();
  subAnalisa.addItem('📅 Custom Range (Tanggal Manual)', 'showCustomRangeDialog');
  subAnalisa.addSeparator();
  subAnalisa.addItem('📤 Kirim Report ke Telegram', 'sendMonthlyReportToTelegram');
  subAnalisa.addSeparator();
  subAnalisa.addItem('🔧 Setup HTML Picker', 'setupHtmlPicker');
  mainMenu.addSubMenu(subAnalisa);
  mainMenu.addSeparator();

  // Submenu: Webhook
  var subWebhook = ui.createMenu('🔧 Manajemen Webhook');
  subWebhook.addItem('Set Webhook (Aktifkan)', 'setWebhook');
  subWebhook.addItem('Check Status Webhook', 'getWebhookInfo');
  subWebhook.addItem('Delete Webhook (Nonaktifkan)', 'deleteWebhook');
  mainMenu.addSubMenu(subWebhook);

  // Submenu: Config
  var subConfig = ui.createMenu('🔐 Config');
  subConfig.addItem('Setup Token & Folder', 'setupConfig');
  subConfig.addItem('Lihat Konfigurasi', 'viewConfig');
  mainMenu.addSubMenu(subConfig);

  mainMenu.addToUi();

  // -------------------------
  //  MENU KEDUA: ⚡ Quick Actions
  // -------------------------
  ui.createMenu('⚡ Quick Actions')
    .addItem('📊 Per Bulan', 'showMonthlyReportPicker')
    .addItem('📅 Custom Range', 'showCustomRangeDialog')
    .addItem('📤 Kirim ke Telegram', 'sendMonthlyReportToTelegram')
    .addItem('🔄 Refresh', 'refreshDataValidation')
    .addToUi();
}

/**
 * Quick action: generate report bulan terakhir tanpa dialog.
 */
function quickLastMonthReport() {
  try {
    assertConfig();

    var available = getAvailableMonths();
    if (available.length === 0) {
      SpreadsheetApp.getUi().alert('Belum ada data.');
      return;
    }

    var latest = available[0];
    var result = JSON.parse(generateMonthlyReport(latest.year, latest.month));

    if (result.success) {
      SpreadsheetApp.getUi().alert(
        '✅ Report ' + getMonthName_(latest.month) + ' ' + latest.year + ' selesai!\n\n'
        + '📄 Sheet: ' + result.sheetName + '\n'
        + '📝 Total: ' + result.totalMessages + ' pesan\n'
        + '👥 Grup terdeteksi: ' + result.summary.groups
      );
    } else {
      SpreadsheetApp.getUi().alert('❌ ' + result.error);
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.toString());
  }
}

/**
 * Refresh / validasi data — sederhana.
 */
function refreshDataValidation() {
  var rowCount = getAllRows().length;
  SpreadsheetApp.getUi().alert(
    '✅ Data siap!\n\nTotal pesan tercatat: ' + rowCount
  );
}
