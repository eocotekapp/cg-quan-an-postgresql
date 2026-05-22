const fs = require("fs");
const path = require("path");

module.exports = async function(req, res) {
  try {
    const imageUrl = String(req.body?.imageUrl || "").trim();
    if (!imageUrl) return res.status(400).json({ ok:false, error:"Thiếu imageUrl" });

    const marker = "/uploads/";
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return res.json({ ok:true, deleted:false, reason:"Không phải ảnh uploads" });

    const filename = decodeURIComponent(imageUrl.slice(idx + marker.length).split("?")[0].split("#")[0]).trim();
    if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return res.status(400).json({ ok:false, error:"Filename không hợp lệ" });
    }

    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.json({ ok:true, deleted:false, reason:"File không tồn tại", filename, uploadDir });
    }

    fs.unlinkSync(filePath);
    console.log("Đã xoá ảnh:", filename);
    return res.json({ ok:true, deleted:true, filename });
  } catch (e) {
    console.error("delete-upload error:", e);
    return res.status(500).json({ ok:false, error:e.message });
  }
};
