/* CG Quán Ăn - Admin Shipping Module v24
   File riêng:
   - Ẩn cài đặt ship cũ.
   - Tạo cài đặt ship mới có tác dụng thật.
   - Thêm lại nút chỉnh phí ship cho đơn ship nếu thiếu.
*/
(function () {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const ship = () => window.CGShipping;

  function ensureCore() {
    if (!window.CGShipping) throw new Error("Thiếu shipping-core.js");
  }

  function hideOldShippingSettings() {
    // Chỉ ẩn đúng form/field cài đặt ship cũ, không ẩn dashboard, section, panel hoặc danh sách đơn.
    const labels = Array.from(document.querySelectorAll("label"));
    labels.forEach((label) => {
      const text = (label.textContent || "").toLowerCase();
      const isOldShipField = text.includes("phí ship mặc định") || text.includes("miễn ship từ đơn");
      if (!isOldShipField) return;
      if (label.closest("#cgShippingSettingsPanel")) return;

      const oldForm = label.closest("form");
      if (oldForm && oldForm.id !== "cgShippingSettingsForm") {
        oldForm.classList.add("cg-old-shipping-hidden");
        return;
      }

      const field = label.closest(".field") || label;
      field.classList.add("cg-old-shipping-hidden");
    });
  }

  function buildSettingsPanel() {
    if ($("#cgShippingSettingsPanel")) return;
    const target = $("main, .admin-main, .dashboard, body");
    const settings = ship().readSettings();

    const panel = document.createElement("section");
    panel.id = "cgShippingSettingsPanel";
    panel.className = "section cg-shipping-settings-panel";
    panel.innerHTML = `
      <div class="panel cg-shipping-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Cài đặt ship mới</p>
            <h2>Cài đặt phí ship</h2>
            <p class="muted">Áp dụng trực tiếp cho web khách và đơn ship.</p>
          </div>
        </div>
        <form id="cgShippingSettingsForm" class="cg-shipping-form">
          <label class="field">
            <span>Phí ship mặc định</span>
            <input name="shippingFee" inputmode="numeric" autocomplete="off" value="${ship().formatInput(settings.shippingFee)}">
          </label>
          <label class="field">
            <span>Miễn ship từ đơn</span>
            <input name="freeShipFrom" inputmode="numeric" autocomplete="off" value="${ship().formatInput(settings.freeShipFrom)}">
          </label>
          <button class="btn primary" type="submit">Lưu cài đặt ship</button>
        </form>
      </div>
    `;

    // Đặt ở khu cài đặt nếu tìm được, không thì cuối main.
    target.appendChild(panel);

    panel.addEventListener("input", (e) => {
      const input = e.target.closest("input");
      if (!input) return;
      input.value = ship().formatInput(input.value);
      input.dataset.raw = ship().rawNumber(input.value);
    });

    panel.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const saved = ship().saveSettings({
        shippingFee: form.shippingFee.value,
        freeShipFrom: form.freeShipFrom.value
      });
      form.shippingFee.value = ship().formatInput(saved.shippingFee);
      form.freeShipFrom.value = ship().formatInput(saved.freeShipFrom);
      showAdminConfirm("Đã lưu cài đặt ship", `Phí ship: ${ship().money(saved.shippingFee)} • Miễn ship từ: ${ship().money(saved.freeShipFrom)}`);
    });
  }

  function showAdminConfirm(title, message) {
    let modal = $("#cgAdminInfoModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "cgAdminInfoModal";
      modal.className = "modal cg-admin-info-modal";
      modal.innerHTML = `
        <div class="modal-card">
          <div class="success-icon">✓</div>
          <h2 id="cgAdminInfoTitle"></h2>
          <p id="cgAdminInfoMessage"></p>
          <button id="cgAdminInfoClose" class="btn primary full" type="button">Đóng</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => {
        if (e.target.id === "cgAdminInfoModal" || e.target.closest("#cgAdminInfoClose")) modal.classList.remove("show");
      });
    }
    $("#cgAdminInfoTitle").textContent = title;
    $("#cgAdminInfoMessage").textContent = message;
    modal.classList.add("show");
  }

  function cardIsShip(card) {
    const text = (card.textContent || "").toLowerCase();
    return text.includes("đơn ship") || text.includes("giao hàng") || text.includes("địa chỉ") || text.includes("ship");
  }

  function findShipCards() {
    return $$("article, .admin-card, .card, .order-card, .compact-card").filter(cardIsShip);
  }

  function getOrderCode(card) {
    const text = card.textContent || "";
    const m = text.match(/\bOD\d{8}-[A-Z0-9]+\b/i);
    return m ? m[0].toUpperCase() : "";
  }

  function ensureEditShipButtons() {
    findShipCards().forEach((card) => {
      if (card.querySelector(".cg-edit-ship-btn")) return;

      const actions = card.querySelector(".admin-actions, .card-actions, .actions") || card;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn soft full cg-edit-ship-btn";
      btn.textContent = "Chỉnh phí ship";
      btn.dataset.orderCode = getOrderCode(card);
      actions.appendChild(btn);
    });
  }

  function ensureEditShipModal() {
    let modal = $("#cgEditShipModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "cgEditShipModal";
    modal.className = "modal";
    modal.innerHTML = `
      <form class="modal-card" id="cgEditShipForm">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Đơn ship</p>
            <h2>Chỉnh phí ship</h2>
            <p class="muted" id="cgEditShipOrderCode"></p>
          </div>
          <button class="modal-close" type="button" data-close-edit-ship>×</button>
        </div>
        <label class="field">
          <span>Phí ship mới</span>
          <input name="shippingFee" inputmode="numeric" autocomplete="off" required>
        </label>
        <label class="field">
          <span>Ghi chú báo khách</span>
          <textarea name="note" placeholder="Ví dụ: địa chỉ xa, phụ thu ship..."></textarea>
        </label>
        <button class="btn primary full" type="submit">Lưu phí ship</button>
      </form>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target.id === "cgEditShipModal" || e.target.closest("[data-close-edit-ship]")) modal.classList.remove("show");
    });
    modal.addEventListener("input", (e) => {
      if (e.target.name === "shippingFee") e.target.value = ship().formatInput(e.target.value);
    });
    modal.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const code = form.dataset.orderCode || "";
      const shippingFee = ship().rawNumber(form.shippingFee.value);
      const note = form.note.value || "";

      try {
        // Thử các endpoint phổ biến, endpoint nào server có sẽ nhận.
        const body = JSON.stringify({ orderCode: code, shippingFee, note });
        let ok = false;
        const paths = [
          "/api/orders/shipping",
          "/api/orders/ship",
          "/api/orders"
        ];
        for (const path of paths) {
          try {
            if (typeof api === "function") {
              await api(path, { method: "PATCH", body });
            } else {
              const res = await fetch(typeof cgApiUrl === "function" ? cgApiUrl(path) : path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
              if (!res.ok) throw new Error("Không hỗ trợ endpoint");
            }
            ok = true;
            break;
          } catch (_) {}
        }
        if (!ok) throw new Error("Server chưa hỗ trợ lưu phí ship cho đơn này");
        modal.classList.remove("show");
        showAdminConfirm("Đã cập nhật phí ship", `Đơn ${code || ""}: ${ship().money(shippingFee)}`);
        if (typeof loadDashboard === "function") loadDashboard();
      } catch (err) {
        showAdminConfirm("Chưa lưu được phí ship", err.message || "Kiểm tra API server");
      }
    });
    return modal;
  }

  function openEditShip(card) {
    const modal = ensureEditShipModal();
    const code = getOrderCode(card);
    const text = card.textContent || "";
    const feeMatch = text.match(/Phí ship[:\s]*([\d.]+)đ/i);
    const fee = feeMatch ? feeMatch[1] : ship().readSettings().shippingFee;
    $("#cgEditShipOrderCode").textContent = code ? `Mã đơn: ${code}` : "";
    const form = $("#cgEditShipForm");
    form.dataset.orderCode = code;
    form.shippingFee.value = ship().formatInput(fee);
    form.note.value = "";
    modal.classList.add("show");
  }

  function installActions() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".cg-edit-ship-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openEditShip(btn.closest("article, .admin-card, .card, .order-card, .compact-card"));
    });
  }

  function init() {
    ensureCore();
    hideOldShippingSettings();
    buildSettingsPanel();
    ensureEditShipModal();
    ensureEditShipButtons();
    installActions();

    new MutationObserver(() => {
      hideOldShippingSettings();
      ensureEditShipButtons();
    }).observe(document.body, { childList: true, subtree: true });

    setInterval(() => {
      hideOldShippingSettings();
      ensureEditShipButtons();
    }, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
