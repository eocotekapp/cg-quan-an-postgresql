/* CG Quán Ăn - Admin Per Order Ship v28
   File riêng.
   Sửa: chỉnh phí ship phải cập nhật cả tổng đơn = tạm tính món + ship.
*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const OVERRIDE_KEY = "CG_ORDER_SHIP_OVERRIDES_V28";
  const settings = () => window.CGSettings;

  function rawTextMoney(text) {
    const n = String(text || "").replace(/[^\d]/g, "");
    return n ? Number(n) : 0;
  }

  function getOverrides() {
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || "{}"); }
    catch (_) { return {}; }
  }

  function saveOverrides(obj) {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(obj || {}));
  }

  function isShipCard(card) {
    const text = card?.textContent || "";
    return /Đơn ship/i.test(text) && /\bOD\d{8}-[A-Z0-9]+\b/i.test(text);
  }

  function getCode(card) {
    const m = (card?.textContent || "").match(/\bOD\d{8}-[A-Z0-9]+\b/i);
    return m ? m[0].toUpperCase() : "";
  }

  function findCards() {
    return $$("article, .admin-card, .card, .order-card, .compact-card").filter(isShipCard);
  }

  function getFoodSubtotal(card) {
    const text = card?.textContent || "";
    const m = text.match(/Tạm tính món:\s*([\d.]+)đ/i);
    if (m) return rawTextMoney(m[1]);

    // Fallback: lấy dòng món trong khung, tránh lấy tổng dòng đầu có ship.
    const itemBlock = Array.from(card.querySelectorAll("*")).find(el =>
      /Món trong đơn/i.test(el.textContent || "") && /Tạm tính món/i.test(el.textContent || "")
    );
    if (itemBlock) {
      const m2 = (itemBlock.textContent || "").match(/Tạm tính món:\s*([\d.]+)đ/i);
      if (m2) return rawTextMoney(m2[1]);
    }
    return 0;
  }

  function getCurrentShip(card) {
    const text = card?.textContent || "";
    const m = text.match(/Ship:\s*([\d.]+)đ/i);
    return m ? rawTextMoney(m[1]) : Number(settings().readSettings().shippingFee || 0);
  }

  function getCurrentTotal(card) {
    const text = card?.textContent || "";
    const m = text.match(/💰\s*([\d.]+)đ/i) || text.match(/(?:^|\s)([\d.]+)đ\s*•\s*Ship:/i);
    return m ? rawTextMoney(m[1]) : 0;
  }

  function setFirstMoneyShipLine(card, total, shipFee) {
    const totalText = settings().money(total);
    const shipText = settings().money(shipFee);
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue || "";
      if (/[\d.]+đ\s*•\s*Ship:\s*[\d.]+đ/i.test(value)) {
        node.nodeValue = value.replace(/[\d.]+đ\s*•\s*Ship:\s*[\d.]+đ/i, `${totalText} • Ship: ${shipText}`);
        return true;
      }
    }
    return false;
  }

  function ensureButtons() {
    findCards().forEach((card) => {
      if (card.querySelector(".cg-order-ship-edit-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn soft full cg-order-ship-edit-btn";
      btn.textContent = "Chỉnh phí ship";
      btn.dataset.orderCode = getCode(card);
      card.appendChild(btn);
    });
  }

  function ensureModal() {
    let modal = $("#cgOrderShipModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "cgOrderShipModal";
    modal.className = "modal";
    modal.innerHTML = `
      <form id="cgOrderShipForm" class="modal-card">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Đơn ship</p>
            <h2>Chỉnh phí ship đơn này</h2>
            <p id="cgOrderShipCode" class="muted"></p>
          </div>
          <button type="button" class="modal-close" data-close-order-ship>×</button>
        </div>
        <label class="field">
          <span>Phí ship</span>
          <input name="shippingFee" inputmode="numeric" autocomplete="off" required>
        </label>
        <p id="cgOrderShipPreview" class="muted"></p>
        <button class="btn primary full" type="submit">Lưu phí ship</button>
      </form>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target.id === "cgOrderShipModal" || e.target.closest("[data-close-order-ship]")) {
        modal.classList.remove("show");
      }
    });

    modal.addEventListener("input", (e) => {
      if (e.target.name !== "shippingFee") return;
      e.target.value = settings().formatMoney(e.target.value);
      updatePreview();
    });

    modal.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const code = form.dataset.orderCode || "";
      const shipFee = settings().rawMoney(form.shippingFee.value);
      const foodSubtotal = Number(form.dataset.foodSubtotal || 0);
      const newTotal = foodSubtotal + shipFee;

      const overrides = getOverrides();
      overrides[code] = { shipFee, total: newTotal, foodSubtotal };
      saveOverrides(overrides);
      applyOverrides();

      // Gửi đầy đủ tổng mới cho server nếu server có hỗ trợ.
      const payload = {
        orderCode: code,
        code,
        shippingFee: shipFee,
        shipFee,
        deliveryFee: shipFee,
        total: newTotal,
        grandTotal: newTotal,
        currentTotal: newTotal
      };
      const body = JSON.stringify(payload);
      for (const path of ["/api/orders/shipping", "/api/orders/ship", "/api/orders"]) {
        try {
          if (typeof api === "function") await api(path, { method: "PATCH", body });
          else await fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
          break;
        } catch (_) {}
      }

      modal.classList.remove("show");
    });

    return modal;
  }

  function updatePreview() {
    const form = $("#cgOrderShipForm");
    if (!form) return;
    const foodSubtotal = Number(form.dataset.foodSubtotal || 0);
    const shipFee = settings().rawMoney(form.shippingFee.value);
    const total = foodSubtotal + shipFee;
    const preview = $("#cgOrderShipPreview");
    if (preview) preview.textContent = `Tạm tính món ${settings().money(foodSubtotal)} + ship ${settings().money(shipFee)} = tổng ${settings().money(total)}`;
  }

  function openModal(card) {
    const modal = ensureModal();
    const code = getCode(card);
    const overrides = getOverrides();
    const foodSubtotal = getFoodSubtotal(card);
    const current = overrides[code]?.shipFee ?? getCurrentShip(card);

    $("#cgOrderShipCode").textContent = code ? `Mã đơn: ${code}` : "";
    const form = $("#cgOrderShipForm");
    form.dataset.orderCode = code;
    form.dataset.foodSubtotal = String(foodSubtotal);
    form.shippingFee.value = settings().formatMoney(current);
    updatePreview();
    modal.classList.add("show");
  }

  function applyOverrides() {
    const overrides = getOverrides();
    findCards().forEach((card) => {
      const code = getCode(card);
      if (!code || overrides[code] == null) return;

      const data = typeof overrides[code] === "number"
        ? { shipFee: Number(overrides[code]), foodSubtotal: getFoodSubtotal(card) }
        : overrides[code];

      const foodSubtotal = Number(data.foodSubtotal || getFoodSubtotal(card) || 0);
      const shipFee = Number(data.shipFee || 0);
      const total = Number(data.total || (foodSubtotal + shipFee));

      setFirstMoneyShipLine(card, total, shipFee);
    });
  }

  function patchStatusRequests() {
    if (window.__CG_ORDER_SHIP_STATUS_PATCHED_V28__) return;
    window.__CG_ORDER_SHIP_STATUS_PATCHED_V28__ = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = function(input, init = {}) {
      try {
        const bodyText = typeof init.body === "string" ? init.body : "";
        if (bodyText && /OD\d{8}-[A-Z0-9]+/i.test(bodyText)) {
          const code = (bodyText.match(/\bOD\d{8}-[A-Z0-9]+\b/i) || [])[0]?.toUpperCase();
          const over = getOverrides()[code];
          if (code && over) {
            const obj = JSON.parse(bodyText);
            const data = typeof over === "number" ? { shipFee: over } : over;
            if (data.shipFee != null) {
              obj.shippingFee = Number(data.shipFee);
              obj.shipFee = Number(data.shipFee);
              obj.deliveryFee = Number(data.shipFee);
            }
            if (data.total != null) {
              obj.total = Number(data.total);
              obj.grandTotal = Number(data.total);
              obj.currentTotal = Number(data.total);
            }
            init = { ...init, body: JSON.stringify(obj) };
          }
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
  }

  function init() {
    if (!window.CGSettings) return;
    ensureModal();
    ensureButtons();
    applyOverrides();
    patchStatusRequests();

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".cg-order-ship-edit-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openModal(btn.closest("article, .admin-card, .card, .order-card, .compact-card"));
    });

    new MutationObserver(() => {
      ensureButtons();
      applyOverrides();
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
