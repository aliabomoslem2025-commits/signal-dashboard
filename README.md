# Signal Local Administration Dashboard

This repository hosts the LAN-only administration UI for the customized Signal server.

The dashboard manages pre-authorized phone-number/device-ID/public-key bindings and device revocation. It talks to the customized server's `/v1/local-auth/admin` API. Do not expose it to the public Internet.

## Run with Docker

Create or join a private Docker network shared with the Signal server:

```sh
docker network create signal-lan
```

Build and run the dashboard on that network:

```sh
docker build -t signal-lan-dashboard .
docker run -d --name signal-dashboard \
  --network signal-lan \
  -p 8088:8080 \
  -e SIGNAL_SERVER_UPSTREAM=http://signal-server:8080 \
  --restart unless-stopped \
  signal-lan-dashboard
```

Replace `signal-server` with the server container's DNS name and port on the shared private network. The browser should connect to the dashboard's own URL (for example `https://dashboard.messenger.lan`); Nginx proxies `/v1/*` to the Signal server. This keeps browser API requests same-origin and avoids enabling CORS on the Signal server.

Terminate TLS in a trusted LAN reverse proxy in front of this container. Restrict the dashboard to the management LAN/VPN with firewall rules. Do not use cleartext HTTP between browsers and the dashboard.

## Security and provisioning

- Use a high-entropy `LOCAL_AUTH_ADMIN_TOKEN` configured only on the Signal server.
- Enter the server/dashboard URL and admin token interactively. The static site never contains the token.
- Register each device with its E.164 phone number, Android ID, and EC P-256 public key.
- The Android private key must remain in Android Keystore and must never be copied into the dashboard.
- Disable or revoke lost devices immediately.

See [docs/API.md](docs/API.md) for the API contract and provisioning requirements.
