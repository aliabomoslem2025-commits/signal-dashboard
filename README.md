# Signal Local Administration Dashboard

A lightweight, RTL, LAN-only dashboard for pre-authorizing Signal Android devices and reviewing local-authentication events. It has no external script, style, font, analytics or CDN dependencies.

## Run

Configure the private Signal server listener and start the dashboard:

```bash
export SIGNAL_SERVER_UPSTREAM=http://192.168.10.20:8080
export DASHBOARD_PORT=8090
docker compose up -d --build
```

Place a trusted HTTPS reverse proxy in front of the dashboard and expose it only on the management VLAN. Open the dashboard and enter the dashboard's same-origin URL plus `LOCAL_AUTH_ADMIN_TOKEN`.

## Provisioning flow

1. On the Android device, generate the local device key in Android Keystore.
2. Retrieve the Base64 X.509 P-256 public key from the app's device-key provisioning screen/tool.
3. In the dashboard, enter the phone number, Android ID and public key.
4. The app can then complete a signed challenge; the private key never leaves Android Keystore.

## Dashboard features

- Create device bindings with phone, Android ID and public key.
- Search and paginate through enrolled devices.
- Enable, disable and revoke device bindings.
- View recent security events and last device activity.

See [docs/API.md](docs/API.md) for request schemas and server setup.

## Security boundary

Android ID alone is not treated as a secret or authentication factor. Enrollment is matched by phone and Android ID, then possession of the device's enrolled EC P-256 key is proven by signature. The admin bearer token must remain server-side and must not be built into web assets or the APK.