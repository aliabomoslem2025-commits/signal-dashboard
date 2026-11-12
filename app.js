(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { apiBase: "", token: "", devices: [], cursor: null, query: "" };
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
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      throw new Error("برای دسترسی شبکه‌ای باید از HTTPS استفاده شود.");
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("نشانی API نباید دارای نام کاربری، رمز، query یا fragment باشد.");
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
        "Authorization": "Bearer " + state.token,
        ...(options.headers || {})
      },
      cache: "no-store",
      credentials: "omit"
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) setConnection(false, "توکن نامعتبر");
      throw new Error(body ? "خطای سرور (" + response.status + "): " + body.slice(0, 220) : "درخواست ناموفق بود (" + response.status + ").");
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function mask(value) {
    const text = String(value || "");
    return text.length > 8 ? text.slice(0, 4) + "…" + text.slice(-3) : text || "—";
  }

  function renderDevices() {
    $("device-count").textContent = String(state.devices.length);
    const tbody = $("device-rows");
    tbody.replaceChildren();
    if (!state.devices.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "empty";
      cell.textContent = "دستگاهی در این صفحه پیدا نشد.";
      row.append(cell);
      tbody.append(row);
      return;
    }
    for (const device of state.devices) {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = device.displayName || "—";
      const phone = document.createElement("td");
      phone.textContent = device.phoneNumber || "—";
      const android = document.createElement("td");
      android.className = "code";
      android.textContent = mask(device.androidId);
      android.title = device.androidId || "";
      const seen = document.createElement("td");
      seen.textContent = device.lastSeenAt ? new Date(Number(device.lastSeenAt) * 1000).toLocaleString() : "هرگز";
      const status = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "state " + (device.enabled ? "enabled" : "disabled");
      pill.textContent = device.enabled ? "فعال" : "غیرفعال";
      status.append(pill);
      const actions = document.createElement("td");
      const toggle = document.createElement("button");
      toggle.className = "table-action";
      toggle.textContent = device.enabled ? "غیرفعال‌سازی" : "فعال‌سازی";
      toggle.addEventListener("click", () => updateDevice(device, { enabled: !device.enabled }));
      actions.append(toggle);
      const revoke = document.createElement("button");
      revoke.className = "table-action danger";
      revoke.style.marginInlineStart = "7px";
      revoke.textContent = "لغو مجوز";
      revoke.addEventListener("click", () => revokeDevice(device));
      actions.append(revoke);
      row.append(name, phone, android, seen, status, actions);
      tbody.append(row);
    }
  }

  function devicePath(device) {
    return "/v1/local-auth/admin/devices/" +
      encodeURIComponent(device.phoneNumber) + "/" + encodeURIComponent(device.androidId);
  }

  async function refreshDevices(append = false) {
    const query = $("search-input").value.trim();
    if (!append) {
      state.devices = [];
      state.cursor = null;
      state.query = query;
    }
    const params = new URLSearchParams({ limit: "50", q: state.query });
    if (append && state.cursor) params.set("cursor", state.cursor);
    const page = await api("/v1/local-auth/admin/devices?" + params.toString(), { method: "GET" });
    state.devices = append ? state.devices.concat(page.devices || []) : (page.devices || []);
    state.cursor = page.nextCursor || null;
    $("load-more-button").disabled = !state.cursor;
    $("page-caption").textContent = state.cursor ? "نتایج بیشتر موجود است." : "به انتهای فهرست رسیدید.";
    renderDevices();
    setConnection(true, "متصل");
  }

  async function refreshEvents() {
    const result = await api("/v1/local-auth/admin/events?limit=100", { method: "GET" });
    const events = result.events || [];
    const tbody = $("event-rows");
    tbody.replaceChildren();
    if (!events.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "empty";
      cell.textContent = "رویدادی ثبت نشده است.";
      row.append(cell);
      tbody.append(row);
      return;
    }
    for (const event of events) {
      const row = document.createElement("tr");
      const time = document.createElement("td");
      time.textContent = event.createdAt ? new Date(Number(event.createdAt) * 1000).toLocaleString() : "—";
      const type = document.createElement("td");
      type.textContent = event.type || "—";
      const number = document.createElement("td");
      number.textContent = event.phoneNumber || "—";
      const android = document.createElement("td");
      android.textContent = mask(event.androidId);
      const success = document.createElement("td");
      success.textContent = event.success ? "موفق" : "ناموفق";
      row.append(time, type, number, android, success);
      tbody.append(row);
    }
  }

  async function updateDevice(device, fields) {
    try {
      await api(devicePath(device), { method: "PUT", body: JSON.stringify(fields) });
      showMessage("اطلاعات دستگاه به‌روزرسانی شد.", "success");
      await refreshDevices();
    } catch (error) { showMessage(error.message, "error"); }
  }

  async function revokeDevice(device) {
    if (!window.confirm("مجوز این دستگاه به‌طور کامل حذف شود؟")) return;
    try {
      await api(devicePath(device), { method: "DELETE" });
      showMessage("مجوز دستگاه حذف شد.", "success");
      await refreshDevices();
    } catch (error) { showMessage(error.message, "error"); }
  }

  $("connection-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      state.apiBase = validateBase($("api-base").value.trim());
      state.token = $("admin-token").value.trim();
      if (!state.token) throw new Error("توکن مدیریتی را وارد کنید.");
      await Promise.all([refreshDevices(), refreshEvents()]);
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
    state.cursor = null;
    $("admin-token").value = "";
    sessionStorage.removeItem("signalDashboard.apiBase");
    renderDevices();
    setConnection(false, "متصل نیست");
    showMessage("اطلاعات اتصال از نشست مرورگر پاک شد.");
  });

  $("enroll-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const phoneNumber = $("phone-number").value.trim();
    const androidId = $("android-id").value.trim();
    const publicKey = $("public-key").value.replace(/\s+/g, "");
    const displayName = $("device-name").value.trim();
    if (!/^\+[1-9][0-9]{7,14}$/.test(phoneNumber)) {
      showMessage("شماره را با قالب E.164 وارد کنید؛ برای نمونه ‎+4915112345678.", "error");
      return;
    }
    if (!androidId || androidId.length > 128) {
      showMessage("Android ID معتبر وارد کنید.", "error");
      return;
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey) || publicKey.length < 80) {
      showMessage("کلید عمومی Base64 X.509 را بررسی کنید.", "error");
      return;
    }
    try {
      await api("/v1/local-auth/admin/devices", {
        method: "POST",
        body: JSON.stringify({ phoneNumber, androidId, publicKey, displayName })
      });
      showMessage("دستگاه با موفقیت ثبت شد.", "success");
      $("public-key").value = "";
      await refreshDevices();
    } catch (error) { showMessage(error.message, "error"); }
  });

  $("search-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") refreshDevices().catch((error) => showMessage(error.message, "error"));
  });
  $("refresh-button").addEventListener("click", () => refreshDevices().catch((error) => showMessage(error.message, "error")));
  $("events-refresh-button").addEventListener("click", () => refreshEvents().catch((error) => showMessage(error.message, "error")));
  $("load-more-button").addEventListener("click", () => refreshDevices(true).catch((error) => showMessage(error.message, "error")));

  renderDevices();
})();