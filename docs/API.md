# Local device-auth and dashboard API

The dashboard is a static, dependency-free RTL web app. Nginx proxies the same-origin `/v1/` routes to the private Signal server listener. Every admin endpoint requires:

```http
Authorization: Bearer <LOCAL_AUTH_ADMIN_TOKEN>
```

The token is supplied at runtime and stored only in the current tab's `sessionStorage`; it must never be committed or embedded in the APK.

## Device management

### Create a pre-authorized device

`POST /v1/local-auth/admin/devices`

```json
{
  "phoneNumber": "+4915112345678",
  "androidId": "android-id-from-device",
  "publicKey": "BASE64_X509_EC_P256_PUBLIC_KEY",
  "displayName": "Warehouse phone"
}
```

### List devices

`GET /v1/local-auth/admin/devices?limit=50&q=warehouse&cursor=...`

Returns `devices` and `nextCursor`. Device objects contain the phone number, Android ID, public key, display name, enabled state, created/updated timestamps and last-seen timestamp. Protect this endpoint as sensitive administrator data.

### Update / disable

`PUT /v1/local-auth/admin/devices/{phoneNumber}/{androidId}`

```json
{ "enabled": false }
```

### Revoke

`DELETE /v1/local-auth/admin/devices/{phoneNumber}/{androidId}`

### Recent events

`GET /v1/local-auth/admin/events?limit=100`

## Client registration protocol

- `POST /v1/local-auth/challenge` with `{ phoneNumber, androidId }`
- `POST /v1/local-auth/verify` with `{ challengeId, signature }`
- `POST /v1/local-auth/submit-code` with `{ phoneNumber, registrationSessionId, code }`

The app generates an EC P-256 key in Android Keystore and signs the server nonce. The corresponding public key must be pre-provisioned by an administrator. The server returns a one-time compatibility code only after signature verification, and the existing Signal account-registration verifier accepts the session only after the code is submitted.

## Deployment

1. Create the local-auth table using the server repository's `deploy/local-auth/create-table.sh`. The table requires string partition/sort keys `PK` and `SK`; TTL is enabled on `expiresAt`.
2. Configure `LOCAL_AUTH_TABLE` (optional; default `signal_local_device_auth`) and `LOCAL_AUTH_ADMIN_TOKEN` on the server.
3. Restrict `/v1/local-auth/admin/*` to the management network at the firewall or reverse proxy.
4. Set `SIGNAL_SERVER_UPSTREAM` to the private server listener and run `docker compose up -d --build`.
5. Put a trusted HTTPS reverse proxy in front of the dashboard. Do not expose the admin UI on the public Internet.

Android ID is an enrollment lookup value, not a secret. The ECDSA proof of possession of the enrolled Android Keystore public key is the cryptographic device authentication factor.