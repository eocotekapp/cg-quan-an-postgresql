/* CG Quán Ăn - Admin Money Settings Add-on v23 - Đã dọn sạch Phí Ship */
(function () {
  "use strict";

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

  function isAnyMoneyInput(input) {
    if (!input || input.tagName !== "INPUT") return false;
    const id = (input.id || "").toLowerCase();
    const name = (input.name || "").toLowerCase();
    const ph = (input.placeholder || "").toLowerCase();
    const label = inputLabel(input);
    const hay = `${id} ${name} ${ph} ${label}`;
    return (
      name === "price" ||
      name === "amount" ||
      id.includes("price") ||
      id.includes("amount") ||
      hay.includes("giá") ||
      hay.includes("số tiền")
    );
  }

  function scan() {
    try {
      const inputs = document.querySelectorAll("input");
      inputs.forEach((input) => {
        if (!isAnyMoneyInput(input)) return;
        if (input.__cg_money_bound__) return;
        input.__cg_money_bound__ = true;

        if (input.value) {
          input.value = formatMoney(input.value);
        }

        input.addEventListener("input", (e) => {
          const cur = e.target.value;
          const clean = formatMoney(cur);
          if (cur !== clean) {
            const start = e.target.selectionStart;
            const oldLen = cur.length;
            e.target.value = clean;
            const newLen = clean.length;
            try {
              e.target.setSelectionRange(start + (newLen - oldLen), start + (newLen - oldLen));
            } catch (_) {}
          }
          e.target.dataset.lastUserEdit = String(Date.now());
        });
      });
    } catch (err) {
      console.error("Money scan error:", err);
    }
  }

  function installSubmitNormalizer() {
    if (window.__CG_MONEY_SUBMIT_NORMALIZER__) return;
    window.__CG_MONEY_SUBMIT_NORMALIZER__ = true;
    document.addEventListener("submit", (e) => {
      try {
        const form = e.target;
        Array.from(form.querySelectorAll("input")).forEach((input) => {
          if (!isAnyMoneyInput(input)) return;
          input.value = rawMoney(input.value);
        });
      } catch (_) {}
    }, true);
  }

  function patchFormData() {
    if (window.__CG_MONEY_FORMDATA_PATCHED__) return;
    window.__CG_MONEY_FORMDATA_PATCHED__ = true;
    const NativeFormData = window.FormData;
    window.FormData = function (form) {
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
          ["price", "amount", "total"].forEach((key) => {
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
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
