"use strict";

const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "wall.html"), "utf8");

exports.main = async () => ({
  statusCode: 200,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": "inline",
  },
  body: html,
  isBase64Encoded: false,
});
