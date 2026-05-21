/* CG Quán Ăn - Settings Core v27
   Một nơi lưu cài đặt chung. Sau này thêm setting mới thì thêm vào đây hoặc admin-settings.js.
*/
(function () {
  "use strict";

  const KEY = "CG_ADMIN_SETTINGS_V27";

  const defaults = {
    shippingFee: 0,
    freeShipFrom: 0,
    shopName: "CG Quán Ăn"
  };

  function digits(v) {
    return String(v ?? "").replace(/[^\d]/g, "");
  }

  function rawMoney(v) {
    const d = digits(v);
    return d ? Number(d) : 0;
  }

  function formatMoney(v) {
    const d = digits(v).replace(/^0+(?=\d)/, "");
    return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";
  }

  function money(v) {
    try {
      if (typeof window.money === "function") return window.money(v);
    } catch (_) {}
    return new Intl.NumberFormat("vi-VN").format(Number(v || 0)) + "đ";
  }

  function migrateOldSettings() {
    const oldKeys = ["CG_SHIPPING_SETTINGS_V26", "CG_SHIPPING_SETTINGS_V24", "CG_SHIPPING_SETTINGS_V23"];
    for (const key of oldKeys) {
      try {
        const old = JSON.parse(localStorage.getItem(key) || "{}");
        if (old && (old.shippingFee != null || old.freeShipFrom != null)) {
          return {
            shippingFee: Number(old.shippingFee || 0),
            freeShipFrom: Number(old.freeShipFrom || 0)
          };
        }
      } catch (_) {}
    }
    return {};
  }

  function readSettings() {
    try {
      return { ...defaults, ...migrateOldSettings(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    } catch (_) {
      return { ...defaults, ...migrateOldSettings() };
    }
  }

  function saveSettings(patch) {
    const next = { ...readSettings(), ...patch };
    next.shippingFee = rawMoney(next.shippingFee);
    next.freeShipFrom = rawMoney(next.freeShipFrom);
    localStorage.setItem(KEY, JSON.stringify(next));

    // Tương thích code cũ nếu đọc window.shopSettings
    window.shopSettings = {
      ...(window.shopSettings || {}),
      shopName: next.shopName,
      shippingFee: next.shippingFee,
      freeShipFrom: next.freeShipFrom
    };

    window.dispatchEvent(new CustomEvent("cg-settings-changed", { detail: next }));
    return next;
  }

  function calcShipping(subtotal, settings = readSettings()) {
    const sub = Number(subtotal || 0);
    const fee = Number(settings.shippingFee || 0);
    const free = Number(settings.freeShipFrom || 0);
    if (free > 0 && sub >= free) return 0;
    return fee;
  }

  window.CGSettings = {
    KEY,
    defaults,
    digits,
    rawMoney,
    formatMoney,
    money,
    readSettings,
    saveSettings,
    calcShipping
  };

  saveSettings(readSettings());
})();
