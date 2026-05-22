const { query, rows, row } = require("../lib/_db");
const { send, requireAdmin, money, makeCode } = require("../lib/_utils");
const { sendTelegram, escapeHtml } = require("../lib/_telegram");
function cleanItems(items){return(Array.isArray(items)?items:[]).map(x=>({id:String(x.id||""),name:String(x.name||"Món"),price:Number(x.price||0),qty:Math.max(1,Number(x.qty||1))})).filter(x=>x.name);}
function calc(calls=[]){const map=new Map();let preorderTotal=0,extraTotal=0;for(const call of calls||[])for(const it of call.items||[]){const key=it.id||it.name,old=map.get(key)||{id:it.id||"",name:it.name,price:Number(it.price||0),qty:0};old.qty+=Number(it.qty||1);map.set(key,old);const a=Number(it.price||0)*Number(it.qty||1);if(call.source==="preorder")preorderTotal+=a;else extraTotal+=a;}return{items:[...map.values()],preorderTotal,extraTotal,total:preorderTotal+extraTotal};}
function map(r){const t=calc(r.calls||[]);return{id:r.id,sessionCode:r.session_code,bookingId:r.booking_id,customerName:r.customer_name,phone:r.phone,guests:Number(r.guests||1),tables:r.tables||[],mainTable:r.main_table,table:r.table_id,status:r.status,source:r.source,calls:r.calls||[],note:r.note,arrivalClock:r.arrival_clock,lockStartText:r.lock_start_text,lockEndText:r.lock_end_text,openedAtText:r.opened_at_text,closedAtText:r.closed_at_text,summaryItems:t.items,total:t.total,preorderTotal:t.preorderTotal,extraTotal:t.extraTotal};}
module.exports=async function handler(req,res){try{
 if(req.method==="GET"){
   if(!requireAdmin(req,res))return;
   const r=await query("SELECT * FROM table_sessions ORDER BY created_at DESC LIMIT 250");
   return send(res,200,{ok:true,items:rows(r).map(map)});
 }
 if(req.method!=="POST")return send(res,405,{ok:false,error:"Method not allowed"});
 const b=req.body||{},action=String(b.action||"");
 if(action==="addItems"){
   const items=cleanItems(b.items);
   if(!items.length)return send(res,400,{ok:false,error:"Thiếu món gọi thêm"});
   let s=b.sessionId?row(await query("SELECT * FROM table_sessions WHERE id=$1",[b.sessionId])):null;
   if(!s&&b.table)s=row(await query("SELECT * FROM table_sessions WHERE status='open' AND tables @> $1::jsonb LIMIT 1",[JSON.stringify([String(b.table).toUpperCase().trim()])]));
   if(!s)return send(res,404,{ok:false,error:"Không tìm thấy phiên bàn đang mở"});
   if(s.status!=="open")return send(res,409,{ok:false,error:"Phiên bàn đã đóng"});
   const call={callCode:makeCode("GM"),table:b.table||s.main_table,source:"extra",items,note:b.note||"Món gọi thêm",createdAtText:new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})};
   const calls=[...(s.calls||[]),call],tot=calc(calls);
   await query("UPDATE table_sessions SET calls=$2,total=$3,preorder_total=$4,extra_total=$5,updated_at=now() WHERE id=$1",[s.id,JSON.stringify(calls),tot.total,tot.preorderTotal,tot.extraTotal]);
   await sendTelegram(`🛒 <b>GỌI THÊM MÓN TẠI BÀN</b>\n\nBàn: <b>${escapeHtml((s.tables || [b.table || s.main_table]).join("+"))}</b>\nPhiên: <b>${escapeHtml(s.session_code || s.id)}</b>\n${items.map(i => `• ${escapeHtml(i.name)} x${i.qty} - ${money(Number(i.price || 0) * Number(i.qty || 1))}`).join("\n")}\n\nTạm tính phiên: <b>${money(tot.total)}</b>`);
   return send(res,200,{ok:true,sessionCode:s.session_code,total:tot.total});
 }
 if(!requireAdmin(req,res))return;
 if(action==="open"){
   const table=String(b.table||"").toUpperCase().trim();
   const code=makeCode("PB");
   const r=await query("INSERT INTO table_sessions(session_code,customer_name,phone,guests,tables,main_table,table_id,status,source,calls,note,opened_at_text) VALUES($1,$2,$3,$4,$5,$6,$6,'open','walk-in','[]',$7,$8) RETURNING id",[code,b.customerName||"Khách tại bàn",b.phone||"",Number(b.guests||1),JSON.stringify([table]),table,b.note||"",new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})]);
   await sendTelegram(`🍽 <b>MỞ PHIÊN BÀN</b>\n\nBàn: <b>${escapeHtml(table)}</b>\nPhiên: <b>${escapeHtml(code)}</b>`);
   return send(res,200,{ok:true,id:rows(r)[0].id,sessionCode:code});
 }
 const s=row(await query("SELECT * FROM table_sessions WHERE id=$1",[b.id]));
 if(!s)return send(res,404,{ok:false,error:"Không tìm thấy phiên bàn"});
 if(s.status!=="open")return send(res,409,{ok:false,error:"Phiên bàn đã đóng"});
 if(action==="close"){
   const tot=calc(s.calls||[]),closed=new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});
   await query("UPDATE table_sessions SET status='closed',total=$2,preorder_total=$3,extra_total=$4,closed_at_text=$5,updated_at=now() WHERE id=$1",[s.id,tot.total,tot.preorderTotal,tot.extraTotal,closed]);
   if(s.booking_id)await query("UPDATE bookings SET status='done',paid_total=$2,closed_at_text=$3,updated_at=now() WHERE id=$1",[s.booking_id,tot.total,closed]);
   await query("INSERT INTO orders(order_code,type,customer,items,subtotal,discount,shipping_fee,total,status,table_session_id) VALUES($1,'table-session',$2,$3,$4,0,0,$4,'done',$5)",[s.session_code,{name:s.customer_name,phone:s.phone,address:`Tại bàn ${(s.tables||[]).join("+")}`,note:"Thanh toán phiên bàn"},JSON.stringify(tot.items),tot.total,s.id]);
   const arrival = s.arrival_clock || s.opened_at_text || "Mở phiên";
   await sendTelegram(`💰 <b>THANH TOÁN HOÀN THÀNH</b>\n\nBàn: <b>${escapeHtml((s.tables || []).join("+"))}</b>\nKhách: <b>${escapeHtml(s.customer_name || "Khách tại bàn")}</b>\nTổng tiền: <b>${money(tot.total)}</b>\nĐặt trước: <b>${money(tot.preorderTotal)}</b>\nGọi thêm: <b>${money(tot.extraTotal)}</b>\nThời gian ăn: ${escapeHtml(arrival)} → ${escapeHtml(closed)}\n\n🧹 <b>DỌN BÀN ${(s.tables || []).join("+")}</b>`);
   return send(res,200,{ok:true,total:tot.total});
 }
 if(action==="move"){
   await query("UPDATE table_sessions SET tables=$2,main_table=$3,table_id=$3,updated_at=now() WHERE id=$1",[s.id,JSON.stringify([String(b.toTable||"").toUpperCase().trim()]),String(b.toTable||"").toUpperCase().trim()]);
   return send(res,200,{ok:true});
 }
 if(action==="merge"){
   const more=String(b.tables||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
   const merged=[...new Set([...(s.tables||[]),...more])];
   await query("UPDATE table_sessions SET tables=$2,updated_at=now() WHERE id=$1",[s.id,JSON.stringify(merged)]);
   return send(res,200,{ok:true});
 }
 send(res,400,{ok:false,error:"Action không hợp lệ"});
}catch(e){console.error(e);send(res,500,{ok:false,error:e.message});}};
