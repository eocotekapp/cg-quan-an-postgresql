const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const money = n => new Intl.NumberFormat("vi-VN").format(Number(n || 0)) + "đ";

let menuItems = [];
let cart = [];
let coupon = "";
let selectedTable = "B01";
let featuredId = null;
let publicTableStatus = [];
let tableRefreshTimer = null;
let shopSettings = { shippingFee: 15000, freeShipFrom: 0 };

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || "Có lỗi xảy ra");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function toast(message, type = "ok") {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}
function showSuccess(title, message) {
  $("#modalTitle").textContent = title;
  $("#modalMessage").textContent = message;
  $("#successModal").classList.add("show");
}
function closeSuccess() { $("#successModal").classList.remove("show"); }
function setLoading(btn, yes, text) {
  if (!btn) return;
  if (yes) { btn.dataset.oldText = btn.textContent; btn.textContent = text; btn.disabled = true; btn.style.opacity = ".7"; }
  else { btn.textContent = btn.dataset.oldText || btn.textContent; btn.disabled = false; btn.style.opacity = "1"; }
}

function getCartPreorderItems() {
  return cart.map(item => ({ id:item.id || "", name:item.name || "", price:Number(item.price || 0), qty:Number(item.qty || 1) }))
    .filter(item => item.name && item.price > 0 && item.qty > 0);
}
function getCartSubtotal() {
  return getCartPreorderItems().reduce((s,i)=>s+i.price*i.qty,0);
}

async function loadShopSettings() {
  try {
    const data = await api("/api/settings");
    shopSettings = data.settings || shopSettings;
  } catch (err) { console.warn(err); }
  renderCart();
}
async function loadMenu() {
  try {
    const data = await api("/api/menu");
    if (data.shop) {
      $("#shopName").textContent = data.shop.name || "CG Quán Ăn";
      $("#contactName").textContent = data.shop.name || "CG Quán Ăn";
      $("#contactPhone").textContent = data.shop.phone || "0559876962";
      $("#contactAddress").textContent = data.shop.address || "Địa chỉ quán";
    }
    menuItems = data.items || [];
    renderMenu();
  } catch (err) {
    console.error(err);
    $("#menuGrid").innerHTML = `<div class="panel">Không tải được menu: ${escapeHtml(err.message)}</div>`;
    toast(err.message, "error");
  }
}
function renderMenu() {
  const search = $("#searchInput").value.trim().toLowerCase();
  const cat = $("#categoryFilter").value;
  const sort = $("#sortSelect").value;
  let list = menuItems.filter(item =>
    item.available !== false &&
    (cat === "all" || item.category === cat) &&
    String(item.name || "").toLowerCase().includes(search)
  );
  if (sort === "priceAsc") list.sort((a,b)=>Number(a.price)-Number(b.price));
  if (sort === "priceDesc") list.sort((a,b)=>Number(b.price)-Number(a.price));
  if (sort === "popular") list.sort((a,b)=>Number(b.popular||0)-Number(a.popular||0));

  $("#menuGrid").innerHTML = list.map(item => {
    const fitClass = escapeHtml(item.imageFit || "custom-crop");
    const art = item.imageUrl
      ? `<img class="${fitClass} menu-img-crop" style="--img-zoom:${Number(item.imageZoom || 100) / 100};--img-x:${Number(item.imagePosX ?? 50)}%;--img-y:${Number(item.imagePosY ?? 50)}%" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">`
      : `<span>${escapeHtml(item.icon || "🍽️")}</span>`;
    return `<article class="food-card ${item.imageUrl ? "has-image" : "no-image"}">
      <div class="food-art">${art}</div>
      <div class="food-body">
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.desc || "")}</p>
        <div class="price-row"><span class="price">${money(item.price)}</span><button class="add-btn" type="button" data-id="${escapeHtml(item.id)}">Thêm</button></div>
      </div>
    </article>`;
  }).join("") || `<div class="panel">Không có món phù hợp.</div>`;

  $$(".add-btn").forEach(btn => btn.addEventListener("click", () => addToCart(btn.dataset.id)));

  const featured = list[0] || menuItems.find(x => x.available !== false);
  if (featured) {
    featuredId = featured.id;
    $("#featuredName").textContent = featured.name;
    $("#featuredPrice").textContent = money(featured.price);
  } else {
    $("#featuredName").textContent = "Chưa có món";
    $("#featuredPrice").textContent = "---";
  }
}

function cartTotalValue() {
  const subtotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const discount = coupon === "QUAN10" ? Math.round(subtotal * 0.1) : 0;
  return subtotal - discount;
}
function showMiniCart(itemName = "Món vừa chọn") {
  const popup = $("#miniCartPopup");
  if (!popup) return;
  $("#miniCartName").textContent = itemName;
  $("#miniCartCount").textContent = `${cart.reduce((s,i)=>s+i.qty,0)} món trong giỏ`;
  $("#miniCartTotal").textContent = money(cartTotalValue());
  popup.classList.add("show");
  clearTimeout(showMiniCart.timer);
  showMiniCart.timer = setTimeout(() => popup.classList.remove("show"), 4200);
}
function clearCartCompletely() {
  cart = [];
  coupon = "";
  const couponInput = $("#couponInput");
  if (couponInput) couponInput.value = "";
  renderCart();
  $("#miniCartPopup")?.classList.remove("show");
}
function addToCart(id) {
  const item = menuItems.find(x => String(x.id) === String(id));
  if (!item) return;
  const old = cart.find(x => String(x.id) === String(id));
  if (old) old.qty += 1;
  else cart.push({ id:item.id, name:item.name, price:Number(item.price), icon:item.icon || "🍽️", qty:1 });
  renderCart();
  showMiniCart(item.name);
  toast(`Đã thêm ${item.name}`);
}
function renderCart() {
  $("#cartBadge").textContent = cart.reduce((s,i)=>s+i.qty,0);
  $("#cartItems").innerHTML = cart.length ? cart.map(item => `
    <div class="cart-item">
      <div><b>${escapeHtml(item.icon)} ${escapeHtml(item.name)}</b><p>${money(item.price)} x ${item.qty}</p></div>
      <div class="qty">
        <button type="button" data-act="minus" data-id="${escapeHtml(item.id)}">−</button>
        <span>${item.qty}</span>
        <button type="button" data-act="plus" data-id="${escapeHtml(item.id)}">+</button>
      </div>
    </div>`).join("") : `<p class="muted">Giỏ hàng đang trống. Hãy chọn món trong menu.</p>`;

  $$(".qty button").forEach(btn => btn.addEventListener("click", () => {
    const item = cart.find(x => String(x.id) === String(btn.dataset.id));
    if (!item) return;
    item.qty += btn.dataset.act === "plus" ? 1 : -1;
    cart = cart.filter(x => x.qty > 0);
    renderCart();
  }));
  $("#cartTotal").textContent = money(cartTotalValue());
}
function openCart(){ $("#cartDrawer").classList.add("open"); $("#overlay").classList.add("show"); }
function closeCart(){ $("#cartDrawer").classList.remove("open"); $("#overlay").classList.remove("show"); }

function tableStatusLabel(status, locked) {
  if (locked) return "khóa";
  return { free:"trống", pending:"chờ xác nhận", reserved:"đã đặt", using:"đang dùng", cleaning:"đang dọn", locked:"khóa" }[status] || "trống";
}
function tableIsAvailable(table) {
  if (!table) return true;
  return !table.locked && table.status === "free";
}
function applyTableAvailability() {
  $$(".table-node").forEach(node => {
    const tableId = node.dataset.table;
    const info = publicTableStatus.find(t => t.id === tableId);
    const status = info?.locked ? "locked" : (info?.status || "free");
    node.classList.remove("table-free","table-pending","table-reserved","table-using","table-cleaning","table-locked","unavailable");
    node.classList.add(`table-${status}`);
    const available = tableIsAvailable(info);
    node.classList.toggle("unavailable", !available);
    node.setAttribute("aria-label", `${tableId} - ${tableStatusLabel(info?.status || "free", info?.locked)}`);
    node.setAttribute("aria-disabled", available ? "false" : "true");
  });
}
async function refreshPublicTables(silent = true) {
  try {
    const form = $("#bookingForm");
    const date = form?.date?.value || "";
    const time = form?.time?.value || "";
    const qs = new URLSearchParams();
    if (date) qs.set("date", date);
    if (time) qs.set("time", time);
    const data = await api(`/api/tables?${qs.toString()}`);
    publicTableStatus = data.items || [];
    applyTableAvailability();
    const free = publicTableStatus.filter(tableIsAvailable).length;
    $("#tableRealtimeHint").textContent = date && time ? `Còn ${free} bàn trống cho khung giờ này` : `Còn ${free} bàn trống hiện tại`;
  } catch (err) {
    console.error(err);
    if (!silent) toast(err.message, "error");
  }
}
function setupTableMap() {
  $$(".table-node").forEach(node => {
    const choose = () => {
      const info = publicTableStatus.find(t => t.id === node.dataset.table);
      if (info && !tableIsAvailable(info)) {
        toast(`Bàn ${node.dataset.table} đang ${tableStatusLabel(info.status, info.locked)}, vui lòng chọn bàn khác`, "error");
        return;
      }
      selectedTable = node.dataset.table;
      $$(".table-node").forEach(x => x.classList.remove("selected"));
      node.classList.add("selected");
      $("#selectedTableLabel").textContent = selectedTable;
      $("#selectedTableInput").value = selectedTable;
      toast(`Đã chọn bàn ${selectedTable}`);
    };
    node.addEventListener("click", choose);
    node.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); }
    });
  });
  const form = $("#bookingForm");
  form?.date?.addEventListener("change", () => refreshPublicTables(false));
  form?.time?.addEventListener("change", () => refreshPublicTables(false));
  clearInterval(tableRefreshTimer);
  tableRefreshTimer = setInterval(() => { if (!document.hidden) refreshPublicTables(true); }, 2000);
  refreshPublicTables(true);
}

async function submitOrder(e) {
  e.preventDefault();
  if (!cart.length) { toast("Bạn chưa chọn món", "error"); openCart(); return; }
  const btn = e.submitter;
  setLoading(btn, true, "Đang gửi đơn...");
  try {
    const customer = Object.fromEntries(new FormData(e.target).entries());
    const subtotal = cart.reduce((s,i)=>s + Number(i.price || 0) * Number(i.qty || 1), 0);
    const discount = coupon === "QUAN10" ? Math.round(subtotal * 0.1) : 0;
    const shippingFee = shopSettings.freeShipFrom > 0 && subtotal >= shopSettings.freeShipFrom ? 0 : Number(shopSettings.shippingFee || 0);
    const finalTotal = subtotal - discount + shippingFee;
    const ok = confirm(`Đây là đơn giao hàng/ship. Phí ship dự kiến: ${money(shippingFee)}. Tổng tạm tính: ${money(finalTotal)}. Shop có thể gọi lại nếu địa chỉ xa cần đổi phí ship. Bạn xác nhận đặt ship chứ?`);
    if (!ok) return;
    const result = await api("/api/orders", { method:"POST", body:JSON.stringify({ customer, items:cart, coupon, shippingFee }) });
    clearCartCompletely();
    e.target.reset();
    closeCart();
    showSuccess("Đã gửi đơn giao hàng", `Mã đơn: ${result.orderCode}. Quán đã nhận thông báo Telegram.`);
  } catch (err) {
    console.error(err);
    toast(err.message, "error");
  } finally { setLoading(btn, false); }
}

async function submitDineInOrder(e) {
  e.preventDefault();
  if (!cart.length) { toast("Bạn chưa chọn món để gọi thêm", "error"); return; }
  const btn = e.submitter;
  setLoading(btn, true, "Đang gửi món vào bàn...");
  try {
    const form = Object.fromEntries(new FormData(e.target).entries());
    const result = await api("/api/sessions", { method:"POST", body:JSON.stringify({
      action:"addItems",
      table:String(form.table || "").toUpperCase().trim(),
      customerName: form.customerName,
      note: form.note,
      items: cart
    }) });
    clearCartCompletely();
    e.target.reset();
    showSuccess("Đã gọi thêm món", `Đã gộp vào phiên bàn ${result.sessionCode}. Tổng tạm tính: ${money(result.total)}.`);
  } catch (err) {
    console.error(err);
    toast(err.message, "error");
  } finally { setLoading(btn, false); }
}

async function submitBooking(e) {
  e.preventDefault();
  const btn = e.submitter;
  setLoading(btn, true, "Đang gửi đặt bàn...");
  try {
    if (!selectedTable) { toast("Hiện không còn bàn trống cho khung giờ này", "error"); return; }
    const info = publicTableStatus.find(t => t.id === selectedTable);
    if (info && !tableIsAvailable(info)) {
      toast(`Bàn ${selectedTable} không còn trống, vui lòng chọn bàn khác`, "error");
      await refreshPublicTables(false);
      return;
    }
    const body = Object.fromEntries(new FormData(e.target).entries());
    const preorderItems = getCartPreorderItems();
    const preorderSubtotal = getCartSubtotal();
    body.table = selectedTable;
    body.preorderItems = preorderItems;
    body.preorderSubtotal = preorderSubtotal;
    const result = await api("/api/bookings", { method:"POST", body:JSON.stringify(body) });
    const preorderText = preorderItems.length ? ` Quán cũng đã nhận ${preorderItems.reduce((s,i)=>s+i.qty,0)} món đặt trước, tạm tính ${money(preorderSubtotal)}.` : "";
    clearCartCompletely();
    e.target.reset();
    showSuccess("Đã gửi đặt bàn", `Mã đặt bàn: ${result.bookingCode}.${preorderText} Quán đã nhận thông báo Telegram.`);
    refreshPublicTables(true);
  } catch (err) {
    console.error(err);
    toast(err.message, "error");
  } finally { setLoading(btn, false); }
}

function setDefaultBookingDateTime() {
  const form = $("#bookingForm");
  if (!form) return;
  if (!form.date.value) form.date.value = new Date().toISOString().slice(0,10);
  if (!form.time.value) form.time.value = new Date().toTimeString().slice(0,5);
}

$("#searchInput").addEventListener("input", renderMenu);
$("#categoryFilter").addEventListener("change", renderMenu);
$("#sortSelect").addEventListener("change", renderMenu);
$("#openCartBtn").addEventListener("click", openCart);
$("#closeCartBtn").addEventListener("click", closeCart);
$("#overlay").addEventListener("click", closeCart);
$("#modalCloseBtn").addEventListener("click", closeSuccess);
$("#miniCartCloseBtn")?.addEventListener("click", () => $("#miniCartPopup").classList.remove("show"));
$("#miniCartOpenBtn")?.addEventListener("click", () => { $("#miniCartPopup").classList.remove("show"); openCart(); });
$("#successModal").addEventListener("click", e => { if (e.target.id === "successModal") closeSuccess(); });
$("#featuredAddBtn").addEventListener("click", () => featuredId && addToCart(featuredId));
$("#applyCouponBtn").addEventListener("click", () => {
  const code = $("#couponInput").value.trim().toUpperCase();
  if (code === "QUAN10") { coupon = code; toast("Đã áp dụng giảm 10%"); }
  else { coupon = ""; toast("Mã giảm giá không hợp lệ", "error"); }
  renderCart();
});
$("#orderForm").addEventListener("submit", submitOrder);
$("#bookingForm").addEventListener("submit", submitBooking);
$("#dineInForm")?.addEventListener("submit", submitDineInOrder);

setDefaultBookingDateTime();
setupTableMap();
renderCart();
loadShopSettings();
loadMenu();
