const fs = require("fs");
const path = require("node:path");
const { validate, bulkValidate } = require("../libs/fileValidator");


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

module.exports = { getPackIndex, getPackInfo, verifyModpackIntegrity }