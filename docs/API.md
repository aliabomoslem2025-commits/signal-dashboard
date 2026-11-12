# Signal LAN Dashboard API contract

The dashboard is a static browser application. It does not store accounts itself; it calls the Local Device Authentication service in the Signal Server repository.

## Required service

Deploy `signal-server/local-auth` and expose it only through the private LAN reverse proxy. The service must be reached over HTTPS. Configure `ALLOWED_ORIGINS` to the dashboard's exact origin if the UI and API are hosted on different origins.

## Endpoints used by the dashboard

Every admin request requires:

```http
Authorization: Bearer <LOCAL_AUTH_ADMIN_TOKEN>
```

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/local-auth/admin/users` | List users and count active devices |
| POST | `/v1/local-auth/admin/users` | Create or re-enable a user |
| DELETE | `/v1/local-auth/admin/users/{phone}` | Delete a user and cascade its device enrollments |
| GET | `/v1/local-auth/admin/users/{phone}/devices` | List enrolled devices |
| POST | `/v1/local-auth/admin/users/{phone}/devices` | Enroll Android ID and ECDSA P-256 public key |
| DELETE | `/v1/local-auth/admin/devices/{deviceId}` | Revoke a device |

Device-enrollment request:

```json
{
  "androidId": "android-secure-id",
  "label": "Warehouse tablet 01",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

The dashboard intentionally does not display public keys or private credentials after enrollment. Android private keys must stay inside Android Keystore.

## Browser security

- Use HTTPS and a private CA trusted by the administrator's browser.
- Set `ALLOWED_ORIGINS` to the exact UI origin (including scheme and port).
- The UI keeps the admin token in `sessionStorage`, not localStorage.
- Do not expose this dashboard to the public Internet.
- Put the dashboard behind the organization's network access controls and administrator authentication in addition to the API bearer token.
