# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [0.3.0] - 2026-10-20

### Added

- `createPack` accepts `release` or `snapshot` as `minecraftVersion` for the latest version
- `createPack` rejects with `invalid_loader` when the loader is `vanilla`

### Fixed

- Importing a pack without a name crashing. Imported packs are now given a random five word name
  (e.g. `we-ship-fifteen-fat-there`)
- `loaderVersion` values `latest`, `release` and `default` not resolving to the recommended loader version
- `addMods` continuing after rejecting a Modrinth mod with no valid version

## [0.2.0] - 2026-10-08

### Added

- `getPackIndex` export

### Changed

- **Breaking:** `removeMods` takes an array of slugs (`['lithium']`) instead of objects
- `installMods` only removes unexpected files from `mods/`. Previously files in `saves/`, `resourcepacks/`,
  `shaderpacks/` and `datapacks/` could also be removed
- `installMods` keeps override files that have been changed in the game folder instead of replacing them
- `installMods` always runs instead of being skipped when the pack is already installed
- Imported packs are no longer named after the pack's manifest
- Re-importing the same file returns the existing pack without running an integrity check
- Performance improvements

### Fixed

- Modrinth imports reading the Minecraft version and loader from the wrong dependency

## [0.1.2] - 2026-10-05

### Fixed

- Loader versions are fetched from `https://resources.cauldronmc.com` (0.1.0 and 0.1.1 used a private development
  server)
- Repository URL in `package.json`

### Changed

- Rewrote README

## [0.1.1] - 2026-10-05

### Added

- `getPackInfo` export

## [0.1.0] - 2026-09-30

First release as Cauldron Mod Manager (`@jackcooperdev/cmm`). CMM is a rewrite of
[packwiz_js](#previously-packwiz_js) that no longer needs the packwiz program.

### Added

- CMM pack format (`cmm-1.0.0`), storing mod metadata and hashes instead of mod files
- `createPack` to create packs from CurseForge and Modrinth mods
- `importFromFolder` to import CurseForge (`.zip`) and Modrinth (`.mrpack`) modpacks
- `addMods` with automatic required dependency resolution, and `removeMods`
- `installMods` to download and verify a pack's mods into a game folder
- Override files (configs etc.) are copied from imported packs

### Known Issues

- Loader versions are fetched from a private development server. Fixed in 0.1.2

## Previously packwiz_js

Before 0.1.0, this project was published as `packwiz_js`, a Node.js wrapper around [packwiz](https://packwiz.infra.link/).
Its releases are on the [packwiz_js repository](https://github.com/jackcooperdev/packwiz_js/releases).

| Version | Date       | Changes                                                                         |
|---------|------------|---------------------------------------------------------------------------------|
| 1.1.0   | 2026-06-30 | Fixed Modrinth imports                                                          |
| 1.0.9   | 2026-06-26 | npm publishing workflow                                                         |
| 1.0.8   | 2025-06-12 | Moved back from ES modules to CommonJS. Updated documentation                   |
| 1.0.7   | 2025-06-09 | Fixed incorrect index location. General refactor                                |
| 1.0.5   | 2025-04-22 | Migrated from CommonJS to ES modules                                            |
| 1.0.3   | 2025-01-20 | Package renamed from `@jackcooper04/packwiz_js` to `@jackcooperdev/packwiz_js`. Code tidy up and logging fixes |
| 1.0.0   | 2024-08-02 | Initial release (1.0.1 and 1.0.2 fixed dependencies and module loading)        |

[unreleased]: https://github.com/jackcooperdev/CauldronModManager/compare/0.3.0...HEAD
[0.3.0]: https://github.com/jackcooperdev/CauldronModManager/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/jackcooperdev/CauldronModManager/compare/0.1.2...0.2.0
[0.1.2]: https://github.com/jackcooperdev/CauldronModManager/compare/0.1.1...0.1.2
[0.1.1]: https://github.com/jackcooperdev/CauldronModManager/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/jackcooperdev/CauldronModManager/releases/tag/0.1.0
