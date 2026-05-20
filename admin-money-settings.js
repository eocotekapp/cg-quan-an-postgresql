/* CG Quán Ăn - Admin Money Settings Add-on v23
   File riêng: chống ô phí ship / miễn ship bị admin.js tự nhảy về 0 khi đang nhập.
*/
(function () {
  "use strict";

  const LOCK_MS = 3500;

  function onlyDigits(value) {
    return String(value ?? "").replace(/[^\d]/g, "");
  }

  function rawMoney(value) {
    const digits = onlyDigits(value);
    return digits ? String(Number(digits)) : "0";
  }

  function formatMoney(value) {
    const clean = onlyDigits(value).replace(/^0+(?=\d)/, "");
    if (!clean) return "0";
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function inputLabel(input) {
    return (input.closest("label")?.textContent || "").toLowerCase();
  }

  function isSettingsMoneyInput(input) {
    if (!input || input.tagName !== "INPUT") return false;
    const id = (input.id || "").toLowerCase();
    const name = (input.name || "").toLowerCase();
    const ph = (input.placeholder || "").toLowerCase();
    const label = inputLabel(input);
    const hay = `${id} ${name} ${ph} ${label}`;
    return (
      name === "shippingfee" ||
      name === "freeshipfrom" ||
      id.includes("shippingfee") ||
      id.includes("freeshipfrom") ||
      hay.includes("phí ship") ||
      hay.includes("miễn ship") ||
      hay.includes("shippingfee") ||
      hay.includes("freeshipfrom")
    );
  }

  function isAnyMoneyInput(input) {
    if (!input || input.tagName !== "INPUT") return false;
    if (isSettingsMoneyInput(input)) return true;
    const id = (input.id || "").toLowerCase();
    const name = (input.name || "").toLowerCase();
    const ph = (input.placeholder || "").toLowerCase();
    const label = inputLabel(input);
    const hay = `${id} ${name} ${ph} ${label}`;
    return (
      hay.includes("giá") ||
      hay.includes("tiền") ||
      hay.includes("phí") ||
      hay.includes("price") ||
      hay.includes("amount") ||
      hay.includes("total") ||
      hay.includes("fee")
    );
  }

  function setEnd(input) {
    try {
      const n = input.value.length;
      input.setSelectionRange(n, n);
    } catch (_) {}
  }

  function lockInput(input) {
    input.dataset.moneyEditing = "1";
    input.dataset.moneyLockUntil = String(Date.now() + LOCK_MS);
  }

  function unlockLater(input) {
    input.dataset.moneyLockUntil = String(Date.now() + 600);
    setTimeout(() => {
      if (Date.now() >= Number(input.dataset.moneyLockUntil || 0)) {
        input.dataset.moneyEditing = "0";
      }
    }, 700);
  }

  function isLocked(input) {
    return input.dataset.moneyEditing === "1" || Date.now() < Number(input.dataset.moneyLockUntil || 0);
  }

  function applyFormat(input, keepCaret = true) {
    const formatted = formatMoney(input.value);
    input.dataset.rawMoney = rawMoney(formatted);
    if (input.value !== formatted) input.value = formatted;
    if (keepCaret) setEnd(input);
  }

  function prepareInput(input) {
    if (!isAnyMoneyInput(input) || input.dataset.moneyAddonReady === "1") return;

    input.dataset.moneyAddonReady = "1";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.setAttribute("pattern", "[0-9.]*");

    if (input.type === "number") {
      try { input.type = "text"; } catch (_) {}
    }

    applyFormat(input, false);

    input.addEventListener("focus", () => {
      lockInput(input);
      applyFormat(input);
    }, true);

    input.addEventListener("input", () => {
      lockInput(input);
      applyFormat(input);
    }, true);

    input.addEventListener("keydown", () => {
      lockInput(input);
    }, true);

    input.addEventListener("blur", () => {
      applyFormat(input, false);
      unlockLater(input);
    }, true);
  }

  function scan() {
    Array.from(document.querySelectorAll("input")).forEach(prepareInput);
  }

  function snapshotSettingsInputs() {
    const map = new Map();
    Array.from(document.querySelectorAll("input")).forEach((input) => {
      if (!isSettingsMoneyInput(input)) return;
      if (!isLocked(input)) return;
      map.set(input, input.value);
    });
    return map;
  }

  function restoreLocked(snapshot) {
    snapshot.forEach((value, input) => {
      if (!document.body.contains(input)) return;
      if (!isSettingsMoneyInput(input) || !isLocked(input)) return;
      if (input.value !== value) input.value = value;
      applyFormat(input, false);
    });
  }

  function protectAgainstExternalOverwrite() {
    // Capture phase: trước các handler gốc
    ["input", "keydown", "keyup", "focus"].forEach((evt) => {
      document.addEventListener(evt, (e) => {
        if (isSettingsMoneyInput(e.target)) {
          lockInput(e.target);
          setTimeout(() => restoreLocked(snapshotSettingsInputs()), 0);
          setTimeout(() => restoreLocked(snapshotSettingsInputs()), 120);
          setTimeout(() => restoreLocked(snapshotSettingsInputs()), 600);
        }
      }, true);
    });

    // Mutation/interval: nếu admin.js refresh settings khi đang nhập, kéo lại giá trị người dùng
    let lastValues = new Map();

    setInterval(() => {
      Array.from(document.querySelectorAll("input")).forEach((input) => {
        if (!isSettingsMoneyInput(input)) return;

        if (isLocked(input)) {
          const last = lastValues.get(input);
          if (last && input.value !== last) input.value = last;
          applyFormat(input, false);
        } else {
          lastValues.set(input, input.value);
        }
      });
    }, 80);

    document.addEventListener("input", (e) => {
      if (!isSettingsMoneyInput(e.target)) return;
      lastValues.set(e.target, e.target.value);
    }, true);
  }

  function normalizeInputForSubmit(input) {
    if (!isAnyMoneyInput(input)) return;
    input.dataset.formattedMoney = input.value;
    input.value = rawMoney(input.value);
  }

  function restoreAfterSubmit(form) {
    setTimeout(() => {
      Array.from(form.querySelectorAll("input")).forEach((input) => {
        if (!isAnyMoneyInput(input)) return;
        input.value = formatMoney(input.value || input.dataset.formattedMoney || "0");
      });
    }, 80);
  }

  function installSubmitNormalizer() {
    document.addEventListener("submit", (e) => {
      const form = e.target;
      Array.from(form.querySelectorAll("input")).forEach(normalizeInputForSubmit);
      restoreAfterSubmit(form);
    }, true);

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button, input[type='submit']");
      if (!btn) return;
      const form = btn.form || btn.closest("form");
      if (!form) return;
      const text = `${btn.textContent || btn.value || ""} ${form.textContent || ""}`.toLowerCase();
      if (!text.includes("lưu") && !text.includes("ship") && !text.includes("phí")) return;
      Array.from(form.querySelectorAll("input")).forEach(normalizeInputForSubmit);
      restoreAfterSubmit(form);
    }, true);
  }

  function patchFormData() {
    if (window.__CG_MONEY_FORMDATA_PATCHED_V23__) return;
    window.__CG_MONEY_FORMDATA_PATCHED_V23__ = true;
    const NativeFormData = window.FormData;
    window.FormData = function(form) {
      const fd = new NativeFormData(form);
      try {
        if (form && form.querySelectorAll) {
          Array.from(form.querySelectorAll("input")).forEach((input) => {
            if (!isAnyMoneyInput(input) || !input.name) return;
            fd.set(input.name, rawMoney(input.value));
          });
        }
      } catch (_) {}
      return fd;
    };
    window.FormData.prototype = NativeFormData.prototype;
  }

  function patchFetch() {
    if (window.__CG_MONEY_FETCH_PATCHED_V23__) return;
    window.__CG_MONEY_FETCH_PATCHED_V23__ = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init = {}) {
      try {
        if (init && typeof init.body === "string") {
          const obj = JSON.parse(init.body);
          ["shippingFee", "freeShipFrom", "shipFee", "deliveryFee", "price", "amount", "total"].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              obj[key] = Number(rawMoney(obj[key]));
            }
          });
          init = { ...init, body: JSON.stringify(obj) };
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
  }

  function init() {
    scan();
    installSubmitNormalizer();
    patchFormData();
    patchFetch();
    protectAgainstExternalOverwrite();

    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    setInterval(scan, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
