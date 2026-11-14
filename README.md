# Signal LAN Administration Dashboard

A small self-hosted control panel for pre-authorizing Signal LAN phone numbers and Android devices. It talks to the Go Local Device Authentication service in `signal-server/local-auth`; it does not create Signal accounts directly.

## What it manages

- Create/enable a user by E.164 phone number.
- List users and their active device counts.
- Enroll an Android ID and ECDSA P-256 public key for a selected user.
- List enrolled devices and revoke a device key.
- Enable or disable an account without deleting its device enrollments; disabling consumes outstanding one-time registration tickets.
- Review the newest administrative audit events for user/device provisioning and revocation.
- Delete a user and all of its enrolled devices.

The Android app creates its private key inside Android Keystore. The administrator copies only the Android ID and public key from **Settings → Local Server → Copy device enrollment information**. Never upload or export the private key.

## Run

```sh
docker compose up -d
```

The dashboard container binds to `127.0.0.1:8088`. Put it behind a trusted LAN HTTPS reverse proxy before using it from other devices. Do not expose the plain HTTP container port to an untrusted network.

The initial API base URL is the dashboard origin. For a same-origin deployment, route `/v1/local-auth/` through the reverse proxy to the Go sidecar at `127.0.0.1:8090`. Otherwise, enter the separate HTTPS Local Auth API base URL in the dashboard's **Server access** panel.

The dashboard requires the `LOCAL_AUTH_ADMIN_TOKEN` configured on the sidecar. The token is held in the current browser tab's session storage and is not persisted in local storage.

## Reverse-proxy example

The reverse proxy runs on the same host as the two Docker Compose stacks and terminates TLS. Use a certificate with the correct DNS SAN and a private CA trusted by your browser, Android app, and Java Signal Server.

```nginx
server {
    listen 443 ssl;
    server_name dashboard.lan;

    ssl_certificate     /etc/ssl/certs/dashboard.lan.crt;
    ssl_certificate_key /etc/ssl/private/dashboard.lan.key;

    location /v1/local-auth/ {
        proxy_pass http://127.0.0.1:8090/v1/local-auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:8088/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Set `LOCAL_AUTH_ALLOWED_ORIGINS=https://dashboard.lan` in the sidecar's protected `.env` file and restart it after changing the value.

## Security

- Keep the dashboard on the trusted administrator LAN/VLAN.
- Use HTTPS; never disable TLS validation.
- Use a high-entropy admin bearer token distinct from the internal Signal Server token and ticket HMAC secret.
- Do not paste the admin token into a shared or untrusted browser.
- Android ID is a lookup attribute only. The sidecar also requires a valid ECDSA signature from the enrolled Android Keystore key.
- Disabling or revoking a device in the dashboard immediately prevents it from requesting new challenges and makes its outstanding tickets unusable at ticket validation time.
