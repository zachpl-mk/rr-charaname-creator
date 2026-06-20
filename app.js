const rows = document.querySelector("#rows");
const template = document.querySelector("#rowTemplate");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#status");
const downloads = document.querySelector("#downloads");
let characters = [];

function padHex(value) {
  return value.toString(16).padStart(6, "0");
}

function makeBmgId(character, table, base) {
  return padHex((character << 16) | base | table);
}

function rowData() {
  return [...rows.querySelectorAll(".row")].map(row => ({
    character: Number(row.querySelector(".character").value),
    table: Number(row.querySelector(".table").value),
    name: row.querySelector(".name").value.trim(),
    author: row.querySelector(".author").value.trim()
  })).filter(row => row.name);
}

function buildPreview() {
  const entries = [];
  for (const row of rowData()) {
    if (row.table < 1 || row.table > 50) continue;
    entries.push([makeBmgId(row.character, row.table, 0x6a00), row.name]);
    if (row.author) entries.push([makeBmgId(row.character, row.table, 0x7a00), row.author]);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  preview.textContent = ["#BMG", ...entries.map(([id, text]) => `${id}=\t${text}`)].join("\n");
}

function addRow(defaults = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  const select = node.querySelector(".character");
  for (const character of characters) {
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent = `${character.id.toString(16).padStart(2, "0")} - ${character.name}`;
    select.appendChild(option);
  }
  select.value = defaults.character ?? 0;
  node.querySelector(".table").value = defaults.table ?? 1;
  node.querySelector(".name").value = defaults.name ?? "";
  node.querySelector(".author").value = defaults.author ?? "";
  node.querySelector(".remove").addEventListener("click", () => {
    node.remove();
    if (!rows.children.length) addRow();
    buildPreview();
  });
  node.addEventListener("input", buildPreview);
  node.addEventListener("change", buildPreview);
  rows.appendChild(node);
  buildPreview();
}

async function generate() {
  statusText.textContent = "Generating...";
  downloads.textContent = "";
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rowData() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Generation failed.");
    preview.textContent = result.txt.trimEnd();
    for (const file of result.files) {
      const link = document.createElement("a");
      link.href = `/download/${result.id}/${encodeURIComponent(file)}`;
      link.textContent = file;
      downloads.appendChild(link);
    }
    statusText.textContent = `Done. ${result.count} BMG entries generated.`;
  } catch (error) {
    statusText.textContent = error.message;
  }
}

async function init() {
  const response = await fetch("/api/characters");
  characters = await response.json();
  addRow({ character: 0, table: 1 });
  document.querySelector("#addRow").addEventListener("click", () => addRow());
  document.querySelector("#generate").addEventListener("click", generate);
}

init();
