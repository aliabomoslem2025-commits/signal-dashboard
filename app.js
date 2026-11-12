(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { apiBase: "", token: "", devices: [] };
  const storedBase = sessionStorage.getItem("signalDashboard.apiBase");
  if (storedBase) $("api-base").value = storedBase;

  function showMessage(text, kind = "success") {
    const node = $("message");
    node.textContent = text;
    node.className = "message " + kind;
    node.hidden = false;
  }

  function setConnection(ok, text) {
    const node = $("connection-status");
    node.textContent = text;
    node.className = "status " + (ok ? "status-ok" : "status-error");
  }

  function validateBase(value) {
    const parsed = new URL(value);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("نشانی سرور معتبر نیست.");
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      throw new Error("برای اتصال غیرمحلی باید از HTTPS استفاده شود.");
    }
    return parsed.origin;
  }

  async function api(path, options = {}) {
    if (!state.apiBase || !state.token) throw new Error("ابتدا به سرور متصل شوید.");
    const response = await fetch(state.apiBase + path, {
      ...options,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Local-Admin-Token": state.token,
        ...(options.headers || {})
      },
      cache: "no-store",
      credentials: "omit"
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        setConnection(false, "اعتبار دسترسی نامعتبر");
      }
      throw new Error(body ? "خطای سرور (" + response.status + "): " + body.slice(0, 240) : "درخواست ناموفق بود (" + response.status + ").");
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function renderRows() {
    const query = $("search-input").value.trim().toLowerCase();
    const filtered = state.devices.filter((d) => String(d.number || "").toLowerCase().includes(query));
    $("device-count").textContent = String(state.devices.length);
    const tbody = $("device-rows");
    tbody.replaceChildren();
    if (!filtered.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "empty";
      cell.textContent = state.devices.length ? "موردی با این جستجو پیدا نشد." : "هنوز دستگاهی ثبت نشده است.";
      row.append(cell);
      tbody.append(row);
      return;
    }
    for (const device of filtered) {
      const row = document.createElement("tr");
      const number = document.createElement("td");
      number.textContent = device.number || "—";
      const hash = document.createElement("td");
      hash.className = "code";
      const rawHash = String(device.deviceHash || "");
      hash.textContent = rawHash ? rawHash.slice(0, 12) + "…" : "—";
      hash.title = rawHash;
      const created = document.createElement("td");
      created.textContent = device.createdAt ? new Date(Number(device.createdAt) * 1000).toLocaleString() : "—";
      const status = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "state " + (device.enabled ? "enabled" : "disabled");
      pill.textContent = device.enabled ? "فعال" : "غیرفعال";
      status.append(pill);
      const actions = document.createElement("td");
      const toggle = document.createElement("button");
      toggle.className = "table-action";
      toggle.textContent = device.enabled ? "غیرفعال‌سازی" : "فعال‌سازی";
      toggle.addEventListener("click", () => toggleDevice(device));
      actions.append(toggle);
      const revoke = document.createElement("button");
      revoke.className = "table-action danger";
      revoke.style.marginInlineStart = "7px";
      revoke.textContent = "لغو مجوز";
      revoke.addEventListener("click", () => revokeDevice(device));
      actions.append(revoke);
      row.append(number, hash, created, status, actions);
      tbody.append(row);
    }
  }

  async function refresh() {
    const records = await api("/v1/admin/device-enrollments", { method: "GET" });
    state.devices = Array.isArray(records) ? records : [];
    renderRows();
    setConnection(true, "متصل");
  }

  async function toggleDevice(device) {
    const nextEnabled = !device.enabled;
    try {
      await api("/v1/admin/device-enrollments", {
        method: "POST",
        body: JSON.stringify({
          number: device.number,
          androidId: $("android-id").value.trim() || "",
          enabled: nextEnabled
        })
      });
      showMessage("وضعیت دستگاه تغییر کرد. برای دستگاه‌های موجود، Android ID اصلی را برای به‌روزرسانی لازم است وارد کنید.", "success");
      await refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function revokeDevice(device) {
    const androidId = window.prompt("برای لغو مجوز، Android ID اصلی این دستگاه را وارد کنید:");
    if (!androidId) return;
    if (!window.confirm("مجوز این دستگاه به‌طور کامل حذف شود؟")) return;
    try {
      await api("/v1/admin/device-enrollments", {
        method: "DELETE",
        body: JSON.stringify({ number: device.number, androidId, enabled: false })
      });
      showMessage("مجوز دستگاه حذف شد.", "success");
      await refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  $("connection-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.apiBase = validateBase($("api-base").value.trim());
      state.token = $("admin-token").value.trim();
      if (!state.token) throw new Error("توکن مدیریتی را وارد کنید.");
      await refresh();
      sessionStorage.setItem("signalDashboard.apiBase", state.apiBase);
      showMessage("اتصال به سرور برقرار شد.", "success");
    } catch (error) {
      setConnection(false, "خطا در اتصال");
      showMessage(error.message, "error");
    }
  });

  $("disconnect-button").addEventListener("click", () => {
    state.apiBase = "";
    state.token = "";
    state.devices = [];
    $("admin-token").value = "";
    sessionStorage.removeItem("signalDashboard.apiBase");
    renderRows();
    setConnection(false, "متصل نیست");
    showMessage("اطلاعات اتصال از نشست مرورگر پاک شد.");
  });

  $("enroll-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const number = $("phone-number").value.trim();
    const androidId = $("android-id").value.trim();
    if (!/^\+[1-9][0-9]{7,14}$/.test(number)) {
      showMessage("شماره را با قالب E.164 وارد کنید؛ برای نمونه ‎+4915112345678.", "error");
      return;
    }
    if (androidId.length < 4) {
      showMessage("Android ID واردشده معتبر به نظر نمی‌رسد.", "error");
      return;
    }
    try {
      await api("/v1/admin/device-enrollments", {
        method: "POST",
        body: JSON.stringify({ number, androidId, enabled: $("device-enabled").checked })
      });
      showMessage("دستگاه با موفقیت ثبت شد.", "success");
      await refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  });

  $("search-input").addEventListener("input", renderRows);
  $("refresh-button").addEventListener("click", async () => {
    try { await refresh(); showMessage("فهرست به‌روز شد."); }
    catch (error) { showMessage(error.message, "error"); }
  });

  renderRows();
})();