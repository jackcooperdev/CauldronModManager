const crypto = require("crypto");
const fs = require("fs");
const path = require("node:path");



async function handleOverrides(zip,zipFiles,MODPACK_PATH) {
    // Handle and Transfer overrides
    let indexTracker = [];
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

    return indexTracker;

}

module.exports = { handleOverrides }