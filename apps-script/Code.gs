/**
 * Workforce Planning — Google Apps Script backend
 *
 * Bu skript Google Sheet-i platformanın ortaq məlumat bazasına çevirir.
 * Vərəqlər avtomatik yaradılır: Tasks, Employees, Log.
 *
 * Quraşdırma (README.md-də ətraflı):
 *  1. Yeni Google Sheet açın → Extensions → Apps Script → bu faylın məzmununu yapışdırın.
 *  2. Project Settings → Script properties → TOKEN adlı açar əlavə edin (uzun, təsadüfi söz).
 *  3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy.
 *  4. Web app URL-ni və TOKEN-i platformanın "Ayarlar" bölməsinə yazın.
 */

var SHEETS = {
  tasks: { name: 'Tasks', cols: ['id', 'company', 'process', 'category', 'task', 'description', 'owner_before', 'owner_after',
    'min_per_key', 'annual_freq', 'unit', 'hours', 'after_opt', 'is_cancelled', 'updated_at'] },
  employees: { name: 'Employees', cols: ['name', 'company', 'activity', 'fte', 'is_group', 'active'] },
  log: { name: 'Log', cols: ['ts', 'action', 'task_id', 'task_label', 'from', 'to', 'comment'] }
};
var BOOL_COLS = { is_cancelled: true, is_group: true, active: true };
var NUM_COLS = { min_per_key: true, annual_freq: true, hours: true, after_opt: true, fte: true };

function doGet(e) {
  try {
    checkToken_(e.parameter.token);
    var action = e.parameter.action || 'read';
    if (action === 'read') return json_({ status: 'success', version: getVersion_(), data: readAll_() });
    return json_({ status: 'error', message: 'Naməlum əməliyyat: ' + action });
  } catch (err) {
    return json_({ status: 'error', message: String(err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    lock.waitLock(20000);
    if (body.action === 'saveAll') {
      var current = getVersion_();
      // baseVersion null → məcburi yazma ("Bu məlumatları Sheet-ə yaz" düyməsi)
      if (body.baseVersion !== null && body.baseVersion !== undefined && Number(body.baseVersion) !== current) {
        return json_({ status: 'conflict', version: current });
      }
      var d = body.data || {};
      writeSheet_(SHEETS.tasks, d.tasks || []);
      writeSheet_(SHEETS.employees, d.employees || []);
      writeSheet_(SHEETS.log, d.log || []);
      var next = current + 1;
      PropertiesService.getScriptProperties().setProperty('VERSION', String(next));
      return json_({ status: 'success', version: next });
    }
    return json_({ status: 'error', message: 'Naməlum əməliyyat: ' + body.action });
  } catch (err) {
    return json_({ status: 'error', message: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (expected && token !== expected) throw new Error('Giriş açarı (token) yanlışdır');
}

function getVersion_() {
  return Number(PropertiesService.getScriptProperties().getProperty('VERSION') || 0);
}

function sheet_(def) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_() {
  return { tasks: readSheet_(SHEETS.tasks), employees: readSheet_(SHEETS.employees), log: readSheet_(SHEETS.log) };
}

function readSheet_(def) {
  var sh = sheet_(def);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0].map(String);
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i], o = {}, empty = true;
    for (var j = 0; j < head.length; j++) {
      var k = head[j], v = row[j];
      if (v !== '' && v !== null) empty = false;
      if (v instanceof Date) v = v.toISOString();
      if (BOOL_COLS[k]) v = v === true || String(v).toUpperCase() === 'TRUE';
      else if (NUM_COLS[k]) v = (v === '' || v === null) ? null : Number(v);
      else v = v === null ? '' : String(v);
      o[k] = v;
    }
    if (!empty) out.push(o);
  }
  return out;
}

function writeSheet_(def, rows) {
  var sh = sheet_(def);
  var cols = def.cols;
  var data = [cols].concat(rows.map(function (r) {
    return cols.map(function (k) {
      var v = r[k];
      if (v === null || v === undefined) return '';
      if (BOOL_COLS[k]) return v === true || String(v).toUpperCase() === 'TRUE';
      return v;
    });
  }));
  sh.clearContents();
  sh.getRange(1, 1, data.length, cols.length).setValues(data);
  sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
