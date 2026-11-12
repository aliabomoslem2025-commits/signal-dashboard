# Dashboard API contract

The static dashboard uses same-origin requests to the Signal server reverse-proxied at `/v1/`. All management calls carry the administrator credential in `X-Local-Admin-Token`. The browser keeps the token in `sessionStorage` only for the current tab session; this is not a substitute for a trusted management network and HTTPS.

## Current server endpoints

- `POST /v1/admin/device-enrollments` — JSON: `{ "number": "+4915112345678", "androidId": "...", "enabled": true }`
- `GET /v1/admin/device-enrollments` — list enrollment rows. The server returns the keyed hash of the Android ID, not the raw identifier.
- `DELETE /v1/admin/device-enrollments` — JSON body with `number` and the original `androidId`.

The existing server implementation upserts an enrollment on POST. To toggle an existing enrollment, the administrator must submit the original Android ID. Revocation also requires the original Android ID. A later API revision should add an opaque enrollment ID and allow changes by that ID so the dashboard never needs to ask an administrator to re-enter the original Android ID.

## Operational notes

1. Enable `localDeviceAuth` in the server configuration.
2. Provision a dedicated DynamoDB table with partition key `P` (String) and sort key `S` (String); enable TTL on attribute `ttl`.
3. Configure `localDeviceAuth.tableName`, `adminApiToken`, and `androidIdHmacKey` using the server's secret store.
4. Restrict the dashboard port to the management VLAN. Do not publish it to the Internet.
5. Terminate HTTPS at a trusted reverse proxy and configure `SIGNAL_SERVER_UPSTREAM` to the private HTTP listener behind that proxy.
6. Rotate the administrator token and HMAC key through a controlled maintenance procedure. Rotating the HMAC key requires re-enrolling Android ID bindings.

The local one-time code is a server-side registration hand-off returned to the already-connected client. It is not an independent second factor and does not prove possession of a phone number. Authorization currently depends on the administrator-created number/Android-ID binding. A production deployment should add an enrolled Android Keystore public key and signed challenge before treating a device as cryptographically authenticated.