# Signal Local Administration Dashboard

A Persian RTL React dashboard for pre-authorizing Signal LAN users and device keys. It manages phone-number records, ECDSA P-256 public-key enrollments, user suspension, device revocation, and the local-auth audit stream.

## Requirements

- Node.js 22+ for development/build.
- A running Signal Server `local-auth` sidecar.
- The sidecar administrator token (`LOCAL_AUTH_ADMIN_TOKEN`).
- HTTPS and an exact browser origin configured in `LOCAL_AUTH_ALLOWED_ORIGINS`.

## Development

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. Enter the local-auth API URL and admin token. The API must allow this exact origin in `ALLOWED_ORIGINS`.

## Deployment

```sh
docker compose up -d --build
docker compose logs -f signal-dashboard
```

The container listens on port 8088 and proxies local-auth requests to `local-auth:8090`. The default published bind address is loopback; configure a trusted LAN HTTPS reverse proxy in front of it. See [docs/API.md](docs/API.md).

## Device enrollment

1. Add the phone number in the dashboard.
2. In the Android app, use **Local server setup → Export device enrollment**.
3. Paste its Android ID and public ECDSA P-256 public key into the dashboard's **Register device** form.
4. The app can now request a signed challenge for that phone/device binding.

Only the public key is uploaded. The private key stays in Android Keystore.
