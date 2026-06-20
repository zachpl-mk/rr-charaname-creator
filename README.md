# CharaName Browser Tool

Static browser-only tool for creating Retro Rewind custom character name files.

It runs entirely in the browser and is compatible with GitHub Pages. There is no Node server, no `.exe`, and no Wiimm tool dependency for users.

## Use Locally

Open `index.html` in a browser.

## GitHub Pages

Copy this folder into a repo and enable GitHub Pages for the folder or branch that contains:

```text
index.html
style.css
app.js
README.md
```

The tool generates downloads directly in the browser:

- `CharaName.txt`
- `CharaName.bmg`
- `CharaName.UIAssets.szs`
- `CharaName.RaceAssets.szs`

Put the two `.szs` files in patches.

## BMG IDs

- Name IDs: `(characterId << 16) | 0x6a00 | customId`
- Author IDs: `(characterId << 16) | 0x7a00 | customId`
- Custom IDs: `1` through `50`

The generated `.szs` files are Yaz0-wrapped U8 archives containing:

```text
message/CharaName.bmg
```
