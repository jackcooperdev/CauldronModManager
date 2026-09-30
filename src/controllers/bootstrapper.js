const fs = require('fs');
const path = require('path');
const { getPackInfo, getPackIndex } = require('../libs/packTools');
const { validate, hashFolder } = require('../libs/fileValidator');
const { verifyInstallation } = require('../tools/bulkDownloader');


async function installMods(packPath, destPath) {
    return new Promise(async (resolve, reject) => {

        if (!fs.existsSync(packPath)) {
            reject('pack not found')
        };

        let packData = await getPackInfo(packPath);

        fs.mkdirSync(destPath, { recursive: true });

        let index = await getPackIndex(packPath)



        // Check For CMM File In Dest
        if (fs.existsSync(path.join(destPath, 'modpack.cmm'))) {
            let cmmData = JSON.parse(atob(fs.readFileSync(path.join(destPath, 'modpack.cmm')).toString()));
            if (packData.index.hash === cmmData.relatesTo) {
                ///let folderHash = await hashFolder(destPath, packData.versions.minecraft)
                if (cmmData.folderHash === 'abc') {
                    return resolve(true);
                }
            }
        }

        let metaFiles = index.filter(obj => obj.metafile);
        let overrideFiles = index.filter(obj => !obj.metafile);

        // Check For Any Files that should not be there;

        const userDirs = new Set([
            'mods', 'saves', 'resourcepacks', 'shaderpacks', 'datapacks'
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


        //process.exit(0)
        let expectedFiles = []
        // Transfer Override Files
        for (let file of overrideFiles) {
            let smolPath = file.file
            const normalized = path.normalize(smolPath.replace(/[\\/]+/g, path.sep));
            const dir = path.dirname(normalized);
            fs.mkdirSync(path.join(destPath, dir), { recursive: true })
            fs.copyFileSync(path.join(packPath, smolPath), path.join(destPath, smolPath));
            expectedFiles.push(path.join(destPath, smolPath))
            let result = await validate(file, destPath)
            if (result !== 'pass') {
                console.log('error transfering ' + file.file)
            };
        };


        let queue = [];


        let newIndexTracker = overrideFiles;

        for (let file of metaFiles) {
            let smolPath = file.file;
            const normalized = path.normalize(smolPath.replace(/[\\/]+/g, path.sep));
            const dir = path.dirname(normalized);
            let fileData = JSON.parse(fs.readFileSync(path.join(packPath, file.file)).toString())
            let downloadType = fileData.download.mode.replace("metadata:", "");

            let newTrackerObj = file;

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
                newTrackerObj['fileInfo'] = obj;
                queue.push(obj)
                expectedFiles.push(path.join(destPath, dir, fileData.filename))
                newIndexTracker.push(newTrackerObj)
            } else {
                let obj = {
                    "origin": `https://cdn.modrinth.com/data/${fileData.projectId}/versions/${fileData.fileId}/${fileData.filename}`,
                    "destination": path.join(destPath, dir),
                    "fileName": `${fileData.filename}`,
                    "sha1": fileData.download.hash
                }
                newTrackerObj['fileInfo'] = obj;
                queue.push(obj)
                expectedFiles.push(path.join(destPath, dir, fileData.filename))
                newIndexTracker.push(newTrackerObj)
            }
        };
        await verifyInstallation(queue);

        // TODO Respect First Boot (Recreate File List after first boot);

    /*     const expectedSet = new Set(expectedFiles);

        const onlyInActual = allFiles.filter(item => !expectedSet.has(item))
        console.log(onlyInActual)
        // Remove Extra Files
        for (let remQueue of onlyInActual) {
            fs.rmSync(remQueue);
        }

        let folderHash = await hashFolder(destPath, packData.versions.minecraft) */

        // Post Download Create CMM File Containing current Index.json;

        let finalToWrite = {
            relatesTo: packData.index.hash,
            index: newIndexTracker,
            folderHash:'abc'
        }
        fs.writeFileSync(path.join(destPath, 'modpack.cmm'), btoa(JSON.stringify(finalToWrite, null, 2)))
        fs.writeFileSync(path.join(destPath, 'plain.json'), JSON.stringify(finalToWrite, null, 2))
        resolve(true)
    })
}
module.exports = { installMods }