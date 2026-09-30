const Promise = require("bluebird");
const fs = require("fs");
const path = require("path");
const { download, validate } = require("../libs/fileValidator");
const { pipeline } = require('stream/promises');
const { getOperatingSystem } = require("./compatibility");

function removeItem(array, item) {
    let i = array.length;

    while (i--) {
        if (array[i] === item) {
            array.splice(i, 1);
        }
    }
}


async function checkDownloadAndCheck(item) {
    return new Promise(async (resolve, reject) => {
        try {
            let validateItem = await validate(item,item.destination,'sha1');
            while (typeof validateItem == "object") {
                let out = await download(validateItem.origin, validateItem.destination, validateItem.fileName);
                if (!out) {
                    reject(`File Not Found: ${validateItem.origin}`);
                }

                validateItem = await validate(item,item.destination,'sha1');
                const CURRENT_OPERATING_SYSTEM = getOperatingSystem();

                // Make jars (and extracted binaries) executable on linux
                if (CURRENT_OPERATING_SYSTEM === 'linux' && item.fileName.includes('.jar')) {
                    fs.chmodSync(path.join(item.destination, item.fileName), 0o755);
                }
            }
            resolve("pass");
        } catch (e) {
            console.log('errrr')
            console.error(e)
        }
    });
}

async function verifyInstallation(queue, isAssetDownload) {
    return new Promise(async (resolve, reject) => {
        try {
            let concurrency = queue.length;
            if (isAssetDownload) {
                concurrency = queue.length / 2;
            }
            const procQueue = await Promise.map(queue, checkDownloadAndCheck, {
                concurrency: concurrency,
            });
            removeItem(procQueue, "pass");
            resolve(procQueue);
        } catch (error) {
            reject(error);
        }

    });
}

module.exports =  {verifyInstallation};
