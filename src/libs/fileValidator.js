const Promise = require("bluebird");
const path = require('path')
const crypto = require('crypto');
const fs = require('fs');

function removeItem(array, item) {
    let i = array.length;

    while (i--) {
        if (array[i] === item) {
            array.splice(i, 1);
        }
    }
}

async function validate(item, preCursor) {
    let filePath = item.file;
    if (preCursor) {
        filePath = path.join(preCursor, filePath)
    }
    let actualFileHash = await getHash(filePath);

    if (actualFileHash === item.hash) {
        return 'pass';
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
                (item, index) => validate(item, preCursor, index),
                { concurrency: concurrency }
            );
            removeItem(procQueue, "pass");
            resolve(procQueue)

        } catch (e) {
            reject(e)
        }
    })
}

async function getHash(path) {
  try {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(path);
    for await (const chunk of rs) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  } catch (error) {
    console.error('Error while calculating hash:', error);
  }
}

module.exports = { validate, bulkValidate }