/* CG Quán Ăn - Admin Per Order Ship v27
   Chỉnh phí ship riêng từng đơn, file riêng.
   Nếu server chưa hỗ trợ, lưu local override để admin hiện đúng trên máy này.
*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const OVERRIDE_KEY = "CG_ORDER_SHIP_OVERRIDES_V27";
  const settings = () => window.CGSettings;

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
      if (e.target.name === "shippingFee") e.target.value = settings().formatMoney(e.target.value);
    });

    modal.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const code = form.dataset.orderCode || "";
      const fee = settings().rawMoney(form.shippingFee.value);

      const overrides = getOverrides();
      overrides[code] = fee;
      saveOverrides(overrides);
      applyOverrides();

      // Thử gửi server nếu có endpoint, không phá UI nếu chưa hỗ trợ.
      const body = JSON.stringify({ orderCode: code, code, shippingFee: fee, shipFee: fee, deliveryFee: fee });
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

  function openModal(card) {
    const modal = ensureModal();
    const code = getCode(card);
    const overrides = getOverrides();
    const text = card.textContent || "";
    const m = text.match(/Ship:\s*([\d.]+)đ/i);
    const current = overrides[code] ?? (m ? m[1] : settings().readSettings().shippingFee);

    $("#cgOrderShipCode").textContent = code ? `Mã đơn: ${code}` : "";
    const form = $("#cgOrderShipForm");
    form.dataset.orderCode = code;
    form.shippingFee.value = settings().formatMoney(current);
    modal.classList.add("show");
  }

  // Apply local ship override display
  function applyOverridesSafe() {
    const overrides = getOverrides();
    findCards().forEach((card) => {
      const code = getCode(card);
      if (!code || overrides[code] == null) return;
      const feeText = settings().money(overrides[code]);
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let node;
      let found = false;
      while ((node = walker.nextNode())) {
        if (/Ship:\s*[\d.]+đ/i.test(node.nodeValue || "")) {
          node.nodeValue = node.nodeValue.replace(/Ship:\s*[\d.]+đ/i, `Ship: ${feeText}`);
          found = true;
          break;
        }
      }
      if (!found) {
        const line = document.createElement("div");
        line.className = "cg-order-ship-line";
        line.textContent = `Ship: ${feeText}`;
        card.insertBefore(line, card.querySelector(".cg-order-ship-edit-btn") || null);
      }
    });
  }

  function init() {
    if (!window.CGSettings) return;
    ensureModal();
    ensureButtons();
    applyOverridesSafe();

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".cg-order-ship-edit-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openModal(btn.closest("article, .admin-card, .card, .order-card, .compact-card"));
    });

    new MutationObserver(() => {
      ensureButtons();
      applyOverridesSafe();
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
