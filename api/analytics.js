const { query, rows } = require("./_db");
const { send, requireAdmin } = require("./_utils");

const num = v => Number(v || 0) || 0;
const norm = v => String(v || "").trim().toLowerCase();

function getRange(range){
  const end=new Date();
  const start=new Date();
  const key=String(range||"day");
  if(key==="week"||key==="7d"||key==="7days") start.setDate(start.getDate()-6);
  else if(key==="month"){ start.setDate(1); start.setHours(0,0,0,0); }
  else if(key==="year"){ start.setMonth(0); start.setDate(1); start.setHours(0,0,0,0); }
  else start.setHours(0,0,0,0);
  return {start,end,key};
}

function parseItems(v){
  if(Array.isArray(v)) return v;
  try{ const x=JSON.parse(v||"[]"); return Array.isArray(x)?x:[]; }catch{ return []; }
}
function qty(i){ return num(i.qty ?? i.quantity ?? i.count ?? 1) || 1; }
function sell(i){ return num(i.price ?? i.sellPrice ?? i.salePrice ?? i.unitPrice ?? 0); }
function costFromOrder(i){ return num(i.originalPrice ?? i.original_price ?? i.cost ?? i.capital ?? i.basePrice ?? 0); }
function nameOf(i){ return String(i.name || i.title || i.id || i.slug || "Món"); }
function keysOf(i){ return [i.id,i.slug,i.menuId,i.menu_id,i.name,i.title].map(norm).filter(Boolean); }

async function getMenuMap(){
  const r=await query("SELECT id,name,original_price,price FROM menu").catch(()=>({rows:[]}));
  const map=new Map();
  for(const m of rows(r)){
    const data={ cost:num(m.original_price), sell:num(m.price), name:m.name };
    [m.id,m.name].map(norm).filter(Boolean).forEach(k=>map.set(k,data));
  }
  return map;
}
function lookupMenu(item,map){
  for(const k of keysOf(item)) if(map.has(k)) return map.get(k);
  return null;
}

module.exports=async function handler(req,res){
  try{
    if(!requireAdmin(req,res)) return;
    const range=getRange(req.query.range||req.query.period||"day");
    const menuMap=await getMenuMap();

    const orderRes=await query(`
      SELECT * FROM orders
      WHERE COALESCE(created_at,updated_at,now()) >= $1
      AND COALESCE(created_at,updated_at,now()) <= $2
      ORDER BY COALESCE(created_at,updated_at,now()) ASC
    `,[range.start.toISOString(),range.end.toISOString()]).catch(()=>({rows:[]}));

    const bookingRes=await query(`
      SELECT * FROM bookings
      WHERE COALESCE(created_at,updated_at,now()) >= $1
      AND COALESCE(created_at,updated_at,now()) <= $2
    `,[range.start.toISOString(),range.end.toISOString()]).catch(()=>({rows:[]}));

    const orders=rows(orderRes);
    const bookings=rows(bookingRes);
    const completed=orders.filter(o=>["done","completed","complete","paid","success","finished"].includes(norm(o.status)));
    const cancelled=orders.filter(o=>["cancelled","canceled","cancel","deleted"].includes(norm(o.status)));

    let revenue=0,totalCost=0,productsSold=0;
    const top=new Map(), byDay=new Map(), byHour=new Map(), customers=new Set();

    for(const o of completed){
      const d=new Date(o.created_at||o.updated_at||Date.now());
      const day=d.toISOString().slice(5,10);
      const hour=d.getHours();
      const phone=String(o.phone||o.customer_phone||o.customer?.phone||"").trim();
      if(phone) customers.add(phone);

      const items=parseItems(o.items||o.menu_items||o.order_items);
      let orderRevenue=0, orderCost=0;

      for(const it of items){
        const q=qty(it);
        const menu=lookupMenu(it,menuMap);
        const unitSell=sell(it)||num(menu?.sell);
        const unitCost=costFromOrder(it)||num(menu?.cost);
        const lineRevenue=unitSell*q;
        const lineCost=unitCost*q;
        orderRevenue+=lineRevenue;
        orderCost+=lineCost;
        productsSold+=q;

        const nm=nameOf(it);
        const old=top.get(nm)||{name:nm,quantity:0,revenue:0,cost:0,profit:0};
        old.quantity+=q; old.revenue+=lineRevenue; old.cost+=lineCost; old.profit=old.revenue-old.cost;
        top.set(nm,old);
      }

      if(!orderRevenue) orderRevenue=num(o.total||o.amount||o.price);
      if(!orderCost) orderCost=num(o.cost||o.original_price||o.capital);

      revenue+=orderRevenue;
      totalCost+=orderCost;

      const dr=byDay.get(day)||{label:day,revenue:0,cost:0,profit:0};
      dr.revenue+=orderRevenue; dr.cost+=orderCost; dr.profit=dr.revenue-dr.cost; byDay.set(day,dr);

      const hr=byHour.get(hour)||{hour,revenue:0,cost:0,profit:0};
      hr.revenue+=orderRevenue; hr.cost+=orderCost; hr.profit=hr.revenue-hr.cost; byHour.set(hour,hr);
    }

    return send(res,200,{
      ok:true,
      range:range.key,
      summary:{
        revenue,
        cost:totalCost,
        profit:revenue-totalCost,
        completedOrders:completed.length,
        totalOrders:orders.length+bookings.length,
        shipOrders:orders.length,
        tableOrders:bookings.length,
        cancelledOrders:cancelled.length,
        productsSold,
        customersWithPhone:customers.size,
        avgOrder:completed.length ? revenue/completed.length : 0
      },
      series:[...byDay.values()],
      hourly:[...byHour.values()].sort((a,b)=>a.hour-b.hour),
      topItems:[...top.values()].sort((a,b)=>b.revenue-a.revenue)
    });
  }catch(e){
    console.error("analytics error:",e);
    return send(res,500,{ok:false,error:e.message});
  }
};
