const fs = require("fs");
const path = require("path");
const { exec } = require("node:child_process"); // Node.js v16+ allows "node:" prefix for built-in modules
const { parse } = require("smol-toml");
const StreamZip = require("node-stream-zip");
const JSZip = require("jszip");
const { rimraf, rimrafSync } = require('rimraf')
const { getCfData, getMrData, getCData } = require("../libs/apiCommunication");
const crypto = require("crypto");
const CF_CLASSES = require('../data/cfClasses.json')
const MR_CLASSES = require('../data/mrClasses.json')
const entryFileConversion = require('../data/entryFile.json');

const { convertModrinthURLtoIDS } = require("../tools/formatConverter");
const { getBulkMods } = require("../tools/bulkModGetter");
const { handleOverrides } = require("../tools/overrideHandler");
const { getPackInfo, verifyModpackIntegrity } = require("../libs/packTools");



async function importFromFolder(zipPath, outPath, nameOverride) {
    return new Promise(async (resolve, reject) => {

        let validFileFormats = ['.zip', '.mrpack'];

        if (!fs.existsSync(zipPath)) {
            reject("FILE_NOT_EXIST");
            return;
        }

        if (!validFileFormats.includes(path.extname(zipPath))) {
            reject("NOT_VALID_FILE");
            return;
        }

        const name_over = nameOverride || path.parse(zipPath).name;
        const MODPACK_PATH = path.join(outPath, name_over)

        const zipBuffer = await fs.readFileSync(zipPath);
        const zipHash = crypto.createHash("sha256").update(zipBuffer).digest("hex");


        if (fs.existsSync(MODPACK_PATH)) {
            let packInfo = await getPackInfo(MODPACK_PATH)
            if (packInfo.sourceHash === zipHash) {
                console.log(`Pack has already been imported (${zipHash})`);
                let validatePack = await verifyModpackIntegrity(MODPACK_PATH);
                if (validatePack.passed) {
                    return resolve(packInfo)
                } else {
                    await rimraf(MODPACK_PATH)
                }
            } else {
                await rimraf(MODPACK_PATH)
            }
        }

        fs.mkdirSync(MODPACK_PATH, { recursive: true })
        const zip = await JSZip.loadAsync(zipBuffer);


        let zipFiles = Object.keys(zip.files);

        let knownEntryFiles = ['modrinth.index.json', 'manifest.json'];

        const entryFile = zipFiles.filter(item => knownEntryFiles.includes(item))[0];
        const entryFileInfo = entryFileConversion[entryFile];
        if (!entryFile) {
            reject("NOT_VALID_FILE");
        };

        // Get Manifest File
        let manifestFileRaw = await zip.files[entryFile].async('string');
        let manifestFile = JSON.parse(manifestFileRaw);

        // Extract and Build File Data
        let masterList = manifestFile.files;

        if (entryFileInfo.key === 'mr') {
            masterList = masterList.map(convertModrinthURLtoIDS);
        }

        let payload = masterList.map(obj => obj[entryFileInfo.pId]);

        let bulkMods = await getBulkMods(entryFileInfo.key, payload);

        let foundMods = [];
        let missingMods = [];

        for (item of masterList) {
            let itemMetadata = bulkMods.find(obj => obj.id === item[entryFileInfo.pId])
            if (itemMetadata) {
                // Item Found now Look for additional file Info.
                let foundFile = itemMetadata[entryFileInfo.fKey.loc].find(obj => obj === item[entryFileInfo.fKey.id] || obj.id === item[entryFileInfo.fKey.id]);

                if (entryFileInfo.key === 'mr') {
                    // Conv Found File to Hold Actually Useful Info to match cf format
                    foundFile = { hashes: [{ value: item.hashes['sha1'], algo: 1 }], fileName: item.path.split("/")[1], };
                    itemMetadata['classId'] = item.path.split("/")[0];
                }

                if (foundFile) {
                    let metItem = {
                        name: itemMetadata[entryFileInfo.title],
                        filename: foundFile.fileName,
                        slug: itemMetadata.slug,
                        side: 'both',
                        download: {
                            'hash-format': 'sha1',
                            hash: foundFile.hashes[0].value,
                            mode: `metadata:${entryFileInfo.name}`
                        },
                        class: itemMetadata.classId,
                        fileId: item[entryFileInfo.fKey.id],
                        projectId: item[entryFileInfo.pId]
                    };
                    foundMods.push(metItem);
                } else {
                    if (entryFileInfo.key === 'cf') {
                        item['name'] = itemMetadata.name;
                        item['class'] = itemMetadata.classId;
                        item['slug'] = itemMetadata.slug;
                    };
                    missingMods.push(item);
                }
            };
        };

        // Missing Mod Check (CF Only)
        if (missingMods.length > 0) {
            if (entryFileInfo.key === 'cf') {
                payload = missingMods.map(obj => obj.fileID);
                let bulkMissingMods = await getBulkMods('cf2', payload);
                let secondPassFound = [];
                let secondPassMissing = [];

                for (let item of missingMods) {
                    let foundFile = bulkMissingMods.find(obj => obj.id === item.fileID);
                    if (foundFile) {
                        let metItem = {
                            name: item.name,
                            slug: item.slug,
                            filename: foundFile.fileName,
                            side: 'both',
                            download: {
                                'hash-format': 'sha1',
                                hash: foundFile.hashes[0].value,
                                mode: 'metadata:curseforge'
                            },
                            class: item.class,
                            fileId: item.fileID,
                            projectId: item.projectID
                        }
                        secondPassFound.push(metItem);
                    } else {
                        secondPassMissing.push(item);
                    }
                }

                for (let missing of secondPassMissing) {
                    console.log(`Was Not able to find mod ${missing.name} (${missing.projectID})`);
                };

                foundMods = [...foundMods, ...secondPassFound];
            } else {
                for (let missing of missingMods) {
                    console.log(`Was Not able to find mod ${missing.name} (${missing.projectId})`);
                };
            }
        };

        let indexTracker = await handleOverrides(zip, zipFiles, MODPACK_PATH);



        for (let mod of foundMods) {
            let actualClass = mod.class
            if (Number(actualClass)) {
                let classInfo = CF_CLASSES.find(obj => obj.id === actualClass);
                actualClass = classInfo.name.toLowerCase();
            } else {
                console.log(actualClass)
                actualClass = MR_CLASSES[actualClass];
            }
            fs.mkdirSync(path.join(MODPACK_PATH, actualClass), { recursive: true })
            const jsonContent = JSON.stringify(mod, null, 2);
            const filePath = path.join(MODPACK_PATH, actualClass, `${mod.slug}-cmm.json`);

            fs.writeFileSync(filePath, jsonContent);

            const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
            let newIndexItem = {
                file: `${actualClass}/${mod.slug}-cmm.json`,
                metafile: true,
                hash
            };
            indexTracker.push(newIndexItem);
        };

        // Write index file
        const jsonContent = JSON.stringify(indexTracker, null, 2);
        const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
        fs.writeFileSync(path.join(MODPACK_PATH, 'index.json'), jsonContent);

        // Extract MC and L Verison
        let v;
        let lv;
        let l;

        if (entryFileInfo.key === 'cf') {
            v = manifestFile.minecraft.version;
            l = manifestFile.minecraft.modLoaders[0].id.split("-")[0];
            lv = manifestFile.minecraft.modLoaders[0].id.split("-")[1];
        } else {
            let depObjs = Object.keys(manifestFile.dependencies)
            v = manifestFile.dependencies[depObjs[0]];
            l = depObjs[1];
            lv = manifestFile.dependencies[depObjs[1]]
        }


        let pack = {
            name: manifestFile.name,
            author: 'A User',
            'pack-format': 'cmm-1.0.0',
            index: {
                file: 'index.json',
                'hash-format': 'sha256',
                hash
            },
            sourceHash: zipHash,
            versions: {
                minecraft: v,
                loader: {
                    type: l,
                    version: lv
                }
            }
        };

        fs.writeFileSync(path.join(MODPACK_PATH, 'pack.json'), JSON.stringify(pack, null, 2));

        const packInfo = await getPackInfo(path.join(outPath, name_over));
        resolve(packInfo)
    })
};



async function createPack(fileData, dir, packwizLoc) {
    return new Promise(async (resolve, reject) => {
        if (!packwizLoc) {
            console.log(packwizLoc)
            packwizLoc = await which("packwiz");
            if (!packwizLoc) {
                reject("No Packwiz exe found! Please Add to Path or declare manually");
                return;
            }
        }

        const packPath = path.join(dir, fileData.name);

        // Temp
        if (fs.existsSync(packPath)) {
            rimrafSync(packPath);
        };

        fs.mkdirSync(packPath, { recursive: true });

        // Create Index
        let index = [];
        const jsonContent = JSON.stringify(index, null, 2);
        const indexHash = crypto.createHash("sha256").update(jsonContent).digest("hex");
        fs.writeFileSync(path.join(packPath, 'index.json'), jsonContent)

        // Get Loader Version
        let curLoadVersion = fileData.loaderVersion;

        if (!curLoadVersion || curLoadVersion.includes(['default', 'latest', 'release'])) {
            let resData = await getCData(`loaders/${fileData.loader}/version_manifest.json`);
            let verManifest = resData.versions.find(obj => obj.id === fileData.minecraftVersion);

            if (!verManifest) {
                return reject('version not valid');
            };
            curLoadVersion = verManifest.loaderVersion;

        }


        // Create Pack

        let pack = {
            name: fileData.name,
            author: fileData.author,
            'pack-format': 'cmm-1.0.0',
            index: {
                file: 'index.json',
                'hash-format': 'sha256',
                hash: indexHash
            },
            versions: {
                minecraft: fileData.minecraftVersion,
                loader: {
                    type: fileData.loader,
                    version: curLoadVersion
                }
            }
        };


        fs.writeFileSync(path.join(packPath, 'pack.json'), JSON.stringify(pack, null, 2));

        try {
            await addMods(packPath, fileData.mods)
        } catch (e) {
            reject(e)
        }

        /*  packwizLoc = path.resolve(packwizLoc.toString());
 
         const loaderVer = fileData.loaderVersion
             ? `--${fileData.loader}-version ${fileData.loaderVersion}`
             : `--${fileData.loader}-latest`;
 
         const command = `init -r --author ${fileData.author.replace(/\s/g, "")} ${loaderVer} --mc-version ${fileData.minecraftVersion} --modloader ${fileData.loader} --name ${fileData.name.replace(/\s/g, "")} --version ${fileData.version}`;
         await runPackwiz(packwizLoc, command, packPath, true);
 
         if (fileData.mods) {
             for (let mod of fileData.mods) {
                 const modCmd = `${mod.source} add ${mod.slug} --yes`;
                 await runPackwiz(packwizLoc, modCmd, packPath, true);
             }
         }
 
         resolve(true); */
    });
}

let loaderMap = {
    'forge': 1,
    'fabric': 4,
    'neoforge': 6
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMod(data, modName) {
    const pattern = new RegExp(`(^|/)${escapeRegex(modName)}-cmm\\.json$`);
    return data.find(obj => pattern.test(obj.file));
}


async function addMods(packPath, mods) {
    return new Promise(async (resolve, reject) => {
        // Get Current Pack

        let pack = JSON.parse(fs.readFileSync(path.join(packPath, 'pack.json')).toString());
        let modList = mods;
        // Create Mods Folder
        fs.mkdirSync(path.join(packPath, 'mods'), { recursive: true });

        // Get Current Index
        let indexTracker = JSON.parse(fs.readFileSync(path.join(packPath, 'index.json')).toString());


        // Check For Dups and Remove from queue

        for (let mod of modList) {
            let found = findMod(indexTracker, mod.slug);
            if (found) {
                modList = modList.filter(item => item !== mod);
            }
        }

        let cfMods = modList.filter(obj => obj.source === 'cf')
        let mrMods = modList.filter(obj => obj.source === 'mr');

        let allMods = [];

        for (let mod of cfMods) {
            let grabData = await getCfData(`mods/search?gameId=432&slug=${mod.slug}&classId=6`);
            let modData = grabData.data[0];
            if (modData) {
                let latestFiles = modData.latestFilesIndexes;
                let foundModForVersion = latestFiles.find(obj => obj.gameVersion === pack.versions.minecraft && obj.modLoader === loaderMap[pack.versions.loader.type])

                if (!foundModForVersion) {

                    let indexKeys = Object.keys(latestFiles[0]);

                    // Edge Case: Mod Does not include a loader but is a dependa so it can be assumed that the mod is compatible with the current mod.
                    if (!indexKeys.includes('modLoader') && mod.isDependa) {
                        foundModForVersion = latestFiles.find(obj => obj.gameVersion === pack.versions.minecraft);
                    } else {
                        return reject('mod not found ' + mod.slug)
                    }
                };
                let modDataExistsinLatest = modData.latestFiles.find(obj => obj.id === foundModForVersion.fileId);
                let modInfo = modDataExistsinLatest
                if (!modInfo) {
                    let fileData = await getCfData(`mods/${modData.id}/files/${foundModForVersion.fileId}`);
                    if (!fileData.data) {
                        return reject('mod file not found')
                    };
                    modInfo = fileData.data
                };

                // Dependency Search
                let respondToDeps = [3];
                let grabDependencys = modInfo.dependencies.filter(obj => respondToDeps.includes(obj.relationType)).map(obj => obj.modId);
                if (grabDependencys.length !== 0) {

                    let toAdd = await getCfData('mods', { modIds: grabDependencys, filterPcOnly: true }, 'post');
                    for (let mod of toAdd.data) {
                        let newQItem = {
                            source: 'cf',
                            slug: mod.slug,
                            isDependa: true
                        };
                        cfMods.push(newQItem)
                    }
                }


                let metItem = {
                    name: modData.name,
                    slug: modData.slug,
                    filename: modInfo.fileName,
                    side: 'both',
                    download: {
                        'hash-format': 'sha1',
                        hash: modInfo.hashes[0].value,
                        mode: 'metadata:curseforge'
                    },
                    class: modData.classId,
                    fileId: modInfo.id,
                    projectId: modData.id
                }
                allMods.push(metItem);
            } else {
                console.log(`Slug ${mod.slug} is not a valid slug`)
            }
        }

        for (let mod of mrMods) {
            let modData = await getMrData(`project/${mod.slug}`);

            if (modData) {
                let modHasValidVersion = (modData.game_versions.includes(pack.versions.minecraft) && modData.loaders.includes(pack.versions.loader.type));

                if (!modHasValidVersion) {
                    reject('mod has no valid version for this mc version / loader');
                };

                let fileData = await getMrData(`project/${mod.slug}/version?loaders=${JSON.stringify([pack.versions.loader.type])}&game_versions=${JSON.stringify([pack.versions.minecraft])}`);


                if (fileData.length === 0) {
                    reject('mod has no valid version for this mc version / loader');
                };

                let latestValidVersion = fileData[0];


                let grabDependencys = latestValidVersion.dependencies.filter(obj => obj.dependency_type === 'required');
                for (let mod of grabDependencys) {
                    let newQItem = {
                        source: 'mr',
                        slug: mod.project_id,
                        isDependa: true
                    };
                    mrMods.push(newQItem)
                };



                let metItem = {
                    name: modData.title,
                    slug: modData.slug,
                    filename: latestValidVersion.files[0].filename,
                    side: 'both',
                    download: {
                        'hash-format': 'sha1',
                        hash: latestValidVersion.files[0].hashes['sha1'],
                        mode: 'metadata:modrinth'
                    },
                    class: modData.project_type,
                    fileId: latestValidVersion.id,
                    projectId: modData.id
                }
                allMods.push(metItem)

            } else {
                console.log(`Slug ${mod.slug} is not a valid slug`)
            }
        }

        // Create Mod Files

        for (let mod of allMods) {
            let actualClass = mod.class
            if (Number(actualClass)) {
                let classInfo = CF_CLASSES.find(obj => obj.id === actualClass);
                actualClass = classInfo.name.toLowerCase();
            } else {
                actualClass = MR_CLASSES[actualClass];
            };

            fs.mkdirSync(path.join(packPath, actualClass), { recursive: true })
            const jsonContent = JSON.stringify(mod, null, 2);
            const filePath = path.join(packPath, actualClass, `${mod.slug}-cmm.json`);

            fs.writeFileSync(filePath, jsonContent);

            const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
            let newIndexItem = {
                file: `${actualClass}/${mod.slug}-cmm.json`,
                metafile: true,
                hash
            };
            indexTracker.push(newIndexItem);
        }

        // Remove Dups from Index (Final Line of Defense) (Dependency Edge Case)
        indexTracker = indexTracker.filter(
            (item, index, self) => index === self.findIndex(t => t.file === item.file)
        );

        const jsonContent = JSON.stringify(indexTracker, null, 2);
        const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
        fs.writeFileSync(path.join(packPath, 'index.json'), jsonContent);

        pack.index.hash = hash;
        fs.writeFileSync(path.join(packPath, 'pack.json'), JSON.stringify(pack, null, 2));

        resolve(true);


    })
}








module.exports = { importFromFolder, createPack, addMods }