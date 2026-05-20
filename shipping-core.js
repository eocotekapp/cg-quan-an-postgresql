/* CG Quán Ăn - Shipping Core v24
   File riêng. Thay cài đặt ship cũ bằng localStorage + API-compatible object.
*/
(function () {
  "use strict";

  const KEY = "CG_SHIPPING_SETTINGS_V24";

  function digits(value) {
    return String(value ?? "").replace(/[^\d]/g, "");
  }

  function rawNumber(value) {
    const d = digits(value);
    return d ? Number(d) : 0;
  }

  function money(value) {
    try {
      if (typeof window.money === "function") return window.money(value);
    } catch (_) {}
    return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + "đ";
  }

  function formatInput(value) {
    const d = digits(value).replace(/^0+(?=\d)/, "");
    return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";
  }

  function readSettings() {
    const defaults = { shippingFee: 0, freeShipFrom: 0 };
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        shippingFee: Number(parsed.shippingFee || 0),
        freeShipFrom: Number(parsed.freeShipFrom || 0)
      };
    } catch (_) {
      return defaults;
    }
  }

  function saveSettings(settings) {
    const data = {
      shippingFee: rawNumber(settings.shippingFee),
      freeShipFrom: rawNumber(settings.freeShipFrom)
    };
    localStorage.setItem(KEY, JSON.stringify(data));

    // Giữ tương thích với code cũ nếu đang đọc biến global shopSettings.
    window.shopSettings = {
      ...(window.shopSettings || {}),
      shippingFee: data.shippingFee,
      freeShipFrom: data.freeShipFrom
    };

    window.dispatchEvent(new CustomEvent("cg-shipping-settings-changed", { detail: data }));
    return data;
  }

  function calcShipping(subtotal, settings = readSettings()) {
    const sub = Number(subtotal || 0);
    const fee = Number(settings.shippingFee || 0);
    const free = Number(settings.freeShipFrom || 0);
    if (free > 0 && sub >= free) return 0;
    return fee;
  }

  window.CGShipping = {
    KEY,
    digits,
    rawNumber,
    money,
    formatInput,
    readSettings,
    saveSettings,
    calcShipping
  };

  // Apply immediately to old global.
  saveSettings(readSettings());
})();
