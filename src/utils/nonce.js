const crypto = require("crypto");

function generateNonce() {

    return crypto.randomBytes(12).toString("hex").substring(0,12);

}

module.exports = {

    generateNonce

};