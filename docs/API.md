# Local device authentication API

All routes are served by the customized Signal HTTP server under /v1/local-auth.

## Security model

- A device is pre-authorized by an administrator using the phone number, Android ID, and an EC P-256 public key exported from Android Keystore.
- POST /challenge returns a short-lived random nonce only when that exact device binding exists and is enabled.
- The Android app signs the decoded nonce bytes with the non-exportable private key.
- POST /verify verifies the ECDSA signature and returns a six-digit code and a random registration-session ID over the configured HTTPS connection.
- POST /submit-code checks the code and marks the registration session verified.
- The Signal registration server accepts the resulting verified local session ID in place of the external registration-service session.
- Android ID is a lookup attribute, not a secret. The cryptographic proof is the Keystore-backed signature.

The six-digit code is returned only to the requesting client over TLS; it is not sent by SMS, voice call, FCM, or another external channel. It is a compatibility code-entry step, not an independent second factor.

## Client endpoints

### POST /challenge

Request body:

    { "phoneNumber": "+491234567890", "androidId": "0123456789abcdef" }

Response body:

    { "challengeId": "uuid", "nonce": "base64url", "expiresAt": 1790000000 }

The client decodes nonce with a Base64 URL decoder and signs the raw bytes using SHA256withECDSA.

### POST /verify

Request body:

    { "challengeId": "uuid", "signature": "base64url-encoded-DER-signature" }

Response body:

    { "code": "123456", "registrationSessionId": "base64url-random-session", "expiresInSeconds": 900 }

### POST /submit-code

Request body:

    {
      "phoneNumber": "+491234567890",
      "registrationSessionId": "base64url-random-session",
      "code": "123456"
    }

Response body: { "verified": true }.

The Android client must then use registrationSessionId as the verification session ID in the existing POST /v1/registration request. The app-side network adapter and automatic code-field integration are separate implementation work and must be completed before this flow can be used by end users.

## Admin endpoints

Every admin request must have this header:

    Authorization: Bearer <LOCAL_AUTH_ADMIN_TOKEN>

- GET /admin/devices?limit=50&q=...
- POST /admin/devices
- PUT /admin/devices/{phoneNumber}/{androidId}
- DELETE /admin/devices/{phoneNumber}/{androidId}
- GET /admin/events?limit=100

Create-device body:

    {
      "phoneNumber": "+491234567890",
      "androidId": "0123456789abcdef",
      "displayName": "Office phone",
      "publicKey": "base64-encoded-X.509-EC-P-256-public-key"
    }

The browser dashboard never embeds the administrator token in its static files. It keeps the token in sessionStorage for the active browser session.

## Required environment variables

- LOCAL_AUTH_TABLE: DynamoDB table name. Defaults to signal_local_device_auth.
- LOCAL_AUTH_ADMIN_TOKEN: high-entropy administrator bearer token. The admin API fails closed when this value is unset.

Do not put either value in the Android APK, JavaScript bundle, or a public configuration file.


## Dashboard reverse proxy

The dashboard container proxies requests under `/v1/` to `SIGNAL_SERVER_UPSTREAM` using Nginx. In the browser, set the Server URL to the dashboard's own HTTPS origin (not the backend container address). This is intentional: the static UI and API then share an origin and the Signal server does not need broad CORS headers.
