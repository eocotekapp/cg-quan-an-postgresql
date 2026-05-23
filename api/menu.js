const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { query, rows } = require("./_db");
const { send, cleanString, requireAdmin } = require("./_utils");

function normalizeUploadPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.pathname.startsWith("/uploads/")) return u.pathname;
    } catch (_) {}
  }
  if (raw.startsWith("/uploads/")) return raw;
  return raw;
}


function parseMoneyVN(value) {
  if (typeof value === "number") return value;
  const raw = String(value || "").replace(/[^\d]/g, "");
  return Number(raw || 0);
}


const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

function slug(s) {
  return String(s || "mon")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"") || crypto.randomUUID();
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
    imageUrl:r.image_url,
    available:r.available,
    imageFit:r.image_fit,
    imageZoom:r.image_zoom,
    imagePosX:r.image_pos_x,
    imagePosY:r.image_pos_y
  };
}

function getUploadFilename(imageUrl){
  if(!imageUrl || typeof imageUrl !== "string") return "";
  const marker = "/uploads/";
  const idx = imageUrl.indexOf(marker);
  if(idx === -1) return "";

  const filename = decodeURIComponent(
    imageUrl.slice(idx + marker.length).split("?")[0].split("#")[0]
  ).trim();

  if(!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return "";
  return filename;
}

function deleteUploadedImage(imageUrl){
  const filename = getUploadFilename(imageUrl);
  if(!filename) {
    if(imageUrl) console.log("Bỏ qua xoá ảnh không thuộc /uploads/:", imageUrl);
    return false;
  }

  const filePath = path.join(UPLOAD_DIR, filename);
  try{
    if(fs.existsSync(filePath)){
      fs.unlinkSync(filePath);
      console.log("Đã xoá ảnh cũ:", filename);
      return true;
    }
    console.log("Ảnh cũ không tồn tại trong uploads:", filename);
  }catch(e){
    console.warn("Không xoá được ảnh cũ:", filename, e.message);
  }
  return false;
}

async function getOldImageById(id){
  if(!id) return "";
  const result = await query("SELECT image_url FROM menu WHERE id=$1 LIMIT 1", [String(id)]);
  return rows(result)?.[0]?.image_url || "";
}

module.exports = async function handler(req,res){
  try{
    if(req.method==="GET"){
      if(req.query.admin==="1" && !requireAdmin(req,res)) return;
      const result=await query("SELECT * FROM menu ORDER BY popular DESC, name ASC");
      return send(res,200,{ok:true,items:rows(result).map(mapMenu)});
    }

    if(req.method==="POST"){
      if(!requireAdmin(req,res)) return;
      const b=req.body||{};
  if (b.image_url !== undefined) b.image_url = normalizeUploadPath(b.image_url);
  if (b.imageUrl !== undefined) b.imageUrl = normalizeUploadPath(b.imageUrl);
      if(!cleanString(b.name,120)) return send(res,400,{ok:false,error:"Thiếu tên món"});

      const id=cleanString(b.id||slug(b.name),120);
      const oldImageUrl = await getOldImageById(id);

      const price=parseMoneyVN(b.price);
      const originalPrice=parseMoneyVN(b.originalPrice);
      const profit=price-originalPrice;
      const newImageUrl=cleanString(b.imageUrl||"",1000);

      await query(`INSERT INTO menu(id,name,category,price,original_price,profit,popular,icon,description,image_url,available,image_fit,image_zoom,image_pos_x,image_pos_y,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,price=EXCLUDED.price,original_price=EXCLUDED.original_price,profit=EXCLUDED.profit,popular=EXCLUDED.popular,icon=EXCLUDED.icon,description=EXCLUDED.description,image_url=EXCLUDED.image_url,available=EXCLUDED.available,image_fit=EXCLUDED.image_fit,image_zoom=EXCLUDED.image_zoom,image_pos_x=EXCLUDED.image_pos_x,updated_at=now()`,
      [id,cleanString(b.name,120),cleanString(b.category||"main",40),price,originalPrice,profit,Number(b.popular||0),cleanString(b.icon||"🍽️",20),cleanString(b.desc||b.description||"",500),newImageUrl,b.available!==false&&b.available!=="false",cleanString(b.imageFit||"cover",20),Number(b.imageZoom||100),Number(b.imagePosX??50),Number(b.imagePosY??50)]);

      if(oldImageUrl && newImageUrl && oldImageUrl !== newImageUrl){
        deleteUploadedImage(oldImageUrl);
      }

      return send(res,200,{ok:true,id});
    }

    if(req.method==="DELETE"){
      if(!requireAdmin(req,res)) return;
      const id=cleanString(req.query.id||req.body?.id||"",120);
      if(!id) return send(res,400,{ok:false,error:"Thiếu id món"});

      const oldImageUrl = await getOldImageById(id);
      await query("DELETE FROM menu WHERE id=$1",[id]);

      if(oldImageUrl){
        deleteUploadedImage(oldImageUrl);
      }

      return send(res,200,{ok:true});
    }

    send(res,405,{ok:false,error:"Method not allowed"});
  }catch(e){
    console.error(e);
    send(res,500,{ok:false,error:e.message});
  }
};
