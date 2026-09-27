const { getCfData, getMrData } = require("../libs/apiCommunication");

async function getBulkMods(format, payload) {
    switch (format) {
        case 'cf':
            let cfOut = await getCfData('mods', { modIds: payload, filterPcOnly: true }, 'post');
            return cfOut.data;
        case 'mr':
            let mrOut = await getMrData(`projects?ids=${JSON.stringify(payload)}`)
            return mrOut;
        case 'cf2':
            let cf2Out = await getCfData('mods/files', { fileIds: payload}, 'post');
            return cf2Out.data;
        default:
            console.log('droped to def')
            return false;
    }
}

module.exports = { getBulkMods }