/* CG Quán Ăn - Admin Settings Tab v27
   File riêng. Tạo tab Cài đặt trong dashboard admin.
   Không sửa render chính trong admin.js.
*/
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const settings = () => window.CGSettings;

  function notify(title, message) {
    let modal = $("#cgSettingsInfoModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "cgSettingsInfoModal";
      modal.className = "modal cg-settings-info-modal";
      modal.innerHTML = `
        <div class="modal-card">
          <div class="success-icon">✓</div>
          <h2 id="cgSettingsInfoTitle"></h2>
          <p id="cgSettingsInfoMessage"></p>
          <button id="cgSettingsInfoClose" class="btn primary full" type="button">Đóng</button>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => {
        if (e.target.id === "cgSettingsInfoModal" || e.target.closest("#cgSettingsInfoClose")) {
          modal.classList.remove("show");
        }
      });
    }
    $("#cgSettingsInfoTitle").textContent = title;
    $("#cgSettingsInfoMessage").textContent = message;
    modal.classList.add("show");
  }

  function ensureSettingsTabButton() {
    const bar = $("#bottomTaskBar") || $(".bottom-taskbar");
    if (!bar || $("#cgSettingsTaskBtn")) return;

    const btn = document.createElement("button");
    btn.id = "cgSettingsTaskBtn";
    btn.className = "bottom-task";
    btn.type = "button";
    btn.innerHTML = `<span>⚙️</span><b>Cài đặt</b>`;
    bar.appendChild(btn);

    btn.addEventListener("click", () => openSettingsView());
  }

  function ensureSettingsView() {
    let view = $("#cgSettingsView");
    if (view) return view;

    view = document.createElement("section");
    view.id = "cgSettingsView";
    view.className = "section cg-settings-view";
    view.innerHTML = `
      <div class="section-head">
        <div>
          <p class="eyebrow">Cài đặt</p>
          <h2>Cài đặt hệ thống</h2>
          <p class="muted">Nơi đặt các cài đặt chung của admin. Sau này thêm mục mới vào đây.</p>
        </div>
      </div>

      <div class="panel cg-settings-panel">
        <h3>🚚 Cài đặt ship</h3>
        <p class="muted">Phí ship mặc định sẽ hiện cho khách khi đặt ship. Đơn xa vẫn có thể chỉnh phí riêng trong card đơn ship.</p>

        <form id="cgSettingsForm" class="cg-settings-form">
          <label class="field">
            <span>Phí ship mặc định</span>
            <input name="shippingFee" inputmode="numeric" autocomplete="off">
          </label>

          <label class="field">
            <span>Miễn ship từ đơn</span>
            <input name="freeShipFrom" inputmode="numeric" autocomplete="off">
          </label>

          <button class="btn primary full" type="submit">Lưu cài đặt</button>
        </form>
      </div>
    `;

    const main = $("main, .admin-main, .dashboard, body");
    main.appendChild(view);

    view.addEventListener("input", (e) => {
      const input = e.target.closest("input");
      if (!input) return;
      if (input.name === "shippingFee" || input.name === "freeShipFrom") {
        input.value = settings().formatMoney(input.value);
      }
    });

    view.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const saved = settings().saveSettings({
        shippingFee: form.shippingFee.value,
        freeShipFrom: form.freeShipFrom.value
      });
      fillSettingsForm(saved);
      notify(
        "Đã lưu cài đặt",
        `Phí ship mặc định: ${settings().money(saved.shippingFee)} • Miễn ship từ đơn: ${settings().money(saved.freeShipFrom)}`
      );
    });

    return view;
  }

  function fillSettingsForm(data = settings().readSettings()) {
    const form = $("#cgSettingsForm");
    if (!form) return;
    form.shippingFee.value = settings().formatMoney(data.shippingFee);
    form.freeShipFrom.value = settings().formatMoney(data.freeShipFrom);
  }

  function hideMainAdminViews() {
    // Ẩn các khối chính, nhưng không ẩn topbar/bottom taskbar/modal.
    $$("main > section, .admin-main > section").forEach((el) => {
      if (el.id === "cgSettingsView") return;
      el.classList.add("cg-settings-hidden");
    });

    // Nếu theme không dùng main > section, dùng fallback nhẹ.
    $$("section").forEach((el) => {
      if (el.id === "cgSettingsView") return;
      if (el.closest("#cgSettingsView")) return;
      const text = (el.textContent || "").toLowerCase();
      if (text.includes("dashboard") || text.includes("đơn mới") || text.includes("cài đặt vận hành")) {
        el.classList.add("cg-settings-hidden");
      }
    });
  }

  function restoreMainAdminViews() {
    $$(".cg-settings-hidden").forEach((el) => el.classList.remove("cg-settings-hidden"));
    const view = $("#cgSettingsView");
    if (view) view.classList.remove("show");
    const btn = $("#cgSettingsTaskBtn");
    if (btn) btn.classList.remove("active");
  }

  function openSettingsView() {
    ensureSettingsView();
    fillSettingsForm();
    hideMainAdminViews();
    $("#cgSettingsView").classList.add("show");

    $$("#bottomTaskBar .bottom-task, .bottom-taskbar .bottom-task").forEach((b) => b.classList.remove("active"));
    $("#cgSettingsTaskBtn")?.classList.add("active");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function installReturnFromOtherTabs() {
    document.addEventListener("click", (e) => {
      const task = e.target.closest("#bottomTaskBar .bottom-task, .bottom-taskbar .bottom-task");
      if (!task || task.id === "cgSettingsTaskBtn") return;
      restoreMainAdminViews();
    }, true);
  }

  function hideOldSettingsFieldsOnly() {
    // Ẩn đúng field cũ, không ẩn cả dashboard.
    $$("label").forEach((label) => {
      if (label.closest("#cgSettingsView")) return;
      const t = (label.textContent || "").toLowerCase();
      if (t.includes("phí ship mặc định") || t.includes("miễn ship từ đơn")) {
        (label.closest(".field") || label).style.display = "none";
      }
    });
  }

  function init() {
    if (!window.CGSettings) return;
    ensureSettingsTabButton();
    ensureSettingsView();
    fillSettingsForm();
    hideOldSettingsFieldsOnly();
    installReturnFromOtherTabs();

    new MutationObserver(() => {
      ensureSettingsTabButton();
      hideOldSettingsFieldsOnly();
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
