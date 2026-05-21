/* CG Quán Ăn - Shipping Removed v30
   Tắt toàn bộ phí ship ở client.
*/
(function () {
  "use strict";

  const keys = [
    "CG_SHIPPING_SETTINGS_V26",
    "CG_SHIPPING_SETTINGS_V24",
    "CG_SHIPPING_SETTINGS_V23",
    "CG_ADMIN_SETTINGS_V27",
    "CG_ORDER_SHIP_OVERRIDES_V28",
    "CG_ORDER_SHIP_OVERRIDES_V27",
    "CG_ORDER_SHIP_OVERRIDES_V26"
  ];

  try {
    keys.forEach(k => localStorage.removeItem(k));
  } catch (_) {}

  window.shopSettings = {
    ...(window.shopSettings || {}),
    shippingFee: 0,
    shipFee: 0,
    deliveryFee: 0,
    freeShipFrom: 0
  };

  function stripShippingFromObject(obj) {
    if (!obj || typeof obj !== "object") return obj;
    obj.shippingFee = 0;
    obj.shipFee = 0;
    obj.deliveryFee = 0;

    // Nếu total đang bị cộng ship từ code cũ thì không đoán trừ; server/card vẫn có total riêng.
    return obj;
  }

  if (!window.__CG_REMOVE_SHIPPING_FETCH_V30__) {
    window.__CG_REMOVE_SHIPPING_FETCH_V30__ = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init = {}) {
      try {
        if (init && typeof init.body === "string") {
          const obj = JSON.parse(init.body);
          stripShippingFromObject(obj);
          init = { ...init, body: JSON.stringify(obj) };
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
  }

  // Ẩn các nút/khu cài đặt ship còn sót từ cache DOM.
  function cleanupDom() {
    document.querySelectorAll(".cg-order-ship-edit-btn, #cgShippingSettingsPanel, #cgSettingsView, #cgSettingsTaskBtn").forEach(el => el.remove());

    document.querySelectorAll("button").forEach(btn => {
      const text = (btn.textContent || "").toLowerCase();
      if (text.includes("chỉnh phí ship") || text.includes("lưu phí ship")) btn.remove();
    });

    document.querySelectorAll("label,.field,section,.panel").forEach(el => {
      const text = (el.textContent || "").toLowerCase();
      if (
        text.includes("phí ship mặc định") ||
        text.includes("miễn ship từ đơn") ||
        text.includes("cài đặt ship")
      ) {
        el.style.display = "none";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cleanupDom);
  } else {
    cleanupDom();
  }
  new MutationObserver(cleanupDom).observe(document.documentElement, { childList: true, subtree: true });
})();
