const crypto = require("crypto");
const { query, rows } = require("../lib/_db");
const { send, cleanString, requireAdmin } = require("../lib/_utils");

function slug(s) {
  return String(s || "mon").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || crypto.randomUUID();
}

function cleanImageValue(v){
  const str = String(v || "").trim();
  if(!str) return "";
  if(str.startsWith("data:image/")){
    // 900KB ảnh nén ở client sẽ thành khoảng 1.2MB base64. Chặn dư thêm để tránh request/DB quá nặng.
    if(str.length > 900 * 1024) throw new Error("Ảnh quá lớn để lưu vào database. Vui lòng chọn ảnh khác hoặc ảnh nhỏ hơn");
    if(!/^data:image\/(webp|jpeg|jpg|png);base64,/i.test(str)) throw new Error("Định dạng ảnh không hỗ trợ");
    return str;
  }
  // Giữ tương thích dữ liệu cũ từng dùng link ảnh. Form mới không còn nhập URL nữa.
  return cleanString(str, 1000);
}

function mapMenu(r) {
  return {
    id:r.id, name:r.name, category:r.category, price:Number(r.price||0),
    originalPrice:Number(r.original_price||0), profit:Number(r.profit||0), popular:Number(r.popular||0),
    icon:r.icon, desc:r.description, imageUrl:r.image_url, available:r.available,
    imageFit:r.image_fit, imageZoom:r.image_zoom, imagePosX:r.image_pos_x, imagePosY:r.image_pos_y
  };
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
      if(!cleanString(b.name,120)) return send(res,400,{ok:false,error:"Thiếu tên món"});
      const id=cleanString(b.id||slug(b.name),120);
      const price=Number(b.price||0);
      const originalPrice=Number(b.originalPrice||0);
      const profit=price-originalPrice;
      await query(`INSERT INTO menu(id,name,category,price,original_price,profit,popular,icon,description,image_url,available,image_fit,image_zoom,image_pos_x,image_pos_y,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,price=EXCLUDED.price,original_price=EXCLUDED.original_price,profit=EXCLUDED.profit,popular=EXCLUDED.popular,icon=EXCLUDED.icon,description=EXCLUDED.description,image_url=EXCLUDED.image_url,available=EXCLUDED.available,image_fit=EXCLUDED.image_fit,image_zoom=EXCLUDED.image_zoom,image_pos_x=EXCLUDED.image_pos_x,image_pos_y=EXCLUDED.image_pos_y,updated_at=now()`,
      [id,cleanString(b.name,120),cleanString(b.category||"main",40),price,originalPrice,profit,Number(b.popular||0),cleanString(b.icon||"🍽️",20),cleanString(b.desc||b.description||"",500),cleanImageValue(b.imageUrl||b.imageData||""),b.available!==false&&b.available!=="false",cleanString(b.imageFit||"cover",20),Number(b.imageZoom||100),Number(b.imagePosX??50),Number(b.imagePosY??50)]);
      return send(res,200,{ok:true,id,hasImage:Boolean(cleanImageValue(b.imageUrl||b.imageData||"")),imageLength:String(b.imageUrl||b.imageData||"").length});
    }
    if(req.method==="DELETE"){
      if(!requireAdmin(req,res)) return;
      await query("DELETE FROM menu WHERE id=$1",[req.query.id]);
      return send(res,200,{ok:true});
    }
    send(res,405,{ok:false,error:"Method not allowed"});
  }catch(e){console.error(e);send(res,500,{ok:false,error:e.message});}
};
