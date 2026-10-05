const axios = require('axios')
const CF_SOURCE = "https://cf.polymc.org/api";
const CF_API = "https://api.curseforge.com/v1/"
const MR_API = "https://api.modrinth.com/v2/"
const C_RES_API = "https://resources.cauldronmc.com/"

let CF_KEY = undefined;


async function retrieveCfKey() {
    if (CF_KEY) {
        return CF_KEY;
    } else {
        let config = {
            method: 'get',
            url: CF_SOURCE
        };
        let response = await axios(config);

        CF_KEY = response.data.token;
        return CF_KEY;
    }
}

async function getCfData(url, payload, method = 'get') {
    let config = {
        method,
        url: `${CF_API}${url}`,
        data: payload,
        headers: {
            'x-api-key': await retrieveCfKey(),
            'Content-Type': 'application/json'
        },
    };
    try {
        let response = await axios(config);
        return response.data;
    } catch (e) {
        return false;
    }
}

async function getMrData(url, payload, method = 'get') {
    let config = {
        method,
        url: `${MR_API}${url}`,
        data: payload,
        headers: {
            'Content-Type': 'application/json'
        },
    };
    try {
        let response = await axios(config);
        return response.data;
    } catch (e) {
        //console.log(e)
        return false;
    }
}

async function getCData(url, payload, method = 'get') {
    let config = {
        method,
        url: `${C_RES_API}${url}`,
        data: payload,
        headers: {
            'Content-Type': 'application/json'
        },
    };
    try {
        let response = await axios(config);
        return response.data;
    } catch (e) {
        //console.log(e)
        return false;
    }
}


module.exports = {getCfData, getMrData, getCData}