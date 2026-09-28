const Promise = require("bluebird");
const path = require('path')
const crypto = require('crypto');
const fs = require('fs');
const Downloader = require("nodejs-file-downloader");


function removeItem(array, item) {
    let i = array.length;

    while (i--) {
        if (array[i] === item) {
            array.splice(i, 1);
        }
    }
}

async function download(url, location, fileName) {
    return new Promise(async (resolve) => {
        const downloader = new Downloader({
            url: url, //If the file name already exists, a new file with the name 200MB1.zip is created.
            directory: location, //This folder will be created if it doesn't exist.
            cloneFiles: false, fileName: fileName, maxAttempts: 50,
        });
        try {
            await downloader.download(); //Downloader.download() resolves with some useful properties.
            resolve(true);
        } catch (error) {
            //IMPORTANT: Handle a possible error. An error is thrown in case of network errors, or status codes of 400 and above.
            //Note that if the maxAttempts is set to higher than 1, the error is thrown only if all attempts fail.
            resolve(false);
        }

    });
}


async function validate(item, preCursor, algo='sha256') {
    let filePath = item.file || item.fileName;
    if (preCursor) {
        filePath = path.join(preCursor, filePath)
    }
    if (fs.existsSync(filePath)) {
        let actualFileHash = await getHash(filePath,algo);
        
        if (actualFileHash === item.hash || actualFileHash === item.sha1) {
            return 'pass';
        } else {
            return item;
        }
    } else {
        return item;
    }

}

async function bulkValidate(queue, preCursor) {
    return new Promise(async (resolve, reject) => {
        try {
            let concurrency = queue.length;
            const procQueue = await Promise.map(
                queue,
                (item, index) => validate(item, preCursor,'sha256', index),
                { concurrency: concurrency }
            );
            removeItem(procQueue, "pass");
            resolve(procQueue)

        } catch (e) {
            reject(e)
        }
    })
}

async function getHash(path, algo ='sha256') {
    try {
        const hash = crypto.createHash(algo);
        const rs = fs.createReadStream(path);
        for await (const chunk of rs) {
            hash.update(chunk);
        }
        return hash.digest('hex');
    } catch (error) {
        console.trace('Error while calculating hash:', error);
    }
}

module.exports = { validate, bulkValidate, download }