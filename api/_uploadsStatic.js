const fs = require("fs");
const path = require("path");

function getUploadDir() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

function serveUploads(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/uploads/")) return false;

    const name = decodeURIComponent(url.pathname.replace("/uploads/", ""));
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
      res.statusCode = 400;
      res.end("Bad upload path");
      return true;
    }

    const file = path.join(getUploadDir(), name);
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      res.end("Not found");
      return true;
    }

    const ext = path.extname(file).toLowerCase();
    const types = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif"
    };

    res.statusCode = 200;
    res.setHeader("Content-Type", types[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    fs.createReadStream(file).pipe(res);
    return true;
  } catch (e) {
    res.statusCode = 500;
    res.end(e.message || "Upload static error");
    return true;
  }
}

module.exports = { getUploadDir, serveUploads };
