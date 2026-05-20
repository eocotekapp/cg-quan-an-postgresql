/* CG Quán Ăn - Admin Money Settings Add-on v22
   File riêng: sửa nhập phí ship/miễn ship và format tiền có dấu chấm.
   Không sửa logic chính trong admin.js.
*/
(function () {
  "use strict";

  const MONEY_INPUT_SELECTOR = [
    'input[name="shippingFee"]',
    'input[name="freeShipFrom"]',
    'input[id*="shipping" i]',
    'input[id*="ship" i]',
    'input[name*="ship" i]',
    'input[id*="fee" i]',
    'input[name*="fee" i]',
    'input[id*="price" i]',
    'input[name*="price" i]',
    'input[id*="amount" i]',
    'input[name*="amount" i]',
    'input[id*="total" i]',
    'input[name*="total" i]'
  ].join(",");

  function onlyDigits(value) {
    return String(value ?? "").replace(/[^\d]/g, "");
  }

  function formatVnMoneyDigits(digits) {
    const clean = onlyDigits(digits).replace(/^0+(?=\d)/, "");
    if (!clean) return "0";
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function rawMoney(value) {
    const digits = onlyDigits(value);
    return digits ? String(Number(digits)) : "0";
  }

  function setCaretToEnd(input) {
    try {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    } catch (_) {}
  }

  function isMoneyInput(input) {
    if (!input || input.tagName !== "INPUT") return false;
    const id = (input.id || "").toLowerCase();
    const name = (input.name || "").toLowerCase();
    const placeholder = (input.placeholder || "").toLowerCase();
    const labelText = input.closest("label")?.textContent?.toLowerCase?.() || "";
    const hay = `${id} ${name} ${placeholder} ${labelText}`;
    return (
      hay.includes("ship") ||
      hay.includes("fee") ||
      hay.includes("price") ||
      hay.includes("amount") ||
      hay.includes("total") ||
      hay.includes("tiền") ||
      hay.includes("phí") ||
      hay.includes("giá") ||
      hay.includes("miễn ship")
    );
  }

  function formatInput(input) {
    if (!isMoneyInput(input)) return;
    const digits = onlyDigits(input.value);
    const formatted = formatVnMoneyDigits(digits);
    if (input.value !== formatted) input.value = formatted;
    input.dataset.rawMoney = rawMoney(formatted);
  }

  function prepareInput(input) {
    if (!isMoneyInput(input) || input.dataset.moneyAddonReady === "1") return;
    input.dataset.moneyAddonReady = "1";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.setAttribute("pattern", "[0-9.]*");

    // Không để type=number vì number không hỗ trợ dấu chấm và dễ bị reset.
    if (input.type === "number") {
      try { input.type = "text"; } catch (_) {}
    }

    formatInput(input);

    input.addEventListener("input", () => {
      formatInput(input);
      setCaretToEnd(input);
    });

    input.addEventListener("focus", () => {
      formatInput(input);
      setCaretToEnd(input);
    });

    input.addEventListener("blur", () => {
      formatInput(input);
    });
  }

  function scanMoneyInputs() {
    const inputs = Array.from(document.querySelectorAll("input"));
    inputs.forEach((input) => {
      if (input.matches(MONEY_INPUT_SELECTOR) || isMoneyInput(input)) prepareInput(input);
    });
  }

  function normalizeFormBeforeSubmit(form) {
    if (!form) return;
    Array.from(form.querySelectorAll("input")).forEach((input) => {
      if (!isMoneyInput(input)) return;
      input.dataset.formattedMoney = input.value;
      input.value = rawMoney(input.value);
    });
    // Khôi phục lại format sau khi code gốc đã đọc FormData / submit event.
    setTimeout(() => {
      Array.from(form.querySelectorAll("input")).forEach((input) => {
        if (!isMoneyInput(input)) return;
        input.value = formatVnMoneyDigits(input.value || input.dataset.formattedMoney || "0");
      });
    }, 80);
  }

  function installSubmitNormalizer() {
    document.addEventListener("submit", (e) => {
      normalizeFormBeforeSubmit(e.target);
    }, true);

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button, input[type='submit']");
      if (!btn) return;
      const form = btn.form || btn.closest("form");
      if (!form) return;
      const text = (btn.textContent || btn.value || "").toLowerCase();
      const formText = (form.textContent || "").toLowerCase();
      if (text.includes("lưu") || formText.includes("phí ship") || formText.includes("miễn ship")) {
        normalizeFormBeforeSubmit(form);
      }
    }, true);
  }

  function patchFormData() {
    if (window.__CG_MONEY_FORMDATA_PATCHED__) return;
    window.__CG_MONEY_FORMDATA_PATCHED__ = true;

    const NativeFormData = window.FormData;
    window.FormData = function(form) {
      const fd = new NativeFormData(form);
      try {
        if (form && form.querySelectorAll) {
          Array.from(form.querySelectorAll("input")).forEach((input) => {
            if (!isMoneyInput(input) || !input.name) return;
            fd.set(input.name, rawMoney(input.value));
          });
        }
      } catch (_) {}
      return fd;
    };
    window.FormData.prototype = NativeFormData.prototype;
  }

  function patchFetchBody() {
    if (window.__CG_MONEY_FETCH_PATCHED__) return;
    window.__CG_MONEY_FETCH_PATCHED__ = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function(input, init = {}) {
      try {
        if (init && typeof init.body === "string" && init.body.includes(".")) {
          const obj = JSON.parse(init.body);
          ["shippingFee", "freeShipFrom", "shipFee", "deliveryFee", "price", "amount", "total"].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(obj, key)) obj[key] = Number(rawMoney(obj[key]));
          });
          init = { ...init, body: JSON.stringify(obj) };
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
  }

  function init() {
    scanMoneyInputs();
    installSubmitNormalizer();
    patchFormData();
    patchFetchBody();

    const observer = new MutationObserver(scanMoneyInputs);
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(scanMoneyInputs, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
