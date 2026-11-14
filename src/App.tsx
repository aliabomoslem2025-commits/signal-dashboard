import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AdminEvent,
  ApiError,
  Device,
  LocalAuthApi,
  User,
  validateBaseUrl
} from "./api";

type Tab = "users" | "events";
const DEFAULT_API = localStorage.getItem("signal.localAuth.api") || "https://auth.lan";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "توکن مدیریت معتبر نیست یا مجوز کافی ندارد.";
    if (error.status === 404) return "مورد موردنظر پیدا نشد.";
    if (error.status === 429) return "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.";
    return error.message;
  }
  return error instanceof Error ? error.message : "خطای پیش‌بینی‌نشده رخ داد.";
}

export default function App() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API);
  const [token, setToken] = useState(sessionStorage.getItem("signal.localAuth.adminToken") || "");
  const [connected, setConnected] = useState(false);
  const [api, setApi] = useState<LocalAuthApi | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);

  const refreshUsers = useCallback(async (client: LocalAuthApi) => {
    setLoading(true);
    try {
      const items = await client.users();
      setUsers(items);
      if (selectedPhone && !items.some(user => user.phone === selectedPhone)) {
        setSelectedPhone(null);
        setDevices([]);
      }
      setError("");
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setConnected(false);
        setApi(null);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedPhone]);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const normalized = validateBaseUrl(baseUrl);
      if (token.trim().length < 32) throw new Error("توکن مدیریت باید حداقل ۳۲ نویسه داشته باشد.");
      const client = new LocalAuthApi(normalized, token.trim());
      if (!await client.health()) throw new Error("سرویس احراز هویت در دسترس نیست.");
      const items = await client.users();
      localStorage.setItem("signal.localAuth.api", normalized);
      sessionStorage.setItem("signal.localAuth.adminToken", token.trim());
      setBaseUrl(normalized);
      setUsers(items);
      setApi(client);
      setConnected(true);
      setNotice("اتصال به سرویس مدیریت برقرار شد.");
      setError("");
    } catch (e) {
      setConnected(false);
      setApi(null);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    sessionStorage.removeItem("signal.localAuth.adminToken");
    setToken("");
    setApi(null);
    setConnected(false);
    setUsers([]);
    setDevices([]);
    setEvents([]);
    setSelectedPhone(null);
    setNotice("از پنل مدیریت خارج شدید.");
  };

  const refresh = useCallback(async () => {
    if (!api) return;
    if (tab === "users") await refreshUsers(api);
    else {
      setLoading(true);
      try {
        setEvents(await api.events(100));
        setError("");
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoading(false);
      }
    }
  }, [api, tab, refreshUsers]);

  useEffect(() => {
    if (api && connected) void refresh();
  }, [api, connected, tab, refresh]);

  useEffect(() => {
    if (!api || !selectedPhone) {
      setDevices([]);
      return;
    }
    let active = true;
    setLoading(true);
    api.devices(selectedPhone)
      .then(items => { if (active) setDevices(items); })
      .catch(e => { if (active) setError(errorText(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, selectedPhone]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return users;
    return users.filter(user =>
      user.phone.toLocaleLowerCase().includes(query) ||
      user.displayName.toLocaleLowerCase().includes(query)
    );
  }, [users, search]);

  const activeUsers = users.filter(user => user.active).length;
  const activeDevices = users.reduce((sum, user) => sum + user.activeDevices, 0);

  const withAction = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      if (api) await refreshUsers(api);
      if (api && selectedPhone) setDevices(await api.devices(selectedPhone));
      if (api && tab === "events") setEvents(await api.events(100));
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!connected || !api) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="brand-mark">S</div>
          <span className="eyebrow">SIGNAL • LOCAL NETWORK</span>
          <h1>پنل مدیریت پیام‌رسان</h1>
          <p className="muted">برای مدیریت کاربران و دستگاه‌های از پیش مجازشده، به سرویس احراز هویت محلی متصل شوید.</p>
          <form onSubmit={event => { event.preventDefault(); void connect(); }}>
            <label>آدرس پایه سرویس احراز هویت</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} dir="ltr" placeholder="https://auth.lan" required />
            <label>توکن مدیریت</label>
            <input value={token} onChange={e => setToken(e.target.value)} dir="ltr" type="password" autoComplete="current-password" placeholder="توکن محرمانه مدیر" required />
            <button className="primary full" disabled={busy}>{busy ? "در حال اتصال…" : "اتصال امن"}</button>
          </form>
          <div className="security-note">توکن فقط در حافظه نشست همین مرورگر نگهداری می‌شود و در Local Storage ذخیره نمی‌شود. پنل را فقط روی HTTPS و شبکه مورد اعتماد منتشر کنید.</div>
          {error && <div className="alert error">{error}</div>}
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark small">S</div><div><strong>Signal LAN</strong><small>مرکز مدیریت</small></div></div>
        <div className="side-label">مدیریت</div>
        <button className={tab === "users" ? "nav-item selected" : "nav-item"} onClick={() => setTab("users")}><span>◉</span> کاربران و دستگاه‌ها</button>
        <button className={tab === "events" ? "nav-item selected" : "nav-item"} onClick={() => setTab("events")}><span>▤</span> گزارش رخدادها</button>
        <div className="sidebar-bottom">
          <div className="connection"><i /> اتصال برقرار است</div>
          <button className="nav-item logout" onClick={disconnect}>↪ خروج امن</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div><span className="eyebrow">LOCAL AUTHENTICATION</span><h1>{tab === "users" ? "کاربران و دستگاه‌ها" : "گزارش رخدادهای مدیریتی"}</h1></div>
          <div className="top-actions"><span className="api-host" dir="ltr">{baseUrl}</span><button className="secondary" onClick={() => void refresh()} disabled={loading}>↻ بروزرسانی</button></div>
        </header>

        {error && <div className="alert error">{error}<button onClick={() => setError("")}>×</button></div>}
        {notice && <div className="alert success">{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {tab === "users" ? (
          <>
            <section className="stats-grid">
              <div className="stat-card"><span>کل کاربران ثبت‌شده</span><strong>{users.length}</strong><small>شماره‌های ثبت‌شده در فهرست مجاز</small></div>
              <div className="stat-card"><span>کاربران فعال</span><strong>{activeUsers}</strong><small>دارای مجوز ورود</small></div>
              <div className="stat-card"><span>دستگاه‌های فعال</span><strong>{activeDevices}</strong><small>کل دستگاه‌های مجاز فعال</small></div>
            </section>
            <section className="content-card">
              <div className="section-heading">
                <div><h2>فهرست کاربران</h2><p>ابتدا کاربر را ثبت کنید، سپس کلید عمومی و Android ID دستگاهش را اضافه کنید.</p></div>
                <button className="primary" onClick={() => setShowCreateUser(true)}>＋ افزودن کاربر</button>
              </div>
              <div className="toolbar"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="جستجو با شماره یا نام…" /><span>{filteredUsers.length} کاربر</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>کاربر</th><th>وضعیت</th><th>دستگاه فعال</th><th>تاریخ ثبت</th><th>عملیات</th></tr></thead>
                  <tbody>
                    {filteredUsers.map(user => (
                      <tr key={user.phone} className={selectedPhone === user.phone ? "active-row" : ""}>
                        <td><strong>{user.displayName || "بدون نام"}</strong><small dir="ltr">{user.phone}</small></td>
                        <td><span className={user.active ? "badge green" : "badge red"}>{user.active ? "فعال" : "مسدود"}</span></td>
                        <td>{user.activeDevices}</td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td className="actions">
                          <button className="text-button" onClick={() => setSelectedPhone(user.phone)}>دستگاه‌ها</button>
                          <button className="text-button" onClick={() => void withAction(() => api.setUserActive(user.phone, !user.active), user.active ? "کاربر غیرفعال شد." : "کاربر فعال شد.")}>{user.active ? "مسدودسازی" : "فعال‌سازی"}</button>
                          <button className="danger-link" onClick={() => {
                            if (window.confirm(`کاربر ${user.phone} و تمام دستگاه‌هایش حذف شود؟`)) {
                              void withAction(() => api.deleteUser(user.phone), "کاربر حذف شد.");
                              if (selectedPhone === user.phone) setSelectedPhone(null);
                            }
                          }}>حذف</button>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && <tr><td colSpan={5} className="empty">{loading ? "در حال دریافت اطلاعات…" : "کاربری پیدا نشد."}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            {selectedPhone && (
              <section className="content-card device-card">
                <div className="section-heading">
                  <div><h2>دستگاه‌های {selectedPhone}</h2><p>هر دستگاه با کلید عمومی ثبت‌شده و شناسه Android ID بررسی می‌شود.</p></div>
                  <div className="inline-actions"><button className="secondary" onClick={() => setSelectedPhone(null)}>بستن</button><button className="primary" onClick={() => setShowEnroll(true)}>＋ ثبت دستگاه</button></div>
                </div>
                <div className="table-wrap">
                  <table><thead><tr><th>نام دستگاه</th><th>شناسه</th><th>وضعیت</th><th>آخرین ورود</th><th>عملیات</th></tr></thead>
                    <tbody>
                      {devices.map(device => <tr key={device.id}>
                        <td><strong>{device.label || "دستگاه بدون نام"}</strong><small dir="ltr">{device.id}</small></td>
                        <td><code>{device.id.slice(0, 12)}…</code></td>
                        <td><span className={device.active ? "badge green" : "badge red"}>{device.active ? "فعال" : "لغوشده"}</span></td>
                        <td>{formatDate(device.lastSeenAt)}</td>
                        <td>{device.active && <button className="danger-link" onClick={() => {
                          if (window.confirm("مجوز این دستگاه لغو شود؟")) void withAction(() => api.revokeDevice(device.id), "مجوز دستگاه لغو شد.");
                        }}>لغو مجوز</button>}</td>
                      </tr>)}
                      {devices.length === 0 && <tr><td colSpan={5} className="empty">برای این کاربر دستگاهی ثبت نشده است.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="content-card">
            <div className="section-heading"><div><h2>آخرین رخدادهای مدیریتی</h2><p>تغییر وضعیت کاربران، حذف و ثبت دستگاه‌ها در این بخش نمایش داده می‌شود.</p></div><span className="badge neutral">{events.length} رخداد</span></div>
            <div className="table-wrap"><table><thead><tr><th>رخداد</th><th>هدف</th><th>نشانی مبدأ</th><th>زمان</th></tr></thead><tbody>
              {events.map(item => <tr key={item.id}><td><strong>{eventLabel(item.eventType)}</strong><small>{item.eventType}</small></td><td dir="ltr">{item.target}</td><td dir="ltr">{item.sourceIp || "—"}</td><td>{formatDate(item.createdAt)}</td></tr>)}
              {events.length === 0 && <tr><td colSpan={4} className="empty">رخدادی ثبت نشده است.</td></tr>}
            </tbody></table></div>
          </section>
        )}
        <footer>Signal LAN Administration • احراز هویت محلی • پنل مدیریتی خصوصی</footer>
      </main>

      {showCreateUser && <Modal title="افزودن کاربر" onClose={() => setShowCreateUser(false)}>
        <CreateUserForm busy={busy} onCancel={() => setShowCreateUser(false)} onSubmit={async (phone, name) => {
          if (await withAction(() => api.createUser(phone, name), "کاربر ثبت شد.")) {
            setShowCreateUser(false);
          }
        }} />
      </Modal>}
      {showEnroll && selectedPhone && <Modal title="ثبت دستگاه مجاز" onClose={() => setShowEnroll(false)} wide>
        <EnrollDeviceForm phone={selectedPhone} busy={busy} onCancel={() => setShowEnroll(false)} onSubmit={async (androidId, publicKey, label) => {
          if (await withAction(() => api.enrollDevice(selectedPhone, androidId, publicKey, label), "دستگاه ثبت شد.")) {
            setShowEnroll(false);
          }
        }} />
      </Modal>}
    </div>
  );
}

function eventLabel(value: string): string {
  const labels: Record<string, string> = {
    "user.created_or_enabled": "ثبت یا فعال‌سازی کاربر",
    "user.deleted": "حذف کاربر",
    "user.disabled": "مسدودسازی کاربر",
    "user.enabled": "فعال‌سازی کاربر",
    "device.enrolled": "ثبت دستگاه",
    "device.revoked": "لغو مجوز دستگاه"
  };
  return labels[value] || value;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={wide ? "modal wide" : "modal"} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><h2>{title}</h2><button onClick={onClose} aria-label="بستن">×</button></div>
      {children}
    </section>
  </div>;
}

function CreateUserForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (phone: string, name: string) => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  return <form className="modal-form" onSubmit={async e => {
    e.preventDefault();
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone.trim())) { setFormError("شماره را با قالب بین‌المللی E.164 وارد کنید؛ مانند ‎+4915112345678"); return; }
    try { await onSubmit(phone.trim(), name.trim()); } catch (err) { setFormError(errorText(err)); }
  }}>
    <label>شماره تلفن (E.164)</label><input dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+4915112345678" required />
    <label>نام نمایشی</label><input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="نام کاربر" />
    {formError && <div className="alert error">{formError}</div>}
    <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>انصراف</button><button className="primary" disabled={busy}>ثبت کاربر</button></div>
  </form>;
}

function EnrollDeviceForm({ phone, busy, onCancel, onSubmit }: { phone: string; busy: boolean; onCancel: () => void; onSubmit: (androidId: string, key: string, label: string) => Promise<void> }) {
  const [androidId, setAndroidId] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [label, setLabel] = useState("");
  const [formError, setFormError] = useState("");
  return <form className="modal-form" onSubmit={async e => {
    e.preventDefault();
    if (androidId.trim().length < 4) { setFormError("Android ID معتبر وارد کنید."); return; }
    if (!publicKey.includes("-----BEGIN PUBLIC KEY-----") || !publicKey.includes("-----END PUBLIC KEY-----")) { setFormError("کلید عمومی PEM کامل نیست."); return; }
    try { await onSubmit(androidId.trim(), publicKey.trim(), label.trim()); } catch (err) { setFormError(errorText(err)); }
  }}>
    <div className="security-note">شماره مقصد: <b dir="ltr">{phone}</b><br/>اطلاعات زیر را از گزینه «اطلاعات ثبت دستگاه» در اپ دریافت کنید. فقط کلید عمومی را وارد کنید؛ هرگز کلید خصوصی را ارسال نکنید.</div>
    <label>Android ID</label><input dir="ltr" value={androidId} onChange={e => setAndroidId(e.target.value)} required />
    <label>نام دستگاه</label><input value={label} onChange={e => setLabel(e.target.value)} maxLength={120} placeholder="مثلاً گوشی اصلی" />
    <label>کلید عمومی دستگاه (PEM)</label><textarea dir="ltr" rows={8} spellCheck={false} value={publicKey} onChange={e => setPublicKey(e.target.value)} placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"} required />
    {formError && <div className="alert error">{formError}</div>}
    <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>انصراف</button><button className="primary" disabled={busy}>ثبت دستگاه</button></div>
  </form>;
}