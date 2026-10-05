# Cauldron Mod Manager

> This documentation is correct for version [0.1.2](https://github.com/jackcooperdev/CauldronModManager/releases/tag/0.1.2) of CauldronModManager

## What does this do?

Cauldron Mod Manager (CMM) is a Node.js mod pack manager for Minecraft. It can:

- **Import** CurseForge (`.zip`) and Modrinth (`.mrpack`) modpacks into CMM's own lightweight pack format
- **Create** new packs from scratch, resolving mods from CurseForge and Modrinth for a given Minecraft version and loader
- **Add / remove** mods in an existing pack, including automatic required-dependency resolution
- **Install** a pack into a game folder by downloading every mod and verifying its checksum

It is used by [Cauldron](https://github.com/jackcooperdev/CauldronEngine) but works standalone in any Node.js project.

## License Information

This project is licensed under [GPL 3.0](https://choosealicense.com/licenses/gpl-3.0/) so please make sure that your
project follows the license guidelines.

## Setup

```
npm i @jackcooperdev/cmm
```

**Requirements**

- Node.js 20.12 or newer
- Internet access to `api.curseforge.com`, `api.modrinth.com`, `cf.polymc.org`, `edge.forgecdn.net` and `cdn.modrinth.com`
- CommonJS (`require`). The package does not ship ES module builds.

## Using CauldronModManager

CMM is split into two importable controllers.

| Import                         | Functions                                                       | Description                              |
| ------------------------------ | --------------------------------------------------------------- | ---------------------------------------- |
| `@jackcooperdev/cmm/pack`      | `importFromFolder`, `createPack`, `addMods`, `removeMods`, `getPackInfo` | Create and edit packs                    |
| `@jackcooperdev/cmm/bootstrap` | `installMods`                                                   | Install a pack into a game directory     |


```js
const { importFromFolder, createPack, addMods, removeMods, getPackInfo } = require("@jackcooperdev/cmm/pack");
const { installMods } = require("@jackcooperdev/cmm/bootstrap");
```

## Quick Start

```js
const { createPack } = require("@jackcooperdev/cmm/pack");
const { installMods } = require("@jackcooperdev/cmm/bootstrap");

async function main() {
  // 1. Create a pack
  const pack = await createPack(
    {
      name: "my-pack",
      author: "Me",
      minecraftVersion: "1.20.1",
      loader: "fabric",
      loaderVersion: "0.15.7",
      mods: [
        { source: "mr", slug: "sodium" },
        { source: "cf", slug: "jei" },
      ],
    },
    "./packs"
  );
  console.log(pack.name, pack.versions);

  // 2. Install it into a game folder
  await installMods("./packs/my-pack", "./instances/my-instance");
}

main().catch(console.error);
```

## API Reference

### Pack Controller (`@jackcooperdev/cmm/pack`)

#### `createPack(fileData, dir)`

Creates a new pack in `<dir>/<fileData.name>` and adds the requested mods.

> **Warning:** If `<dir>/<name>` already exists it is **deleted** and recreated.

| `fileData` field   | Type     | Description                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `name`             | string   | Pack name, also used as the folder name                                     |
| `author`           | string   | Pack author                                                                 |
| `minecraftVersion` | string   | e.g. `"1.20.1"`                                                             |
| `loader`           | string   | `"forge"`, `"fabric"` or `"neoforge"`                                       |
| `loaderVersion`    | string   | Loader version. |
| `mods`             | array    | List of `{ source, slug }` (see below)                                      |

Each mod entry:

| Field    | Type   | Description                                              |
| -------- | ------ | -------------------------------------------------------- |
| `source` | string | `"cf"` (CurseForge) or `"mr"` (Modrinth)                 |
| `slug`   | string | The project slug from the mod's page URL                 |

Resolves with the contents of `pack.json`. Rejects with a string such as `"mod not found <slug>"` or
`"mod has no valid version for this mc version / loader"` if a mod can't be matched.

#### `addMods(packPath, mods)`

Adds mods to an existing pack. Mods already in the pack are skipped. For each mod the **latest file matching the
pack's Minecraft version and loader** is chosen, and required dependencies are added automatically.

```js
await addMods("./packs/my-pack", [{ source: "mr", slug: "lithium" }]);
```

Resolves `true`.

#### `removeMods(packPath, mods)`

Removes mods by slug. Dependencies are **not** removed automatically.

```js
await removeMods("./packs/my-pack", [{ slug: "lithium" }]);
```

Resolves `true`.

#### `importFromFolder(zipPath, outPath, nameOverride?)`

Imports a `.zip` (CurseForge, containing `manifest.json`) or `.mrpack` (Modrinth, containing `modrinth.index.json`)
into `<outPath>/<name>`.

- `name` defaults to the pack's name from its manifest, lowercased. Pass `nameOverride` to choose your own.
- Mod metadata is looked up from the CurseForge / Modrinth APIs; the `overrides/` folder is copied into the pack
  (logs, crash reports, `.hprof` files and files over 100 MB are skipped).
- Re-importing the same archive is a no-op if the existing pack passes an integrity check; a different archive with
  the same name replaces the old pack.
- Mods that can't be found are logged to the console and left out of the pack.

```js
const pack = await importFromFolder("./downloads/cool-pack.mrpack", "./packs");
```

Rejects with `"FILE_NOT_EXIST"` or `"NOT_VALID_FILE"` for a missing file or unsupported format.

#### `getPackInfo(packPath)`

Reads and returns `pack.json`, or `false` if it can't be read.

### Bootstrap Controller (`@jackcooperdev/cmm/bootstrap`)

#### `installMods(packPath, destPath)`

Installs a pack into a game directory (created if missing):

1. Copies the pack's override files (configs etc.) into `destPath`
2. Downloads every mod / resource pack / shader into its folder (`mods/`, `resourcepacks/`, `shaderpacks/`, ...)
   from the CurseForge or Modrinth CDN, verifying each file's SHA-1 and re-downloading on mismatch
3. Writes `modpack.cmm` (base64) and `plain.json` (the same data as readable JSON) into `destPath`

If `destPath` already contains a `modpack.cmm` created from the same pack version, the install is skipped.

Rejects with `"pack not found"` if `packPath` doesn't exist. Resolves `true`.


## Pack Format

A pack is a folder of small JSON files, not the mod jars themselves:

```
my-pack/
├── pack.json            # Pack metadata
├── index.json           # List of every file in the pack + SHA-256 hashes
├── mods/
│   ├── sodium-cmm.json  # One metadata file per mod
│   └── jei-cmm.json
├── resourcepacks/
├── shaderpacks/
└── config/...           # Override files (imported packs only)
```

**`pack.json`**

```json
{
  "name": "my-pack",
  "author": "Me",
  "pack-format": "cmm-1.0.0",
  "index": { "file": "index.json", "hash-format": "sha256", "hash": "..." },
  "versions": {
    "minecraft": "1.20.1",
    "loader": { "type": "fabric", "version": "0.15.7" }
  }
}
```

Imported packs also have a `sourceHash` (SHA-256 of the original archive).

**`<slug>-cmm.json`**

```json
{
  "name": "Sodium",
  "filename": "sodium-fabric-0.5.8+mc1.20.1.jar",
  "slug": "sodium",
  "side": "both",
  "download": { "hash-format": "sha1", "hash": "...", "mode": "metadata:modrinth" },
  "class": "mod",
  "fileId": "...",
  "projectId": "..."
}
```

Because packs only store metadata and hashes, they are tiny and easy to share or version-control. Mods are downloaded
when `installMods` runs.

## Project Layout

```
src/
├── index.js                    # Empty (currently exports nothing)
├── controllers/
│   ├── packManager.js          # importFromFolder, createPack, addMods, removeMods
│   └── bootstrapper.js         # installMods
├── libs/
│   ├── apiCommunication.js     # CurseForge / Modrinth / Cauldron API calls
│   ├── fileValidator.js        # Hashing, validation, file downloads
│   └── packTools.js            # Read pack.json / index.json, integrity checks
├── tools/
│   ├── bulkDownloader.js       # Parallel download + verify
│   ├── bulkModGetter.js        # Batch mod lookups
│   ├── formatConverter.js      # Modrinth URL -> project / file IDs
│   ├── overrideHandler.js      # Copies overrides/ from imported archives
│   └── compatibility.js        # OS / path helpers
└── data/                       # CurseForge / Modrinth category + manifest mappings
```

## Contributing

```
git clone https://github.com/jackcooperdev/CauldronModManager.git
cd CauldronModManager
npm install
```

There is no test suite yet. See the [CHANGELOG](CHANGELOG.md) for history. Issues and pull requests are welcome.

## Related Projects

- [CauldronEngine](https://github.com/jackcooperdev/CauldronEngine): Node.js based Minecraft launcher