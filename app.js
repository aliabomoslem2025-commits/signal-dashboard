(() => {
  const $ = (id) => document.getElementById(id);
  const state = { selectedPhone: null, users: [] };
  const apiBase = $("apiBase");
  const tokenInput = $("adminToken");
  const toast = $("toast");
  let toastTimer;

  $("year").textContent = new Date().getFullYear();
  apiBase.value = sessionStorage.getItem("signalLocalAuthApi") || window.location.origin;
  tokenInput.value = sessionStorage.getItem("signalLocalAuthAdminToken") || "";

  function notify(message, isError = false) {
    toast.textContent = message;
    toast.style.borderColor = isError ? "#b85a65" : "#52749b";
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3800);
  }

  function setConnected(connected, label) {
    $("statusDot").classList.toggle("ok", connected);
    $("statusText").textContent = label;
  }

  function normalizedBase() {
    const value = apiBase.value.trim().replace(/\/+$/, "");
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error("Use HTTPS for every non-localhost server.");
    }
    return value;
  }

  async function request(path, options = {}) {
    const base = normalizedBase();
    const token = tokenInput.value.trim();
    if (!token) throw new Error("Enter the administrator bearer token first.");
    const response = await fetch(base + path, {
      ...options,
      headers: {
        "Authorization": "Bearer " + token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      cache: "no-store",
      credentials: "omit"
    });
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Request failed (" + response.status + ").");
    return body;
  }

  function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  async function loadUsers() {
    const result = await request("/v1/local-auth/admin/users");
    state.users = result.users || [];
    renderUsers();
    if (state.selectedPhone && state.users.some(u => u.phone === state.selectedPhone)) {
      await loadDevices(state.selectedPhone);
    } else {
      state.selectedPhone = null;
      $("deviceTitle").textContent = "Select a user";
      $("deviceContent").textContent = "Choose a user on the left to inspect or enroll devices.";
    }
    await loadEvents();
    setConnected(true, "Connected");
  }

  async function loadEvents() {
    const root = $("events");
    try {
      const result = await request("/v1/local-auth/admin/events?limit=25");
      const events = result.events || [];
      root.replaceChildren();
      root.className = events.length ? "list" : "list empty";
      if (!events.length) {
        root.textContent = "No administrative events recorded yet.";
        return;
      }
      for (const event of events) {
        const row = document.createElement("div");
        row.className = "device-row";
        const details = document.createElement("div");
        const date = event.createdAt ? new Date(event.createdAt).toLocaleString() : "Unknown time";
        const metadata = event.metadata && Object.keys(event.metadata).length
          ? " · " + JSON.stringify(event.metadata)
          : "";
        details.innerHTML = "<strong>" + escapeText(event.eventType) + "</strong>" +
          '<div class="device-meta">' + escapeText(event.target) + " · " + escapeText(date) + "</div>" +
          '<div class="device-meta">Connection peer: ' + escapeText(event.sourceIp || "unknown") +
          escapeText(metadata) + "</div>";
        row.appendChild(details);
        root.appendChild(row);
      }
    } catch (error) {
      root.className = "list empty";
      root.textContent = "Audit events unavailable: " + error.message;
    }
  }

  function renderUsers() {
    const root = $("users");
    root.replaceChildren();
    if (!state.users.length) {
      root.textContent = "No users are enrolled yet.";
      root.className = "list empty";
      return;
    }
    root.className = "list";
    for (const user of state.users) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "list-row" + (user.phone === state.selectedPhone ? " selected" : "");
      row.innerHTML = '<span><strong>' + escapeText(user.displayName || user.phone) +
        '</strong><span class="sub">' + escapeText(user.phone) + ' · ' +
        Number(user.activeDevices || 0) + ' active device(s)</span></span>' +
        '<span class="pill ' + (user.active ? "" : "off") + '">' + (user.active ? "ACTIVE" : "DISABLED") + "</span>";
      row.addEventListener("click", () => loadDevices(user.phone).catch(e => notify(e.message, true)));
      root.appendChild(row);
    }
  }

  async function loadDevices(phone) {
    state.selectedPhone = phone;
    renderUsers();
    $("deviceTitle").textContent = phone;
    $("deviceContent").textContent = "Loading devices…";
    const result = await request("/v1/local-auth/admin/users/" + encodeURIComponent(phone) + "/devices");
    renderDevices(phone, result.devices || []);
  }

  function renderDevices(phone, devices) {
    const root = $("deviceContent");
    root.replaceChildren();

    const selectedUser = state.users.find(user => user.phone === phone);
    if (selectedUser) {
      const statusButton = document.createElement("button");
      statusButton.className = selectedUser.active ? "danger small" : "primary small";
      statusButton.textContent = selectedUser.active ? "Block new sign-ins" : "Allow new sign-ins";
      statusButton.addEventListener("click", async () => {
        const nextActive = !selectedUser.active;
        const action = nextActive ? "allow new sign-ins for" : "block new sign-ins for";
        if (!confirm("Are you sure you want to " + action + " " + phone + "? Existing Signal sessions are not terminated by this action.")) return;
        try {
          await request("/v1/local-auth/admin/user-status/" + encodeURIComponent(phone), {
            method: "PATCH",
            body: JSON.stringify({ active: nextActive })
          });
          notify("Future local device sign-ins " + (nextActive ? "allowed." : "blocked.") + " Existing Signal sessions remain active.");
          await loadUsers();
        } catch (error) {
          notify(error.message, true);
        }
      });
      root.appendChild(statusButton);
    }

    const form = document.createElement("form");
    form.className = "device-form";
    form.innerHTML = `
      <h3>Enroll an authorized Android device</h3>
      <label>Paste device enrollment JSON from the Android app<textarea id="deviceEnrollmentBundle" spellcheck="false" placeholder='{"formatVersion":1,"androidId":"...","publicKeyPem":"-----BEGIN PUBLIC KEY-----..."}'></textarea></label>
      <button class="quiet small" id="importDeviceEnrollment" type="button">Import device information</button>
      <label>Android ID<input id="newAndroidId" autocomplete="off" minlength="4" maxlength="256" required placeholder="Android secure ID"></label>
      <label>Device label<input id="newDeviceLabel" maxlength="120" placeholder="e.g. Warehouse tablet 01"></label>
      <label>ECDSA P-256 public key (PEM)<textarea id="newPublicKey" required spellcheck="false" placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"></textarea></label>
      <button class="primary" type="submit">Enroll device</button>
      <p class="help">In the app, choose Copy device enrollment information, paste the JSON above, and click Import. The private key is never included or exported.</p>
    `;
    $("importDeviceEnrollment").addEventListener("click", () => {
      try {
        const bundle = JSON.parse($("deviceEnrollmentBundle").value);
        if (bundle.formatVersion !== 1 ||
            typeof bundle.androidId !== "string" ||
            typeof bundle.publicKeyPem !== "string" ||
            !bundle.publicKeyPem.includes("-----BEGIN PUBLIC KEY-----") ||
            !bundle.publicKeyPem.includes("-----END PUBLIC KEY-----")) {
          throw new Error("The JSON must contain a version 1 Android ID and public key PEM.");
        }
        $("newAndroidId").value = bundle.androidId.trim();
        $("newPublicKey").value = bundle.publicKeyPem.trim();
        notify("Device ID and public key imported. The private key is not part of this bundle.");
      } catch (error) {
        notify("Invalid enrollment JSON: " + error.message, true);
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = {
        androidId: $("newAndroidId").value.trim(),
        label: $("newDeviceLabel").value.trim(),
        publicKeyPem: $("newPublicKey").value.trim()
      };
      try {
        const response = await request("/v1/local-auth/admin/users/" + encodeURIComponent(phone) + "/devices", {
          method: "POST", body: JSON.stringify(body)
        });
        notify("Device enrolled. Device ID: " + response.deviceId);
        await loadDevices(phone);
      } catch (error) {
        notify(error.message, true);
      }
    });
    root.appendChild(form);

    if (!devices.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No devices are enrolled for this user.";
      root.appendChild(empty);
      return;
    }
    for (const device of devices) {
      const row = document.createElement("div");
      row.className = "device-row";
      const meta = document.createElement("div");
      meta.innerHTML = '<strong>' + escapeText(device.label || "Unnamed device") + '</strong>' +
        '<div class="device-meta">ID: ' + escapeText(device.id) + '</div>' +
        '<div class="device-meta">Enrolled: ' + escapeText(new Date(device.createdAt).toLocaleString()) +
        (device.lastSeenAt ? ' · Last seen: ' + escapeText(new Date(device.lastSeenAt).toLocaleString()) : "") +
        '</div><span class="pill ' + (device.active ? "" : "off") + '">' + (device.active ? "ACTIVE" : "REVOKED") + "</span>";
      row.appendChild(meta);
      if (device.active) {
        const revoke = document.createElement("button");
        revoke.className = "danger small";
        revoke.textContent = "Revoke";
        revoke.addEventListener("click", async () => {
          if (!confirm("Revoke this device? It will no longer be able to authenticate.")) return;
          try {
            await request("/v1/local-auth/admin/devices/" + encodeURIComponent(device.id), { method: "DELETE" });
            notify("Device revoked.");
            await loadDevices(phone);
          } catch (error) {
            notify(error.message, true);
          }
        });
        row.appendChild(revoke);
      }
      root.appendChild(row);
    }
  }

  $("connectBtn").addEventListener("click", async () => {
    try {
      sessionStorage.setItem("signalLocalAuthApi", normalizedBase());
      sessionStorage.setItem("signalLocalAuthAdminToken", tokenInput.value.trim());
      await loadUsers();
      notify("Connected to the local authentication service.");
    } catch (error) {
      setConnected(false, "Connection failed");
      notify(error.message, true);
    }
  });

  $("refreshUsersBtn").addEventListener("click", () => loadUsers().catch(e => notify(e.message, true)));
  $("refreshEventsBtn").addEventListener("click", () => loadEvents());
  $("clearTokenBtn").addEventListener("click", () => {
    sessionStorage.removeItem("signalLocalAuthAdminToken");
    tokenInput.value = "";
    setConnected(false, "Not connected");
    notify("Administrator token cleared from this tab.");
  });

  $("userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = $("phone").value.trim();
    const displayName = $("displayName").value.trim();
    try {
      await request("/v1/local-auth/admin/users", {
        method: "POST", body: JSON.stringify({ phone, displayName })
      });
      $("phone").value = "";
      $("displayName").value = "";
      notify("User created or re-enabled.");
      await loadUsers();
      await loadDevices(phone);
    } catch (error) {
      notify(error.message, true);
    }
  });

  if (tokenInput.value) {
    loadUsers().catch(() => setConnected(false, "Not connected"));
  }
})();
