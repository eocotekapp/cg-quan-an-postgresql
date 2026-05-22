const { query, transaction, row } = require("./_db");
const { send, requireAdmin, money, makeCode } = require("./_utils");
const { buildLockWindow } = require("./_bookingTime");
const { sendTelegram, escapeHtml } = require("./_telegram");
const allowed={orders:["new","processing","delivering","done","cancelled"],bookings:["new","confirmed","done","cancelled"]};

async function createSession(client,b){
  if(b.session_id) return { id:b.session_id, sessionCode:b.session_code || "", window:{ lockStartText:b.lock_start_text || "", lockEndText:b.lock_end_text || "" }, preorderSubtotal:Number(b.preorder_subtotal||0) };
  const w=buildLockWindow(b.date,b.time,120,120);
  const code=`TS-${b.table_id}-${String(b.date).replaceAll("-","")}-${String(b.time).replace(":","")}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  const preorder=b.preorder_items||[];
  const total=preorder.reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||1),0);
  const calls=preorder.length?[{callCode:makeCode("DT"),table:b.table_id,source:"preorder",items:preorder,note:"Món đặt trước",createdAtText:new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}]:[];
  const s=row(await client.query(`INSERT INTO table_sessions(session_code,booking_id,customer_name,phone,guests,tables,main_table,table_id,status,source,calls,note,arrival_clock,lock_start,lock_end,lock_start_ms,lock_end_ms,lock_start_text,lock_end_text,total,preorder_total,extra_total,opened_at_text) VALUES($1,$2,$3,$4,$5,$6,$7,$7,'open','booking',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,0,$18) RETURNING id`,[code,b.id,b.name,b.phone,b.guests,JSON.stringify([b.table_id]),b.table_id,JSON.stringify(calls),b.note||"",b.time,w.lockStart,w.lockEnd,w.lockStartMs,w.lockEndMs,w.lockStartText,w.lockEndText,total,new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})]));
  await client.query("UPDATE bookings SET session_id=$1,session_code=$2,lock_start=$3,lock_end=$4,lock_start_ms=$5,lock_end_ms=$6,lock_start_text=$7,lock_end_text=$8,updated_at=now() WHERE id=$9",[s.id,code,w.lockStart,w.lockEnd,w.lockStartMs,w.lockEndMs,w.lockStartText,w.lockEndText,b.id]);
  return { id:s.id, sessionCode:code, window:w, preorderSubtotal:total };
}

module.exports=async function handler(req,res){
 try{
  if(req.method!=="POST")return send(res,405,{ok:false,error:"Method not allowed"});
  if(!requireAdmin(req,res))return;
  const{type,id,status}=req.body||{};
  if(!allowed[type]||!allowed[type].includes(status)||!id)return send(res,400,{ok:false,error:"Trạng thái không hợp lệ"});
  if(type==="orders"){
    const old=row(await query("UPDATE orders SET status=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,status]));
    if(!old) return send(res,404,{ok:false,error:"Không tìm thấy đơn"});
    const customer=old.customer||{};
    const orderCode=old.order_code||id;
    if(status==="processing") await sendTelegram(`👨‍🍳 <b>ĐƠN SHIP ĐANG LÀM</b>\n\nKhách: <b>${escapeHtml(customer.name || "")}</b>\nMã đơn: <b>${escapeHtml(orderCode)}</b>`);
    if(status==="delivering") await sendTelegram(`🛵 <b>ĐƠN SHIP ĐANG GIAO</b>\n\nKhách: <b>${escapeHtml(customer.name || "")}</b>\nMã đơn: <b>${escapeHtml(orderCode)}</b>\nĐịa chỉ: ${escapeHtml(customer.address || "")}`);
    if(status==="done") await sendTelegram(`🚚 <b>SHIP HOÀN THÀNH</b>\n\nKhách: <b>${escapeHtml(customer.name || "")}</b>\nSĐT: <b>${escapeHtml(customer.phone || "")}</b>\nĐịa chỉ: ${escapeHtml(customer.address || "")}\n\nMã đơn: <b>${escapeHtml(orderCode)}</b>\nTổng tiền: <b>${money(old.total || 0)}</b>\n\n✅ Đã thanh toán hoàn tất`);
    if(status==="cancelled") await sendTelegram(`❌ <b>ĐƠN SHIP ĐÃ HỦY</b>\n\nKhách: <b>${escapeHtml(customer.name || "")}</b>\nMã đơn: <b>${escapeHtml(orderCode)}</b>`);
    return send(res,200,{ok:true});
  }
  let created=null;
  const booking=await transaction(async client=>{
    const b=row(await client.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE",[id]));
    if(!b)throw new Error("Không tìm thấy đơn đặt bàn");
    if(status==="confirmed"){
      const w=buildLockWindow(b.date,b.time);
      const c=await client.query("SELECT id FROM bookings WHERE id<>$1 AND table_id=$2 AND status='confirmed' AND lock_start_ms < $3 AND lock_end_ms > $4 LIMIT 1",[id,b.table_id,w.lockEndMs,w.lockStartMs]);
      if(c.rows.length)throw new Error("Bàn này đã được đặt trong khung giờ gần nhất");
    }
    await client.query("UPDATE bookings SET status=$2,updated_at=now() WHERE id=$1",[id,status]);
    if(status==="confirmed") created=await createSession(client,{...b,status:"confirmed"});
    return b;
  });
  if(status==="confirmed") await sendTelegram(`✅ <b>ĐÃ XÁC NHẬN ĐẶT BÀN</b>\n\nKhách: <b>${escapeHtml(booking.name || "")}</b>\nBàn: <b>${escapeHtml(booking.table_id || "")}</b>\nNgày: <b>${escapeHtml(booking.date || "")}</b>\nGiờ: <b>${escapeHtml(booking.time || "")}</b>\nKhóa bàn: <b>${escapeHtml(created?.window?.lockStartText || "")} → ${escapeHtml(created?.window?.lockEndText || "")}</b>\n\n🍽 Phiên bàn <b>${escapeHtml(created?.sessionCode || "")}</b> đã được tạo.${created?.preorderSubtotal ? `\nMón đặt trước: <b>${money(created.preorderSubtotal)}</b>` : ""}`);
  if(status==="cancelled") await sendTelegram(`❌ <b>ĐẶT BÀN ĐÃ HỦY</b>\n\nKhách: <b>${escapeHtml(booking.name || "")}</b>\nBàn: <b>${escapeHtml(booking.table_id || "")}</b>\n${escapeHtml(booking.date || "")} - ${escapeHtml(booking.time || "")}\n\nBàn đã mở lại.`);
  if(status==="done") await sendTelegram(`✅ <b>ĐẶT BÀN ĐÃ HOÀN THÀNH</b>\n\nKhách: <b>${escapeHtml(booking.name || "")}</b>\nBàn: <b>${escapeHtml(booking.table_id || "")}</b>\n${escapeHtml(booking.date || "")} - ${escapeHtml(booking.time || "")}`);
  return send(res,200,{ok:true});
 }catch(e){console.error(e);send(res,500,{ok:false,error:e.message});}
};
