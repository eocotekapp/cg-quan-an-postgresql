const crypto = require("crypto");
const { query, rows } = require("./_db");
const { send, cleanString, requireAdmin } = require("./_utils");

const MAX_IMAGE_BYTES = Number(process.env.MAX_MENU_IMAGE_BYTES || 2_500_000);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), buffer: Buffer.from(match[2], "base64") };
}

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS menu_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT DEFAULT '',
    mime_type TEXT NOT NULL,
    data BYTEA NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { ok:false, error:"Method not allowed" });
    if (!requireAdmin(req, res)) return;

    const body = req.body || {};
    const parsed = parseDataUrl(body.imageData || body.dataUrl || "");
    if (!parsed) return send(res, 400, { ok:false, error:"Thiếu dữ liệu ảnh" });
    if (!ALLOWED_MIME.has(parsed.mimeType)) return send(res, 400, { ok:false, error:"Định dạng ảnh chưa hỗ trợ" });
    if (!parsed.buffer.length) return send(res, 400, { ok:false, error:"Ảnh rỗng" });
    if (parsed.buffer.length > MAX_IMAGE_BYTES) return send(res, 413, { ok:false, error:`Ảnh quá lớn. Tối đa ${Math.round(MAX_IMAGE_BYTES/1024/1024)}MB sau khi nén.` });

    await ensureTable();
    const id = crypto.randomUUID();
    const filename = cleanString(body.filename || "menu-image.jpg", 180);
    await query(
      "INSERT INTO menu_images(id, filename, mime_type, data, size_bytes) VALUES($1,$2,$3,$4,$5)",
      [id, filename, parsed.mimeType, parsed.buffer, parsed.buffer.length]
    );
    return send(res, 200, { ok:true, id, imageUrl:`/api/image?id=${id}` });
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok:false, error:e.message });
  }
};
