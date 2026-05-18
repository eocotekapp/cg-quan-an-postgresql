const { query, rows, row } = require("./_db");
const { send, requireAdmin, money, makeCode } = require("./_utils");
const { sendTelegram, escapeHtml } = require("./_telegram");

function mapOrder(r){return{ id:r.id,orderCode:r.order_code,type:r.type,customer:r.customer||{},items:r.items||[],subtotal:Number(r.subtotal||0),discount:Number(r.discount||0),shippingFee:Number(r.shipping_fee||0),total:Number(r.total||0),status:r.status,createdAt:r.created_at,updatedAt:r.updated_at};}
function cleanItems(items){return(Array.isArray(items)?items:[]).map(x=>({id:String(x.id||""),name:String(x.name||"Món"),price:Number(x.price||0),qty:Math.max(1,Number(x.qty||1))})).filter(x=>x.name);}

module.exports=async function handler(req,res){
 try{
  if(req.method==="GET"){ if(!requireAdmin(req,res)) return; const r=await query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 300"); return send(res,200,{ok:true,items:rows(r).map(mapOrder)});}
  if(req.method==="POST"){
    const b=req.body||{}, customer=b.customer||{}, items=cleanItems(b.items);
    if(!customer.name||!customer.phone||!customer.address) return send(res,400,{ok:false,error:"Thiếu thông tin khách hàng"});
    if(!items.length) return send(res,400,{ok:false,error:"Giỏ hàng trống"});
    const subtotal=items.reduce((s,x)=>s+x.price*x.qty,0);
    const discount=String(b.coupon||"").toUpperCase()==="QUAN10"?Math.round(subtotal*.1):0;
    const settings=row(await query("SELECT shipping_fee,free_ship_from FROM settings WHERE id='main'"))||{};
    const shippingFee=subtotal>=Number(settings.free_ship_from||0)&&Number(settings.free_ship_from||0)>0?0:Number(settings.shipping_fee||0);
    const total=subtotal-discount+shippingFee, code=makeCode("OD");
    const r=await query(`INSERT INTO orders(order_code,type,customer,items,subtotal,discount,shipping_fee,total,status) VALUES($1,'ship',$2,$3,$4,$5,$6,$7,'new') RETURNING id`,[code,customer,JSON.stringify(items),subtotal,discount,shippingFee,total]);
    await sendTelegram(`🔔 <b>ĐƠN SHIP MỚI</b>\nMã: <b>${escapeHtml(code)}</b>\nKhách: <b>${escapeHtml(customer.name)}</b>\n${items.map(i=>`• ${escapeHtml(i.name)} x${i.qty} - ${money(i.price*i.qty)}`).join("\n")}\n\nTổng: <b>${money(total)}</b>`);
    return send(res,200,{ok:true,id:rows(r)[0].id,orderCode:code});
  }
  if(req.method==="PUT"){ if(!requireAdmin(req,res)) return; const b=req.body||{}; await query("UPDATE orders SET shipping_fee=$2,total=subtotal-discount+$2,updated_at=now() WHERE id=$1",[b.id,Number(b.shippingFee||0)]); return send(res,200,{ok:true});}
  if(req.method==="DELETE"){ if(!requireAdmin(req,res)) return; await query("DELETE FROM orders WHERE id=$1",[req.query.id]); return send(res,200,{ok:true});}
  send(res,405,{ok:false,error:"Method not allowed"});
 }catch(e){console.error(e);send(res,500,{ok:false,error:e.message});}
};
