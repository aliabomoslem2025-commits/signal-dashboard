# Signal Local Administration Dashboard

This repository hosts the LAN-only administration UI for the customized Signal server.

The dashboard manages pre-authorized phone-number/device-ID/public-key bindings and device revocation. It talks only to the server's `/v1/local-auth/admin` API. Do not expose it to the public Internet.

See `docs/API.md` for the API contract and `docker-compose.yml` for local deployment guidance.
