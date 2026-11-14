export type User = {
  phone: string;
  displayName: string;
  active: boolean;
  createdAt: string;
  activeDevices: number;
};

export type Device = {
  id: string;
  label: string;
  active: boolean;
  createdAt: string;
  lastSeenAt: string | null;
};

export type AdminEvent = {
  id: number;
  eventType: string;
  target: string;
  metadata: Record<string, unknown>;
  sourceIp: string;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export class LocalAuthApi {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...init.headers
      },
      cache: "no-store"
    });

    if (!response.ok) {
      let message = `خطای سرور (${response.status})`;
      try {
        const body = await response.json() as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Keep the status-based fallback for empty or non-JSON responses.
      }
      throw new ApiError(message, response.status);
    }

    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  async health(): Promise<boolean> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/healthz`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    return response.ok;
  }

  async users(): Promise<User[]> {
    const result = await this.request<{ users: User[] }>("/v1/local-auth/admin/users");
    return result.users;
  }

  async createUser(phone: string, displayName: string): Promise<void> {
    await this.request("/v1/local-auth/admin/users", {
      method: "POST",
      body: JSON.stringify({ phone, displayName })
    });
  }

  async deleteUser(phone: string): Promise<void> {
    await this.request(`/v1/local-auth/admin/users/${encodeURIComponent(phone)}`, { method: "DELETE" });
  }

  async setUserActive(phone: string, active: boolean): Promise<void> {
    await this.request(`/v1/local-auth/admin/user-status/${encodeURIComponent(phone)}`, {
      method: "PATCH",
      body: JSON.stringify({ active })
    });
  }

  async devices(phone: string): Promise<Device[]> {
    const result = await this.request<{ devices: Device[] }>(
      `/v1/local-auth/admin/users/${encodeURIComponent(phone)}/devices`
    );
    return result.devices;
  }

  async enrollDevice(phone: string, androidId: string, publicKeyPem: string, label: string): Promise<void> {
    await this.request(
      `/v1/local-auth/admin/users/${encodeURIComponent(phone)}/devices`,
      {
        method: "POST",
        body: JSON.stringify({ androidId, publicKeyPem, label })
      }
    );
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.request(`/v1/local-auth/admin/devices/${encodeURIComponent(deviceId)}`, {
      method: "DELETE"
    });
  }

  async events(limit = 50): Promise<AdminEvent[]> {
    const result = await this.request<{ events: AdminEvent[] }>(
      `/v1/local-auth/admin/events?limit=${limit}`
    );
    return result.events;
  }
}

export function validateBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("آدرس سرویس باید HTTPS باشد؛ HTTP فقط برای localhost مجاز است.");
  }
  if (parsed.username || parsed.password) throw new Error("قرار دادن نام کاربری یا رمز در URL مجاز نیست.");
  return parsed.toString().replace(/\/$/, "");
}