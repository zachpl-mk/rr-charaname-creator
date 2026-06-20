const characters = [
  "Mario", "Baby Peach", "Waluigi", "Bowser", "Baby Daisy", "Dry Bones", "Baby Mario", "Luigi",
  "Toad", "Donkey Kong", "Yoshi", "Wario", "Baby Luigi", "Toadette", "Koopa Troopa", "Daisy",
  "Peach", "Birdo", "Diddy Kong", "King Boo", "Bowser Jr.", "Dry Bowser", "Funky Kong", "Rosalina",
  "Mii S A Male", "Mii S A Female", "Mii S B Male", "Mii S B Female", "Mii S C Male", "Mii S C Female",
  "Mii M A Male", "Mii M A Female", "Mii M B Male", "Mii M B Female", "Mii M C Male", "Mii M C Female",
  "Mii L A Male", "Mii L A Female", "Mii L B Male", "Mii L B Female", "Mii L C Male", "Mii L C Female",
  "Mii M", "Mii S", "Mii L", "Peach Biker", "Daisy Biker", "Rosalina Biker"
];

const rows = document.querySelector("#rows");
const template = document.querySelector("#rowTemplate");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#status");
const downloads = document.querySelector("#downloads");
const generatedUrls = [];

function padHex(value, length) {
  return value.toString(16).padStart(length, "0");
}

function align(value, boundary) {
  return (value + boundary - 1) & ~(boundary - 1);
}

function cleanText(value, limit) {
  return String(value || "").replace(/[\r\n\t]/g, " ").trim().slice(0, limit);
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
addRow({ character: 0, table: 1 });
