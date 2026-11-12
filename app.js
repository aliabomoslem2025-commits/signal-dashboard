(() => {
  const $ = (id) => document.getElementById(id);
  const state = { baseUrl: "", token: "", cursor: null, devices: [], events: [] };

  const safeText = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);

  function setMessage(message, kind) {
    $("connectionMessage").textContent = message;
    $("connectionMessage").className = "message " + (kind || "");
  }

  function setConnected(connected) {
    $("connectionDot").classList.toggle("online", connected);
    $("connectionLabel").textContent = connected ? "Connected to LAN server" : "Not connected";
  }

  function apiUrl(path) {
    return state.baseUrl.replace(/\/$/, "") + path;
  }

  async function api(path, options) {
    options = options || {};
    if (!state.baseUrl || !state.token) throw new Error("Connect to your Signal server first.");
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        "Accept": "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        "Authorization": "Bearer " + state.token,
        ...(options.headers || {})
      }
    });
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); } catch { data = { message: raw }; }
    }
    if (!response.ok) {
      throw new Error((data && (data.message || data.detail)) || ("HTTP " + response.status));
    }
    return data;
  }

  function fingerprint(base64Key) {
    try {
      const binary = atob(base64Key);
      let hash = 2166136261;
      for (let i = 0; i < binary.length; i++) {
        hash ^= binary.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, "0").toUpperCase();
    } catch {
      return "unknown";
    }
  }

  function renderDevices() {
    const rows = state.devices.map((device) => {
      const phone = safeText(device.phoneNumber);
      const android = safeText(device.androidId);
      const name = safeText(device.displayName || "Android device");
      const enabled = !!device.enabled;
      return "<tr>" +
        "<td><strong>" + phone + "</strong></td>" +
        "<td>" + name + "</td>" +
        '<td class="code">' + android + "</td>" +
        '<td class="code">' + safeText(fingerprint(device.publicKey)) + "</td>" +
        '<td><span class="badge ' + (enabled ? "enabled" : "disabled") + '">' + (enabled ? "ENABLED" : "DISABLED") + "</span></td>" +
        '<td><div class="row-actions">' +
        '<button class="secondary" data-action="toggle" data-phone="' + encodeURIComponent(device.phoneNumber) + '" data-android="' + encodeURIComponent(device.androidId) + '" data-enabled="' + enabled + '">' + (enabled ? "Disable" : "Enable") + "</button>" +
        '<button class="danger" data-action="delete" data-phone="' + encodeURIComponent(device.phoneNumber) + '" data-android="' + encodeURIComponent(device.androidId) + '">Revoke</button>' +
        "</div></td></tr>";
    }).join("");

    $("deviceRows").innerHTML = rows || '<tr><td colspan="6" class="empty">No authorized devices found.</td></tr>';
    $("deviceCount").textContent = String(state.devices.length);
    $("paginationLabel").textContent = state.cursor ? "More devices are available." : "End of device list.";
    $("loadMoreButton").disabled = !state.cursor;
  }

  async function loadDevices(append) {
    append = !!append;
    if (!append) {
      state.devices = [];
      state.cursor = null;
    }
    const params = new URLSearchParams({ limit: "50", q: $("deviceSearch").value.trim() });
    if (append && state.cursor) params.set("cursor", state.cursor);
    const result = await api("/v1/local-auth/admin/devices?" + params.toString());
    state.devices = append ? state.devices.concat(result.devices || []) : (result.devices || []);
    state.cursor = result.nextCursor || null;
    renderDevices();
    setConnected(true);
    setMessage("Device list refreshed.", "success");
  }

  async function loadEvents() {
    const result = await api("/v1/local-auth/admin/events?limit=100");
    state.events = result.events || [];
    $("eventRows").innerHTML = state.events.length ? state.events.map((item) => {
      const date = new Date((item.createdAt || 0) * 1000);
      return "<tr><td>" + safeText(date.toLocaleString()) + "</td>" +
        "<td><strong>" + safeText(item.type) + "</strong></td>" +
        "<td>" + safeText(item.phoneNumber) + "</td>" +
        '<td class="code">' + safeText(item.androidId) + "</td>" +
        '<td><span class="badge ' + (item.success ? "ok" : "failed") + '">' + (item.success ? "SUCCESS" : "FAILED") + "</span></td></tr>";
    }).join("") : '<tr><td colspan="5" class="empty">No security events yet.</td></tr>';
    $("latestEvent").textContent = state.events[0] ? state.events[0].type : "None";
  }

  $("connectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.baseUrl = $("serverUrl").value.trim().replace(/\/$/, "");
    state.token = $("adminToken").value.trim();
    sessionStorage.setItem("signalAdminToken", state.token);
    localStorage.setItem("signalAdminUrl", state.baseUrl);
    setMessage("Checking dashboard API access…");
    try {
      await loadDevices(false);
      await loadEvents();
    } catch (error) {
      setConnected(false);
      setMessage(error.message, "error");
    }
  });

  $("deviceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      phoneNumber: $("phoneNumber").value.trim(),
      androidId: $("androidId").value.trim(),
      displayName: $("displayName").value.trim(),
      publicKey: $("publicKey").value.trim()
    };
    try {
      await api("/v1/local-auth/admin/devices", { method: "POST", body: JSON.stringify(payload) });
      $("deviceForm").reset();
      setMessage("Device authorized.", "success");
      await loadDevices(false);
      await loadEvents();
    } catch (error) {
      setMessage(error.message, "error");
    }
  });

  $("deviceRows").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const phone = decodeURIComponent(button.dataset.phone);
    const android = decodeURIComponent(button.dataset.android);
    if (button.dataset.action === "toggle") {
      const currentlyEnabled = button.dataset.enabled === "true";
      try {
        await api("/v1/local-auth/admin/devices/" + encodeURIComponent(phone) + "/" + encodeURIComponent(android), {
          method: "PUT",
          body: JSON.stringify({ enabled: !currentlyEnabled })
        });
        await loadDevices(false);
        await loadEvents();
      } catch (error) {
        setMessage(error.message, "error");
      }
      return;
    }

    $("dialogTitle").textContent = "Revoke device access?";
    $("dialogText").textContent = "The selected Android device will no longer be able to authenticate with this phone number.";
    const dialog = $("confirmDialog");
    dialog.showModal();
    $("dialogConfirm").onclick = async (dialogEvent) => {
      dialogEvent.preventDefault();
      dialog.close("confirm");
      try {
        await api("/v1/local-auth/admin/devices/" + encodeURIComponent(phone) + "/" + encodeURIComponent(android), { method: "DELETE" });
        await loadDevices(false);
        await loadEvents();
      } catch (error) {
        setMessage(error.message, "error");
      }
    };
  });

  $("refreshButton").addEventListener("click", () => loadDevices(false).catch((e) => setMessage(e.message, "error")));
  $("refreshEventsButton").addEventListener("click", () => loadEvents().catch((e) => setMessage(e.message, "error")));
  $("loadMoreButton").addEventListener("click", () => loadDevices(true).catch((e) => setMessage(e.message, "error")));
  let searchTimer;
  $("deviceSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadDevices(false).catch((e) => setMessage(e.message, "error")), 250);
  });

  $("serverUrl").value = localStorage.getItem("signalAdminUrl") || "";
  $("adminToken").value = sessionStorage.getItem("signalAdminToken") || "";
})();
