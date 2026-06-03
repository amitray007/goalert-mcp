# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for
anything sensitive.

- Preferred: open a private report via this repository's
  **Security → Report a vulnerability** (GitHub Security Advisories).
- Alternatively, contact the maintainer through GitHub ([@amitray007](https://github.com/amitray007)).

Please include reproduction steps and the affected version. We aim to acknowledge
reports promptly and will coordinate a fix and disclosure timeline with you.

## Credential handling

`goalert-mcp` is designed to keep your GoAlert credentials safe:

- Credentials are read **only** from environment variables (`GOALERT_USERNAME` /
  `GOALERT_PASSWORD` or `GOALERT_TOKEN`) — never from arguments or files.
- Credentials are **never logged or echoed**, and are redacted from error messages.
- The session token is held in memory only and is not written to disk.
- Use **HTTPS** for `GOALERT_BASE_URL` in any non-local deployment.
- Set `GOALERT_READ_ONLY=true` to expose only read tools (no mutations possible).
- Prefer a **dedicated, least-privilege GoAlert user** rather than a personal admin account.

## Supported versions

Security fixes are provided for the latest released version.
