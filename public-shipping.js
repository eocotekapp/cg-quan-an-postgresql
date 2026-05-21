/* CG Quán Ăn - Public Shipping v27
   Web khách đọc cài đặt ship từ CGSettings và dùng modal web thay confirm điện thoại.
*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const settings = () => window.CGSettings;

  function subtotal() {
    try { if (typeof getCartSubtotal === "function") return Number(getCartSubtotal() || 0); } catch (_) {}
    try {
      if (Array.isArray(window.cart)) {
        return window.cart.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 1), 0);
      }
    } catch (_) {}
    const txt = $("#cartTotal")?.textContent || "0";
    return Number(String(txt).replace(/[^\d]/g, "") || 0);
  }

  function ensureModal() {
    let modal = $("#cgShipConfirmModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "cgShipConfirmModal";
    modal.className = "modal cg-ship-confirm-modal";
    modal.innerHTML = `
      <div class="modal-card">
        <div class="success-icon">!</div>
        <h2>Xác nhận đặt ship</h2>
        <p id="cgShipConfirmMessage"></p>
        <div class="modal-actions">
          <button id="cgShipCancel" class="btn soft" type="button">Hủy</button>
          <button id="cgShipOk" class="btn primary" type="button">Đồng ý</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function webConfirm(msg) {
    const modal = ensureModal();
    $("#cgShipConfirmMessage").textContent = msg;
    modal.classList.add("show");
    return new Promise((resolve) => {
      $("#cgShipCancel").onclick = () => { modal.classList.remove("show"); resolve(false); };
      $("#cgShipOk").onclick = () => { modal.classList.remove("show"); resolve(true); };
    });
  }

  function isShipForm(form) {
    const text = (form.textContent || "").toLowerCase();
    return text.includes("giao hàng") || text.includes("ship") || (form.id || "").toLowerCase().includes("order");
  }

  function patchForms() {
    Array.from(document.querySelectorAll("form")).forEach((form) => {
      if (!isShipForm(form) || form.dataset.cgShipV27 === "1") return;
      form.dataset.cgShipV27 = "1";

      form.addEventListener("submit", async (e) => {
        if (form.dataset.cgShipAllow === "1") {
          form.dataset.cgShipAllow = "0";
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();

        const sub = subtotal();
        const fee = settings().calcShipping(sub);
        const ok = await webConfirm(
          `Đây là đơn giao hàng/ship. Phí ship dự kiến: ${settings().money(fee)}. Tổng tạm tính: ${settings().money(sub + fee)}. Shop có thể gọi lại nếu địa chỉ xa cần đổi phí ship. Bạn xác nhận đặt ship chứ?`
        );
        if (!ok) return;

        // Cho code cũ đọc đúng phí ship
        window.shopSettings = {
          ...(window.shopSettings || {}),
          ...settings().readSettings(),
          shippingFee: fee,
          shipFee: fee,
          deliveryFee: fee
        };

        form.dataset.cgShipAllow = "1";
        form.requestSubmit();
      }, true);
    });
  }

  function patchFetch() {
    if (window.__CG_PUBLIC_SHIP_FETCH_V27__) return;
    window.__CG_PUBLIC_SHIP_FETCH_V27__ = true;

    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init = {}) {
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.includes("/api/") && init && typeof init.body === "string") {
          const obj = JSON.parse(init.body);
          const sub = subtotal();
          const fee = settings().calcShipping(sub);
          obj.shippingFee = fee;
          obj.shipFee = fee;
          obj.deliveryFee = fee;
          if (obj.total != null) obj.total = Number(obj.total || 0) + fee;
          if (obj.grandTotal != null) obj.grandTotal = Number(obj.grandTotal || 0) + fee;
          init = { ...init, body: JSON.stringify(obj) };
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
  }


  function patchNativeShipConfirm() {
    if (window.__CG_PUBLIC_SHIP_CONFIRM_PATCHED_V29__) return;
    window.__CG_PUBLIC_SHIP_CONFIRM_PATCHED_V29__ = true;

    const nativeConfirm = window.confirm ? window.confirm.bind(window) : null;
    window.confirm = function(message) {
      const msg = String(message || "").toLowerCase();
      if (
        msg.includes("đơn giao hàng") ||
        msg.includes("đặt ship") ||
        msg.includes("phí ship") ||
        msg.includes("giao hàng/ship")
      ) {
        return true;
      }
      return nativeConfirm ? nativeConfirm(message) : true;
    };
  }

  function init() {
    if (!window.CGSettings) return;
    patchNativeShipConfirm();
    patchFetch();
    patchForms();
    new MutationObserver(patchForms).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
