# CharaName Web Tool

Run the packed Windows app:

```powershell
.\dist\CharaNameWebTool.exe
```

It opens the tool in your browser and includes the Wiimm `wbmgt`/`wszst` files it needs.

For development, run the local web tool from this folder:

```powershell
node server.js
```

Open `http://localhost:8787`, add one or more character names, and click `Generate downloads`.

The tool uses the existing Retro Rewind custom character BMG scheme:

- Name IDs: `(characterId << 16) | 0x6a00 | customId`
- Author IDs: `(characterId << 16) | 0x7a00 | customId`
- Custom IDs: `1` through `50`

Downloads include `CharaName.txt`, `CharaName.bmg`, `CharaName.UIAssets.szs`, and `CharaName.RaceAssets.szs`. Put the two `.szs` files in patches.
