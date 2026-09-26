// noinspection JSUnusedGlobalSymbols

const fs = require("fs");
const path = require("path");
const { exec } = require("node:child_process"); // Node.js v16+ allows "node:" prefix for built-in modules
const { parse } = require("smol-toml");
const StreamZip = require("node-stream-zip");
const JSZip = require("jszip");
const { rimraf, rimrafSync } = require('rimraf')
const { getCfData, getMrData, getCData } = require("./libs/apiCommunication");
const crypto = require("crypto");

const { validate, bulkValidate } = require("./libs/fileValidator");
// Native helper to replace shell.which
function which(cmd) {
    return new Promise((resolve) => {
        exec(`which ${cmd}`, (err, stdout) => {
            if (err || !stdout) {
                resolve(null);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

function getFileNamesFromToml(dir) {
    return fs.readdirSync(dir).flatMap((file) => {
        if (!file.endsWith('.toml')) return [];
        const fileData = parse(fs.readFileSync(path.join(dir, file)).toString());
        return fileData.filename ? [fileData.filename] : [];
    });
}

function convertModrinthURLtoIDS(obj) {
    const url = obj.downloads[0];
    const match = url.match(/\/data\/([^/]+)\/versions\/([^/]+)\//);

    if (match) {
        obj.projectId = match[1]; // "3xf3eGxN"
        obj.fileId = match[2]; // "PeYaLZ5O"
    }

    return obj;
}

// Import From Modrinth (.mrpack)
async function importFromModrinth(mrPath, outPath, nameOverride) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!fs.existsSync(mrPath)) {
                reject("FILE_NOT_EXIST");
                return;
            }

            if (path.extname(mrPath) !== ".mrpack") {
                reject("NOT_VALID_MRPACK");
                return;
            }

            const name_over = nameOverride || path.parse(mrPath).name;
            const MODPACK_PATH = path.join(outPath, name_over)
            const zipBuffer = await fs.readFileSync(mrPath);
            const zipHash = crypto.createHash("sha256").update(zipBuffer).digest("hex");

            // Check If pack has been previously imported
            if (fs.existsSync(MODPACK_PATH)) {
                let packInfo = await getPackInfo(MODPACK_PATH)
                if (packInfo.sourceHash === zipHash) {
                    console.log(`Pack has already been imported (${zipHash})`);
                    let validatePack = await verifyModpackIntegrity(MODPACK_PATH);
                    if (validatePack.passed) {
                        return resolve(packInfo)
                    } else {
                        rimraf(MODPACK_PATH)
                    }

                } else {
                    rimraf(MODPACK_PATH)
                }
            };

            const zip = await JSZip.loadAsync(zipBuffer);


            let zipFiles = Object.keys(zip.files);



            if (!zipFiles.includes('modrinth.index.json')) {
                reject("NOT_VALID_ZIP")
                return;
            };

            // Get Manifest File
            let manifestFileRaw = await zip.files['modrinth.index.json'].async('string');
            let manifestFile = JSON.parse(manifestFileRaw)

            // Extract and Build File Data

            let masterList = manifestFile.files;

            // Extract Project and File IDS from download URL
            masterList = masterList.map(convertModrinthURLtoIDS);

            let payload = masterList.map(obj => obj.projectId)

            let bulkMods = await getMrData(`projects?ids=${JSON.stringify(payload)}`)

            let foundMods = [];
            let missingMods = [];

            for (item of masterList) {
                let itemMetadata = bulkMods.find(obj => obj.id === item.projectId);
                let foundFile = itemMetadata.versions.find(obj => obj === item.fileId);

                if (foundFile) {
                    let metItem = {
                        name: itemMetadata.title,
                        filename: item.path.split("/")[1],
                        slug: itemMetadata.slug,
                        side: 'both',
                        download: {
                            'hash-format': 'sha1',
                            hash: item.hashes['sha1'],
                            mode: 'metadata:modrinth'
                        },
                        class: item.path.split("/")[0],
                        fileId: item.fileId,
                        projectId: item.projectId
                    };
                    foundMods.push(metItem);
                } else {
                    missingMods.push(item)
                }

            }


            // Log Any Remining Missing Files;
            for (let missing of missingMods) {
                console.log(`Was Not able to find mod ${missing.name} (${missing.projectId})`);
            };

            fs.mkdirSync(MODPACK_PATH, { recursive: true })


            let indexTracker = [];

            // Handle and Transfer overrides
            const SKIP_PATTERNS = [/\.hprof$/i, /\.log$/i, /^logs\//i, /^crash-reports\//i];
            const MAX_OVERRIDE_SIZE = 100 * 1024 * 1024; // 100MB — adjust as needed

            let overrideFiles = zipFiles
                .filter(f => f.startsWith('overrides/') && !zip.files[f].dir)
                .map(f => f.replace(/^overrides\//, ''))
                .filter(f => {
                    if (SKIP_PATTERNS.some(re => re.test(f))) {
                        return false;
                    }
                    const entry = zip.files[`overrides/${f}`];
                    const size = entry._data ? entry._data.uncompressedSize : 0;
                    if (size > MAX_OVERRIDE_SIZE) {
                        return false;
                    }
                    return true;
                });

            for (let file of overrideFiles) {
                const entry = zip.files[`overrides/${file}`];
                let filePath = path.join(MODPACK_PATH, file.split("/").slice(0, -1).join("/"));
                let fileName = file.split("/")[file.split("/").length - 1];

                fs.mkdirSync(filePath, { recursive: true });

                try {
                    const content = await entry.async('nodebuffer');
                    let finalDest = path.join(filePath, fileName)
                    let innerDest = path.join(file.split("/").slice(0, -1).join("/"), fileName)
                    fs.writeFileSync(finalDest, content);
                    const hash = crypto.createHash("sha256").update(content).digest("hex");
                    let newIndexItem = {
                        file: innerDest,
                        hash
                    };
                    indexTracker.push(newIndexItem);


                } catch (err) {
                    console.error(`Skipping bad entry overrides/${file}: ${err.message}`);
                }
            }



            // Split and Create Mod Files

            for (let mod of foundMods) {
                fs.mkdirSync(path.join(MODPACK_PATH, mod.class), { recursive: true })
                const jsonContent = JSON.stringify(mod, null, 2);
                const filePath = path.join(MODPACK_PATH, mod.class, `${mod.slug}-cmm.json`);

                fs.writeFileSync(filePath, jsonContent);

                const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
                let newIndexItem = {
                    file: `${mod.class}/${mod.slug}-cmm.json`,
                    metafile: true,
                    hash
                };
                indexTracker.push(newIndexItem);

            };


            // Write index file
            const jsonContent = JSON.stringify(indexTracker, null, 2);
            const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
            fs.writeFileSync(path.join(MODPACK_PATH, 'index.json'), jsonContent);
            let depObjs = Object.keys(manifestFile.dependencies)
            let pack = {
                name: manifestFile.name,
                author: 'A Modrinth User',
                'pack-format': 'cmm-1.0.0',
                index: {
                    file: 'index.json',
                    'hash-format': 'sha256',
                    hash
                },
                sourceHash: zipHash,
                versions: {
                    minecraft: manifestFile.dependencies[depObjs[0]],
                    loader: `${depObjs[1]}-${manifestFile.dependencies[depObjs[1]]}`
                }
            };

            fs.writeFileSync(path.join(MODPACK_PATH, 'pack.json'), JSON.stringify(pack, null, 2));

            const packInfo = await getPackInfo(path.join(outPath, name_over));
            resolve(packInfo)
        } catch (e) {
            reject(e);
        }
    });
}

// Import From CurseForge (.zip)
async function importFromCurseforge(zipPath, outPath, nameOverride) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!fs.existsSync(zipPath)) {
                reject("FILE_NOT_EXIST");
                return;
            }

            if (path.extname(zipPath) !== ".zip") {
                reject("NOT_VALID_ZIP");
                return;
            }

            const name_over = nameOverride || path.parse(zipPath).name;
            const MODPACK_PATH = path.join(outPath, name_over)

            const zipBuffer = await fs.readFileSync(zipPath);
            const zipHash = crypto.createHash("sha256").update(zipBuffer).digest("hex");

            // Check If pack has been previously imported
            if (fs.existsSync(MODPACK_PATH)) {
                let packInfo = await getPackInfo(MODPACK_PATH)
                if (packInfo.sourceHash === zipHash) {
                    console.log(`Pack has already been imported (${zipHash})`);
                    let validatePack = await verifyModpackIntegrity(MODPACK_PATH);
                    if (validatePack.passed) {
                        return resolve(packInfo)
                    } else {
                        rimraf(MODPACK_PATH)
                    }

                } else {
                    rimraf(MODPACK_PATH)
                }
            };

            // Grab Modpack Info
            const zip = await JSZip.loadAsync(zipBuffer);

            let zipFiles = Object.keys(zip.files);

            // Check for Valid File
            if (!zipFiles.includes('manifest.json')) {
                reject("NOT_VALID_ZIP")
                return;
            };

            // Get Manifest File

            let manifestFileRaw = await zip.files['manifest.json'].async('string');
            let manifestFile = JSON.parse(manifestFileRaw)


            // Extract and Build File Data
            let masterList = manifestFile.files;
            let payload = masterList.map(obj => obj.projectID);

            let bulkMods = await getCfData('mods', { modIds: payload, filterPcOnly: true }, 'post');


            let foundMods = [];
            let missingMods = []

            for (let item of masterList) {
                let itemMetadata = bulkMods.data.find(obj => obj.id === item.projectID);
                if (itemMetadata) {
                    // Found Item now Check for LatestFiles and extract info.
                    let foundFile = itemMetadata.latestFiles.find(obj => obj.id === item.fileID);
                    if (foundFile) {
                        // Build metadata item
                        let metItem = {
                            name: itemMetadata.name,
                            filename: foundFile.fileName,
                            slug: itemMetadata.slug,
                            side: 'both',
                            download: {
                                'hash-format': 'sha1',
                                hash: foundFile.hashes[0].value,
                                mode: 'metadata:curseforge'
                            },
                            class: itemMetadata.classId,
                            fileId: item.fileID,
                            projectId: item.projectID
                        }
                        foundMods.push(metItem)
                    } else {
                        item['name'] = itemMetadata.name;
                        item['class'] = itemMetadata.classId;
                        item['slug'] = itemMetadata.slug;
                        missingMods.push(item);
                    }
                }
            }

            // Attempt Two Search Via FileIds

            let masterMissingList = missingMods;

            payload = masterMissingList.map(obj => obj.fileID);
            let bulkMissingMods = await getCfData('mods/files', { fileIds: payload }, 'post');


            let secondPassFound = [];
            let secondPassMissing = [];

            for (let item of masterMissingList) {
                let foundFile = bulkMissingMods.data.find(obj => obj.id === item.fileID);
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



            // Log Any Remining Missing Files;
            for (let missing of secondPassMissing) {
                console.log(`Was Not able to find mod ${missing.name} (${missing.projectID})`);
            };

            // Merge Mods Into One Obj
            let allMods = [...foundMods, ...secondPassFound];





            // Create Modpack
            fs.mkdirSync(MODPACK_PATH, { recursive: true });

            // Create Object for tracking index
            let indexTracker = [];

            // Handle and Transfer overrides
            const SKIP_PATTERNS = [/\.hprof$/i, /\.log$/i, /^logs\//i, /^crash-reports\//i];
            const MAX_OVERRIDE_SIZE = 100 * 1024 * 1024; // 100MB — adjust as needed

            let overrideFiles = zipFiles
                .filter(f => f.startsWith('overrides/') && !zip.files[f].dir)
                .map(f => f.replace(/^overrides\//, ''))
                .filter(f => {
                    if (SKIP_PATTERNS.some(re => re.test(f))) {
                        return false;
                    }
                    const entry = zip.files[`overrides/${f}`];
                    const size = entry._data ? entry._data.uncompressedSize : 0;
                    if (size > MAX_OVERRIDE_SIZE) {
                        return false;
                    }
                    return true;
                });

            for (let file of overrideFiles) {
                const entry = zip.files[`overrides/${file}`];
                let filePath = path.join(MODPACK_PATH, file.split("/").slice(0, -1).join("/"));
                let fileName = file.split("/")[file.split("/").length - 1];

                fs.mkdirSync(filePath, { recursive: true });

                try {
                    const content = await entry.async('nodebuffer');
                    let finalDest = path.join(filePath, fileName)
                    let innerDest = path.join(file.split("/").slice(0, -1).join("/"), fileName)
                    fs.writeFileSync(finalDest, content);
                    const hash = crypto.createHash("sha256").update(content).digest("hex");
                    let newIndexItem = {
                        file: innerDest,
                        hash
                    };
                    indexTracker.push(newIndexItem);


                } catch (err) {
                    console.error(`Skipping bad entry overrides/${file}: ${err.message}`);
                }
            }

            // Split and Create Mod Files

            let actualMods = allMods.filter(obj => obj.class === 6);
            let shaders = allMods.filter(obj => obj.class === 6552);

            // Handle Shaders
            for (let shader of shaders) {
                const jsonContent = JSON.stringify(shader, null, 2);
                const filePath = path.join(MODPACK_PATH, `${shader.slug}-cmm.json`);

                fs.writeFileSync(filePath, jsonContent);

                const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
                let newIndexItem = {
                    file: `${shader.slug}-cmm.json`,
                    metafile: true,
                    hash
                };
                indexTracker.push(newIndexItem);

            }

            fs.mkdirSync(path.join(MODPACK_PATH, 'mods'), { recursive: true })

            for (let mod of actualMods) {
                const jsonContent = JSON.stringify(mod, null, 2);
                const filePath = path.join(MODPACK_PATH, 'mods', `${mod.slug}-cmm.json`);

                fs.writeFileSync(filePath, jsonContent);

                const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
                let newIndexItem = {
                    file: `mods/${mod.slug}-cmm.json`,
                    metafile: true,
                    hash
                };
                indexTracker.push(newIndexItem);

            };

            // Write index file
            const jsonContent = JSON.stringify(indexTracker, null, 2);
            const hash = crypto.createHash("sha256").update(jsonContent).digest("hex");
            fs.writeFileSync(path.join(MODPACK_PATH, 'index.json'), jsonContent);

            let pack = {
                name: manifestFile.name,
                author: manifestFile.author,
                'pack-format': 'cmm-1.0.0',
                index: {
                    file: 'index.json',
                    'hash-format': 'sha256',
                    hash
                },
                sourceHash: 'zipHash',
                versions: {
                    minecraft: manifestFile.minecraft.version,
                    loader: manifestFile.minecraft.modLoaders[0].id
                }
            };

            fs.writeFileSync(path.join(MODPACK_PATH, 'pack.json'), JSON.stringify(pack, null, 2));


            const packInfo = await getPackInfo(path.join(outPath, name_over));
            resolve(packInfo)
        } catch (err) {
            reject(err);
        }
    });
}

async function getPackInfo(dir) {
    return new Promise((resolve, reject) => {
        try {
            const packFile = JSON.parse(fs.readFileSync(path.join(dir, "pack.json")).toString());
            resolve(packFile);
        } catch (err) {
            resolve(false);
        }
    });
}

async function getPackIndex(dir) {
    return new Promise((resolve, reject) => {
        try {
            const packFile = JSON.parse(fs.readFileSync(path.join(dir, "index.json")).toString());
            resolve(packFile);
        } catch (err) {
            resolve(false);
        }
    });
}

async function verifyModpackIntegrity(mPackPath) {
    return new Promise(async (resolve, reject) => {
        try {
            let startTime = Date.now();

            let mPackContents = fs.readdirSync(mPackPath);
            let requiredFiles = ['index.json', 'pack.json'];
            for (let req of requiredFiles) {
                if (!mPackContents.includes(req)) {
                    resolve(false)
                }
            }

            // Get pack.json
            let packInfo = await getPackInfo(mPackPath);

            // Validate Index.json
            let validIndex = await validate({ file: path.join(mPackPath, 'index.json'), hash: packInfo.index.hash });


            if (!validIndex) {
                resolve({ passed: false, failed: [{ file: 'index.json', hash: packInfo.index.hash }] })
            }

            // Get Index

            let index = await getPackIndex(mPackPath);

            let validateIndex = await bulkValidate(index, mPackPath);
            if (validateIndex.length !== 0) {
                resolve({ passed: false, failed: validateIndex })
            }
            let endTime = Date.now()
            resolve({ passed: true, failed: [], took: `${endTime - startTime}ms` })



        } catch (e) {
            reject(e)
        }

    })
}

async function getPackVersion(name, dir) {
    try {
        const packFile = JSON.parse(fs.readFileSync(path.join(dir, "pack.json")).toString());
        return packFile.version;
    } catch (err) {
        return false;
    }
}

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
                indexHash
            },
            versions: {
                minecraft: fileData.minecraftVersion,
                loader: `${fileData.loader}-${curLoadVersion}`
            }
        };


        fs.writeFileSync(path.join(packPath, 'pack.json'), JSON.stringify(pack, null, 2));

        try {
            await addMods(fileData, packPath)
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

async function addMods(packData, packPath) {
    return new Promise(async (resolve, reject) => {
        let modList = packData.mods;
        // Create Mods Folder
        fs.mkdirSync(path.join(packPath, 'mods'), { recursive: true });

        // Get Current Index
        let indexTracker = JSON.parse(fs.readFileSync(path.join(packPath, 'index.json')).toString());

        let cfMods = modList.filter(obj => obj.source === 'cf')
        let mrMods = modList.filter(obj => obj.source === 'mr');

        let allMods = [];

        for (let mod of cfMods) {
            let grabData = await getCfData(`mods/search?gameId=432&slug=${mod.slug}&classId=6`);
            let modData = grabData.data[0];
            if (modData) {
                let latestFiles = modData.latestFilesIndexes;
                let foundModForVersion = latestFiles.find(obj => obj.gameVersion === packData.minecraftVersion && obj.modLoader === loaderMap[packData.loader])

                if (!foundModForVersion) {

                    let indexKeys = Object.keys(latestFiles[0]);

                    // Edge Case: Mod Does not include a loader but is a dependa so it can be assumed that the mod is compatible with the current mod.
                    if (!indexKeys.includes('modLoader') && mod.isDependa) {
                        foundModForVersion = latestFiles.find(obj => obj.gameVersion === packData.minecraftVersion);
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

                // TODO Dependency Search
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

        
        console.log(allMods)

    })
}


async function getModList(packFolder) {
    return new Promise((resolve) => {
        try {
            const modsDir = path.join(packFolder, "mods");
            if (fs.existsSync(modsDir)) {
                const files = fs.readdirSync(modsDir);
                const mods = files
                    .map((file) => parse(fs.readFileSync(path.join(modsDir, file)).toString()))
                    .filter((fileData) => fileData.side === 'client' || fileData.side === 'both')
                    .map((fileData) => fileData.filename);
                resolve(mods);
            } else {
                resolve([]);
            }
        } catch (err) {
            resolve(["notamod.jar"]);
        }
    });
}

// Packwiz Runner
async function runPackwiz(loc, command, dir, printOut = false) {
    return new Promise((resolve) => {
        fs.mkdirSync(dir, { recursive: true });
        const child = exec(`cd ${dir} && ${loc} ${command}`);
        child.stdout.on("data", (data) => {
            if (printOut) console.log(data.trim());
        });
        child.stderr.on("data", (data) => {
            if (printOut) console.log(data.trim());
        });
        child.on("close", (code) => resolve(code));
    });
}

module.exports = {
    importFromCurseforge,
    getPackVersion,
    getModList,
    createPack,
    importFromModrinth,
    verifyModpackIntegrity
};
