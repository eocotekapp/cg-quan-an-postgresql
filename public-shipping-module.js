/* CG Quán Ăn - Public Shipping Module v24
   File riêng:
   - Áp dụng phí ship từ CGShipping.
   - Thay confirm() điện thoại bằng modal web.
*/
(function () {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);

  function ship() { return window.CGShipping; }

  function getCartSubtotalSafe() {
    try {
      if (typeof getCartSubtotal === "function") return Number(getCartSubtotal() || 0);
    } catch (_) {}
    try {
      if (Array.isArray(window.cart)) return window.cart.reduce((s,i)=>s+Number(i.price||0)*Number(i.qty||1),0);
    } catch (_) {}
    const totalText = $("#cartTotal")?.textContent || "0";
    return Number(String(totalText).replace(/[^\d]/g, "") || 0);
  }

  function ensureShipConfirmModal() {
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

  function webConfirmShip(message) {
    const modal = ensureShipConfirmModal();
    $("#cgShipConfirmMessage").textContent = message;
    modal.classList.add("show");

    return new Promise(resolve => {
      const cleanup = () => {
        $("#cgShipCancel").onclick = null;
        $("#cgShipOk").onclick = null;
      };
      $("#cgShipCancel").onclick = () => {
        cleanup();
        modal.classList.remove("show");
        resolve(false);
      };
      $("#cgShipOk").onclick = () => {
        cleanup();
        modal.classList.remove("show");
        resolve(true);
      };
    });
  }

  function patchConfirm() {
    if (window.__CG_SHIP_CONFIRM_PATCHED__) return;
    window.__CG_SHIP_CONFIRM_PATCHED__ = true;

    const nativeConfirm = window.confirm.bind(window);
    window.confirm = function(message) {
      const msg = String(message || "");
      if (!msg.toLowerCase().includes("ship") && !msg.toLowerCase().includes("giao hàng")) {
        return nativeConfirm(message);
      }
      // Không thể trả Promise cho confirm sync, nên dùng fallback true và chặn submit ở capture bên dưới.
      return true;
    };
  }

  function patchOrderSubmit() {
    const form = $("#orderForm");
    if (!form || form.dataset.cgShipPatched === "1") return;
    form.dataset.cgShipPatched = "1";

    form.addEventListener("submit", async (e) => {
      if (form.dataset.cgShipAllow === "1") {
        form.dataset.cgShipAllow = "0";
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();

      const subtotal = getCartSubtotalSafe();
      const settings = ship().readSettings();
      const fee = ship().calcShipping(subtotal, settings);
      const finalTotal = subtotal + fee;

      // Đồng bộ global cũ để submitOrder cũ lấy đúng fee.
      window.shopSettings = {
        ...(window.shopSettings || {}),
        shippingFee: settings.shippingFee,
        freeShipFrom: settings.freeShipFrom
      };

      const ok = await webConfirmShip(`Đây là đơn giao hàng/ship. Phí ship dự kiến: ${ship().money(fee)}. Tổng tạm tính: ${ship().money(finalTotal)}. Shop có thể gọi lại nếu địa chỉ xa cần đổi phí ship. Bạn xác nhận đặt ship chứ?`);
      if (!ok) return;

      form.dataset.cgShipAllow = "1";
      form.requestSubmit();
    }, true);
  }

  function init() {
    if (!window.CGShipping) return;
    patchConfirm();
    patchOrderSubmit();
    window.addEventListener("cg-shipping-settings-changed", () => {
      window.shopSettings = {
        ...(window.shopSettings || {}),
        ...ship().readSettings()
      };
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
