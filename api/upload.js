const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { send, requireAdmin } = require("./_utils");

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024);

// Android/Termux nên set UPLOAD_DIR=/storage/emulated/0/android-server/uploads
// Nếu không set, mặc định lưu vào thư mục uploads cạnh code server hiện tại.
function getUploadDir() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

function getPublicBase(req) {
  const envBase = process.env.PUBLIC_UPLOAD_BASE || process.env.PUBLIC_API_BASE || "";
  if (envBase) return String(envBase).replace(/\/$/, "");

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return host ? `${proto}://${host}` : "";
}

function safeExt(filename, contentType) {
  const byName = String(filename || "").toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/);
  if (byName) return byName[1] === "jpeg" ? "jpg" : byName[1];

  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  return map[String(contentType || "").toLowerCase()] || "";
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error("Ảnh quá lớn. Tối đa " + Math.round(MAX_BYTES / 1024 / 1024) + "MB"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, boundary) {
  const boundaryBuffer = Buffer.from("--" + boundary);
  const headerBreak = Buffer.from("\r\n\r\n");
  const parts = [];

  let start = buffer.indexOf(boundaryBuffer);
  while (start !== -1) {
    start += boundaryBuffer.length;

    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const headerEnd = buffer.indexOf(headerBreak, start);
    if (headerEnd === -1) break;

    const headerText = buffer.slice(start, headerEnd).toString("utf8");
    const dataStart = headerEnd + headerBreak.length;
    const next = buffer.indexOf(boundaryBuffer, dataStart);
    if (next === -1) break;

    let dataEnd = next;
    if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2;

    const name = (headerText.match(/name="([^"]+)"/i) || [])[1] || "";
    const filename = (headerText.match(/filename="([^"]*)"/i) || [])[1] || "";
    const contentType = (headerText.match(/content-type:\s*([^\r\n]+)/i) || [])[1] || "";

    parts.push({
      name,
      filename,
      contentType,
      data: buffer.slice(dataStart, dataEnd)
    });

    start = next;
  }

  return parts;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { ok:false, error:"Method not allowed" });
    if (!requireAdmin(req, res)) return;

    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = boundaryMatch && (boundaryMatch[1] || boundaryMatch[2]);
    if (!boundary) return send(res, 400, { ok:false, error:"Thiếu multipart boundary" });

    const raw = await readRawBody(req);
    const parts = parseMultipart(raw, boundary);
    const file = parts.find(p => p.name === "image" || p.filename);

    if (!file || !file.data || !file.data.length) {
      return send(res, 400, { ok:false, error:"Thiếu file ảnh" });
    }

    if (!String(file.contentType || "").toLowerCase().startsWith("image/")) {
      return send(res, 400, { ok:false, error:"File không phải ảnh" });
    }

    const ext = safeExt(file.filename, file.contentType);
    if (!ext) return send(res, 400, { ok:false, error:"Chỉ hỗ trợ JPG, PNG, WEBP, GIF" });

    const uploadDir = getUploadDir();
    fs.mkdirSync(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, file.data);

    const relativeUrl = `/uploads/${filename}`;
    const base = getPublicBase(req);
    const url = base ? `${base}${relativeUrl}` : relativeUrl;

    return send(res, 200, {
      ok: true,
      url,
      relativeUrl,
      filename,
      size: file.data.length,
      uploadDir
    });
  } catch (e) {
    console.error(e);
    return send(res, 500, { ok:false, error:e.message || "Upload ảnh lỗi" });
  }
};
