const crypto = require("crypto");

async function encryptAES(data, encryptionKey, nonce) {

    if (nonce.length !== 12) {

        throw new Error("Nonce must be exactly 12 characters");

    }

    const key = Buffer.from(encryptionKey, "base64");

    if (key.length !== 32) {

        throw new Error("Invalid Encryption Key");

    }

    const cipher = crypto.createCipheriv(

        "aes-256-gcm",

        key,

        Buffer.from(nonce)

    );

    const encrypted = Buffer.concat([

        cipher.update(data, "utf8"),

        cipher.final()

    ]);

    const tag = cipher.getAuthTag();

    return Buffer.concat([

        encrypted,

        tag

    ]).toString("base64");

}

module.exports = {

    encryptAES

};