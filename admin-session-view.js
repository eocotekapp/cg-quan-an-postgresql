/* CG Quán Ăn - Admin View Session Add-on
   File riêng, không sửa render chính trong admin.js.
*/
(function () {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  function htmlEscape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function fmtMoney(value) {
    try {
      if (typeof money === "function") return money(value);
    } catch (_) {}
    return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + "đ";
  }

  function apiBase(path) {
    if (typeof cgApiUrl === "function") return cgApiUrl(path);
    const base = (window.CG_API_BASE_URL || localStorage.getItem("CG_API_BASE_URL") || "").replace(/\/$/, "");
    const p = String(path || "");
    return p.startsWith("/api/") ? base + p : p;
  }

  async function addonApi(path, options = {}) {
    if (typeof api === "function") return api(path, options);
    const res = await fetch(apiBase(path), {
      headers: { "Content-Type": "application/json" },
      ...options
    });
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
        <div class="modal-head">
          <div>
            <p class="eyebrow">Phiên bàn</p>
            <h2 id="viewSessionAddonTitle">Chi tiết phiên bàn</h2>
            <p id="viewSessionAddonSub" class="muted">Đang tải...</p>
          </div>
          <button id="viewSessionAddonClose" class="modal-close" type="button" aria-label="Đóng">×</button>
        </div>
        <div id="viewSessionAddonBody" class="view-session-addon-body">
          <div class="panel">Đang tải phiên bàn...</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target.id === "viewSessionAddonModal" || e.target.closest("#viewSessionAddonClose")) {
        closeModal();
      }
    });

    return modal;
  }

  function openModal() {
    const modal = ensureModal();
    modal.removeAttribute("aria-hidden");
    modal.classList.add("show");
    modal.style.display = "";
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

  function getCardTable(card) {
    const text = card ? card.textContent || "" : "";
    const m = text.match(/Bàn\s+(B\d+)/i) || text.match(/\b(B\d{2})\b/i);
    return m ? m[1].toUpperCase() : "";
  }

  function getCardSessionCode(card) {
    const text = card ? card.textContent || "" : "";
    const m = text.match(/Phiên bàn:\s*([A-Z0-9\-]+)/i) || text.match(/\bTS-[A-Z0-9\-]+/i);
    return m ? (m[1] || m[0]) : "";
  }

  function findSessionButtons() {
    const selector = [
      "[data-session-add-items]",
      "[data-add-session-items]",
      "[data-session-id]",
      "button"
    ].join(",");
    return $$(selector).filter((btn) => {
      const text = (btn.textContent || "").trim().toLowerCase();
      return btn.hasAttribute("data-session-add-items") ||
        btn.hasAttribute("data-add-session-items") ||
        text.includes("thêm món");
    });
  }

  function ensureViewButtons() {
    findSessionButtons().forEach((btn) => {
      const card = getCardFromButton(btn);
      if (!card || card.querySelector(".view-session-addon-btn")) return;

      const sessionId =
        btn.dataset.sessionAddItems ||
        btn.dataset.addSessionItems ||
        btn.dataset.sessionId ||
        getCardSessionCode(card) ||
        "";

      const table =
        btn.dataset.sessionTable ||
        btn.dataset.table ||
        getCardTable(card) ||
        "";

      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn soft full view-session-addon-btn";
      viewBtn.textContent = "Xem phiên bàn này";
      viewBtn.dataset.viewSessionAddon = sessionId;
      viewBtn.dataset.sessionTable = table;

      btn.insertAdjacentElement("afterend", viewBtn);
    });
  }

  async function loadSession(sessionId, table) {
    const body = $("#viewSessionAddonBody");
    $("#viewSessionAddonTitle").textContent = "Chi tiết phiên bàn";
    $("#viewSessionAddonSub").textContent = table ? `Bàn ${table}` : "Đang tải...";
    body.innerHTML = `<div class="panel">Đang tải phiên bàn...</div>`;

    let data;
    if (sessionId) {
      data = await addonApi(`/api/sessions?id=${encodeURIComponent(sessionId)}`);
    } else if (table) {
      data = await addonApi(`/api/sessions?table=${encodeURIComponent(table)}`);
    } else {
      throw new Error("Không tìm thấy phiên bàn liên kết");
    }

    const session = data.item || data.session || (Array.isArray(data.items) ? data.items[0] : data);
    if (!session) throw new Error("Không có dữ liệu phiên bàn");
    renderSession(session);
  }

  function collectItems(session) {
    const result = [];
    const add = (arr, group) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((item) => {
        const qty = Number(item.qty || item.quantity || 1);
        const price = Number(item.price || 0);
        result.push({
          name: item.name || item.title || "Món",
          qty,
          price,
          total: qty * price,
          group
        });
      });
    };

    add(session.preorderItems, "Món đặt trước");
    add(session.items, "Món trong phiên");
    add(session.extraItems, "Món gọi thêm");
    add(session.summaryItems, "Tổng hợp món");
    add(session.orderItems, "Món trong đơn");

    return result;
  }

  function renderSession(session) {
    const body = $("#viewSessionAddonBody");
    const code = session.sessionCode || session.code || session.id || "Phiên bàn";
    const table = session.table || session.tableId || "";
    const status = session.status || "";
    const items = collectItems(session);
    const itemsTotal = items.reduce((s, i) => s + Number(i.total || 0), 0);
    const total = Number(session.total || session.grandTotal || session.currentTotal || itemsTotal || 0);

    $("#viewSessionAddonTitle").textContent = `Phiên ${code}`;
    $("#viewSessionAddonSub").textContent = `${table ? "Bàn " + table + " • " : ""}${status ? "Trạng thái: " + status : ""}`;

    body.innerHTML = `
      <div class="view-session-addon-list">
        ${items.length ? items.map((item, index) => `
          <div class="view-session-addon-row">
            <b>${index + 1}</b>
            <div>
              <strong>${htmlEscape(item.name)}</strong>
              <small>${htmlEscape(item.group)}</small>
            </div>
            <em>x${Number(item.qty || 1)}</em>
            <span>${fmtMoney(item.total)}</span>
          </div>
        `).join("") : `<div class="panel">Chưa có món trong phiên này.</div>`}
      </div>
      <div class="view-session-addon-total">
        <span>Tổng tiền phiên bàn</span>
        <b>${fmtMoney(total)}</b>
      </div>
    `;
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-view-session-addon]");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    openModal();
    try {
      await loadSession(btn.dataset.viewSessionAddon || "", btn.dataset.sessionTable || "");
    } catch (err) {
      console.error(err);
      $("#viewSessionAddonBody").innerHTML = `<div class="panel">Không tải được phiên bàn: ${htmlEscape(err.message)}</div>`;
      try {
        if (typeof toast === "function") toast(err.message || "Không tải được phiên bàn", "error");
      } catch (_) {}
    }
  });

  const observer = new MutationObserver(() => ensureViewButtons());
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("DOMContentLoaded", ensureViewButtons);
  setTimeout(ensureViewButtons, 300);
  setTimeout(ensureViewButtons, 1200);
})();
