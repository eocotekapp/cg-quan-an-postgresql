const { query, row } = require("./_db");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end("Method not allowed");
      return;
    }
    const id = String(req.query?.id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      res.statusCode = 400;
      res.end("Bad image id");
      return;
    }
    const found = row(await query("SELECT mime_type, data FROM menu_images WHERE id=$1", [id]));
    if (!found) {
      res.statusCode = 404;
      res.end("Image not found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", found.mime_type || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(found.data);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end("Image error");
  }
};
