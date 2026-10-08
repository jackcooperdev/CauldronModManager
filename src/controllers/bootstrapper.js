const fs = require('fs');
const path = require('path');
const { getPackInfo, getPackIndex } = require('../libs/packTools');
const { validate } = require('../libs/fileValidator');
const { verifyInstallation } = require('../tools/bulkDownloader');
const crypto = require('crypto')

async function installMods(packPath, destPath) {
    return new Promise(async (resolve, reject) => {

        if (!fs.existsSync(packPath)) {
            reject('pack not found')
        };

        let packData = await getPackInfo(packPath);

        fs.mkdirSync(destPath, { recursive: true });

        let index = await getPackIndex(packPath)

        let metaFiles = index.filter(obj => obj.metafile);
        let overrideFiles = index.filter(obj => !obj.metafile);

        // Check For Any Files that should not be there;

        const userDirs = new Set([
            'mods'
        ]);

        const ignoredDirs = [
            path.join('mods', packData.versions.minecraft)
        ];

        const manualRemoval = new Set(['modpack.cmm', 'plain.json']);

        const entries = fs.readdirSync(destPath, { recursive: true, withFileTypes: true });

        const allFiles = entries
            .filter(e => e.isFile())
            .filter(e => !manualRemoval.has(e.name))
            .map(e => path.join(e.parentPath, e.name))
            .filter(fullPath => {
                const rel = path.relative(destPath, fullPath);
                const [topLevel, ...rest] = rel.split(path.sep);

                if (rest.length === 0 || !userDirs.has(topLevel)) return false;

                // skip anything inside an ignored folder
                return !ignoredDirs.some(dir => rel.startsWith(dir + path.sep));
            });


        let expectedFiles = [];

        for (let file of overrideFiles) {
            let smolPath = file.file
            const normalized = path.normalize(smolPath.replace(/[\\/]+/g, path.sep));
            const dir = path.dirname(normalized);
            fs.mkdirSync(path.join(destPath, dir), { recursive: true });

            let doesFileAlreadyExist = fs.existsSync(path.join(destPath, smolPath));
            if (doesFileAlreadyExist) {
                let result = await validate(file, destPath, 'sha1');

                if (result !== 'pass') {
                    overrideFiles = overrideFiles.filter(function (obj) {
                        return obj !== file;
                    });
                } else {
                    if (smolPath.includes('mods')) {
                        expectedFiles.push(path.join(destPath, smolPath))
                    }
                }
            } else {
                fs.copyFileSync(path.join(packPath, smolPath), path.join(destPath, smolPath));
                if (smolPath.includes('mods')) {
                    expectedFiles.push(path.join(destPath, smolPath))
                }
                let result = await validate(file, destPath, 'sha1')
                if (result !== 'pass') {
                    console.log('error transfering ' + file.file)
                };
            }


        };
        //process.exit(0)
        let queue = [];

        for (let file of metaFiles) {
            let smolPath = file.file;
            const normalized = path.normalize(smolPath.replace(/[\\/]+/g, path.sep));
            const dir = path.dirname(normalized);
            let fileData = JSON.parse(fs.readFileSync(path.join(packPath, file.file)).toString())
            let downloadType = fileData.download.mode.replace("metadata:", "");

            if (downloadType === 'curseforge') {
                const str = String(fileData.fileId);

                const a = Number(str.slice(0, -3)); // 3039
                const b = Number(str.slice(-3));    // 37  (from "037")
                let obj = {
                    "origin": `https://edge.forgecdn.net/files/${a}/${b}/${fileData.filename}`,
                    "destination": path.join(destPath, dir),
                    "fileName": `${fileData.filename}`,
                    "sha1": fileData.download.hash
                }
                queue.push(obj)
                expectedFiles.push(path.join(destPath, dir, fileData.filename))
            } else {
                let obj = {
                    "origin": `https://cdn.modrinth.com/data/${fileData.projectId}/versions/${fileData.fileId}/${fileData.filename}`,
                    "destination": path.join(destPath, dir),
                    "fileName": `${fileData.filename}`,
                    "sha1": fileData.download.hash
                }
                queue.push(obj)
                expectedFiles.push(path.join(destPath, dir, fileData.filename))
            }
        };


        await verifyInstallation(queue);

        const expectedSet = new Set(expectedFiles);

        const toDelete = allFiles.filter(item => !expectedSet.has(item))

        for (let rmFile of toDelete) {
            fs.rmSync(rmFile)
        }

        let finalToWrite = {
            relatesTo: packData.index.hash,
            index
        }
        fs.writeFileSync(path.join(destPath, 'modpack.cmm'), btoa(JSON.stringify(finalToWrite, null, 2)))
        fs.writeFileSync(path.join(destPath, 'plain.json'), JSON.stringify(finalToWrite, null, 2))

        resolve(true)
    })
}
module.exports = { installMods }