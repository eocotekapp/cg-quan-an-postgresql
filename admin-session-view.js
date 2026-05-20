/* CG Quán Ăn - Admin View Session Add-on v21 */
(function () {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  function htmlEscape(v) {
    return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  }
  function fmtMoney(v) {
    try { if (typeof money === "function") return money(v); } catch (_) {}
    return new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + "đ";
  }
  function apiBase(path) {
    if (typeof cgApiUrl === "function") return cgApiUrl(path);
    const base = (window.CG_API_BASE_URL || localStorage.getItem("CG_API_BASE_URL") || "").replace(/\/$/, "");
    const p = String(path || "");
    return p.startsWith("/api/") ? base + p : p;
  }
  async function addonApi(path, options = {}) {
    if (typeof api === "function") return api(path, options);
    const res = await fetch(apiBase(path), { headers: { "Content-Type": "application/json" }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || "Có lỗi xảy ra");
    return data;
  }

  function ensureModal() {
    let modal = $("#viewSessionAddonModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "viewSessionAddonModal";
    modal.className = "modal view-session-addon-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-card wide-modal view-session-addon-card">
        <button id="viewSessionAddonClose" class="modal-close view-session-addon-close" type="button" aria-label="Đóng">×</button>
        <div class="modal-head view-session-addon-head">
          <div>
            <p class="eyebrow">Phiên bàn</p>
            <h2 id="viewSessionAddonTitle">Chi tiết phiên bàn</h2>
            <p id="viewSessionAddonSub" class="muted">Đang tải...</p>
          </div>
        </div>
        <div id="viewSessionAddonBody" class="view-session-addon-body">
          <div class="panel">Đang tải phiên bàn...</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target.id === "viewSessionAddonModal" || e.target.closest("#viewSessionAddonClose")) closeModal();
    });
    return modal;
  }
  function openModal() {
    const modal = ensureModal();
    modal.removeAttribute("aria-hidden");
    modal.style.display = "";
    modal.classList.add("show");
  }
  function closeModal() {
    const modal = $("#viewSessionAddonModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    modal.style.display = "none";
  }

  function getCardFromButton(btn) {
    return btn.closest(".admin-card, article, .booking-card, .session-card, .compact-card");
  }
  function cardText(card) {
    return card ? (card.textContent || "").replace(/\s+/g, " ").trim() : "";
  }
  function getBookingCode(card) {
    const m = cardText(card).match(/\bTB\d{8}-[A-Z0-9]+\b/i);
    return m ? m[0].toUpperCase() : "";
  }
  function getSessionCode(card) {
    const text = cardText(card);
    const m1 = text.match(/Phiên bàn:\s*([A-Z0-9\-]+)/i);
    if (m1) return m1[1].toUpperCase();
    const m2 = text.match(/\bTS-[A-Z0-9\-]+\b/i);
    return m2 ? m2[0].toUpperCase() : "";
  }
  function getTable(card) {
    const m = cardText(card).match(/Bàn\s+(B\d+)/i) || cardText(card).match(/\b(B\d{2})\b/i);
    return m ? m[1].toUpperCase() : "";
  }
  function buttonSessionCode(btn, card) {
    return (btn.dataset.sessionAddItems || btn.dataset.addSessionItems || btn.dataset.sessionId || btn.dataset.id || getSessionCode(card) || "").toUpperCase();
  }

  function matchesBooking(session, bookingCode) {
    if (!bookingCode) return false;
    const hay = [session.bookingCode, session.booking_code, session.sourceBookingCode, session.source_booking_code, session.reservationCode, session.reservation_code, session.code, session.sessionCode, session.id, session.note]
      .map(v => String(v || "").toUpperCase()).join(" ");
    return hay.includes(bookingCode.toUpperCase());
  }
  function matchesSession(session, sessionCode) {
    if (!sessionCode) return false;
    return [session.id, session.code, session.sessionCode, session.session_code].map(v => String(v || "").toUpperCase()).includes(sessionCode.toUpperCase());
  }
  function scoreSession(session, wanted) {
    let score = 0;
    if (wanted.sessionCode && matchesSession(session, wanted.sessionCode)) score += 1000;
    if (wanted.bookingCode && matchesBooking(session, wanted.bookingCode)) score += 800;
    if (wanted.table && String(session.table || session.tableId || "").toUpperCase() === wanted.table) score += 50;
    if (String(session.status || "").toLowerCase() === "open") score += 10;
    const t = new Date(session.createdAt || session.created_at || session.startTime || session.startedAt || 0).getTime() || 0;
    score += Math.min(t / 10**13, 1);
    return score;
  }
  function pickBest(items, wanted) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return null;
    return list.map(item => ({ item, score: scoreSession(item, wanted) })).sort((a,b)=>b.score-a.score)[0].item;
  }

  function findSessionButtons() {
    return $$("button").filter(btn => {
      const text = (btn.textContent || "").trim().toLowerCase();
      return btn.hasAttribute("data-session-add-items") || btn.hasAttribute("data-add-session-items") || btn.hasAttribute("data-session-id") || text.includes("thêm món");
    });
  }
  function ensureViewButtons() {
    findSessionButtons().forEach(btn => {
      const card = getCardFromButton(btn);
      if (!card || card.querySelector(".view-session-addon-btn")) return;
      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn soft full view-session-addon-btn";
      viewBtn.textContent = "Xem phiên bàn này";
      viewBtn.dataset.viewSessionAddon = buttonSessionCode(btn, card);
      viewBtn.dataset.bookingCode = getBookingCode(card);
      viewBtn.dataset.sessionTable = btn.dataset.sessionTable || btn.dataset.table || getTable(card);
      btn.insertAdjacentElement("afterend", viewBtn);
    });
  }

  async function fetchSession(wanted) {
    if (wanted.sessionCode) {
      try {
        const data = await addonApi(`/api/sessions?id=${encodeURIComponent(wanted.sessionCode)}`);
        const session = data.item || data.session || (Array.isArray(data.items) ? pickBest(data.items, wanted) : data);
        if (session && scoreSession(session, wanted) >= 50) return session;
      } catch (e) { console.warn("Không lấy được theo mã phiên, thử tiếp", e); }
    }

    if (wanted.table) {
      const data = await addonApi(`/api/sessions?table=${encodeURIComponent(wanted.table)}`);
      const items = data.items || (data.item ? [data.item] : data.session ? [data.session] : Array.isArray(data) ? data : []);
      const best = pickBest(items, wanted);
      if (best && scoreSession(best, wanted) >= (wanted.bookingCode ? 800 : 50)) return best;
    }

    if (wanted.bookingCode) {
      const data = await addonApi(`/api/sessions?bookingCode=${encodeURIComponent(wanted.bookingCode)}`);
      const session = data.item || data.session || (Array.isArray(data.items) ? pickBest(data.items, wanted) : data);
      if (session) return session;
    }

    throw new Error("Không tìm thấy đúng phiên bàn của đơn này");
  }

  async function loadSession(wanted) {
    $("#viewSessionAddonTitle").textContent = "Chi tiết phiên bàn";
    $("#viewSessionAddonSub").textContent = wanted.bookingCode ? `Mã đặt bàn ${wanted.bookingCode}${wanted.table ? " • Bàn " + wanted.table : ""}` : (wanted.table ? `Bàn ${wanted.table}` : "Đang tải...");
    $("#viewSessionAddonBody").innerHTML = `<div class="panel">Đang tải phiên bàn...</div>`;
    const session = await fetchSession(wanted);
    renderSession(session, wanted);
  }

  function collectItems(session) {
    const result = [];
    const add = (arr, group) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(item => {
        const qty = Number(item.qty || item.quantity || 1);
        const price = Number(item.price || 0);
        result.push({ name: item.name || item.title || "Món", qty, price, total: qty * price, group });
      });
    };
    add(session.preorderItems, "Món đặt trước");
    add(session.items, "Món trong phiên");
    add(session.extraItems, "Món gọi thêm");
    add(session.summaryItems, "Tổng hợp món");
    add(session.orderItems, "Món trong đơn");
    return result;
  }

  function renderSession(session, wanted) {
    const code = session.sessionCode || session.code || session.id || "Phiên bàn";
    const table = session.table || session.tableId || wanted.table || "";
    const status = session.status || "";
    const bookingCode = session.bookingCode || session.booking_code || wanted.bookingCode || "";
    const items = collectItems(session);
    const itemsTotal = items.reduce((s,i)=>s+Number(i.total||0),0);
    const total = Number(session.total || session.grandTotal || session.currentTotal || itemsTotal || 0);

    $("#viewSessionAddonTitle").textContent = `Phiên ${code}`;
    $("#viewSessionAddonSub").textContent = `${bookingCode ? "Mã đặt bàn: " + bookingCode + " • " : ""}${table ? "Bàn " + table + " • " : ""}${status ? "Trạng thái: " + status : ""}`;
    $("#viewSessionAddonBody").innerHTML = `
      <div class="view-session-addon-list">
        ${items.length ? items.map((item, index) => `
          <div class="view-session-addon-row">
            <b>${index + 1}</b>
            <div><strong>${htmlEscape(item.name)}</strong><small>${htmlEscape(item.group)}</small></div>
            <em>x${Number(item.qty || 1)}</em>
            <span>${fmtMoney(item.total)}</span>
          </div>`).join("") : `<div class="panel">Chưa có món trong phiên này.</div>`}
      </div>
      <div class="view-session-addon-total"><span>Tổng tiền phiên bàn</span><b>${fmtMoney(total)}</b></div>`;
  }

  document.addEventListener("click", async e => {
    const btn = e.target.closest("[data-view-session-addon]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const wanted = { sessionCode: btn.dataset.viewSessionAddon || "", bookingCode: btn.dataset.bookingCode || "", table: btn.dataset.sessionTable || "" };
    openModal();
    try { await loadSession(wanted); }
    catch (err) {
      console.error(err);
      $("#viewSessionAddonBody").innerHTML = `<div class="panel">Không tải được đúng phiên bàn: ${htmlEscape(err.message)}</div>`;
      try { if (typeof toast === "function") toast(err.message || "Không tải được phiên bàn", "error"); } catch (_) {}
    }
  });

  const observer = new MutationObserver(() => ensureViewButtons());
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", ensureViewButtons);
  setTimeout(ensureViewButtons, 300);
  setTimeout(ensureViewButtons, 1200);
})();
