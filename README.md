# Cauldron Mod Manager

> This Documentation is correct for
> version [0.3.0](https://github.com/jackcooperdev/CauldronModManager/releases/tag/0.3.0) of CauldronModManager

## What does this do?

Cauldron Mod Manager (CMM) is a Node.js modpack manager for Minecraft. It can:

+ **Create** packs from scratch, resolving mods from CurseForge and Modrinth for a Minecraft version and loader
+ **Import** CurseForge (`.zip`) and Modrinth (`.mrpack`) modpacks
+ **Add / remove** mods in a pack, automatically adding required dependencies
+ **Install** a pack into a game folder, downloading every mod and verifying its checksum

Packs are stored in CMM's own [pack format](#pack-format), which only holds metadata and hashes, so they are small
and easy to share. Mods are downloaded when the pack is installed.

CMM is used by [CauldronCLI](https://docs.cauldronmc.com/cli/commands/modpacks) but works in any Node.js project.

## License Information

This project is licensed under [GPL 3.0](https://choosealicense.com/licenses/gpl-3.0/) so please make sure that your
project follows the license guidelines.

## Setup

To Install the package, run the following command

```
npm i @jackcooperdev/cmm
```

Requirements:

+ Node.js 20.12 or newer
+ CommonJS (`require`)
+ Internet access to the following hosts

| Host                           | Used for                              |
|--------------------------------|---------------------------------------|
| `api.curseforge.com`           | CurseForge mod information            |
| `cf.polymc.org`                | CurseForge API key                    |
| `api.modrinth.com`             | Modrinth mod information              |
| `resources.cauldronmc.com`     | Recommended loader versions           |
| `edge.forgecdn.net`            | CurseForge downloads                  |
| `cdn.modrinth.com`             | Modrinth downloads                    |

## Using Cauldron Mod Manager

CMM is split into two exports.

| Name                                  | Import                         | Description                          |
|---------------------------------------|--------------------------------|--------------------------------------|
| [Pack](https://docs.cauldronmc.com/modmanager/pack)              | `@jackcooperdev/cmm/pack`      | Create, import and edit packs        |
| [Bootstrap](https://docs.cauldronmc.com/modmanager/bootstrap)    | `@jackcooperdev/cmm/bootstrap` | Install a pack into a game folder    |

## Quick Start

```js
const { createPack } = require('@jackcooperdev/cmm/pack');
const { installMods } = require('@jackcooperdev/cmm/bootstrap');

// 1. Create a pack in ./packs/my-pack
const pack = await createPack({
    name: 'my-pack',
    author: 'Me',
    minecraftVersion: '1.20.1',
    loader: 'fabric',
    mods: [
        { source: 'mr', slug: 'sodium' },
        { source: 'cf', slug: 'jei' },
    ],
}, './packs');

// 2. Install it into a game folder
await installMods('./packs/my-pack', './instances/my-pack');
```

The game folder can then be used as the `game_directory`
[override](https://docs.cauldronmc.com/engine/controllers/client#overrides) when launching with Cauldron Engine.

## Pack Format

A pack is a folder of small JSON files rather than the mod jars themselves.

```
my-pack/
├── pack.json            # Pack information
├── index.json           # Every file in the pack and its hash
├── mods/
│   ├── sodium-cmm.json  # One metadata file per mod
│   └── jei-cmm.json
├── resourcepacks/
├── shaderpacks/
└── config/...           # Override files (imported packs only)
```

### pack.json

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

Imported packs also include `sourceHash`, the SHA-256 of the archive they were imported from.

### index.json

```json
[
  { "file": "mods/sodium-cmm.json", "metafile": true, "hash": "..." },
  { "file": "config/sodium-options.json", "hash": "..." }
]
```

Entries with `metafile: true` are mod metadata files. Other entries are override files that are copied into the game
folder as-is.

### Mod metadata (`<slug>-cmm.json`)

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

`download.mode` is `metadata:curseforge` or `metadata:modrinth` and decides where the file is downloaded from.
Files are placed in a folder based on their type (`mods`, `resourcepacks` or `shaderpacks`).
