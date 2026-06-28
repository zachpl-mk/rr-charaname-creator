const characters = [
  "Mario", "Baby Peach", "Waluigi", "Bowser", "Baby Daisy", "Dry Bones", "Baby Mario", "Luigi",
  "Toad", "Donkey Kong", "Yoshi", "Wario", "Baby Luigi", "Toadette", "Koopa Troopa", "Daisy",
  "Peach", "Birdo", "Diddy Kong", "King Boo", "Bowser Jr.", "Dry Bowser", "Funky Kong", "Rosalina",
  "Mii S A Male", "Mii S A Female", "Mii S B Male", "Mii S B Female", "Mii S C Male", "Mii S C Female",
  "Mii M A Male", "Mii M A Female", "Mii M B Male", "Mii M B Female", "Mii M C Male", "Mii M C Female",
  "Mii L A Male", "Mii L A Female", "Mii L B Male", "Mii L B Female", "Mii L C Male", "Mii L C Female",
  "Mii M", "Mii S", "Mii L"
];

const rows = document.querySelector("#rows");
const template = document.querySelector("#rowTemplate");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#status");
const importStatus = document.querySelector("#importStatus");
const importFiles = document.querySelector("#importFiles");
const themeToggle = document.querySelector("#themeToggle");
const downloads = document.querySelector("#downloads");
const generatedUrls = [];
const themeStorageKey = "charaNameTheme";

function systemPrefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function getThemePreference() {
  return localStorage.getItem(themeStorageKey) || "system";
}

function resolveTheme() {
  const preference = getThemePreference();
  return preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const preference = getThemePreference();
  const isDark = theme === "dark";
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.title = preference === "system"
    ? `System theme is ${isDark ? "dark" : "light"}`
    : `Using saved ${preference} mode`;
}

function syncTheme() {
  applyTheme(resolveTheme());
}

function cycleTheme() {
  const current = getThemePreference();
  const next = current === "system" ? "dark" : current === "dark" ? "light" : "system";
  localStorage.setItem(themeStorageKey, next);
  syncTheme();
}

function padHex(value, length) {
  return value.toString(16).padStart(length, "0");
}

function align(value, boundary) {
  return (value + boundary - 1) & ~(boundary - 1);
}

function cleanText(value, limit) {
  return String(value || "").replace(/[\r\n\t]/g, " ").trim().slice(0, limit);
}

function stripNulls(text) {
  return String(text || "").replace(/\0+$/g, "");
}

function makeBmgId(character, table, base) {
  return (character << 16) | base | table;
}

function rowData() {
  return [...rows.querySelectorAll(".row")].map(row => ({
    character: Number(row.querySelector(".character").value),
    table: Number(row.querySelector(".table").value),
    name: cleanText(row.querySelector(".name").value, 80),
    author: cleanText(row.querySelector(".author").value, 80)
  })).filter(row => row.name && row.table >= 1 && row.table <= 50);
}

function buildEntries() {
  const entries = [];
  for (const row of rowData()) {
    entries.push({ id: makeBmgId(row.character, row.table, 0x6a00), text: row.name });
    if (row.author) entries.push({ id: makeBmgId(row.character, row.table, 0x7a00), text: row.author });
  }
  entries.sort((a, b) => a.id - b.id);
  return entries;
}

function buildTxt(entries) {
  return ["#BMG", ...entries.map(entry => `${padHex(entry.id, 6)}=\t${entry.text}`)].join("\n") + "\n";
}

function clearRows() {
  rows.textContent = "";
}

function setRows(data) {
  clearRows();
  const sorted = [...data].sort((a, b) => {
    if (a.character !== b.character) return a.character - b.character;
    return a.table - b.table;
  });
  if (!sorted.length) sorted.push({ character: 0, table: 1, name: "", author: "" });
  for (const row of sorted) addRow(row);
  updatePreview();
}

function addRow(defaults = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  const select = node.querySelector(".character");
  characters.forEach((name, id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${padHex(id, 2)} - ${name}`;
    select.appendChild(option);
  });
  select.value = defaults.character ?? 0;
  node.querySelector(".table").value = defaults.table ?? 1;
  node.querySelector(".name").value = defaults.name ?? "";
  node.querySelector(".author").value = defaults.author ?? "";
  node.querySelector(".remove").addEventListener("click", () => {
    node.remove();
    if (!rows.children.length) addRow();
    updatePreview();
  });
  node.addEventListener("input", updatePreview);
  node.addEventListener("change", updatePreview);
  rows.appendChild(node);
  updatePreview();
}

function updatePreview() {
  preview.textContent = buildTxt(buildEntries()).trimEnd();
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
  }

  u8() {
    return this.bytes[this.offset++];
  }

  u16() {
    const value = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return value;
  }

  u32() {
    const value = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return value;
  }

  skip(count) {
    this.offset += count;
  }

  slice(offset, length) {
    return this.bytes.slice(offset, offset + length);
  }
}

class Writer {
  constructor(size) {
    this.bytes = new Uint8Array(size);
    this.offset = 0;
  }

  u8(value) {
    this.bytes[this.offset++] = value & 0xff;
  }

  u16(value) {
    this.u8(value >> 8);
    this.u8(value);
  }

  u32(value) {
    this.u8(value >> 24);
    this.u8(value >> 16);
    this.u8(value >> 8);
    this.u8(value);
  }

  ascii(text) {
    for (let i = 0; i < text.length; i++) this.u8(text.charCodeAt(i));
  }

  bytesFrom(data) {
    this.bytes.set(data, this.offset);
    this.offset += data.length;
  }

  padTo(boundary) {
    while (this.offset % boundary) this.u8(0);
  }
}

function utf16beWithTerminator(text) {
  const codePoints = Array.from(text);
  const out = new Writer((codePoints.length + 1) * 2);
  for (const char of codePoints) out.u16(char.codePointAt(0));
  out.u16(0);
  return out.bytes;
}

function decodeUtf16Be(bytes) {
  const values = [];
  for (let i = 0; i < bytes.length; i += 2) {
    const code = (bytes[i] << 8) | bytes[i + 1];
    if (code === 0) break;
    values.push(code);
  }
  return String.fromCharCode(...values);
}

function buildBmg(entries) {
  const strings = [0, 0];
  const infos = [];
  let dataOffset = 2;

  for (const entry of entries) {
    const textBytes = utf16beWithTerminator(`\t${entry.text}`);
    infos.push({ id: entry.id, offset: dataOffset });
    strings.push(...textBytes);
    dataOffset += textBytes.length;
  }

  const infSize = align(16 + infos.length * 8, 32);
  const datSize = align(8 + strings.length, 32);
  const midSize = align(16 + infos.length * 4, 32);
  const fileSize = 32 + infSize + datSize + midSize;
  const out = new Writer(fileSize);

  out.ascii("MESGbmg1");
  out.u32(fileSize);
  out.u32(3);
  out.u8(2);
  for (let i = 0; i < 15; i++) out.u8(0);

  out.ascii("INF1");
  out.u32(infSize);
  out.u16(infos.length);
  out.u16(8);
  out.u32(0);
  for (const info of infos) {
    out.u32(info.offset);
    out.u8(1);
    out.u8(0);
    out.u8(0);
    out.u8(0);
  }
  out.padTo(32);

  out.ascii("DAT1");
  out.u32(datSize);
  out.bytesFrom(Uint8Array.from(strings));
  out.padTo(32);

  out.ascii("MID1");
  out.u32(midSize);
  out.u16(infos.length);
  out.u16(0x1000);
  out.u32(0);
  for (const info of infos) out.u32(info.id);
  out.padTo(32);

  return out.bytes;
}

function stringTable(strings) {
  const bytes = [0];
  const offsets = [0];
  for (const text of strings) {
    offsets.push(bytes.length);
    for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i));
    bytes.push(0);
  }
  return { bytes: Uint8Array.from(bytes), offsets };
}

function buildU8Archive(bmg) {
  const names = stringTable(["message", "CharaName.bmg"]);
  const nodeCount = 3;
  const nodesOffset = 0x20;
  const nodesSize = nodeCount * 12;
  const headerSize = align(nodesOffset + nodesSize + names.bytes.length, 32);
  const dataOffset = headerSize;
  const fileSize = dataOffset + bmg.length;
  const out = new Writer(fileSize);

  out.u32(0x55aa382d);
  out.u32(nodesOffset);
  out.u32(headerSize);
  out.u32(dataOffset);
  out.u32(0);
  out.u32(0);
  out.u32(0);
  out.u32(0);

  out.u32(0x01000000);
  out.u32(0);
  out.u32(nodeCount);

  out.u32(0x01000000 | names.offsets[1]);
  out.u32(0);
  out.u32(nodeCount);

  out.u32(names.offsets[2]);
  out.u32(dataOffset);
  out.u32(bmg.length);

  out.bytesFrom(names.bytes);
  out.padTo(32);
  out.bytesFrom(bmg);

  return out.bytes;
}

function parseTxt(text) {
  const rowsByKey = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-fA-F]{6})=\t?(.*)$/);
    if (!match) continue;
    const id = Number.parseInt(match[1], 16);
    const value = match[2].trim();
    const character = id >>> 16;
    const table = id & 0xff;
    const kind = (id & 0xff00) === 0x6a00 ? "name" : (id & 0xff00) === 0x7a00 ? "author" : null;
    if (!kind) continue;
    const key = `${character}:${table}`;
    const row = rowsByKey.get(key) ?? { character, table, name: "", author: "" };
    row[kind] = value;
    rowsByKey.set(key, row);
  }
  return [...rowsByKey.values()];
}

function parseBmg(bytes) {
  if (String.fromCharCode(...bytes.slice(0, 8)) !== "MESGbmg1") return [];
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let infOffset = -1;
  let datOffset = -1;
  let midOffset = -1;
  let datSize = 0;

  for (let offset = 32; offset + 8 <= bytes.length;) {
    const tag = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = dataView.getUint32(offset + 4, false);
    if (tag === "INF1") infOffset = offset;
    if (tag === "DAT1") {
      datOffset = offset;
      datSize = size;
    }
    if (tag === "MID1") midOffset = offset;
    offset += size;
  }

  if (infOffset < 0 || datOffset < 0 || midOffset < 0) return [];
  const count = dataView.getUint16(infOffset + 8, false);
  if (!count) return [];

  const offsets = [];
  let infCursor = infOffset + 16;
  for (let i = 0; i < count; i++) {
    offsets.push(dataView.getUint32(infCursor, false));
    infCursor += 8;
  }

  const ids = [];
  let midCursor = midOffset + 16;
  for (let i = 0; i < count; i++) {
    ids.push(dataView.getUint32(midCursor, false));
    midCursor += 4;
  }

  const entriesByKey = new Map();
  for (let i = 0; i < count; i++) {
    const start = datOffset + 8 + offsets[i];
    const end = i + 1 < count ? datOffset + 8 + offsets[i + 1] : datOffset + datSize;
    const textBytes = bytes.slice(start, end);
    const decoded = stripNulls(decodeUtf16Be(textBytes.slice(2)));
    const id = ids[i];
    const character = id >>> 16;
    const table = id & 0xff;
    const kind = (id & 0xff00) === 0x6a00 ? "name" : (id & 0xff00) === 0x7a00 ? "author" : null;
    if (!kind) continue;
    const key = `${character}:${table}`;
    const row = entriesByKey.get(key) ?? { character, table, name: "", author: "" };
    row[kind] = decoded;
    entriesByKey.set(key, row);
  }
  return [...entriesByKey.values()];
}

function decompressYaz0(bytes) {
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "Yaz0") return bytes;
  const outSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, false);
  const out = new Uint8Array(outSize);
  let src = 16;
  let dst = 0;
  let code = 0;
  let bits = 0;
  while (dst < outSize && src < bytes.length) {
    if (bits === 0) {
      code = bytes[src++];
      bits = 8;
    }
    if (code & 0x80) {
      out[dst++] = bytes[src++];
    } else {
      const byte1 = bytes[src++];
      const byte2 = bytes[src++];
      let count = byte1 >> 4;
      let offset = ((byte1 & 0x0f) << 8) | byte2;
      if (count === 0) {
        count = bytes[src++] + 0x12;
      } else {
        count += 2;
      }
      offset += 1;
      for (let i = 0; i < count && dst < outSize; i++) {
        out[dst] = out[dst - offset];
        dst++;
      }
    }
    code <<= 1;
    bits--;
  }
  return out;
}

function parseU8(bytes) {
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dataView.getUint32(0, false) !== 0x55aa382d) return [];
  const nodesOffset = dataView.getUint32(4, false);
  const headerSize = dataView.getUint32(8, false);
  const nodeCount = dataView.getUint32(nodesOffset + 8, false);
  const stringTable = bytes.slice(nodesOffset + nodeCount * 12, headerSize);
  const names = [];
  let current = "";
  for (const byte of stringTable) {
    if (byte === 0) {
      names.push(current);
      current = "";
    } else {
      current += String.fromCharCode(byte);
    }
  }
  const fileNode = nodeCount - 1;
  const fileOffset = dataView.getUint32(nodesOffset + fileNode * 12 + 4, false);
  const fileSize = dataView.getUint32(nodesOffset + fileNode * 12 + 8, false);
  if (names.length < 3 || fileOffset + fileSize > bytes.length) return [];
  return parseBmg(bytes.slice(fileOffset, fileOffset + fileSize));
}

function parseSzs(bytes) {
  return parseU8(decompressYaz0(bytes));
}

function mergeImportedRows(target, source) {
  for (const row of source) {
    const key = `${row.character}:${row.table}`;
    const existing = target.get(key) ?? { character: row.character, table: row.table, name: "", author: "" };
    if (row.name) existing.name = row.name;
    if (row.author) existing.author = row.author;
    target.set(key, existing);
  }
}

async function importFilesFromInput(fileList) {
  const merged = new Map();
  let importedFiles = 0;
  for (const file of fileList) {
    const lower = file.name.toLowerCase();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let rowsFromFile = [];
    if (lower.endsWith(".txt")) {
      rowsFromFile = parseTxt(await file.text());
    } else if (lower.endsWith(".bmg")) {
      rowsFromFile = parseBmg(bytes);
    } else if (lower.endsWith(".szs")) {
      rowsFromFile = parseSzs(bytes);
    }
    if (rowsFromFile.length) {
      mergeImportedRows(merged, rowsFromFile);
      importedFiles++;
    }
  }
  if (!merged.size) {
    importStatus.textContent = "No supported progress files were found.";
    return;
  }
  setRows([...merged.values()]);
  importStatus.textContent = `Imported ${importedFiles} file${importedFiles === 1 ? "" : "s"}.`;
  statusText.textContent = "Imported files.";
}

function yaz0Literal(data) {
  const groupCount = Math.ceil(data.length / 8);
  const out = new Writer(16 + groupCount + data.length);
  out.ascii("Yaz0");
  out.u32(data.length);
  out.u32(0);
  out.u32(0);
  for (let i = 0; i < data.length; i += 8) {
    const count = Math.min(8, data.length - i);
    out.u8(0xff);
    for (let j = 0; j < count; j++) out.u8(data[i + j]);
  }
  return out.bytes.slice(0, out.offset);
}

function downloadBlob(name, bytes, type = "application/octet-stream") {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  generatedUrls.push(url);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.textContent = name;
  downloads.appendChild(link);
}

function clearDownloads() {
  for (const url of generatedUrls) URL.revokeObjectURL(url);
  generatedUrls.length = 0;
  downloads.textContent = "";
}

function generate() {
  clearDownloads();
  const entries = buildEntries();
  if (!entries.length) {
    statusText.textContent = "Add at least one character name.";
    return;
  }

  const txt = buildTxt(entries);
  const bmg = buildBmg(entries);
  const u8 = buildU8Archive(bmg);
  const szs = yaz0Literal(u8);

  downloadBlob("CharaName.txt", new Blob([txt], { type: "text/plain;charset=utf-8" }));
  downloadBlob("CharaName.bmg", bmg);
  downloadBlob("CharaName.UIAssets.szs", szs);
  downloadBlob("CharaName.RaceAssets.szs", szs);
  statusText.textContent = `Done. ${entries.length} BMG entries generated.`;
}

document.querySelector("#addRow").addEventListener("click", () => addRow());
document.querySelector("#generate").addEventListener("click", generate);
themeToggle.addEventListener("click", cycleTheme);
importFiles.addEventListener("change", async () => {
  if (!importFiles.files?.length) return;
  importStatus.textContent = "Importing...";
  await importFilesFromInput(importFiles.files);
  importFiles.value = "";
});
window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
  if (getThemePreference() === "system") syncTheme();
});
syncTheme();
addRow({ character: 0, table: 1 });
