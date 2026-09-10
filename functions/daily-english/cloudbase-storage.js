"use strict";

const cloudbase = require("@cloudbase/node-sdk");

const ENV_ID = process.env.CLOUDBASE_ENV_ID || "family-wall-ipad-v2-d2bg1e621aa0";
const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV });

async function uploadObject(objectName, body, contentType) {
  const result = await app.uploadFile({
    cloudPath: objectName,
    fileContent: body,
  });
  return { ...result, contentType };
}

module.exports = { ENV_ID, uploadObject };
