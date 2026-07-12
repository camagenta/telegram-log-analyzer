/**
 * ============================================================
 *  03_DRIVE.gs — Interaksi dengan Google Drive
 * ============================================================
 *  Dependensi: 00_Config.gs (getToken, getFolderId)
 *              02_Telegram.gs (getFileLink)
 * ============================================================
 */

/**
 * Download file dari Telegram dan simpan ke Google Drive folder.
 * @param {string} fileId Telegram file_id
 * @param {string} fileName Nama file untuk disimpan
 * @return {string} URL file Google Drive, atau pesan error
 */
function saveToDrive(fileId, fileName) {
  try {
    assertConfig();

    // 1. Validasi Input
    if (!fileId) return 'Gagal: fileId kosong';
    if (!fileName) fileName = 'Untitled_File_' + new Date().getTime();

    // 2. Dapatkan file path dari Telegram
    var response = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + getToken() + '/getFile?file_id=' + fileId
    );
    var resJson = JSON.parse(response.getContentText());

    if (!resJson.ok || !resJson.result) {
      return 'Gagal: Telegram tidak mengizinkan akses file (Mungkin file > 20MB)';
    }

    var filePath = resJson.result.file_path;
    var fileUrl = 'https://api.telegram.org/file/bot' + getToken() + '/' + filePath;

    // 3. Download file sebagai Blob
    var blob = UrlFetchApp.fetch(fileUrl).getBlob();
    blob.setName(fileName);

    // 4. Simpan ke folder Drive
    var folder = DriveApp.getFolderById(getFolderId());
    var file = folder.createFile(blob);

    // 5. Atur izin (siapa pun dengan link bisa lihat)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return file.getUrl();

  } catch (e) {
    console.error('saveToDrive error:', e.toString());
    return 'Gagal Simpan: ' + e.toString();
  }
}
