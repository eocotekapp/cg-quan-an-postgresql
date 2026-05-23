const { query, rows } = require("./_db");
const { send, requireAdmin } = require("./_utils");
function n(v){ return Number(v||0)||0; }
function rng(r){ const end=new Date(), start=new Date(); const k=String(r||"day"); if(k==="week"||k==="7d") start.setDate(start.getDate()-6); else if(k==="month") start.setDate(1); else if(k==="year"){start.setMonth(0);start.setDate(1);} else start.setHours(0,0,0,0); return {start,end,k};}
function arr(v){ if(Array.isArray(v)) return v; try{return JSON.parse(v||"[]")}catch{return []}}
function qty(i){return n(i.qty??i.quantity??i.count??1)||1}
function price(i){return n(i.price??i.sellPrice??i.salePrice??0)}
function cost(i){return n(i.originalPrice??i.original_price??i.cost??i.capital??0)}
module.exports=async function handler(req,res){
  try{
    if(!requireAdmin(req,res)) return;
    const r=rng(req.query.range||req.query.period||"day");
    const orderRes=await query(`SELECT * FROM orders WHERE COALESCE(created_at,updated_at,now()) >= $1 AND COALESCE(created_at,updated_at,now()) <= $2 ORDER BY COALESCE(created_at,updated_at,now()) ASC`,[r.start.toISOString(),r.end.toISOString()]).catch(()=>({rows:[]}));
    const bookingRes=await query(`SELECT * FROM bookings WHERE COALESCE(created_at,updated_at,now()) >= $1 AND COALESCE(created_at,updated_at,now()) <= $2`,[r.start.toISOString(),r.end.toISOString()]).catch(()=>({rows:[]}));
    const orders=rows(orderRes), bookings=rows(bookingRes);
    const completed=orders.filter(o=>["done","completed","complete","paid","success","finished"].includes(String(o.status||"").toLowerCase()));
    const cancelled=orders.filter(o=>["cancelled","canceled","cancel","deleted"].includes(String(o.status||"").toLowerCase()));
    let revenue=0,totalCost=0,productsSold=0; const top=new Map(), byDay=new Map(), byHour=new Map(), customers=new Set();
    for(const o of completed){
      const dte=new Date(o.created_at||o.updated_at||Date.now()); const day=dte.toISOString().slice(5,10); const hour=dte.getHours();
      const phone=String(o.phone||o.customer_phone||"").trim(); if(phone) customers.add(phone);
      let or=0, oc=0; const items=arr(o.items||o.menu_items||o.order_items);
      for(const it of items){ const q=qty(it), pr=price(it), co=cost(it); const lr=pr*q, lc=co*q; or+=lr; oc+=lc; productsSold+=q; const name=String(it.name||it.title||it.id||"Món"); const old=top.get(name)||{name,quantity:0,revenue:0,cost:0,profit:0}; old.quantity+=q; old.revenue+=lr; old.cost+=lc; old.profit=old.revenue-old.cost; top.set(name,old);}
      if(!or) or=n(o.total||o.amount||o.price);
      if(!oc) oc=n(o.cost||o.original_price||o.capital);
      revenue+=or; totalCost+=oc;
      const bd=byDay.get(day)||{label:day,revenue:0,cost:0,profit:0}; bd.revenue+=or; bd.cost+=oc; bd.profit=bd.revenue-bd.cost; byDay.set(day,bd);
      const bh=byHour.get(hour)||{hour,revenue:0,cost:0}; bh.revenue+=or; bh.cost+=oc; byHour.set(hour,bh);
    }
    send(res,200,{ok:true,range:r.k,summary:{revenue,cost:totalCost,profit:revenue-totalCost,completedOrders:completed.length,totalOrders:orders.length+bookings.length,shipOrders:orders.length,tableOrders:bookings.length,cancelledOrders:cancelled.length,productsSold,customersWithPhone:customers.size,avgOrder:completed.length?revenue/completed.length:0},series:[...byDay.values()],hourly:[...byHour.values()].sort((a,b)=>a.hour-b.hour),topItems:[...top.values()].sort((a,b)=>b.revenue-a.revenue)});
  }catch(e){console.error("analytics error",e);send(res,500,{ok:false,error:e.message});}
};
