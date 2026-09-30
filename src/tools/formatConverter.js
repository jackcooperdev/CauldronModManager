function convertModrinthURLtoIDS(obj) {
    const url = obj.downloads[0];
    const match = url.match(/\/data\/([^/]+)\/versions\/([^/]+)\//);

    if (match) {
        obj.projectId = match[1]; // "3xf3eGxN"
        obj.fileId = match[2]; // "PeYaLZ5O"
    }

    return obj;
}

module.exports = { convertModrinthURLtoIDS }