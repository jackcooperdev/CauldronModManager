const os = require("os");
const path = require("path");
const fs = require("fs");

const osCurrent = os.platform();
const archCurrent = os.arch();
const homedir = os.homedir();

function grabPath() {
    const WORKING_DIR = ".cauldron";
    let pathReturn;

    if (!process.env.CAULDRON_PATH) {
        if (osCurrent === "win32") {
            pathReturn = path.join(homedir, "AppData", "Roaming", WORKING_DIR);
        } else if (osCurrent === "linux" || osCurrent === "darwin") {
            pathReturn = path.join(homedir, WORKING_DIR);
        }
    } else {
        pathReturn = path.resolve(process.env.CAULDRON_PATH);
    }

    fs.mkdirSync(pathReturn, { recursive: true });
    return pathReturn;
}

const osConvertStandard = {
    win32: "windows",
    linux: "linux",
    darwin: "osx"
};

function getOperatingSystem(isJVM) {
    const actualOS = osConvertStandard[osCurrent];

    if (!actualOS) {
        throw new Error("Unsupported Operating System");
    }

    if (!isJVM) {
        return actualOS;
    }

    if (actualOS === "linux") {
        return actualOS;
    }

    if (actualOS === "windows") {
        if (archCurrent === "x64") {
            return "windows-x64";
        } else if (archCurrent.includes("arm")) {
            return "windows-arm64";
        } else {
            return "windows-x86";
        }
    }

    if (actualOS === "osx") {
        return archCurrent.includes("arm") ? "mac-os-arm64" : "macos";
    }

    throw new Error("Unsupported OS/architecture combination");
}

module.exports =  { grabPath, getOperatingSystem };
