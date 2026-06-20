const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_DIR = __dirname;
const OUTPUTS = new Map();

const CHARACTERS = [
  "Mario", "Baby Peach", "Waluigi", "Bowser", "Baby Daisy", "Dry Bones", "Baby Mario", "Luigi",
  "Toad", "Donkey Kong", "Yoshi", "Wario", "Baby Luigi", "Toadette", "Koopa Troopa", "Daisy",
  "Peach", "Birdo", "Diddy Kong", "King Boo", "Bowser Jr.", "Dry Bowser", "Funky Kong", "Rosalina",
  "Mii S A Male", "Mii S A Female", "Mii S B Male", "Mii S B Female", "Mii S C Male", "Mii S C Female",
  "Mii M A Male", "Mii M A Female", "Mii M B Male", "Mii M B Female", "Mii M C Male", "Mii M C Female",
  "Mii L A Male", "Mii L A Female", "Mii L B Male", "Mii L B Female", "Mii L C Male", "Mii L C Female",
  "Mii M", "Mii S", "Mii L", "Peach Biker", "Daisy Biker", "Rosalina Biker"
];

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk);
    child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}\n${stdout}${stderr}`));
    });
  });
}

function cleanText(value, limit) {
  return String(value || "").replace(/[\r\n\t]/g, " ").trim().slice(0, limit);
}

function bmgId(character, table, base) {
  return ((character << 16) | base | table).toString(16).padStart(6, "0");
}

function buildTxt(entries) {
  const lines = ["#BMG"];
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  for (const entry of sorted) lines.push(`${entry.id}=\t${entry.text}`);
  return `${lines.join("\n")}\n`;
}

async function generate(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const entries = [];
  for (const row of rows) {
    const character = Number(row.character);
    const table = Number(row.table);
    const name = cleanText(row.name, 80);
    const author = cleanText(row.author, 80);
    if (!Number.isInteger(character) || character < 0 || character >= CHARACTERS.length) continue;
    if (!Number.isInteger(table) || table < 1 || table > 50) continue;
    if (!name) continue;
    entries.push({ id: bmgId(character, table, 0x6a00), text: name });
    if (author) entries.push({ id: bmgId(character, table, 0x7a00), text: author });
  }
  if (entries.length === 0) throw new Error("Add at least one character name.");

  const id = crypto.randomBytes(8).toString("hex");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chara-name-"));
  const archiveRoot = path.join(tmp, "CharaName");
  const messageDir = path.join(archiveRoot, "message");
  fs.mkdirSync(messageDir, { recursive: true });

  const txt = buildTxt(entries);
  const txtPath = path.join(tmp, "CharaName.txt");
  const bmgPath = path.join(messageDir, "CharaName.bmg");
  const uiPath = path.join(tmp, "CharaName.UIAssets.szs");
  const racePath = path.join(tmp, "CharaName.RaceAssets.szs");

  fs.writeFileSync(txtPath, txt, "utf8");
  await run("wbmgt", ["ENCODE", "--overwrite", "--endian", "BIG", "--encoding", "UTF-16BE", "--inf-size", "8", "--bmg-mid=ON", "--dest", bmgPath, txtPath], tmp);
  await run("wszst", ["CREATE", "--overwrite", "--szs", "--dest", uiPath, archiveRoot], tmp);
  fs.copyFileSync(uiPath, racePath);

  OUTPUTS.set(id, {
    tmp,
    files: {
      "CharaName.txt": txtPath,
      "CharaName.bmg": bmgPath,
      "CharaName.UIAssets.szs": uiPath,
      "CharaName.RaceAssets.szs": racePath
    }
  });

  return { id, txt, files: Object.keys(OUTPUTS.get(id).files), count: entries.length };
}

function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, "Not found");
  const ext = path.extname(filePath).toLowerCase();
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/characters") {
    return send(res, 200, JSON.stringify(CHARACTERS.map((name, id) => ({ id, name }))), "application/json");
  }

  if (req.method === "POST" && req.url === "/api/generate") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const result = await generate(JSON.parse(body || "{}"));
        send(res, 200, JSON.stringify(result), "application/json");
      } catch (error) {
        send(res, 400, JSON.stringify({ error: error.message }), "application/json");
      }
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/download/")) {
    const [, , id, filename] = req.url.split("/");
    const output = OUTPUTS.get(id);
    const safeName = decodeURIComponent(filename || "");
    if (!output || !Object.prototype.hasOwnProperty.call(output.files, safeName)) return send(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`
    });
    fs.createReadStream(output.files[safeName]).pipe(res);
    return;
  }

  if (req.method === "GET") return serveStatic(req, res);
  send(res, 405, "Method not allowed");
});

server.listen(PORT, () => {
  console.log(`CharaName Web Tool: http://localhost:${PORT}`);
});
