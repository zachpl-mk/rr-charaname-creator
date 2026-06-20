using System.Diagnostics;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CharaNameWebTool;

internal static class Program {
    private static readonly string[] Characters = {
        "Mario", "Baby Peach", "Waluigi", "Bowser", "Baby Daisy", "Dry Bones", "Baby Mario", "Luigi",
        "Toad", "Donkey Kong", "Yoshi", "Wario", "Baby Luigi", "Toadette", "Koopa Troopa", "Daisy",
        "Peach", "Birdo", "Diddy Kong", "King Boo", "Bowser Jr.", "Dry Bowser", "Funky Kong", "Rosalina",
        "Mii S A Male", "Mii S A Female", "Mii S B Male", "Mii S B Female", "Mii S C Male", "Mii S C Female",
        "Mii M A Male", "Mii M A Female", "Mii M B Male", "Mii M B Female", "Mii M C Male", "Mii M C Female",
        "Mii L A Male", "Mii L A Female", "Mii L B Male", "Mii L B Female", "Mii L C Male", "Mii L C Female",
        "Mii M", "Mii S", "Mii L", "Peach Biker", "Daisy Biker", "Rosalina Biker"
    };

    private static readonly JsonSerializerOptions JsonOptions = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static readonly Dictionary<string, OutputSet> Outputs = new();
    private static string ToolDir = "";

    [STAThread]
    private static async Task Main() {
        ToolDir = ExtractVendorTools();
        using HttpListener listener = new();
        int port = FindOpenPort(listener);
        string url = $"http://localhost:{port}/";

        listener.Start();
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

        while (listener.IsListening) {
            HttpListenerContext context = await listener.GetContextAsync();
            _ = Task.Run(() => Handle(context));
        }
    }

    private static int FindOpenPort(HttpListener listener) {
        for (int port = 8787; port < 8800; ++port) {
            try {
                listener.Prefixes.Clear();
                listener.Prefixes.Add($"http://localhost:{port}/");
                listener.Start();
                listener.Stop();
                return port;
            } catch (HttpListenerException) {
            }
        }
        throw new InvalidOperationException("Could not find an open localhost port.");
    }

    private static async Task Handle(HttpListenerContext context) {
        try {
            string path = context.Request.Url?.AbsolutePath ?? "/";
            if (context.Request.HttpMethod == "GET" && path == "/api/characters") {
                var characters = Characters.Select((name, id) => new { id, name });
                await SendJson(context, characters);
            } else if (context.Request.HttpMethod == "POST" && path == "/api/generate") {
                using StreamReader reader = new(context.Request.InputStream, context.Request.ContentEncoding);
                GenerateRequest? request = JsonSerializer.Deserialize<GenerateRequest>(await reader.ReadToEndAsync(), JsonOptions);
                await SendJson(context, await Generate(request));
            } else if (context.Request.HttpMethod == "GET" && path.StartsWith("/download/", StringComparison.Ordinal)) {
                await SendDownload(context, path);
            } else if (context.Request.HttpMethod == "GET") {
                await SendStatic(context, path);
            } else {
                await SendText(context, 405, "Method not allowed");
            }
        } catch (Exception ex) {
            await SendJson(context, new { error = ex.Message }, 400);
        }
    }

    private static async Task<GenerateResponse> Generate(GenerateRequest? request) {
        List<BmgEntry> entries = new();
        foreach (InputRow row in request?.Rows ?? Array.Empty<InputRow>()) {
            int character = row.Character;
            int table = row.Table;
            string name = CleanText(row.Name, 80);
            string author = CleanText(row.Author, 80);
            if (character < 0 || character >= Characters.Length || table < 1 || table > 50 || name.Length == 0) continue;
            entries.Add(new BmgEntry(BmgId(character, table, 0x6a00), name));
            if (author.Length != 0) entries.Add(new BmgEntry(BmgId(character, table, 0x7a00), author));
        }
        if (entries.Count == 0) throw new InvalidOperationException("Add at least one character name.");

        string id = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
        string tmp = Path.Combine(Path.GetTempPath(), $"chara-name-{id}");
        string archiveRoot = Path.Combine(tmp, "CharaName");
        string messageDir = Path.Combine(archiveRoot, "message");
        Directory.CreateDirectory(messageDir);

        string txt = BuildTxt(entries);
        string txtPath = Path.Combine(tmp, "CharaName.txt");
        string bmgPath = Path.Combine(messageDir, "CharaName.bmg");
        string uiPath = Path.Combine(tmp, "CharaName.UIAssets.szs");
        string racePath = Path.Combine(tmp, "CharaName.RaceAssets.szs");

        await File.WriteAllTextAsync(txtPath, txt, Encoding.UTF8);
        await Run("wbmgt.exe", tmp, "ENCODE", "--overwrite", "--endian", "BIG", "--encoding", "UTF-16BE", "--inf-size", "8", "--bmg-mid=ON", "--dest", bmgPath, txtPath);
        await Run("wszst.exe", tmp, "CREATE", "--overwrite", "--szs", "--dest", uiPath, archiveRoot);
        File.Copy(uiPath, racePath, true);

        Outputs[id] = new OutputSet(tmp, new Dictionary<string, string> {
            { "CharaName.txt", txtPath },
            { "CharaName.bmg", bmgPath },
            { "CharaName.UIAssets.szs", uiPath },
            { "CharaName.RaceAssets.szs", racePath }
        });

        return new GenerateResponse(id, txt, Outputs[id].Files.Keys.ToArray(), entries.Count);
    }

    private static async Task Run(string exe, string cwd, params string[] args) {
        ProcessStartInfo info = new(Path.Combine(ToolDir, exe)) {
            WorkingDirectory = cwd,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (string arg in args) info.ArgumentList.Add(arg);
        using Process process = Process.Start(info) ?? throw new InvalidOperationException($"Could not start {exe}.");
        string stdout = await process.StandardOutput.ReadToEndAsync();
        string stderr = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0) throw new InvalidOperationException($"{exe} failed with exit code {process.ExitCode}\n{stdout}{stderr}");
    }

    private static string ExtractVendorTools() {
        string dir = Path.Combine(Path.GetTempPath(), "CharaNameWebTool", Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1");
        Directory.CreateDirectory(dir);

        Assembly assembly = Assembly.GetExecutingAssembly();
        foreach (string resource in assembly.GetManifestResourceNames().Where(name => name.Contains(".vendor.", StringComparison.Ordinal))) {
            string fileName = resource[(resource.LastIndexOf(".vendor.", StringComparison.Ordinal) + 8)..];
            string path = Path.Combine(dir, fileName);
            using Stream input = assembly.GetManifestResourceStream(resource) ?? throw new InvalidOperationException($"Missing resource {resource}.");
            using FileStream output = File.Create(path);
            input.CopyTo(output);
        }
        return dir;
    }

    private static async Task SendStatic(HttpListenerContext context, string path) {
        string fileName = path switch {
            "/" => "index.html",
            "/index.html" => "index.html",
            "/style.css" => "style.css",
            "/app.js" => "app.js",
            _ => ""
        };
        if (fileName.Length == 0) {
            await SendText(context, 404, "Not found");
            return;
        }

        string suffix = $".web.{fileName}";
        Assembly assembly = Assembly.GetExecutingAssembly();
        string resource = assembly.GetManifestResourceNames().First(name => name.EndsWith(suffix, StringComparison.Ordinal));
        await using Stream stream = assembly.GetManifestResourceStream(resource) ?? throw new InvalidOperationException($"Missing resource {fileName}.");
        context.Response.ContentType = fileName.EndsWith(".html", StringComparison.Ordinal) ? "text/html; charset=utf-8" :
            fileName.EndsWith(".css", StringComparison.Ordinal) ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8";
        await stream.CopyToAsync(context.Response.OutputStream);
        context.Response.Close();
    }

    private static async Task SendDownload(HttpListenerContext context, string path) {
        string[] parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 3 || !Outputs.TryGetValue(parts[1], out OutputSet? output)) {
            await SendText(context, 404, "Not found");
            return;
        }
        string fileName = WebUtility.UrlDecode(parts[2]);
        if (!output.Files.TryGetValue(fileName, out string? filePath)) {
            await SendText(context, 404, "Not found");
            return;
        }

        context.Response.ContentType = "application/octet-stream";
        context.Response.AddHeader("Content-Disposition", $"attachment; filename=\"{fileName}\"");
        await using FileStream stream = File.OpenRead(filePath);
        await stream.CopyToAsync(context.Response.OutputStream);
        context.Response.Close();
    }

    private static async Task SendJson(HttpListenerContext context, object body, int status = 200) {
        byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body, JsonOptions));
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        await context.Response.OutputStream.WriteAsync(bytes);
        context.Response.Close();
    }

    private static async Task SendText(HttpListenerContext context, int status, string body) {
        byte[] bytes = Encoding.UTF8.GetBytes(body);
        context.Response.StatusCode = status;
        context.Response.ContentType = "text/plain; charset=utf-8";
        await context.Response.OutputStream.WriteAsync(bytes);
        context.Response.Close();
    }

    private static string CleanText(string? value, int limit) {
        string clean = (value ?? "").Replace('\r', ' ').Replace('\n', ' ').Replace('\t', ' ').Trim();
        return clean.Length > limit ? clean[..limit] : clean;
    }

    private static string BmgId(int character, int table, int baseId) {
        return ((character << 16) | baseId | table).ToString("x6");
    }

    private static string BuildTxt(IEnumerable<BmgEntry> entries) {
        StringBuilder builder = new("#BMG\n");
        foreach (BmgEntry entry in entries.OrderBy(entry => entry.Id, StringComparer.Ordinal)) {
            builder.Append(entry.Id).Append("=\t").Append(entry.Text).Append('\n');
        }
        return builder.ToString();
    }

    private sealed record GenerateRequest(InputRow[] Rows);
    private sealed record InputRow(int Character, int Table, string? Name, string? Author);
    private sealed record BmgEntry(string Id, string Text);
    private sealed record GenerateResponse(string Id, string Txt, string[] Files, int Count);
    private sealed record OutputSet(string TempDir, Dictionary<string, string> Files);
}
