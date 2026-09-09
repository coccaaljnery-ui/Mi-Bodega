const APP_VERSION = "Mi Bodega V57 NETLIFY READY";
const SNAPSHOT_SHEET = "_Snapshot";
const CONNECTION_SHEET = "Conexion";
const CHUNK_SIZE = 40000;

function setup() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error("Abre Apps Script desde una hoja de Google Sheets.");
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", active.getId());

  let token = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    PropertiesService.getScriptProperties().setProperty("API_TOKEN", token);
  }

  try { active.setSpreadsheetTimeZone("America/Guatemala"); } catch (err) {}

  ensureSheet_(CONNECTION_SHEET, ["Campo", "Valor"]);
  ensureSheet_(SNAPSHOT_SHEET, ["Parte", "JSON"]);
  createDataSheets_();
  migrateLegacyDifferences_();
  refreshOpenDifferencesSheet_();
  updateConnectionSheet_(token, "");

  return "Listo. Copia el token desde la pestaña Conexion.";
}

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "ping");
    const token = String((e && e.parameter && e.parameter.token) || "");
    verifyToken_(token);

    let result;
    if (action === "ping") {
      result = { ok: true, version: APP_VERSION, baseProducts: true, saveBaseProduct: true, centralStaff: true, differenceImmediateSave: true, weeklyHistory: true, time: new Date().toISOString() };
    } else if (action === "load") {
      result = { ok: true, version: APP_VERSION, data: readSnapshot_() };
    } else if (action === "base_products") {
      result = { ok: true, version: APP_VERSION, products: readBaseProducts_() };
    } else if (action === "week_history_list") {
      result = { ok: true, version: APP_VERSION, weeks: weeklyHistoryList_() };
    } else if (action === "week_history_status") {
      const status = weeklyHistoryStatus_(String(e.parameter.id || ""));
      result = { ok: true, version: APP_VERSION, ...status };
    } else if (action === "week_history") {
      const archive = readWeeklyArchive_(String(e.parameter.id || ""));
      result = archive
        ? { ok: true, version: APP_VERSION, archive: archive }
        : { ok: false, error: "Semana no encontrada." };
    } else if (action === "difference_history") {
      migrateLegacyDifferences_();
      result = { ok: true, version: APP_VERSION, history: readDifferenceHistory_() };
    } else if (action === "save_difference") {
      const rec = differenceRecordFromParams_(e.parameter || {});
      if (!rec.id) throw new Error("ID de diferencia vacío.");
      if (!rec.code) throw new Error("Código de diferencia vacío.");

      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        upsertDifferenceHistory_([rec]);
        refreshOpenDifferencesSheet_();
        updateConnectionSheet_(
          PropertiesService.getScriptProperties().getProperty("API_TOKEN") || "",
          new Date().toISOString()
        );
      } finally {
        lock.releaseLock();
      }

      result = { ok: true, saved: true, id: rec.id, sheet: "Historial_Diferencias", version: APP_VERSION };
    } else if (action === "staff") {
      const staff = readStaff_();
      result = { ok: true, version: APP_VERSION, technicians: staff.technicians, keepers: staff.keepers };
    } else if (action === "save_staff") {
      const type = String(e.parameter.type || "").trim();
      const name = String(e.parameter.name || "").trim();
      const active = String(e.parameter.active || "1") !== "0";
      if (!name) throw new Error("Nombre vacío.");
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        saveStaffEntry_(type, name, active);
        updateConnectionSheet_(PropertiesService.getScriptProperties().getProperty("API_TOKEN") || "", new Date().toISOString());
      } finally { lock.releaseLock(); }
      result = { ok: true, saved: true, version: APP_VERSION, type: type, name: name, active: active };
    } else if (action === "save_base_product") {
      const product = {
        code: String(e.parameter.code || "").trim(),
        catalog: String(e.parameter.catalog || "").trim(),
        description: String(e.parameter.description || "").trim(),
        family: String(e.parameter.family || "").trim(),
        min: Number(e.parameter.min || 0) || 0,
        max: Number(e.parameter.max || 0) || 0
      };
      if (!product.code) throw new Error("Código vacío.");
      if (!product.description) throw new Error("Descripción vacía.");
      if (!product.family) throw new Error("Familia vacía.");
      if (product.max < product.min) throw new Error("Máximo no puede ser menor que Mínimo.");

      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        upsertBaseProducts_([product]);
        updateConnectionSheet_(
          PropertiesService.getScriptProperties().getProperty("API_TOKEN") || "",
          new Date().toISOString()
        );
      } finally {
        lock.releaseLock();
      }

      result = {
        ok: true,
        saved: true,
        version: APP_VERSION,
        code: product.code,
        sheet: "BASE_PRODUCTOS"
      };
    } else {
      result = { ok: false, error: "Acción no válida." };
    }

    return output_(result, e && e.parameter ? e.parameter.callback : "");
  } catch (err) {
    return output_({ ok: false, error: String(err.message || err) }, e && e.parameter ? e.parameter.callback : "");
  }
}

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    verifyToken_(String(request.token || ""));
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (request.action === "save") {
        if (!request.data || typeof request.data !== "object") throw new Error("Datos vacíos.");
        writeSnapshot_(request.data);
        mirrorAll_(request.data);
      } else if (request.action === "save_week_archive") {
        if (!request.archive || typeof request.archive !== "object") throw new Error("Historial semanal vacío.");
        saveWeeklyArchive_(request.archive);
      } else if (request.action === "upsert_base_products") {
        const products = Array.isArray(request.products) ? request.products : [];
        if (!products.length) throw new Error("No hay productos para guardar.");
        upsertBaseProducts_(products);
      } else if (request.action === "upsert_differences") {
        const records = Array.isArray(request.records) ? request.records : [];
        if (!records.length) throw new Error("No hay diferencias para guardar.");
        upsertDifferenceHistory_(records);
        refreshOpenDifferencesSheet_();
      } else {
        throw new Error("Acción no válida.");
      }
      updateConnectionSheet_(
        PropertiesService.getScriptProperties().getProperty("API_TOKEN") || "",
        new Date().toISOString()
      );
    } finally {
      lock.releaseLock();
    }

    return output_({ ok: true, savedAt: new Date().toISOString() }, "");
  } catch (err) {
    return output_({ ok: false, error: String(err.message || err) }, "");
  }
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error("No hay hoja vinculada. Ejecuta setup().");
  return active;
}

function verifyToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  if (!expected) throw new Error("Ejecuta setup() primero.");
  if (!token || token !== expected) throw new Error("Token incorrecto.");
}

function output_(obj, callback) {
  const json = JSON.stringify(obj);
  const cb = String(callback || "");
  if (cb && /^[A-Za-z_$][A-Za-z0-9_$\.]*$/.test(cb)) {
    return ContentService
      .createTextOutput(cb + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureSheet_(name, headers) {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && headers.length) {
    const current = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    const mismatch = headers.some((h, i) => current[i] !== h);
    if (mismatch) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function setTable_(name, headers, rows) {
  const sh = ensureSheet_(name, headers);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows && rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sh.setFrozenRows(1);
  try { sh.autoResizeColumns(1, headers.length); } catch (err) {}
}

function writeSnapshot_(data) {
  const sh = ensureSheet_(SNAPSHOT_SHEET, ["Parte", "JSON"]);
  const raw = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < raw.length; i += CHUNK_SIZE) {
    chunks.push([chunks.length + 1, raw.slice(i, i + CHUNK_SIZE)]);
  }
  sh.clearContents();
  sh.getRange(1, 1, 1, 2).setValues([["Parte", "JSON"]]);
  if (chunks.length) sh.getRange(2, 1, chunks.length, 2).setValues(chunks);
}

function readSnapshot_() {
  const sh = ensureSheet_(SNAPSHOT_SHEET, ["Parte", "JSON"]);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 2).getValues()
    .filter(r => r[1] !== "")
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!rows.length) return null;
  const raw = rows.map(r => String(r[1])).join("");
  return JSON.parse(raw);
}

function createDataSheets_() {
  ensureSheet_("BASE_PRODUCTOS", ["CÓDIGO","CATÁLOGO","DESCRIPCIÓN","FAMILIA","MÍN.","MÁX."]);
  ensureSheet_("BASE_TECNICOS", ["NOMBRE","ACTIVO"]);
  ensureSheet_("BASE_BODEGUEROS", ["NOMBRE","ACTIVO"]);
  ensureSheet_("Codigos_Nuevos", ["CÓDIGO","CATÁLOGO","DESCRIPCIÓN","FAMILIA","MÍN.","MÁX.","ESTADO"]);
  ensureSheet_("Inventario", ["ID","Código","Catálogo","Descripción","Familia","Existencia","Mínimo","Máximo","Ubicación","Reposición"]);
  ensureSheet_("Salidas", ["ID","Fecha","Código","Producto","Cantidad","Técnico","N. Orden","Estado","Bodeguero","Orden bloqueada"]);
  ensureSheet_("Conteo_Semanal", ["Producto ID","Físico","Observación","Actualizado"]);
  ensureSheet_("Historial_Semanas", ["ID","Semana","Responsable","Cerrada","Revisión","Total","Checksum","Contados","Diferencias","Pendientes"]);
  ensureSheet_("Historial_Conteo_Semanal", ["Archivo ID","Semana","Responsable","Cerrada","Revisión","Total","Checksum","Orden","Producto ID","Código","Catálogo","Descripción","Familia","Existencia","Físico","Diferencia","Estado","Observación","Solo semanal"]);
  ensureSheet_("Semana", ["Campo","Valor"]);
  ensureSheet_("Inventario_Digital", ["Producto ID","Código","Familia","Existencia","Físico","Diferencia","Estado","Observación","Responsable","Detectado"]);
  ensureSheet_("Diferencias", ["Fecha","Hora","Responsable","Familia","Código","Catálogo","Descripción","Existencia","Físico","Diferencia","Estado","Observación"]);
  ensureSheet_("Historial_Diferencias", ["ID","Detectado","Responsable","Familia","Código","Catálogo","Descripción","Existencia al detectar","Físico inicial","Diferencia inicial","Observación","Seguimiento","Resuelto en","Resolución","Última revisión","Existencia revisión","Físico revisión","Diferencia revisión","Producto ID"]);
  ensureSheet_("Sin_Existencia", ["Fecha","Hora","Código","Catálogo","Descripción","Familia","Existencia","Mínimo","Máximo","Reposición","Ubicación","Estado"]);
  ensureSheet_("Familias_Cerradas", ["Familia","Cerrada","Responsable","Cerrada en","Reabierta en"]);
  ensureSheet_("Ajustes", ["ID","Fecha","Código","Producto ID","Familia","Existencia anterior","Físico","Diferencia","Responsable"]);
  ensureSheet_("Configuracion", ["Campo","Valor"]);
  ensureSheet_("Conteos_Aux", ["Índice","JSON"]);
}

function staffSheetName_(type) {
  const t = String(type || "").trim().toLowerCase();
  if (t === "technician" || t === "tech" || t === "tecnico" || t === "técnico") return "BASE_TECNICOS";
  if (t === "keeper" || t === "bodeguero") return "BASE_BODEGUEROS";
  throw new Error("Tipo de personal no válido.");
}

function readActiveNames_(sheetName) {
  const sh = ensureSheet_(sheetName, ["NOMBRE","ACTIVO"]);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2,1,last-1,2).getDisplayValues()
    .filter(r => String(r[0] || "").trim() !== "")
    .filter(r => {
      const v = String(r[1] || "TRUE").trim().toLowerCase();
      return !(v === "false" || v === "0" || v === "no" || v === "inactivo");
    })
    .map(r => String(r[0] || "").trim());
}

function readStaff_() {
  return {
    technicians: readActiveNames_("BASE_TECNICOS"),
    keepers: readActiveNames_("BASE_BODEGUEROS")
  };
}

function saveStaffEntry_(type, name, active) {
  const sheetName = staffSheetName_(type);
  const sh = ensureSheet_(sheetName, ["NOMBRE","ACTIVO"]);
  const clean = String(name || "").trim();
  const key = clean.toUpperCase();
  if (!clean) throw new Error("Nombre vacío.");
  const last = sh.getLastRow();
  let row = 0;
  if (last >= 2) {
    const values = sh.getRange(2,1,last-1,1).getDisplayValues();
    for (let i=0;i<values.length;i++) {
      if (String(values[i][0] || "").trim().toUpperCase() === key) { row = i + 2; break; }
    }
  }
  if (row) sh.getRange(row,1,1,2).setValues([[clean, !!active]]);
  else sh.appendRow([clean, !!active]);
  sh.setFrozenRows(1);
  try { sh.autoResizeColumns(1,2); } catch (err) {}
}

function upsertBaseProducts_(products) {
  const sh = ensureSheet_("BASE_PRODUCTOS", ["CÓDIGO","CATÁLOGO","DESCRIPCIÓN","FAMILIA","MÍN.","MÁX."]);
  const last = sh.getLastRow();
  const existing = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 6).getDisplayValues().forEach((r, i) => {
      const code = String(r[0] || "").trim().toUpperCase();
      if (code) existing[code] = i + 2;
    });
  }

  const appendRows = [];
  products.forEach(p => {
    const code = String(p.code || "").trim().toUpperCase();
    if (!code) return;
    const row = [
      code,
      String(p.catalog || "").trim(),
      String(p.description || "").trim(),
      String(p.family || "").trim(),
      Number(p.min || 0) || 0,
      Number(p.max || 0) || 0
    ];
    if (existing[code]) sh.getRange(existing[code], 1, 1, 6).setValues([row]);
    else appendRows.push(row);
  });

  if (appendRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, 6).setValues(appendRows);
  }
}

function readBaseProducts_() {
  const sh = ensureSheet_("BASE_PRODUCTOS", ["CÓDIGO","CATÁLOGO","DESCRIPCIÓN","FAMILIA","MÍN.","MÁX."]);
  const last = sh.getLastRow();
  if (last < 2) return [];

  const rows = sh.getRange(2, 1, last - 1, 6).getDisplayValues();
  return rows
    .filter(r => String(r[0] || "").trim() !== "")
    .map(r => ({
      code: String(r[0] || "").trim(),
      catalog: String(r[1] || "").trim(),
      description: String(r[2] || "").trim(),
      family: String(r[3] || "").trim(),
      min: Number(String(r[4] || "0").replace(",", ".")) || 0,
      max: Number(String(r[5] || "0").replace(",", ".")) || 0
    }));
}

function legacyDifferenceIso_(dateText, timeText) {
  try {
    const d = String(dateText || "").trim().split("/");
    if (d.length !== 3) return new Date().toISOString();
    const t = String(timeText || "00:00:00").trim().split(":");
    const dt = new Date(
      Number(d[2]), Number(d[1]) - 1, Number(d[0]),
      Number(t[0] || 0), Number(t[1] || 0), Number(t[2] || 0)
    );
    return dt.toISOString();
  } catch (err) {
    return new Date().toISOString();
  }
}

function migrateLegacyDifferences_() {
  const hist = ensureSheet_("Historial_Diferencias", ["ID","Detectado","Responsable","Familia","Código","Catálogo","Descripción","Existencia al detectar","Físico inicial","Diferencia inicial","Observación","Seguimiento","Resuelto en","Resolución","Última revisión","Existencia revisión","Físico revisión","Diferencia revisión","Producto ID"]);
  if (hist.getLastRow() >= 2) return;

  const legacy = spreadsheet_().getSheetByName("Diferencias");
  if (!legacy || legacy.getLastRow() < 2) return;

  const rows = legacy.getRange(2, 1, legacy.getLastRow() - 1, Math.min(12, legacy.getLastColumn())).getDisplayValues();
  const migrated = rows
    .filter(r => String(r[4] || "").trim() !== "")
    .map((r, i) => {
      const expected = Number(String(r[7] || "0").replace(",", ".")) || 0;
      const physical = Number(String(r[8] || "0").replace(",", ".")) || 0;
      const difference = Number(String(r[9] || (physical - expected)).replace(",", ".")) || (physical - expected);
      return [
        "legacy-" + Utilities.getUuid(),
        legacyDifferenceIso_(r[0], r[1]),
        r[2] || "",
        r[3] || "",
        r[4] || "",
        r[5] || "",
        r[6] || "",
        expected,
        physical,
        difference,
        r[11] || "",
        "open",
        "",
        "Migrada desde Diferencias",
        legacyDifferenceIso_(r[0], r[1]),
        expected,
        physical,
        difference
      ];
    });

  if (migrated.length) {
    hist.getRange(2, 1, migrated.length, 19).setValues(migrated.map(r=>[...r,""]));
  }
}

function readDifferenceHistory_() {
  migrateLegacyDifferences_();
  const sh = ensureSheet_("Historial_Diferencias", ["ID","Detectado","Responsable","Familia","Código","Catálogo","Descripción","Existencia al detectar","Físico inicial","Diferencia inicial","Observación","Seguimiento","Resuelto en","Resolución","Última revisión","Existencia revisión","Físico revisión","Diferencia revisión","Producto ID"]);
  if (sh.getLastRow() < 2) return [];

  return sh.getRange(2, 1, sh.getLastRow() - 1, 19).getValues().map(r => ({
    id: String(r[0] || ""),
    detectedAt: r[1] instanceof Date ? r[1].toISOString() : String(r[1] || ""),
    responsible: String(r[2] || ""),
    family: String(r[3] || ""),
    code: String(r[4] || ""),
    catalog: String(r[5] || ""),
    name: String(r[6] || ""),
    expected: Number(r[7] || 0),
    physical: Number(r[8] || 0),
    difference: Number(r[9] || 0),
    obs: String(r[10] || ""),
    status: String(r[11] || "open"),
    resolvedAt: r[12] instanceof Date ? r[12].toISOString() : String(r[12] || ""),
    resolution: String(r[13] || ""),
    lastCheckedAt: r[14] instanceof Date ? r[14].toISOString() : String(r[14] || ""),
    lastExpected: Number(r[15] || 0),
    lastPhysical: Number(r[16] || 0),
    lastDifference: Number(r[17] || 0),
    productId: String(r[18] || "")
  }));
}

function differenceRecordFromParams_(p) {
  return {
    id: String(p.id || "").trim(),
    detectedAt: String(p.detectedAt || ""),
    responsible: String(p.responsible || ""),
    family: String(p.family || ""),
    code: String(p.code || ""),
    catalog: String(p.catalog || ""),
    name: String(p.name || ""),
    expected: Number(p.expected || 0) || 0,
    physical: Number(p.physical || 0) || 0,
    difference: Number(p.difference || 0) || 0,
    obs: String(p.obs || ""),
    status: String(p.status || "open"),
    resolvedAt: String(p.resolvedAt || ""),
    resolution: String(p.resolution || ""),
    lastCheckedAt: String(p.lastCheckedAt || ""),
    lastExpected: Number(p.lastExpected || 0) || 0,
    lastPhysical: Number(p.lastPhysical || 0) || 0,
    lastDifference: Number(p.lastDifference || 0) || 0,
    productId: String(p.productId || "")
  };
}

function differenceRecordRow_(r) {
  return [
    r.id || "", r.detectedAt || "", r.responsible || "", r.family || "", r.code || "",
    r.catalog || "", r.name || "", Number(r.expected || 0), Number(r.physical || 0),
    Number(r.difference || 0), r.obs || "", r.status || "open", r.resolvedAt || "",
    r.resolution || "", r.lastCheckedAt || "", Number(r.lastExpected || 0),
    Number(r.lastPhysical || 0), Number(r.lastDifference || 0), r.productId || ""
  ];
}

function upsertDifferenceHistory_(records) {
  const list = Array.isArray(records) ? records.filter(r => r && String(r.id || "").trim()) : [];
  if (!list.length) return;

  const sh = ensureSheet_("Historial_Diferencias", ["ID","Detectado","Responsable","Familia","Código","Catálogo","Descripción","Existencia al detectar","Físico inicial","Diferencia inicial","Observación","Seguimiento","Resuelto en","Resolución","Última revisión","Existencia revisión","Físico revisión","Diferencia revisión","Producto ID"]);
  const last = sh.getLastRow();
  const rowById = {};
  if (last >= 2) {
    sh.getRange(2,1,last-1,1).getDisplayValues().forEach((r,i)=>{
      const id=String(r[0]||"").trim();
      if(id)rowById[id]=i+2;
    });
  }

  const appendRows=[];
  list.forEach(r=>{
    const id=String(r.id||"").trim();
    if(!id)return;
    const row=differenceRecordRow_(r);
    if(rowById[id]){
      sh.getRange(rowById[id],1,1,19).setValues([row]);
    }else{
      appendRows.push(row);
    }
  });

  if(appendRows.length){
    sh.getRange(sh.getLastRow()+1,1,appendRows.length,19).setValues(appendRows);
  }
  sh.setFrozenRows(1);
}

function refreshOpenDifferencesSheet_() {
  const history=readDifferenceHistory_();
  const tz=spreadsheet_().getSpreadsheetTimeZone() || "America/Guatemala";
  const rows=history
    .filter(r=>String(r.status||"open")==="open")
    .map(r=>{
      let fecha="",hora="";
      if(r.detectedAt){
        const dt=new Date(r.detectedAt);
        if(!isNaN(dt.getTime())){
          fecha=Utilities.formatDate(dt,tz,"dd/MM/yyyy");
          hora=Utilities.formatDate(dt,tz,"HH:mm:ss");
        }
      }
      return [
        fecha,hora,r.responsible||"",r.family||"",r.code||"",r.catalog||"",
        r.name||"",Number(r.expected||0),Number(r.physical||0),
        Number(r.difference||0),Number(r.difference||0)>0?"Sobrante":"Faltante",
        r.obs||""
      ];
    });

  setTable_("Diferencias",
    ["Fecha","Hora","Responsable","Familia","Código","Catálogo","Descripción","Existencia","Físico","Diferencia","Estado","Observación"],
    rows
  );
}

function weeklyArchiveHash_(text) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

function weeklyArchiveNormalize_(a) {
  const items = Array.isArray(a && a.items) ? a.items.map((i,idx)=>({
    order:Number(i.order||idx+1),
    productId:String(i.productId||""),
    code:String(i.code||""),
    catalog:String(i.catalog||""),
    name:String(i.name||""),
    family:String(i.family||""),
    expected:Number(i.expected||0),
    physical:(i.physical===""||i.physical===null||i.physical===undefined)?"":Number(i.physical),
    difference:(i.difference===null||i.difference===undefined||i.difference==="")?null:Number(i.difference),
    status:String(i.status||"Pendiente"),
    obs:String(i.obs||""),
    weeklyOnly:!!i.weeklyOnly
  })) : [];

  return {
    id:String(a && a.id || "").trim(),
    label:String(a && a.label || ""),
    responsible:String(a && a.responsible || ""),
    closedAt:String(a && a.closedAt || ""),
    revision:Number(a && a.revision || 1),
    itemCount:Number(a && a.itemCount || items.length),
    counted:Number(a && a.counted || items.filter(i=>i.physical!=="").length),
    differences:Number(a && a.differences || items.filter(i=>i.physical!==""&&Number(i.difference)!==0).length),
    pending:Number(a && a.pending || items.filter(i=>i.physical==="").length),
    checksum:String(a && a.checksum || weeklyArchiveHash_(JSON.stringify(items))),
    items:items
  };
}

function weeklyHistoryIndexRow_(a) {
  return [
    a.id,a.label,a.responsible,a.closedAt,Number(a.revision||1),
    Number(a.itemCount||0),a.checksum||"",Number(a.counted||0),
    Number(a.differences||0),Number(a.pending||0)
  ];
}

function upsertWeeklyHistoryIndex_(archive) {
  const sh = ensureSheet_("Historial_Semanas", ["ID","Semana","Responsable","Cerrada","Revisión","Total","Checksum","Contados","Diferencias","Pendientes"]);
  const last = sh.getLastRow();
  let row = 0;
  if (last >= 2) {
    const vals = sh.getRange(2,1,last-1,1).getDisplayValues();
    for (let i=0;i<vals.length;i++) {
      if (String(vals[i][0]||"").trim() === archive.id) { row=i+2; break; }
    }
  }
  const data=weeklyHistoryIndexRow_(archive);
  if(row)sh.getRange(row,1,1,10).setValues([data]);
  else sh.getRange(sh.getLastRow()+1,1,1,10).setValues([data]);
  sh.setFrozenRows(1);
}

function weeklyHistoryStatus_(id) {
  const clean=String(id||"").trim();
  if(!clean)return {saved:false,id:"",itemCount:0,checksum:""};
  const sh=ensureSheet_("Historial_Semanas", ["ID","Semana","Responsable","Cerrada","Revisión","Total","Checksum","Contados","Diferencias","Pendientes"]);
  const last=sh.getLastRow();
  if(last<2)return {saved:false,id:clean,itemCount:0,checksum:""};
  const vals=sh.getRange(2,1,last-1,10).getDisplayValues();
  const r=vals.find(x=>String(x[0]||"").trim()===clean);
  if(!r)return {saved:false,id:clean,itemCount:0,checksum:""};
  return {saved:true,id:clean,itemCount:Number(r[5]||0),checksum:String(r[6]||"")};
}

function deleteWeeklyArchiveRows_(id) {
  const sh=ensureSheet_("Historial_Conteo_Semanal", ["Archivo ID","Semana","Responsable","Cerrada","Revisión","Total","Checksum","Orden","Producto ID","Código","Catálogo","Descripción","Familia","Existencia","Físico","Diferencia","Estado","Observación","Solo semanal"]);
  const last=sh.getLastRow();
  if(last<2)return;
  const matches=sh.getRange(2,1,last-1,1).createTextFinder(String(id||"")).matchEntireCell(true).findAll();
  const rows=matches.map(r=>r.getRow()).sort((a,b)=>b-a);
  rows.forEach(row=>sh.deleteRow(row));
}

function saveWeeklyArchive_(raw) {
  const a=weeklyArchiveNormalize_(raw);
  if(!a.id)throw new Error("ID de semana vacío.");
  if(!a.label)throw new Error("Semana sin nombre.");
  if(!a.items.length)throw new Error("La semana no tiene productos.");

  const current=weeklyHistoryStatus_(a.id);
  if(current.saved && current.itemCount===a.itemCount && current.checksum===a.checksum){
    return current;
  }

  if(current.saved)deleteWeeklyArchiveRows_(a.id);

  const sh=ensureSheet_("Historial_Conteo_Semanal", ["Archivo ID","Semana","Responsable","Cerrada","Revisión","Total","Checksum","Orden","Producto ID","Código","Catálogo","Descripción","Familia","Existencia","Físico","Diferencia","Estado","Observación","Solo semanal"]);
  const rows=a.items.map(i=>[
    a.id,a.label,a.responsible,a.closedAt,a.revision,a.itemCount,a.checksum,
    i.order,i.productId,i.code,i.catalog,i.name,i.family,Number(i.expected||0),
    i.physical===""?"":Number(i.physical),
    i.difference===null?"":Number(i.difference),
    i.status,i.obs,!!i.weeklyOnly
  ]);
  sh.getRange(sh.getLastRow()+1,1,rows.length,19).setValues(rows);
  sh.setFrozenRows(1);

  upsertWeeklyHistoryIndex_(a);
  return weeklyHistoryStatus_(a.id);
}

function weeklyHistoryList_() {
  const sh=ensureSheet_("Historial_Semanas", ["ID","Semana","Responsable","Cerrada","Revisión","Total","Checksum","Contados","Diferencias","Pendientes"]);
  const last=sh.getLastRow();
  if(last<2)return [];
  return sh.getRange(2,1,last-1,10).getValues().map(r=>({
    id:String(r[0]||""),
    label:String(r[1]||""),
    responsible:String(r[2]||""),
    closedAt:r[3] instanceof Date?r[3].toISOString():String(r[3]||""),
    revision:Number(r[4]||1),
    itemCount:Number(r[5]||0),
    checksum:String(r[6]||""),
    counted:Number(r[7]||0),
    differences:Number(r[8]||0),
    pending:Number(r[9]||0),
    needsSync:false
  })).sort((a,b)=>(new Date(b.closedAt).getTime()||0)-(new Date(a.closedAt).getTime()||0));
}

function readWeeklyArchive_(id) {
  const clean=String(id||"").trim();
  if(!clean)return null;
  const metas=weeklyHistoryList_();
  const meta=metas.find(m=>m.id===clean);
  if(!meta)return null;

  const sh=ensureSheet_("Historial_Conteo_Semanal", ["Archivo ID","Semana","Responsable","Cerrada","Revisión","Total","Checksum","Orden","Producto ID","Código","Catálogo","Descripción","Familia","Existencia","Físico","Diferencia","Estado","Observación","Solo semanal"]);
  const last=sh.getLastRow();
  if(last<2)return {...meta,items:[]};

  const matches=sh.getRange(2,1,last-1,1).createTextFinder(clean).matchEntireCell(true).findAll();
  const rows=matches.map(cell=>cell.getRow()).sort((a,b)=>a-b).map(row=>sh.getRange(row,1,1,19).getValues()[0]);

  const items=rows.map(r=>({
    order:Number(r[7]||0),
    productId:String(r[8]||""),
    code:String(r[9]||""),
    catalog:String(r[10]||""),
    name:String(r[11]||""),
    family:String(r[12]||""),
    expected:Number(r[13]||0),
    physical:r[14]===""?"":Number(r[14]),
    difference:r[15]===""?null:Number(r[15]),
    status:String(r[16]||"Pendiente"),
    obs:String(r[17]||""),
    weeklyOnly:!!r[18]
  })).sort((a,b)=>a.order-b.order);

  return {...meta,items:items};
}

function mirrorAll_(d) {
  const inventory = Array.isArray(d.inventory) ? d.inventory : [];
  const movements = Array.isArray(d.movements) ? d.movements : [];
  const weeklyCounts = d.weeklyCounts || {};
  const weeklyMeta = d.weeklyMeta || {};
  const settings = d.settings || {};
  const digitalCounts = d.digitalCounts || {};
  const digitalClosed = d.digitalClosedFamilies || {};
  const adjustments = Array.isArray(d.digitalAdjustments) ? d.digitalAdjustments : [];
  const differenceHistory = Array.isArray(d.differenceHistory) ? d.differenceHistory : [];
  const counts = Array.isArray(d.counts) ? d.counts : [];
  const pendingBaseProducts = Array.isArray(d.pendingBaseProducts) ? d.pendingBaseProducts : [];
  const stockoutRecords = Array.isArray(d.stockoutRecords) ? d.stockoutRecords : [];

  setTable_("Inventario",
    ["ID","Código","Catálogo","Descripción","Familia","Existencia","Mínimo","Máximo","Ubicación","Reposición"],
    inventory
      .slice()
      .sort((a,b)=>(Number(a.importOrder)||999999999)-(Number(b.importOrder)||999999999))
      .map(p => [
        p.id || "", p.code || "", p.catalog || "", p.name || "", p.family || "",
        Number(p.stock || 0), Number(p.min || 0), Number(p.max || 0), p.location || "",
        Number(p.reorder || 0)
      ])
  );

  setTable_("Salidas",
    ["ID","Fecha","Código","Producto","Cantidad","Técnico","N. Orden","Estado","Bodeguero","Orden bloqueada"],
    movements.map(m => [
      m.id || "", m.date || "", m.code || "", m.product || "", Number(m.qty || 0),
      m.technician || "", m.orderNumber || "", m.status || (m.orderNumber ? "Descargado" : "PEND. DESCARGA"),
      m.keeper || "", !!m.orderLocked
    ])
  );

  setTable_("Conteo_Semanal",
    ["Producto ID","Físico","Observación","Actualizado"],
    Object.keys(weeklyCounts).map(id => {
      const c = weeklyCounts[id] || {};
      return [id, c.physical === "" ? "" : Number(c.physical || 0), c.obs || "", c.updatedAt || ""];
    })
  );

  const weekRows = Object.keys(weeklyMeta).map(k => [
    k,
    typeof weeklyMeta[k] === "object" ? JSON.stringify(weeklyMeta[k]) : weeklyMeta[k]
  ]);
  setTable_("Semana", ["Campo","Valor"], weekRows);

  const invById = {};
  inventory.forEach(p => invById[p.id] = p);

  const digitalRows = Object.keys(digitalCounts).map(id => {
    const c = digitalCounts[id] || {};
    const p = invById[id] || {};
    const physical = c.physical === "" || c.physical === null || c.physical === undefined ? "" : Number(c.physical);
    const exist = Number(p.stock || 0);
    const diff = physical === "" ? "" : physical - exist;
    const status = physical === "" ? "Pendiente" : diff === 0 ? "Cuadreado" : diff > 0 ? "Sobrante" : "Faltante";
    return [
      id, p.code || "", p.family || "", exist, physical, diff, status,
      c.obs || "", c.responsible || "", c.detectedAt || ""
    ];
  });
  setTable_("Inventario_Digital",
    ["Producto ID","Código","Familia","Existencia","Físico","Diferencia","Estado","Observación","Responsable","Detectado"],
    digitalRows
  );

  const tz = spreadsheet_().getSpreadsheetTimeZone() || "America/Guatemala";

  // Historial_Diferencias es persistente: nunca se vacía por un snapshot vacío.
  if (differenceHistory.length) {
    upsertDifferenceHistory_(differenceHistory);
  }
  refreshOpenDifferencesSheet_();

  const invByCode = {};
  inventory.forEach(p => invByCode[String(p.code || "").trim().toUpperCase()] = p);
  const stockoutRows = stockoutRecords
    .filter(r => r && r.active)
    .map(r => {
      const p = invByCode[String(r.code || "").trim().toUpperCase()] || {};
      if (Number(p.stock || 0) > 0) return null;
      let fecha = "", hora = "";
      if (r.detectedAt) {
        const dt = new Date(r.detectedAt);
        if (!isNaN(dt.getTime())) {
          fecha = Utilities.formatDate(dt, tz, "dd/MM/yyyy");
          hora = Utilities.formatDate(dt, tz, "HH:mm:ss");
        }
      }
      const max = Number(p.max || r.max || 0);
      return [
        fecha, hora, p.code || r.code || "", p.catalog || r.catalog || "",
        p.name || r.name || "", p.family || r.family || "", 0,
        Number(p.min || r.min || 0), max, Math.max(0, max),
        p.location || r.location || "", "Sin existencia"
      ];
    })
    .filter(Boolean);

  setTable_("Sin_Existencia",
    ["Fecha","Hora","Código","Catálogo","Descripción","Familia","Existencia","Mínimo","Máximo","Reposición","Ubicación","Estado"],
    stockoutRows
  );

  setTable_("Familias_Cerradas",
    ["Familia","Cerrada","Responsable","Cerrada en","Reabierta en"],
    Object.keys(digitalClosed).map(family => {
      const x = digitalClosed[family] || {};
      return [family, !!x.closed, x.responsible || "", x.closedAt || "", x.reopenedAt || ""];
    })
  );

  setTable_("Ajustes",
    ["ID","Fecha","Código","Producto ID","Familia","Existencia anterior","Físico","Diferencia","Responsable"],
    adjustments.map(a => [
      a.id || "", a.date || "", a.code || "", a.productId || "", a.family || "",
      Number(a.before || 0), Number(a.physical || 0), Number(a.difference || 0), a.responsible || ""
    ])
  );

  setTable_("Configuracion",
    ["Campo","Valor"],
    [
      ["Nombre", settings.name || "Mi Bodega"],
      ["Modo oscuro", !!settings.dark],
      ["Técnicos", "Ver BASE_TECNICOS"],
      ["Bodegueros", "Ver BASE_BODEGUEROS"],
      ["Filtro Inventario Digital", JSON.stringify(d.digitalFilter || {})]
    ]
  );

  setTable_("Codigos_Nuevos",
    ["CÓDIGO","CATÁLOGO","DESCRIPCIÓN","FAMILIA","MÍN.","MÁX.","ESTADO"],
    pendingBaseProducts.map(p => [
      p.code || "", p.catalog || "", p.description || "", p.family || "",
      Number(p.min || 0), Number(p.max || 0), p.status || "Pendiente"
    ])
  );

  setTable_("Conteos_Aux",
    ["Índice","JSON"],
    counts.map((c, i) => [i + 1, JSON.stringify(c)])
  );
}

function updateConnectionSheet_(token, lastUpdate) {
  const rows = [
    ["Token", token],
    ["Última actualización", lastUpdate || ""],
    ["Versión", APP_VERSION],
    ["ID hoja", spreadsheet_().getId()]
  ];
  setTable_(CONNECTION_SHEET, ["Campo","Valor"], rows);
}
