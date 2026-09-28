const fs = require('fs');
const path = require('path');
const { getPackInfo, getPackIndex } = require('../libs/packTools');
const { validate } = require('../libs/fileValidator');
const { verifyInstallation } = require('../tools/bulkDownloader');


async function installMods(packPath, destPath) {
    return new Promise(async (resolve, reject) => {

        if (!fs.existsSync(packPath)) {
            reject('pack not found')
        };

        let packData = await getPackInfo(packPath);

        fs.mkdirSync(destPath, { recursive: true });

        let index = await getPackIndex(packPath)

        // TODO:  Check for Existing Content and remove any invalids

        let metaFiles = index.filter(obj => obj.metafile);
        let overrideFiles = index.filter(obj => !obj.metafile)

        // Transfer Override Files
        for (let file of overrideFiles) {
            let smolPath = file.file
            const normalized = path.normalize(smolPath.replace(/[\\/]+/g, path.sep));
            const dir = path.dirname(normalized);
            fs.mkdirSync(path.join(destPath, dir), { recursive: true })
            fs.copyFileSync(path.join(packPath, smolPath), path.join(destPath, smolPath));
            let result = await validate(file, destPath)
            if (result !== 'pass') {
                console.log('error transfering ' + file.file)
            };
        };


        let queue = [];
        //

        for (let file of metaFiles) {
            let smolPath = file.file;
            const normalized = path.normalize(smolPath.replace(/[\\/]+/g, path.sep));
            const dir = path.dirname(normalized);
            let fileData = JSON.parse(fs.readFileSync(path.join(packPath, file.file)).toString())
            const str = String(fileData.fileId);

            const a = Number(str.slice(0, -3)); // 3039
            const b = Number(str.slice(-3));    // 37  (from "037")
            let obj = {
                "origin": `https://mediafilez.forgecdn.net/files/${a}/${b}/${fileData.filename}`,
                "destination": path.join(destPath, dir),
                "fileName": `${fileData.filename}`,
                "sha1": fileData.download.hash
            }
            queue.push(obj)
        };

        await verifyInstallation(queue);



        //https://mediafilez.forgecdn.net/files/2405/32/DeathQuotes-1.2.0-mc1.7.10-forge.jar

        resolve(true)
    })
}

module.exports = { installMods }