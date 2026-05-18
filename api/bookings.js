const { query, rows } = require("./_db");
const { send, requireAdmin, makeCode } = require("./_utils");
const { buildLockWindow, overlaps } = require("./_bookingTime");
const { sendTelegram, escapeHtml } = require("./_telegram");

function cleanItems(items){return(Array.isArray(items)?items:[]).map(x=>({id:String(x.id||""),name:String(x.name||"Món"),price:Number(x.price||0),qty:Math.max(1,Number(x.qty||1))})).filter(x=>x.name);}
function mapBooking(r){return{id:r.id,bookingCode:r.booking_code,name:r.name,phone:r.phone,date:r.date,time:r.time,guests:Number(r.guests||1),table:r.table_id,note:r.note,status:r.status,preorderItems:r.preorder_items||[],preorderSubtotal:Number(r.preorder_subtotal||0),lockStart:r.lock_start,lockEnd:r.lock_end,lockStartMs:Number(r.lock_start_ms||0),lockEndMs:Number(r.lock_end_ms||0),lockStartText:r.lock_start_text,lockEndText:r.lock_end_text,sessionId:r.session_id,sessionCode:r.session_code,paidTotal:Number(r.paid_total||0),closedAtText:r.closed_at_text,createdAt:r.created_at,updatedAt:r.updated_at};}
async function hasConflict(table,date,time){const target=buildLockWindow(date,time); if(!target)return false; const b=await query("SELECT lock_start_ms,lock_end_ms FROM bookings WHERE table_id=$1 AND date=$2 AND status='confirmed'",[table,date]); for(const x of rows(b)) if(overlaps(target.lockStartMs,target.lockEndMs,x.lock_start_ms,x.lock_end_ms)) return true; const s=await query("SELECT lock_start_ms,lock_end_ms FROM table_sessions WHERE status='open' AND tables @> $1::jsonb",[JSON.stringify([table])]); for(const x of rows(s)) if(overlaps(target.lockStartMs,target.lockEndMs,x.lock_start_ms,x.lock_end_ms)) return true; return false;}

module.exports=async function handler(req,res){
 try{
  if(req.method==="GET"){ if(!requireAdmin(req,res)) return; const r=await query("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 300"); return send(res,200,{ok:true,items:rows(r).map(mapBooking)});}
  if(req.method==="POST"){ const b=req.body||{}, table=String(b.table||"").toUpperCase().trim(); if(!b.name||!b.phone||!b.date||!b.time||!table) return send(res,400,{ok:false,error:"Thiếu thông tin đặt bàn"}); if(await hasConflict(table,b.date,b.time)) return send(res,409,{ok:false,error:"Bàn này đã được đặt trong khung giờ gần nhất"}); const items=cleanItems(b.preorderItems||b.items||[]), subtotal=items.reduce((s,x)=>s+x.price*x.qty,0), code=makeCode("TB"); const r=await query(`INSERT INTO bookings(booking_code,name,phone,date,time,guests,table_id,note,status,preorder_items,preorder_subtotal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'new',$9,$10) RETURNING id`,[code,b.name,b.phone,b.date,b.time,Number(b.guests||1),table,b.note||"",JSON.stringify(items),subtotal]); await sendTelegram(`🔔 <b>ĐẶT BÀN MỚI</b>\nMã: <b>${escapeHtml(code)}</b>\nKhách: <b>${escapeHtml(b.name)}</b>\nBàn: <b>${escapeHtml(table)}</b>\nNgày giờ: <b>${escapeHtml(b.date)} ${escapeHtml(b.time)}</b>`); return send(res,200,{ok:true,id:rows(r)[0].id,bookingCode:code});}
  if(req.method==="DELETE"){ if(!requireAdmin(req,res)) return; await query("DELETE FROM bookings WHERE id=$1",[req.query.id]); return send(res,200,{ok:true});}
  send(res,405,{ok:false,error:"Method not allowed"});
 }catch(e){console.error(e);send(res,500,{ok:false,error:e.message});}
};
module.exports.hasConflict=hasConflict;
