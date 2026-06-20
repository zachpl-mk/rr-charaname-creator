# CharaName Browser Tool

Static tool for creating Retro Rewind custom character name files.

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
