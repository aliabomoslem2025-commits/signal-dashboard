# Signal Local Administration Dashboard

This repository provides a lightweight, RTL, LAN-only web console for managing pre-authorized phone-number / Android-ID pairs through the customized Signal server's local device-auth API.

## Run

1. Configure the server's `localDeviceAuth` section and create the required DynamoDB table (see [API and server setup](docs/API.md)).
2. Set the private server listener:
   ```bash
   export SIGNAL_SERVER_UPSTREAM=http://192.168.10.20:8080
   export DASHBOARD_PORT=8090
   docker compose up -d --build
   ```
3. Put a trusted HTTPS reverse proxy in front of the dashboard container and expose it only on the management LAN.
4. Open the dashboard, enter the internal server URL (usually the dashboard's same origin) and the admin token.

The dashboard has no external JavaScript, CSS, font, analytics, or CDN dependencies. The admin token is held in the current browser tab's `sessionStorage` and sent using `X-Local-Admin-Token`.

## Current capabilities

- Add or update an enrolled phone / Android-ID pair.
- List enrolled devices and search by phone number.
- Disable or re-enable an entry when the administrator supplies its original Android ID.
- Revoke an enrollment.

## Security and functionality boundaries

Android ID is an enrollment identifier, not a cryptographic secret. The present server endpoint checks the pre-provisioned phone-number / Android-ID pair but does not yet prove possession of a registered Android Keystore key. The local verification code is returned over the same TLS session as a hand-off to the existing Signal registration flow; it is not an out-of-band factor.

This dashboard does not make the complete Signal deployment LAN-only by itself. FoundationDB, DynamoDB-compatible storage, Redis, local object storage, TLS, calling infrastructure, push delivery, CDSI, SVR, key transparency, and other enabled services still need deployment-specific configuration. See [API and operational notes](docs/API.md).