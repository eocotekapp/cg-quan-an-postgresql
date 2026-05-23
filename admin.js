function cgApiUrl(path){
  const base = (window.CG_API_BASE_URL || localStorage.getItem("CG_API_BASE_URL") || "").replace(/\/$/, "");
  const p = String(path || "");
  return p.startsWith("/api/") ? base + p : p;
}
function cgFetch(path, options){
  return fetch(cgApiUrl(path), options);
}

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const money = n => new Intl.NumberFormat("vi-VN").format(Number(n || 0)) + "đ";

let pin = sessionStorage.getItem("ADMIN_PIN") || "";
let confirmJob = null;
let autoRefreshTimer = null;
let currentRange = "day";
let currentStatusFilter = "new";
let currentKindFilter = "all";
let menuCache = [];
let tableCache = [];
let inventoryCache = [];
let sessionCache = [];
let lastOrderCount = 0;
let lastBookingCount = 0;
let firstLoadDone = false;

async function api(path, options = {}) {
  const res = await cgFetch(path, { headers: { "Content-Type":"application/json", "x-admin-pin": pin }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || "Có lỗi xảy ra");
  return data;
}
function cgUploadUrl(path) {
  const base = String(window.CG_API_BASE_URL || "").replace(/\/$/, "");
  const p = String(path || "");
  return base ? base + p : p;
}

async function uploadMenuImageIfNeeded(form) {
  const fileInput = document.getElementById("menuImageFile");
  const file = fileInput?.files?.[0];

  if (!file) return form.imageUrl?.value?.trim?.() || "";

  if (!file.type || !file.type.startsWith("image/")) throw new Error("File chọn không phải ảnh");

  const max = 8 * 1024 * 1024;
  if (file.size > max) throw new Error("Ảnh quá lớn. Tối đa 8MB");

  const fd = new FormData();
  fd.append("image", file, file.name || "menu-image.jpg");

  const res = await fetch(cgUploadUrl("/api/upload"), {
    method: "POST",
    headers: { "x-admin-pin": pin },
    body: fd
  });

  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) {}

  if (!res.ok || data.ok === false) {
    throw new Error(data.error || text || `Upload ảnh lỗi HTTP ${res.status}`);
  }

  const uploaded = data.url || data.relativeUrl || "";
  return normalizeImageUrl(uploaded);
}

function escapeHtml(v){ return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

function normalizeImageUrl(url) {
  let u = String(url || "").trim();
  if (!u) return "";

  // Dữ liệu lỗi cũ có dạng ${proto}://${host}/uploads/${filename}; không render nữa.
  if (u.includes("${") || u.includes("%7B") || u.includes("%7D")) return "";

  const apiBase = String(window.CG_API_BASE_URL || localStorage.getItem("CG_API_BASE_URL") || "").replace(/\/$/, "");

  if (/^https?:\/\//i.test(u) || u.startsWith("data:") || u.startsWith("blob:")) return u;
  if (u.startsWith("/uploads/")) return apiBase ? apiBase + u : u;
  if (u.startsWith("uploads/")) return apiBase ? apiBase + "/" + u : "/" + u;

  return u;
}


function isManagedUploadUrl(url){
  return typeof url === "string" && url.includes("/uploads/") && !url.includes("${") && !url.includes("%7B");
}

async function deleteUploadedImageOnAndroid(imageUrl){
  const normalized = normalizeImageUrl(imageUrl);
  if(!isManagedUploadUrl(normalized)) return false;
  try{
    const res = await fetch(cgUploadUrl("/api/delete-upload"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-pin": pin },
      body: JSON.stringify({ imageUrl: normalized })
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.ok === false){
      console.warn("Không xoá được ảnh cũ trên Android:", data.error || res.status);
      return false;
    }
    console.log("Kết quả xoá ảnh cũ:", data);
    return !!data.deleted;
  }catch(e){
    console.warn("Lỗi gọi Android delete-upload:", e.message);
    return false;
  }
}

function menuImageHtml(item, className = "admin-menu-thumb"){
  const fitClass = escapeHtml(item?.imageFit || "custom-crop");
  const zoom = Number(item?.imageZoom || 100) / 100;
  const x = Number(item?.imagePosX ?? 50);
  const y = Number(item?.imagePosY ?? 50);
  const imgUrl = normalizeImageUrl(item?.imageUrl);
  if (imgUrl) {
    return `<img class="${escapeHtml(className)} ${fitClass}" style="--img-zoom:${zoom};--img-x:${x}%;--img-y:${y}%" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.name || "Món ăn")}" loading="lazy">`;
  }
  return `<span class="${escapeHtml(className)} no-image-thumb">${escapeHtml(item?.icon || "🍽️")}</span>`;
}

function getStatusLabel(status, fallback = "") {
  const raw = status && typeof status === "object"
    ? (status.text || status.label || status.name || status.status || fallback)
    : (status ?? fallback);
  const key = String(raw || "");
  return {
    new: "Mới",
    pending: "Chờ xác nhận",
    confirmed: "Đã xác nhận",
    done: "Hoàn thành",
    completed: "Hoàn thành",
    cancelled: "Đã huỷ",
    canceled: "Đã huỷ",
    active: "Đang dùng",
    open: "Đang mở",
    closed: "Đã đóng",
    locked: "Khoá",
    free: "Trống",
    reserved: "Đã đặt",
    using: "Đang dùng",
    cleaning: "Đang dọn"
  }[key] || key || fallback || "Không rõ";
}

function getCategoryLabel(category, fallback = "") {
  const raw = category && typeof category === "object"
    ? (category.text || category.label || category.name || category.category || fallback)
    : (category ?? fallback);
  const key = String(raw || "");
  return {
    all: "Tất cả",
    main: "Món chính",
    drink: "Đồ uống",
    snack: "Ăn vặt",
    dessert: "Tráng miệng",
    booking: "Đặt bàn",
    bookings: "Đặt bàn",
    order: "Đơn ship",
    orders: "Đơn ship",
    session: "Phiên bàn",
    sessions: "Phiên bàn"
  }[key] || key || fallback || "Khác";
}

function toast(message, type = "ok") {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  el.style.pointerEvents = "none";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.classList.remove("show", "ok", "error");
    el.style.pointerEvents = "none";
    el.textContent = "";
  }, 2600);
}
function isOrderConfirmedStatus(s){
  return ["processing","delivering","confirmed"].includes(String(s || ""));
}
function normalizedStatus(item){
  const s = String(item.status || "new");
  if (s === "done") return "done";
  if (s === "cancelled") return "cancelled";
  if (isOrderConfirmedStatus(s)) return "confirmed";
  return "new";
}
function newestFirst(a,b){
  const av = Number(a.createdAtMs || a.arrivalMs || a.createdAt?.seconds || 0);
  const bv = Number(b.createdAtMs || b.arrivalMs || b.createdAt?.seconds || 0);
  return bv - av;
}
function itemKind(item){
  return item.__kind || item.kind || item.type || "";
}
function mixedItems(orders, bookings){
  return [
    ...(orders || []).map(x => ({...x, __kind:"orders"})),
    ...(bookings || []).map(x => ({...x, __kind:"bookings"}))
  ].sort(newestFirst);
}

function renderDashboardItemsBox(item){
  const isBooking = itemKind(item) === "bookings";
  const items = isBooking
    ? (Array.isArray(item.preorderItems) ? item.preorderItems : [])
    : (Array.isArray(item.items) ? item.items : []);
  const total = items.reduce((sum, x) => sum + Number(x.price || 0) * Number(x.qty || 1), 0);
  const boxTitle = isBooking ? "Món đặt trước" : "Món trong đơn";
  const countText = items.length ? ` (${items.reduce((sum, x) => sum + Number(x.qty || 1), 0)} món)` : "";

  return `<div class="dash-items-box ${items.length ? "has-items" : "no-items"}">
    <div class="dash-items-title"><span>🍽️ ${boxTitle}${countText}</span></div>
    ${
      items.length
      ? `<div class="dash-items-list">
          ${items.map((x, index) => `
            <p class="numbered-item-line">
              <i class="item-no">${index + 1}</i>
              <span>${escapeHtml(x.name || "Món")}</span>
              <em>x${Number(x.qty || 1)}</em>
              <strong>${money(Number(x.price || 0) * Number(x.qty || 1))}</strong>
            </p>
          `).join("")}
        </div>
        <div class="dash-items-total"><span>Tạm tính món:</span><strong>${money(total)}</strong></div>`
      : `<p class="dash-items-empty">Chưa có món đặt kèm.</p>`
    }
  </div>`;
}

function renderAppOrderCard(item){
  const kind = itemKind(item);
  const isBooking = kind === "bookings";
  const status = normalizedStatus(item);
  const codeText = escapeHtml(isBooking ? (item.bookingCode || item.id) : (item.orderCode || item.id));
  const name = escapeHtml(isBooking ? (item.name || "") : (item.customer?.name || ""));
  const phone = escapeHtml(isBooking ? (item.phone || "") : (item.customer?.phone || ""));
  const typeLabel = isBooking ? "Đặt bàn" : "Đơn ship";
  const typeIcon = isBooking ? "🪑" : "🚚";
  const mainLine = isBooking 
    ? `📅 ${escapeHtml(item.date || "")} • ${escapeHtml(item.time || "")}`
    : `📍 ${escapeHtml(item.customer?.address || "")}`;
  const secondLine = isBooking
    ? `👥 Bàn ${escapeHtml(item.table || "")} • ${escapeHtml(item.guests || "")} người`
    : `💰 ${money(item.total || 0)}`;
  const badge = status === "new" ? "MỚI" : getStatusLabel(item.status);

  return `<article class="app-order-card ${isBooking ? "booking-card" : "ship-card"}">
    <div class="app-order-head">
      <div class="app-order-type"><span>${typeIcon}</span><b>${typeLabel}</b><em>${codeText}</em></div>
      <strong class="status status-${escapeHtml(item.status || "new")}">${escapeHtml(badge)}</strong>
    </div>
    <div class="app-order-content">
      <div class="app-order-body">
        <p>${mainLine}</p>
        <p>${secondLine}</p>
        <p>👤 ${name}</p>
        <p>☎ ${phone}</p>
      </div>
      ${renderDashboardItemsBox(item)}
    </div>
    <div class="app-order-actions">
      ${status === "new" ? `<button class="action-btn action-confirm" data-type="${kind}" data-id="${escapeHtml(item.id)}" data-status="${isBooking ? "confirmed" : "processing"}">Xác nhận</button>` : ""}
      ${status === "confirmed" && !isBooking ? `<button class="action-btn action-confirm" data-type="orders" data-id="${escapeHtml(item.id)}" data-status="delivering">Đang giao</button><button class="action-btn action-done" data-type="orders" data-id="${escapeHtml(item.id)}" data-status="done">Hoàn thành</button>` : ""}
      ${status === "confirmed" && isBooking && item.sessionId ? `<button class="action-btn action-confirm" data-session-add-items="${escapeHtml(item.sessionId)}" data-session-table="${escapeHtml(item.table||"")}">+ Thêm món</button><button class="action-btn action-done" data-session-close="${escapeHtml(item.sessionId)}">Thanh toán</button>` : ""}
      ${status !== "done" && status !== "cancelled" ? `<button class="action-btn action-cancel" data-type="${kind}" data-id="${escapeHtml(item.id)}" data-status="cancelled">Hủy</button>` : ""}
      ${status === "done" || status === "cancelled" ? `<button class="action-btn action-delete" ${isBooking ? `data-delete-booking="${escapeHtml(item.id)}"` : `data-delete-order="${escapeHtml(item.id)}"`}>Xoá hẳn</button>` : ""}
    </div>
  </article>`;
}

function renderMiniOrderCard(item){
  const kind = itemKind(item);
  const status = normalizedStatus(item);
  const isBooking = kind === "bookings";
  const title = isBooking ? "Đặt bàn" : "Đơn ship";
  const codeText = escapeHtml(isBooking ? (item.bookingCode || item.id) : (item.orderCode || item.id));
  const name = escapeHtml(isBooking ? (item.name || "") : (item.customer?.name || ""));
  const phone = escapeHtml(isBooking ? (item.phone || "") : (item.customer?.phone || ""));
  const addressOrTable = isBooking
    ? `Bàn ${escapeHtml(item.table || "")} • ${escapeHtml(item.guests || "")} người`
    : escapeHtml(item.customer?.address || "");
  const timeLine = isBooking
    ? `${escapeHtml(item.date || "")} • ${escapeHtml(item.time || "")}`
    : `${money(item.total || 0)}`;
  const icon = isBooking ? "🪑" : "🚚";
  const statusBadge = status === "new" ? "MỚI" : getStatusLabel(item.status);

  return `<article class="admin-card dashboard-order-card ${isBooking ? "booking-card" : "ship-card"}">
    <div class="dash-order-top">
      <div class="dash-order-title"><span class="dash-icon">${icon}</span><b>${title}</b><span>•</span><em>${codeText}</em></div>
      <span class="status status-${escapeHtml(item.status || "new")}">${escapeHtml(statusBadge)}</span>
    </div>
    <div class="dash-order-main">
      <div class="dash-order-info">
        ${isBooking ? `<p>📅 ${timeLine}</p><p>👥 ${addressOrTable}</p>` : `<p>📍 ${addressOrTable}</p><p>💰 ${timeLine}</p>`}
        <p>👤 ${name}</p>
        <p>☎ ${phone}</p>
      </div>
      ${renderDashboardItemsBox(item)}
    </div>
    <div class="admin-actions dash-actions">
      ${status === "new" ? `<button class="action-btn action-confirm" data-type="${kind}" data-id="${escapeHtml(item.id)}" data-status="${isBooking ? "confirmed" : "processing"}">Xác nhận</button>` : ""}
      ${status === "confirmed" && !isBooking ? `<button class="action-btn action-confirm" data-type="orders" data-id="${escapeHtml(item.id)}" data-status="delivering">Đang giao</button><button class="action-btn action-done" data-type="orders" data-id="${escapeHtml(item.id)}" data-status="done">Hoàn thành</button>` : ""}
      ${status === "confirmed" && isBooking && item.sessionId ? `<button class="action-btn action-confirm" data-session-add-items="${escapeHtml(item.sessionId)}" data-session-table="${escapeHtml(item.table||"")}">+ Thêm món</button><button class="action-btn action-done" data-session-close="${escapeHtml(item.sessionId)}">Thanh toán</button>` : ""}
      ${status !== "done" && status !== "cancelled" ? `<button class="action-btn action-cancel" data-type="${kind}" data-id="${escapeHtml(item.id)}" data-status="cancelled">Hủy</button>` : ""}
      ${status === "done" || status === "cancelled" ? `<button class="action-btn action-delete" ${isBooking ? `data-delete-booking="${escapeHtml(item.id)}"` : `data-delete-order="${escapeHtml(item.id)}"`}>Xoá hẳn</button>` : ""}
    </div>
  </article>`;
}

function renderDashboardFeed(orders, bookings){
  const all = mixedItems(orders, bookings);
  const counts = {
    new: all.filter(x => normalizedStatus(x)==="new").length,
    confirmed: all.filter(x => normalizedStatus(x)==="confirmed").length,
    done: all.filter(x => normalizedStatus(x)==="done").length,
    cancelled: all.filter(x => normalizedStatus(x)==="cancelled").length
  };

  const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  setText("#countNew", counts.new);
  setText("#countConfirmed", counts.confirmed);
  setText("#countDone", counts.done);
  setText("#countCancelled", counts.cancelled);

  const newOrders = (orders || []).filter(x => x.status === "new").length;
  const newBookings = (bookings || []).filter(x => x.status === "new").length;
  setText("#statNewOrders", newOrders);
  setText("#statNewBookings", newBookings);
  setText("#statNew", newOrders + newBookings);

  let list = all.filter(x => normalizedStatus(x) === currentStatusFilter);
  if (currentKindFilter !== "all") list = list.filter(x => itemKind(x) === currentKindFilter);
  if (currentStatusFilter === "new") list = list.filter(x => x.status === "new");

  const titleMap = {new:"Đơn chờ xác nhận",confirmed:"Đơn đã xác nhận",done:"Đơn hoàn thành",cancelled:"Đơn đã hủy"};
  const kindMap = {all:"Tất cả",bookings:"Đơn đặt bàn",orders:"Đơn ship"};
  const title = document.querySelector("#dashboardPanel h2");
  if (title) title.textContent = `${titleMap[currentStatusFilter] || "Dashboard"} • ${kindMap[currentKindFilter] || "Tất cả"} (${list.length})`;

  const box = $("#dashboardList");
  if (box) {
    box.innerHTML = list.length ? list.slice(0,80).map(renderAppOrderCard).join("") : `<p class="muted empty-state">Không có đơn trong mục này.</p>`;
  }
  bindActions();
  bindSessionActions();
}

function openDrawer(){ document.body.classList.add("drawer-open"); }
function closeDrawer(){ document.body.classList.remove("drawer-open"); }
function showPanel(tab){
  ["dashboard","orders","bookings","tables","sessions","menu","inventory","analytics"].forEach(name=>$(`#${name}Panel`)?.classList.toggle("hidden", name !== tab));
  $$(".tab-btn").forEach(x=>x.classList.toggle("active", x.dataset.tab === tab));
  if(tab === "analytics") loadAnalytics(currentRange);
  closeDrawer();
}
function setStatusFilter(status){
  currentStatusFilter = status || "new";
  $$(".bottom-task").forEach(x=>x.classList.toggle("active", x.dataset.statusFilter === currentStatusFilter));
  showPanel("dashboard");
  loadDashboard(); bindActions();
}

function showDashboard(){
  $("#pinScreen").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  setDefaultDateTime();
  loadDashboard(); bindActions();startAutoRefresh();
}
function showPin(){
  $("#dashboard").classList.add("hidden");
  $("#pinScreen").classList.remove("hidden");
}
function setDefaultDateTime(){
  const d=$("#tableDateFilter"), t=$("#tableTimeFilter");
  if(d && !d.value) d.value = new Date().toISOString().slice(0,10);
  if(t && !t.value) t.value = new Date().toTimeString().slice(0,5);
  const y=$("#archiveYearInput");
  if(y && !y.value) y.value = new Date().getFullYear() - 1;
}
function startAutoRefresh(){
  clearInterval(autoRefreshTimer);
  autoRefreshTimer=setInterval(()=>{ if(pin && !document.hidden) loadDashboard({silent:true}); },2000);
}
function showNewNotice(message){
  toast(message);
  document.body.classList.add("new-order-flash");
  setTimeout(()=>document.body.classList.remove("new-order-flash"),900);
}

async function loadDashboard(){
  try{
    const [orders,bookings,menu,tables,inventory,sessions] = await Promise.all([
      api("/api/orders"),
      api("/api/bookings"),
      api("/api/menu?admin=1"),
      api(`/api/tables?admin=1&date=${encodeURIComponent($("#tableDateFilter")?.value||"")}&time=${encodeURIComponent($("#tableTimeFilter")?.value||"")}`),
      api("/api/inventory"),
      api("/api/sessions")
    ]);

    const orderItems=orders.items||[], bookingItems=bookings.items||[];
    if(firstLoadDone){
      if(orderItems.length > lastOrderCount) showNewNotice(`Có ${orderItems.length-lastOrderCount} đơn ship mới`);
      if(bookingItems.length > lastBookingCount) showNewNotice(`Có ${bookingItems.length-lastBookingCount} đặt bàn mới`);
    }
    lastOrderCount=orderItems.length; lastBookingCount=bookingItems.length; firstLoadDone=true;

    menuCache=menu.items||[];
    tableCache=tables.items||[];
    inventoryCache=inventory.items||[];
    sessionCache=sessions.items||[];

    renderDashboardFeed(orderItems, bookingItems);
    renderOrders(orderItems);
    renderBookings(bookingItems);
    renderMenuAdmin(menuCache);
    renderTables(tableCache);
    renderInventory(inventoryCache);
    renderSessions(sessionCache);
    loadAnalytics(currentRange);

    const hint=$("#refreshHint");
    if(hint) hint.textContent=`Tự cập nhật: ${new Date().toLocaleTimeString("vi-VN")}`;
  }catch(err){
    console.error(err);
    toast(err.message,"error");
    if(err.message.includes("PIN")){ sessionStorage.removeItem("ADMIN_PIN"); pin=""; showPin(); }
  }
}

function renderOrders(items){
  const __root = $("#ordersList");
  if(!__root) return;

  const visible = items.filter(order => order.status !== "done" && order.status !== "cancelled");
  $("#ordersList").innerHTML = visible.length ? visible.map(order=>{
    const orderItems = Array.isArray(order.items) ? order.items : [];
    const lines=orderItems.map((i,index)=>`${index + 1}. ${escapeHtml(i.name)} x${i.qty}`).join(", ");
    const itemsTotal = orderItems.reduce((sum,i)=>sum+Number(i.price||0)*Number(i.qty||1),0);
    const itemsBox = orderItems.length ? `<div class="admin-numbered-items-box">
      <div class="numbered-items-title">🍽️ Món trong đơn <span>(${orderItems.reduce((sum,i)=>sum+Number(i.qty||1),0)} món)</span></div>
      <div class="numbered-items-list">
        ${orderItems.map((i,index)=>`<div class="numbered-items-row">
          <b class="item-no">${index+1}</b>
          <span class="item-name">${escapeHtml(i.name||"Món")}</span>
          <em class="item-qty">x${Number(i.qty||1)}</em>
          <strong class="item-price">${money(Number(i.price||0)*Number(i.qty||1))}</strong>
        </div>`).join("")}
      </div>
      <div class="numbered-items-total"><span>Tạm tính món:</span><b>${money(itemsTotal)}</b></div>
    </div>` : "";
    return `<article class="admin-card compact-card">
      <div class="compact-main">
        <div><div class="admin-code">${escapeHtml(order.orderCode||order.id)}</div><p><b>${escapeHtml(order.customer?.name||"")}</b> • ${escapeHtml(order.customer?.phone||"")}</p><p class="muted">${lines}</p></div>
        <div><span class="status status-${escapeHtml(order.status||"new")}">${getStatusLabel(order.status)}</span><b class="compact-money">${money(order.total)}</b></div>
      </div>
      <p class="muted">${escapeHtml(order.customer?.address||"")} — ${escapeHtml(order.customer?.note||"Không ghi chú")}</p>
      ${itemsBox}
      <div class="admin-actions">
        <button class="action-btn action-confirm" data-type="orders" data-id="${escapeHtml(order.id)}" data-status="processing">Đang xử lý</button>
        <button class="action-btn action-done" data-type="orders" data-id="${escapeHtml(order.id)}" data-status="done">Hoàn thành</button>
        <button class="action-btn action-cancel" data-type="orders" data-id="${escapeHtml(order.id)}" data-status="cancelled">Hủy</button>
        <button class="action-btn action-delete" data-delete-order="${escapeHtml(order.id)}">Xoá hẳn</button>
      </div>
    </article>`;
  }).join("") : `<p class="muted">Không có đơn ship đang xử lý.</p>`;
  bindActions(); bindDeleteActions();
}
function renderBookings(items){
  const __root = $("#bookingsList");
  if(!__root) return;

  const visible = items.filter(b => b.status !== "done" && b.status !== "cancelled");
  $("#bookingsList").innerHTML = visible.length ? visible.map(b=>{
    const preorderItems = Array.isArray(b.preorderItems) ? b.preorderItems : [];
    const preTotal = b.preorderSubtotal || preorderItems.reduce((sum,i)=>sum+Number(i.price||0)*Number(i.qty||1),0);
    const preText = preorderItems.length ? preorderItems.map((i,index)=>`${index + 1}. ${escapeHtml(i.name)} x${i.qty}`).join(", ") + ` • ${money(preTotal)}` : "Không có";
    const preorderBox = preorderItems.length ? `<div class="admin-numbered-items-box">
      <div class="numbered-items-title">🍽️ Món đặt trước <span>(${preorderItems.reduce((sum,i)=>sum+Number(i.qty||1),0)} món)</span></div>
      <div class="numbered-items-list">
        ${preorderItems.map((i,index)=>`<div class="numbered-items-row">
          <b class="item-no">${index+1}</b>
          <span class="item-name">${escapeHtml(i.name||"Món")}</span>
          <em class="item-qty">x${Number(i.qty||1)}</em>
          <strong class="item-price">${money(Number(i.price||0)*Number(i.qty||1))}</strong>
        </div>`).join("")}
      </div>
      <div class="numbered-items-total"><span>Tạm tính món:</span><b>${money(preTotal)}</b></div>
    </div>` : `<div class="admin-numbered-items-box empty"><div class="numbered-items-title">🍽️ Món đặt trước</div><p class="muted">Không có món đặt kèm.</p></div>`;
    const session = b.sessionId ? sessionCache.find(s=>String(s.id)===String(b.sessionId)) : null;
    const sessionStatus = session?.status || "";
    const sessionIsOpen = !!session && sessionStatus === "open" && b.status !== "done" && b.status !== "cancelled";
    const sessionIsClosed = !!session && (sessionStatus === "closed" || b.status === "done");
    const sessionTotal = session ? money(Number(session.total || 0)) : "";
    const canConfirm = !b.sessionId && b.status === "new";
    const canCancel = b.status !== "done" && b.status !== "cancelled" && !sessionIsClosed;

    return `<article class="admin-card booking-row-card ${sessionIsClosed ? "booking-closed" : ""}">
      <div class="booking-grid">
        <div><span>Tên khách</span><b>${escapeHtml(b.name||"")}</b></div>
        <div><span>SĐT</span><b>${escapeHtml(b.phone||"")}</b></div>
        <div><span>Giờ đặt</span><b>${escapeHtml(b.date||"")} ${escapeHtml(b.time||"")}</b><small>${b.lockStartText && b.lockEndText ? `Khóa: ${escapeHtml(b.lockStartText)} → ${escapeHtml(b.lockEndText)}` : "Chưa khóa bàn"}</small></div>
        <div><span>Số người</span><b>${escapeHtml(b.guests||"")}</b></div>
        <div><span>Bàn</span><b>${escapeHtml(b.table||"")}</b></div>
        <div><span>Trạng thái</span><b class="status status-${escapeHtml(b.status||"new")}">${sessionIsClosed ? "Đã thanh toán / đóng phiên" : getStatusLabel(b.status)}</b></div>
      </div>
      <p class="muted"><b>Ghi chú:</b> ${escapeHtml(b.note||"Không có")}</p>
      ${preorderBox}
      ${b.sessionId ? `<p class="muted"><b>Phiên bàn:</b> ${escapeHtml(b.sessionCode || b.sessionId)} ${sessionTotal ? `• Tổng hiện tại: <b>${sessionTotal}</b>` : ""} ${sessionStatus ? `• Trạng thái phiên: <b>${sessionStatus === "open" ? "Đang mở" : "Đã đóng"}</b>` : ""}</p>` : ""}
      <div class="admin-actions">
        ${canConfirm ? `<button class="action-btn action-confirm" data-type="bookings" data-id="${escapeHtml(b.id)}" data-status="confirmed">Xác nhận & tạo phiên bàn</button>` : ""}
        ${sessionIsOpen ? `<button class="action-btn action-confirm" data-session-add-items="${escapeHtml(b.sessionId)}" data-session-table="${escapeHtml(b.table||"")}">+ Thêm món</button>
        <button class="action-btn action-done" data-session-close="${escapeHtml(b.sessionId)}">Thanh toán / Hoàn thành</button>` : ""}
        ${sessionIsClosed ? `<span class="status status-done">Đã đóng đơn, không thể thêm món</span>` : ""}
        ${canCancel ? `<button class="action-btn action-cancel" data-type="bookings" data-id="${escapeHtml(b.id)}" data-status="cancelled">Hủy</button>` : ""}
        <button class="action-btn action-delete" data-delete-booking="${escapeHtml(b.id)}">Xoá hẳn</button>
      </div>
    </article>`;
  }).join("") : `<p class="muted">Không có đặt bàn đang xử lý.</p>`;
  bindActions(); bindDeleteActions(); bindSessionActions();
}
function renderTables(items){
  const __root = $("#tablesList");
  if(!__root) return;

  tableCache=items;
  $$(".admin-table-node").forEach(node=>{
    const t=items.find(x=>x.id===node.dataset.adminTable);
    const status=t?.locked ? "locked" : (t?.status || "free");
    node.classList.remove("table-free","table-reserved","table-using","table-locked","table-cleaning","table-pending");
    node.classList.add(`table-${status}`);
    node.onclick=()=>openTableForm(t||{id:node.dataset.adminTable,name:node.dataset.adminTable,seats:4,status:"free",locked:false});
  });
  $("#tableDetail").innerHTML=items.map(t=>`<div class="table-mini-row"><b>${escapeHtml(t.id)}</b><span>${getStatusLabel(t.locked?"locked":t.status)}</span><small>${escapeHtml(t.zone||"")}</small></div>`).join("");
}
function renderSessions(items){
  const __root = $("#sessionsList");
  if(!__root) return;

  const open=items.filter(s=>s.status==="open");
  $("#sessionsList").innerHTML=open.length ? open.map(s=>{
    const sessionItems = Array.isArray(s.summaryItems) ? s.summaryItems : [];
    const summary=sessionItems.map((i,index)=>`${index + 1}. ${escapeHtml(i.name)} x${i.qty}`).join(", ");
    const sessionItemsBox = sessionItems.length ? `<div class="admin-numbered-items-box compact">
      <div class="numbered-items-title">🍽️ Món trong phiên <span>(${sessionItems.reduce((sum,i)=>sum+Number(i.qty||1),0)} món)</span></div>
      ${sessionItems.map((i,index)=>`<div class="numbered-items-row">
        <b class="item-no">${index+1}</b>
        <span class="item-name">${escapeHtml(i.name||"Món")}</span>
        <em class="item-qty">x${Number(i.qty||1)}</em>
        <strong class="item-price">${money(Number(i.price||0)*Number(i.qty||1))}</strong>
      </div>`).join("")}
    </div>` : "";
    const preorder = Number(s.preorderTotal || 0);
    const extra = Number(s.extraTotal || 0);
    return `<article class="admin-card compact-card">
      <div class="compact-main">
        <div>
          <div class="admin-code">${escapeHtml(s.sessionCode || s.id)}</div>
          <p><b>Bàn ${escapeHtml((s.tables||[]).join("+"))}</b> • ${escapeHtml(s.customerName||"Khách tại bàn")}</p>
          <p class="muted">${summary || "Chưa gọi món"}</p>
          ${sessionItemsBox}
          <p class="muted">Đặt trước: <b>${money(preorder)}</b> • Gọi thêm: <b>${money(extra)}</b></p>
        </div>
        <div><span class="status status-processing">Đang dùng</span><b class="compact-money">${money(s.total||0)}</b></div>
      </div>
      <p class="muted">Lượt gọi: ${(s.calls||[]).length} • Mở lúc: ${escapeHtml(s.openedAtText||"")} ${s.lockStartText && s.lockEndText ? `• Khóa: ${escapeHtml(s.lockStartText)} → ${escapeHtml(s.lockEndText)}` : ""}</p>
      <div class="admin-actions">
        <button class="action-btn action-confirm" data-session-add-items="${escapeHtml(s.id)}" data-session-table="${escapeHtml((s.tables||[])[0]||"")}">+ Thêm món</button>
        <button class="action-btn action-confirm" data-session-move="${escapeHtml(s.id)}">Chuyển / merge</button>
        <button class="action-btn action-done" data-session-close="${escapeHtml(s.id)}">Thanh toán / Hoàn thành</button>
      </div>
    </article>`;
  }).join("") : `<p class="muted">Chưa có phiên bàn đang mở.</p>`;
  bindSessionActions();
}
function renderMenuAdmin(items){
  $("#menuAdminList").innerHTML=items.length ? `<div class="admin-compact-list menu-compact-list">
    ${items.map(item=>`<article class="admin-mini-card menu-mini-card">
      <div class="mini-main menu-mini-main">
        ${menuImageHtml(item, "admin-menu-thumb")}
        <div class="menu-mini-info"><div class="mini-title"><b>${escapeHtml(item.icon||"🍽️")} ${escapeHtml(item.name||"")}</b><small>${escapeHtml(item.id)}</small></div>
        <div class="mini-meta">
          <span>${escapeHtml(getCategoryLabel(item.category))}</span>
          <span>Gốc: <b>${money(item.originalPrice)}</b></span>
          <span>Bán: <b>${money(item.price)}</b></span>
          <span>Lãi: <b class="${Number(item.profit||0)>=0?"good":"bad"}">${money(item.profit)}</b></span>
          <span><b class="status ${item.available===false?"status-cancelled":"status-done"}">${item.available===false?"Ẩn":"Đang bán"}</b></span>
        </div></div>
      </div>
      <div class="mini-actions">
        <button data-menu-edit="${escapeHtml(item.id)}">Sửa</button>
        <button data-menu-delete="${escapeHtml(item.id)}">Xoá</button>
      </div>
    </article>`).join("")}
  </div>` : `<p class="muted">Chưa có món.</p>`;
  bindMenuActions(items);
}
function renderInventory(items){
  $("#inventoryList").innerHTML=items.length ? `<div class="admin-compact-list inventory-compact-list">
    ${items.map(item=>`<article class="admin-mini-card inventory-mini-card ${item.low?"low-stock":""}">
      <div class="mini-main">
        <div class="mini-title"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.note||"")}</small></div>
        <div class="mini-meta">
          <span>Tồn: <b>${item.stock} ${escapeHtml(item.unit||"")}</b></span>
          <span>${item.low?'<b class="bad">Sắp hết</b>':'<b class="good">Ổn</b>'} <small>Min: ${item.minStock}</small></span>
          <span>Nhập: <b>${item.lastImportQty||0} ${escapeHtml(item.unit||"")}</b></span>
          <span>${money(item.lastImportPrice||0)} ${item.lastImportDate?`• ${escapeHtml(item.lastImportDate)}`:""}</span>
          <span>NCC: ${escapeHtml(item.supplier||"")}</span>
        </div>
      </div>
      <div class="mini-actions">
        <button data-inv-edit="${escapeHtml(item.id)}">Sửa</button>
        <button data-inv-delete="${escapeHtml(item.id)}">Xoá</button>
      </div>
    </article>`).join("")}
  </div>` : `<p class="muted">Chưa có nguyên liệu.</p>`;
  bindInventoryActions(items);
}
async function loadAnalytics(range=currentRange){
  currentRange=range;
  try{ renderAnalytics(await api(`/api/analytics?range=${encodeURIComponent(range)}`)); }catch(e){ toast(e.message,"error"); }
}
function renderAnalytics(data){
  const root = $("#analyticsView") || $(".admin-content");
  if(!root) return;
  const summary = data?.summary || data || {};
  const series = data?.series || data?.daily || [];
  const hourly = data?.hourly || [];
  const topItems = data?.topItems || data?.items || [];

  const revenue = Number(summary.revenue || summary.totalRevenue || 0);
  const cost = Number(summary.cost || summary.totalCost || summary.capital || 0);
  const profit = Number(summary.profit ?? (revenue - cost));
  const completed = Number(summary.completedOrders || summary.completed || 0);
  const totalOrders = Number(summary.totalOrders || summary.orders || 0);
  const shipOrders = Number(summary.shipOrders || summary.shippingOrders || 0);
  const tableOrders = Number(summary.tableOrders || summary.bookingOrders || 0);
  const cancelled = Number(summary.cancelledOrders || summary.cancelled || 0);
  const productsSold = Number(summary.productsSold || summary.soldItems || 0);
  const customers = Number(summary.customersWithPhone || summary.customers || 0);
  const avgOrder = Number(summary.avgOrder || (completed ? revenue / completed : 0));

  root.innerHTML = `
    <section class="analytics-shell">
      <div class="analytics-hero card">
        <div><div class="eyebrow">THỐNG KÊ</div><h2>Trung tâm thống kê</h2><p>Tổng quan vận hành, đơn hàng, sản phẩm và doanh thu.</p></div>
        <div class="analytics-tabs">
          <button class="analytics-subtab active" data-stat-tab="revenue">Doanh thu chi tiết</button>
          <button class="analytics-subtab" data-stat-tab="orders">Đơn hàng</button>
          <button class="analytics-subtab" data-stat-tab="products">Sản phẩm</button>
        </div>
      </div>
      <div class="stat-panel active" data-stat-panel="revenue">
        <div class="analytics-grid pro">
          ${statCard("Doanh thu", money(revenue), "Tổng tiền đơn hoàn thành")}
          ${statCard("Giá vốn", money(cost), "Tổng vốn theo món đã bán")}
          ${statCard(profit >= 0 ? "Lãi" : "Lỗ", money(Math.abs(profit)), "Doanh thu - giá vốn")}
          ${statCard("TB/đơn", money(avgOrder), "Trung bình mỗi đơn hoàn thành")}
        </div>
        <div class="analytics-chart-card card"><div class="chart-head"><h3>Sơ đồ doanh thu</h3><span>Vàng: doanh thu • Xanh: lãi • Đỏ: lỗ</span></div>${renderRevenueBars(series)}</div>
        <div class="analytics-chart-card card"><div class="chart-head"><h3>Doanh thu theo giờ</h3><span>Nhận diện giờ cao điểm</span></div>${renderHourlyBars(hourly)}</div>
      </div>
      <div class="stat-panel" data-stat-panel="orders">
        <div class="analytics-grid pro">
          ${statCard("Tổng đơn", totalOrders, "Tất cả đơn trong kỳ")}
          ${statCard("Đơn hoàn thành", completed, "Đã hoàn tất")}
          ${statCard("Đơn ship", shipOrders, "Đơn giao hàng")}
          ${statCard("Đơn tại bàn", tableOrders, "Đơn đặt bàn / phiên bàn")}
          ${statCard("Đơn huỷ", cancelled, "Đơn bị huỷ")}
          ${statCard("Khách có SĐT", customers, "Khách để lại số")}
        </div>
      </div>
      <div class="stat-panel" data-stat-panel="products">
        <div class="analytics-grid pro">
          ${statCard("Sản phẩm bán", productsSold, "Tổng số lượng món đã bán")}
          ${statCard("Món top", topItems?.[0]?.name || "Chưa có", topItems?.[0] ? money(topItems[0].revenue || 0) : "Chưa có dữ liệu")}
        </div>
        <div class="analytics-chart-card card"><div class="chart-head"><h3>Top món tạo doanh thu</h3><span>Theo doanh thu</span></div>${renderTopItems(topItems)}</div>
      </div>
    </section>`;
  $$(".analytics-subtab").forEach(btn=>{
    btn.onclick=()=>{
      const tab=btn.dataset.statTab;
      $$(".analytics-subtab").forEach(x=>x.classList.toggle("active", x===btn));
      $$("[data-stat-panel]").forEach(p=>p.classList.toggle("active", p.dataset.statPanel===tab));
    };
  });
}
function statCard(label, value, note=""){
  return `<article class="stat-card"><small>${escapeHtml(label)}</small><b>${typeof value === "number" ? value : escapeHtml(String(value))}</b>${note ? `<span>${escapeHtml(String(note))}</span>` : ""}</article>`;
}
function renderRevenueBars(series){
  if(!Array.isArray(series) || !series.length) return `<div class="empty-chart">Chưa có dữ liệu.</div>`;
  const max=Math.max(...series.map(x=>Number(x.revenue||x.total||0)),1);
  return `<div class="revenue-bars">${series.map(x=>{const revenue=Number(x.revenue||x.total||0); const cost=Number(x.cost||0); const profit=Number(x.profit ?? (revenue-cost)); const h=Math.max(8,Math.round(revenue/max*100)); return `<div class="revenue-bar-wrap"><div class="revenue-bar ${profit<0?"loss":"profit"}" style="height:${h}%"></div><small>${escapeHtml(String(x.label||x.date||""))}</small><b>${money(revenue)}</b></div>`;}).join("")}</div>`;
}
function renderHourlyBars(hourly){
  if(!Array.isArray(hourly) || !hourly.length) return `<div class="empty-chart big">Chưa có dữ liệu.</div>`;
  const max=Math.max(...hourly.map(x=>Number(x.revenue||x.total||0)),1);
  return `<div class="hour-bars">${hourly.map(x=>{const revenue=Number(x.revenue||x.total||0); const h=Math.max(6,Math.round(revenue/max*100)); return `<div class="hour-bar-wrap"><div class="hour-bar" style="height:${h}%"></div><small>${escapeHtml(String(x.hour ?? x.label ?? ""))}</small></div>`;}).join("")}</div>`;
}
function renderTopItems(items){
  if(!Array.isArray(items)||!items.length) return `<div class="empty-chart big">Chưa có món phát sinh doanh thu.</div>`;
  return `<div class="top-products">${items.slice(0,8).map((x,i)=>`<div class="top-product-row"><b>${i+1}</b><span>${escapeHtml(x.name||"Món")}</span><strong>${money(Number(x.revenue||0))}</strong><small>x${Number(x.quantity||x.qty||0)}</small></div>`).join("")}</div>`;
}


function updateCropPreview(){
  const f=$("#menuForm"), img=$("#cropPreviewImg");
  if(!f || !img) return;
  const zoom=Number($("#cropZoom").value||100), x=Number($("#cropX").value||50), y=Number($("#cropY").value||50);
  f.imageZoom.value=zoom; f.imagePosX.value=x; f.imagePosY.value=y;
  if(f.imageFit.value!=="contain-dark" && f.imageFit.value!=="contain-light") f.imageFit.value="custom-crop";
  const file=document.getElementById("menuImageFile")?.files?.[0];
  if(file){
    if(img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl);
    img.dataset.objectUrl=URL.createObjectURL(file);
    img.src=img.dataset.objectUrl;
  }else{
    img.src=normalizeImageUrl(f.imageUrl.value.trim())||"";
  }
  img.className=f.imageFit.value||"custom-crop";
  img.style.setProperty("--img-zoom", zoom/100);
  img.style.setProperty("--img-x", x+"%");
  img.style.setProperty("--img-y", y+"%");
}
function resetCropPreview(){ $("#cropZoom").value=100; $("#cropX").value=50; $("#cropY").value=50; $("#menuForm").imageFit.value="custom-crop"; updateCropPreview(); }
function openMenuForm(item=null){
  const f=$("#menuForm"); f.reset();
  f.dataset.oldImageUrl = normalizeImageUrl(item?.imageUrl || "");
  $("#menuModalTitle").textContent=item?"Sửa món":"Thêm món";
  $("#menuIdInput").value=item?.id||"";
  f.name.value=item?.name||""; f.originalPrice.value=item?.originalPrice??""; f.price.value=item?.price??"";
  f.category.value=item?.category||"main"; f.popular.value=item?.popular??50; f.icon.value=item?.icon||"";
  if(document.getElementById("menuImageFile")) document.getElementById("menuImageFile").value="";
  f.imageUrl.value=item?.imageUrl||""; f.imageFit.value=item?.imageFit||"custom-crop";
  f.imageZoom.value=item?.imageZoom??100; f.imagePosX.value=item?.imagePosX??50; f.imagePosY.value=item?.imagePosY??50;
  $("#cropZoom").value=f.imageZoom.value; $("#cropX").value=f.imagePosX.value; $("#cropY").value=f.imagePosY.value;
  f.desc.value=item?.desc||""; f.tags.value=Array.isArray(item?.tags)?item.tags.join(", "):""; f.available.value=item?.available===false?"false":"true";
  $("#menuModal").classList.add("show"); setTimeout(updateCropPreview,0);
}
function openInventoryForm(item=null){
  const f=$("#inventoryForm"); f.reset();
  $("#inventoryModalTitle").textContent=item?"Sửa nguyên liệu":"Thêm nguyên liệu";
  $("#inventoryIdInput").value=item?.id||""; f.name.value=item?.name||""; f.unit.value=item?.unit||"kg"; f.stock.value=item?.stock??""; f.minStock.value=item?.minStock??""; f.supplier.value=item?.supplier||""; f.lastImportQty.value=item?.lastImportQty??""; f.lastImportPrice.value=item?.lastImportPrice??""; f.lastImportDate.value=item?.lastImportDate||""; f.note.value=item?.note||"";
  $("#inventoryModal").classList.add("show");
}
function openTableForm(t){
  const f=$("#tableForm"); f.reset();
  $("#tableIdInput").value=t.id; $("#tableModalTitle").textContent=`Quản lý bàn ${t.id}`;
  f.name.value=t.name||t.id; f.seats.value=t.seats||4; f.zone.value=t.zone||""; f.status.value=t.locked?"locked":(t.status||"free"); f.locked.value=t.locked?"true":"false"; f.note.value=t.note||"";
  $("#tableModal").classList.add("show");
}

function bindActions(){
  $$(".action-btn[data-type]").forEach(btn=>btn.onclick=()=>{
    const label = getStatusLabel(btn.dataset.status, btn.textContent.trim());
    confirmJob = async () => {
      const payload = { type: btn.dataset.type, id: btn.dataset.id, status: btn.dataset.status };
      if (!payload.type || !payload.id || !payload.status) throw new Error("Thiếu dữ liệu nút xác nhận");
      await api("/api/status", { method: "POST", body: JSON.stringify(payload) });
      toast(`Đã cập nhật: ${label}`);
      await loadDashboard(); bindActions();};
    $("#confirmTitle").textContent="Xác nhận cập nhật"; $("#confirmMessage").textContent=`Chuyển trạng thái sang “${label}”?`; $("#confirmModal").classList.add("show");
  });
}
function bindDeleteActions(){
  $$("[data-delete-order]").forEach(btn=>btn.onclick=()=>{ confirmJob=async()=>{ await api(`/api/orders?id=${encodeURIComponent(btn.dataset.deleteOrder)}`,{method:"DELETE"}); toast("Đã xoá đơn"); loadDashboard(); bindActions();}; $("#confirmTitle").textContent="Xoá hẳn đơn"; $("#confirmMessage").textContent="Không thể hoàn tác."; $("#confirmModal").classList.add("show"); });
  $$("[data-delete-booking]").forEach(btn=>btn.onclick=()=>{ confirmJob=async()=>{ await api(`/api/bookings?id=${encodeURIComponent(btn.dataset.deleteBooking)}`,{method:"DELETE"}); toast("Đã xoá lịch đặt bàn"); loadDashboard(); bindActions();}; $("#confirmTitle").textContent="Xoá hẳn đặt bàn"; $("#confirmMessage").textContent="Không thể hoàn tác."; $("#confirmModal").classList.add("show"); });
}
function bindMenuActions(items){
  $$("[data-menu-edit]").forEach(btn=>btn.onclick=()=>openMenuForm(items.find(x=>String(x.id)===String(btn.dataset.menuEdit))));
  $$("[data-menu-delete]").forEach(btn=>btn.onclick=()=>{
    const item = items.find(x=>String(x.id)===String(btn.dataset.menuDelete));
    confirmJob=async()=>{
      await api(`/api/menu?id=${encodeURIComponent(btn.dataset.menuDelete)}`,{method:"DELETE"});
      await deleteUploadedImageOnAndroid(item?.imageUrl || "");
      toast("Đã xoá món");
      loadDashboard(); bindActions();
    };
    $("#confirmTitle").textContent="Xoá món"; $("#confirmMessage").textContent="Bạn chắc chắn muốn xoá món?"; $("#confirmModal").classList.add("show");
  });
}
function bindInventoryActions(items){
  $$("[data-inv-edit]").forEach(btn=>btn.onclick=()=>openInventoryForm(items.find(x=>String(x.id)===String(btn.dataset.invEdit))));
  $$("[data-inv-delete]").forEach(btn=>btn.onclick=()=>{ confirmJob=async()=>{ await api(`/api/inventory?id=${encodeURIComponent(btn.dataset.invDelete)}`,{method:"DELETE"}); toast("Đã xoá nguyên liệu"); loadDashboard(); bindActions();}; $("#confirmTitle").textContent="Xoá nguyên liệu"; $("#confirmMessage").textContent="Bạn chắc chắn?"; $("#confirmModal").classList.add("show"); });
}

function ensureSessionMenuModal(){
  if ($("#sessionMenuModal")) return;
  const wrap = document.createElement("div");
  wrap.id = "sessionMenuModal";
  wrap.className = "modal";
  wrap.innerHTML = `
    <div class="modal-card wide-modal">
      <div class="modal-head">
        <div>
          <p class="eyebrow">Gộp món vào phiên bàn</p>
          <h2 id="sessionMenuTitle">+ Thêm món</h2>
          <p class="muted" id="sessionMenuHint">Chọn món khách gọi thêm tại bàn.</p>
        </div>
        <button id="sessionMenuCloseBtn" class="session-menu-close modal-close" type="button" aria-label="Đóng">✕</button>
      </div>
      <div class="session-menu-layout">
        <div>
          <input id="sessionMenuSearch" placeholder="Tìm món..." />
          <div id="sessionMenuGrid" class="session-menu-grid"></div>
        </div>
        <form id="sessionAddItemsForm" class="session-cart-box">
          <input type="hidden" name="sessionId" id="sessionAddSessionId">
          <input type="hidden" name="table" id="sessionAddTable">
          <h3>Món gọi thêm</h3>
          <div id="sessionCartList" class="session-cart-list"></div>
          <label>Ghi chú
            <textarea name="note" placeholder="Ví dụ: ít cay, làm sau 10 phút..."></textarea>
          </label>
          <button class="btn primary full" type="submit">Gộp món vào bàn</button>
        </form>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  $("#sessionMenuSearch").oninput = renderSessionMenuGrid;
  $("#sessionAddItemsForm").onsubmit = submitSessionAddItems;
}
let sessionAddCart = [];

function openSessionMenuModal(sessionId, table){
  ensureSessionMenuModal();
  sessionAddCart = [];
  $("#sessionAddSessionId").value = sessionId || "";
  $("#sessionAddTable").value = table || "";
  $("#sessionMenuTitle").textContent = `+ Thêm món ${table ? "bàn " + table : ""}`;
  renderSessionMenuGrid();
  renderSessionAddCart();
  (() => {
    const modal = document.getElementById("sessionMenuModal");
    if (modal) {
      modal.style.display = "";
      modal.removeAttribute("aria-hidden");
      modal.classList.add("show");
    }
  })();
}

function renderSessionMenuGrid(){
  const q = ($("#sessionMenuSearch")?.value || "").trim().toLowerCase();
  const list = menuCache.filter(item => item.available !== false && String(item.name || "").toLowerCase().includes(q));
  $("#sessionMenuGrid").innerHTML = list.length ? list.map(item=>`
    <button type="button" class="session-food-card has-real-image" data-add-session-food="${escapeHtml(item.id)}">
      ${menuImageHtml(item, "session-food-thumb")}
      <b>${escapeHtml(item.icon || "🍽️")} ${escapeHtml(item.name || "")}</b>
      <span>${money(item.price || 0)}</span>
    </button>
  `).join("") : `<p class="muted">Không có món phù hợp.</p>`;
  $$("[data-add-session-food]").forEach(btn=>btn.onclick=()=>{
    const item = menuCache.find(x=>String(x.id)===String(btn.dataset.addSessionFood));
    if(!item) return;
    const old = sessionAddCart.find(x=>String(x.id)===String(item.id));
    if(old) old.qty += 1;
    else sessionAddCart.push({ id:item.id, name:item.name, price:Number(item.price||0), qty:1 });
    renderSessionAddCart();
  });
}

function renderSessionAddCart(){
  const total = sessionAddCart.reduce((s,i)=>s+Number(i.price||0)*Number(i.qty||1),0);
  $("#sessionCartList").innerHTML = sessionAddCart.length ? sessionAddCart.map(item=>`
    <div class="session-cart-row">
      <div><b>${escapeHtml(item.name)}</b><small>${money(item.price)} x ${item.qty}</small></div>
      <div>
        <button type="button" data-session-cart-minus="${escapeHtml(item.id)}">−</button>
        <button type="button" data-session-cart-plus="${escapeHtml(item.id)}">+</button>
      </div>
    </div>
  `).join("") + `<div class="session-cart-total">Tổng gọi thêm: <b>${money(total)}</b></div>` : `<p class="muted">Chưa chọn món.</p>`;
  $$("[data-session-cart-minus]").forEach(btn=>btn.onclick=()=>{
    const it=sessionAddCart.find(x=>String(x.id)===String(btn.dataset.sessionCartMinus));
    if(!it) return;
    it.qty-=1;
    sessionAddCart=sessionAddCart.filter(x=>x.qty>0);
    renderSessionAddCart();
  });
  $$("[data-session-cart-plus]").forEach(btn=>btn.onclick=()=>{
    const it=sessionAddCart.find(x=>String(x.id)===String(btn.dataset.sessionCartPlus));
    if(!it) return;
    it.qty+=1;
    renderSessionAddCart();
  });
}

async function submitSessionAddItems(e){
  e.preventDefault();
  if(!sessionAddCart.length){ toast("Chưa chọn món gọi thêm","error"); return; }
  const data = Object.fromEntries(new FormData(e.target).entries());
  try{
    const result = await api("/api/sessions",{
      method:"POST",
      body:JSON.stringify({
        action:"addItems",
        sessionId:data.sessionId,
        table:String(data.table||"").toUpperCase().trim(),
        note:data.note,
        items:sessionAddCart
      })
    });
    $("#sessionMenuModal").classList.remove("show");
    toast(`Đã gộp món vào phiên ${result.sessionCode}`);
    loadDashboard(); bindActions();}catch(err){ toast(err.message,"error"); }
}

function bindSessionActions(){
  $$("[data-session-add-items]").forEach(btn=>btn.onclick=()=>openSessionMenuModal(btn.dataset.sessionAddItems, btn.dataset.sessionTable || ""));
  $$("[data-session-close]").forEach(btn=>btn.onclick=()=>{ confirmJob=async()=>{ await api("/api/sessions",{method:"POST",body:JSON.stringify({action:"close",id:btn.dataset.sessionClose})}); toast("Đã thanh toán phiên bàn"); loadDashboard(); bindActions();}; $("#confirmTitle").textContent="Thanh toán phiên bàn"; $("#confirmMessage").textContent="Thanh toán, đóng phiên bàn và khóa thêm món cho đơn này?"; $("#confirmModal").classList.add("show"); });
  $$("[data-session-move]").forEach(btn=>btn.onclick=()=>{ $("#moveSessionForm").reset(); $("#moveSessionId").value=btn.dataset.sessionMove; $("#moveSessionModal").classList.add("show"); });
}

$("#pinForm").addEventListener("submit", async e=>{ e.preventDefault(); try{ pin=$("#pinInput").value.trim(); await api("/api/admin-check"); sessionStorage.setItem("ADMIN_PIN",pin); showDashboard(); }catch(err){ toast(err.message,"error"); } });
$("#logoutBtn").addEventListener("click",()=>{ clearInterval(autoRefreshTimer); sessionStorage.removeItem("ADMIN_PIN"); pin=""; showPin(); });
$("#refreshBtn").addEventListener("click",()=>loadDashboard());

$("#drawerToggleBtn")?.addEventListener("click", openDrawer);
$("#drawerCloseBtn")?.addEventListener("click", closeDrawer);
$("#drawerBackdrop")?.addEventListener("click", closeDrawer);
$$(".bottom-task").forEach(btn=>btn.addEventListener("click",()=>setStatusFilter(btn.dataset.statusFilter || "new")));
$$(".view-mode").forEach(btn=>btn.addEventListener("click",()=>{
  currentKindFilter = btn.dataset.kindFilter || "all";
  $$(".view-mode").forEach(x=>x.classList.toggle("active", x.dataset.kindFilter === currentKindFilter));
  showPanel("dashboard");
  loadDashboard(); bindActions();}));
$$("[data-jump-status]").forEach(card=>card.addEventListener("click",()=>{
  currentStatusFilter = card.dataset.jumpStatus || "new";
  currentKindFilter = card.dataset.jumpKind || "all";
  $$(".bottom-task").forEach(x=>x.classList.toggle("active", x.dataset.statusFilter === currentStatusFilter));
  $$(".view-mode").forEach(x=>x.classList.toggle("active", x.dataset.kindFilter === currentKindFilter));
  showPanel("dashboard");
  loadDashboard(); bindActions();}));

$$(".tab-btn").forEach(btn=>btn.addEventListener("click",()=>showPanel(btn.dataset.tab || "dashboard")));
$$(".range-btn").forEach(btn=>btn.addEventListener("click",()=>{ $$(".range-btn").forEach(x=>x.classList.remove("active")); btn.classList.add("active"); loadAnalytics(btn.dataset.range); }));
$("#tableDateFilter")?.addEventListener("change",loadDashboard); $("#tableTimeFilter")?.addEventListener("change",loadDashboard);

$("#addMenuBtn").addEventListener("click",()=>openMenuForm());
$("#menuCancelBtn").addEventListener("click",()=>$("#menuModal").classList.remove("show"));
$("#menuForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const form=e.target;
  const data=Object.fromEntries(new FormData(form).entries());
  delete data.imageFile;
  data.originalPrice=Number(data.originalPrice||0);
  data.price=Number(data.price||0);
  data.popular=Number(data.popular||0);
  data.imageZoom=Number(data.imageZoom||100);
  data.imagePosX=Number(data.imagePosX??50);
  data.imagePosY=Number(data.imagePosY??50);
  data.available=data.available==="true";
  try{
    const oldImageUrlBeforeSave = normalizeImageUrl(form.dataset.oldImageUrl || "");
    const uploadedUrl=await uploadMenuImageIfNeeded(form);
    data.imageUrl=normalizeImageUrl(uploadedUrl||"");
    await api("/api/menu",{method:"POST",body:JSON.stringify(data)});
    if(oldImageUrlBeforeSave && oldImageUrlBeforeSave !== data.imageUrl){
      await deleteUploadedImageOnAndroid(oldImageUrlBeforeSave);
    }
    $("#menuModal").classList.remove("show");
    toast("Đã lưu món");
    loadDashboard();
    bindActions();
  }catch(err){
    toast(err.message,"error");
  }
});
document.getElementById("menuImageFile")?.addEventListener("change", updateCropPreview);
document.getElementById("menuImageClearBtn")?.addEventListener("click", ()=>{
  const f=$("#menuForm");
  if(document.getElementById("menuImageFile")) document.getElementById("menuImageFile").value="";
  if(f?.imageUrl) f.imageUrl.value="";
  updateCropPreview();
});
$("#menuForm").imageFit.addEventListener("change", updateCropPreview); $("#cropZoom").addEventListener("input", updateCropPreview); $("#cropX").addEventListener("input", updateCropPreview); $("#cropY").addEventListener("input", updateCropPreview); $("#cropResetBtn").addEventListener("click", resetCropPreview);

$("#addInventoryBtn").addEventListener("click",()=>openInventoryForm());
$("#inventoryCancelBtn").addEventListener("click",()=>$("#inventoryModal").classList.remove("show"));
$("#inventoryForm").addEventListener("submit",async e=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries()); ["stock","minStock","lastImportQty","lastImportPrice"].forEach(k=>data[k]=Number(data[k]||0)); try{ await api("/api/inventory",{method:"POST",body:JSON.stringify(data)}); $("#inventoryModal").classList.remove("show"); toast("Đã lưu nguyên liệu"); loadDashboard(); bindActions();}catch(err){ toast(err.message,"error"); } });

$("#tableCancelBtn").addEventListener("click",()=>$("#tableModal").classList.remove("show"));
$("#tableForm").addEventListener("submit",async e=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries()); data.seats=Number(data.seats||4); data.locked=data.locked==="true"||data.status==="locked"; try{ await api("/api/tables",{method:"POST",body:JSON.stringify(data)}); $("#tableModal").classList.remove("show"); toast("Đã lưu bàn"); loadDashboard(); bindActions();}catch(err){ toast(err.message,"error"); } });

$("#openSessionBtn").addEventListener("click",()=>$("#sessionModal").classList.add("show"));
$("#sessionCancelBtn").addEventListener("click",()=>$("#sessionModal").classList.remove("show"));

// Validate Phone Here
$("#sessionForm").addEventListener("submit",async e=>{ 
  e.preventDefault(); 
  const data=Object.fromEntries(new FormData(e.target).entries()); 
  
  if(data.phone && !/^[0-9]{10}$/.test(data.phone.trim())){
    return toast("Số điện thoại phải gồm đúng 10 chữ số", "error");
  }

  data.action="open"; 
  data.table=String(data.table||"").toUpperCase().trim(); 
  data.guests=Number(data.guests||1); 
  try{ 
    await api("/api/sessions",{method:"POST",body:JSON.stringify(data)}); 
    $("#sessionModal").classList.remove("show"); 
    toast("Đã mở phiên bàn"); 
    loadDashboard(); 
    bindActions();
  } catch(err){ 
    toast(err.message,"error"); 
  } 
});

$("#moveSessionCancelBtn").addEventListener("click",()=>$("#moveSessionModal").classList.remove("show"));
$("#moveSessionForm").addEventListener("submit",async e=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries()); try{ if(data.toTable) await api("/api/sessions",{method:"POST",body:JSON.stringify({action:"move",id:data.id,toTable:String(data.toTable).toUpperCase().trim()})}); if(data.mergeTables) await api("/api/sessions",{method:"POST",body:JSON.stringify({action:"merge",id:data.id,tables:String(data.mergeTables).toUpperCase()})}); $("#moveSessionModal").classList.remove("show"); toast("Đã cập nhật phiên bàn"); loadDashboard(); bindActions();}catch(err){ toast(err.message,"error"); } });

$("#archiveRunBtn").addEventListener("click",async()=>{ const year=$("#archiveYearInput").value||new Date().getFullYear(); const action=$("#archiveAction").value; try{ if(action==="view"){ const data=await api(`/api/archive?year=${encodeURIComponent(year)}`); $("#archiveResult").innerHTML=`Doanh thu năm ${year}: <b>${money(data.summary.revenue)}</b><br>Đơn ship: ${data.summary.shipOrders} • Đơn bàn: ${data.summary.tableOrders} • Huỷ: ${data.summary.cancelled}`; return; } if(action==="deleteYearRevenue" && String(year)===String(new Date().getFullYear())) return toast("Không được xoá năm hiện tại","error"); if(action==="deleteYearRevenue" && !confirm(`Xoá doanh thu năm ${year}? Không thể hoàn tác.`)) return; const data=await api("/api/archive",{method:"POST",body:JSON.stringify({action,year})}); toast(action==="closeYear"?"Đã chốt năm":"Đã xoá doanh thu năm cũ"); if(data.summary) $("#archiveResult").innerHTML=`Đã chốt năm ${year}: ${money(data.summary.revenue)}`; }catch(err){ toast(err.message,"error"); } });

$("#confirmCancelBtn").addEventListener("click",()=>{ $("#confirmModal").classList.remove("show"); confirmJob=null; });
$("#confirmOkBtn").addEventListener("click", async () => {
  const btn = $("#confirmOkBtn");
  $("#confirmModal").classList.remove("show");
  const job = confirmJob;
  confirmJob = null;
  if (!job) return;
  try {
    if (btn) { btn.disabled = true; btn.dataset.oldText = btn.textContent; btn.textContent = "Đang xử lý..."; }
    await job();
  } catch (err) {
    console.error("Confirm action failed:", err);
    toast(err.message || "Không xác nhận được đơn", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.oldText || "Đồng ý"; }
  }
});

document.addEventListener("visibilitychange",()=>{ if(!document.hidden && pin) loadDashboard(); bindActions();});

if(pin) showDashboard(); else showPin();

function closeSessionMenuModal(){
  const modal = document.getElementById("sessionMenuModal");
  if(!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  modal.style.display = "none";
}

document.addEventListener("click", function(e){
  const btn = e.target.closest("#sessionMenuCloseBtn");
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  closeSessionMenuModal();
}, true);
