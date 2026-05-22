const crypto = require("crypto");
const { query, rows } = require("../lib/_db");
const { send, cleanString, requireAdmin } = require("../lib/_utils");

function slug(s) {
  return String(s || "mon")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || crypto.randomUUID();
}

async function ensureMenuImagesTable(){
  // Giữ lại để các bản deploy cũ đang dùng /api/menu?image=... vẫn đọc được.
  await query(`CREATE TABLE IF NOT EXISTS menu_images(
    menu_id TEXT PRIMARY KEY,
    mime TEXT NOT NULL DEFAULT 'image/webp',
    data TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
  )`);
}

function parseDataImage(v){
  const str = String(v || "").trim();
  if(!str || !str.startsWith("data:image/")) return null;
  // Đây là độ dài chuỗi data URL sau khi đã nén ở trình duyệt.
  // 900KB file ảnh khi đổi sang base64 thường thành khoảng 1.2MB chuỗi.
  if(str.length > 2.6 * 1024 * 1024){
    throw new Error("Ảnh quá lớn để gửi/lưu. Hãy chọn ảnh nhỏ hơn hoặc cắt ảnh rồi thử lại");
  }
  const m = str.match(/^data:(image\/(webp|jpeg|jpg|png));base64,([A-Za-z0-9+/=]+)$/i);
  if(!m) throw new Error("Định dạng ảnh không hỗ trợ");
  const mime = m[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const base64 = m[3];
  const bytes = Buffer.byteLength(base64, "base64");
  if(bytes > 900 * 1024){
    throw new Error("Ảnh sau nén vẫn vượt 900KB. Hãy chọn ảnh khác hoặc giảm kích thước ảnh");
  }
  return { mime, base64, dataUrl: `data:${mime};base64,${base64}`, bytes };
}

function isSavedImageEndpoint(v){
  const str = String(v || "").trim();
  return str.startsWith("/api/menu?image=") || str.startsWith("api/menu?image=");
}

function cleanLegacyImageValue(v){
  const str = String(v || "").trim();
  if(!str) return "";
  // Không còn dùng ô URL cho ảnh mới, nhưng giữ tương thích dữ liệu cũ.
  if(str.startsWith("data:image/")) return parseDataImage(str).dataUrl;
  if(isSavedImageEndpoint(str)) return str;
  if(/^https?:\/\//i.test(str)) return cleanString(str, 1000);
  return "";
}

function mapMenu(r) {
  return {
    id:r.id,
    name:r.name,
    category:r.category,
    price:Number(r.price||0),
    originalPrice:Number(r.original_price||0),
    profit:Number(r.profit||0),
    popular:Number(r.popular||0),
    icon:r.icon,
    desc:r.description,
    imageUrl:r.image_url || "",
    available:r.available,
    imageFit:r.image_fit,
    imageZoom:r.image_zoom,
    imagePosX:r.image_pos_x,
    imagePosY:r.image_pos_y
  };
}

module.exports = async function handler(req,res){
  try{
    // Endpoint cũ để không làm mất ảnh đã lưu bởi các bản trước.
    if(req.method === "GET" && req.query.image){
      await ensureMenuImagesTable();
      const id = cleanString(req.query.image, 120);
      const result = await query("SELECT mime,data,updated_at FROM menu_images WHERE menu_id=$1", [id]);
      const img = rows(result)[0];
      if(!img || !img.data) return send(res,404,{ok:false,error:"Không tìm thấy ảnh"});
      const buf = Buffer.from(String(img.data), "base64");
      res.statusCode = 200;
      res.setHeader("Content-Type", img.mime || "image/webp");
      res.setHeader("Cache-Control", "no-store");
      return res.end(buf);
    }

    if(req.method === "GET"){
      if(req.query.admin === "1" && !requireAdmin(req,res)) return;
      const result = await query("SELECT * FROM menu ORDER BY popular DESC, name ASC");
      return send(res,200,{ok:true,items:rows(result).map(mapMenu)});
    }

    if(req.method === "POST"){
      if(!requireAdmin(req,res)) return;
      const b = req.body || {};
      if(!cleanString(b.name,120)) return send(res,400,{ok:false,error:"Thiếu tên món"});

      const id = cleanString(b.id || slug(b.name), 120);
      const price = Number(b.price || 0);
      const originalPrice = Number(b.originalPrice || 0);
      const profit = price - originalPrice;

      // Ưu tiên ảnh mới upload. Không để imageUrl cũ/URL cũ đè lên imageData.
      const incomingImage = String(b.imageData || b.imageUrl || "").trim();
      const dataImage = parseDataImage(incomingImage);
      const finalImageUrl = dataImage ? dataImage.dataUrl : cleanLegacyImageValue(incomingImage);

      await query(`INSERT INTO menu(id,name,category,price,original_price,profit,popular,icon,description,image_url,available,image_fit,image_zoom,image_pos_x,image_pos_y,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,price=EXCLUDED.price,original_price=EXCLUDED.original_price,profit=EXCLUDED.profit,popular=EXCLUDED.popular,icon=EXCLUDED.icon,description=EXCLUDED.description,image_url=EXCLUDED.image_url,available=EXCLUDED.available,image_fit=EXCLUDED.image_fit,image_zoom=EXCLUDED.image_zoom,image_pos_x=EXCLUDED.image_pos_x,image_pos_y=EXCLUDED.image_pos_y,updated_at=now()`,
      [
        id,
        cleanString(b.name,120),
        cleanString(b.category || "main",40),
        price,
        originalPrice,
        profit,
        Number(b.popular || 0),
        cleanString(b.icon || "🍽️",20),
        cleanString(b.desc || b.description || "",500),
        finalImageUrl,
        b.available !== false && b.available !== "false",
        cleanString(b.imageFit || "cover",20),
        Number(b.imageZoom || 100),
        Number(b.imagePosX ?? 50),
        Number(b.imagePosY ?? 50)
      ]);

      // Khi ảnh mới lưu dạng data URL trực tiếp vào menu.image_url thì xoá bản ảnh endpoint cũ để tránh nhầm.
      if(dataImage){
        await ensureMenuImagesTable();
        await query("DELETE FROM menu_images WHERE menu_id=$1", [id]);
      }else if(!incomingImage){
        await ensureMenuImagesTable();
        await query("DELETE FROM menu_images WHERE menu_id=$1", [id]);
      }

      const verify = await query("SELECT image_url FROM menu WHERE id=$1", [id]);
      const saved = rows(verify)[0]?.image_url || "";
      const imageSaved = dataImage ? saved.startsWith("data:image/") && saved.length > 100 : Boolean(saved);
      return send(res,200,{ok:true,id,hasImage:Boolean(saved),imageSaved,imageUrl:saved,imageMode:dataImage ? "database-data-url" : (saved ? "legacy" : "none"),imageBytes:dataImage?.bytes || 0});
    }

    if(req.method === "DELETE"){
      if(!requireAdmin(req,res)) return;
      await query("DELETE FROM menu WHERE id=$1", [req.query.id]);
      await ensureMenuImagesTable();
      await query("DELETE FROM menu_images WHERE menu_id=$1", [req.query.id]);
      return send(res,200,{ok:true});
    }

    send(res,405,{ok:false,error:"Method not allowed"});
  }catch(e){
    console.error(e);
    send(res,500,{ok:false,error:e.message});
  }
};
