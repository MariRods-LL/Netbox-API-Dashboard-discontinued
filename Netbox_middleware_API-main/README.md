# NetBox Middleware API Dashboard

A Node.js/Express middleware and web dashboard for synchronizing access-control records and event history from a NetBox-connected system into PostgreSQL, with reporting and configuration tools.


> **Project status: incomplete and discontinued.** This repository is an unfinished snapshot. It is not production-ready, and it will not receive further updates, maintenance, bug fixes, or security patches. Use it for reference or local experimentation only. Deployment is at your own risk.


## Features found in this snapshot

- External NetBox/access-control service connectivity and session handling.
- Access and event-history imports, partition-aware synchronization, and reprocessing scripts.
- PostgreSQL history storage and ETL state.
- Manual synchronization controls and synchronization-progress status.
- Connection/configuration management and connection tests.
- Periodic synchronization controls.
- Access/event reports, charts, and PDF export.
- JWT login, user registration, and password-change flow.
- Browser dashboard and configuration/help pages.


These features are present in the source, but some are unfinished, inconsistent, or unverified. Do not assume they work reliably.


## Technology stack

- Node.js (CommonJS)
- Express 5
- PostgreSQL (`pg`)
- Axios
- JSON Web Tokens (`jsonwebtoken`)
- bcryptjs
- fast-xml-parser and xml2js
- PDFKit
- Chart.js and Choices.js
- node-cron is listed as a dependency; the scheduler implementation currently uses an interval timer.


## Repository layout

```text
.
├── modelSQL_NetboxHistory.sql
├── scripts/                  # Maintenance and reprocessing scripts
├── src/
│   ├── config/               # App settings and database connection
│   ├── controllers/           # HTTP request handlers
│   ├── middleware/            # Authentication middleware
│   ├── routes/                # API routes
│   ├── services/              # NetBox integration, auth, scheduler, PDF
│   ├── utils/                  # Shared utilities and sync progress
│   └── public/                 # Web UI, assets, pages, scripts, styles
└── package.json
```


## Requirements

- Node.js and npm
- PostgreSQL
- Network connectivity to the external access-control/NetBox service
- Credentials for the external service and PostgreSQL


## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```
2. Configure the application using the dashboard configuration page or environment variables. The app reads a local `src/config/app-config.json` file when it exists; this file is ignored by Git.
3. Ensure PostgreSQL is running and the configured database account has the privileges needed to create the database/schema and tables.
4. Start the server:


   ```bash
   node src/server.js
   ```
5. Open `http://localhost:3000` (or the configured `PORT`).


> `package.json` does not currently provide a working start or test script. The defined `npm test` script intentionally exits with “no test specified”.


## Environment variables

| Variable | Default / fallback | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NETBOX_HOST` | empty | External service host |
| `NETBOX_PORT` | `80` | External service port |
| `NETBOX_USER` | empty | External service username |
| `NETBOX_PASSWORD` | empty | External service password |
| `NETBOX_PARTITION_KEY` | `3` in app config; `1` in one service fallback | Default partition; set explicitly to avoid conflicting fallbacks |
| `NETBOX_DB_NAME` | `s2config` | Database name on the external system |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `netbox_history` | Local database name |
| `DB_USER` | empty | PostgreSQL username |
| `DB_PASSWORD` | empty | PostgreSQL password |
| `DB_IMPORT_TABLE` | `access_history` | Access-history table setting |
| `DB_EVENT_TABLE` | `event_history` | Event-history table setting |
| `IMPORT_LOG_TYPE` / `LOG_TYPE` | `access` | Import mode |
| `LOG_LIMIT` | `50` | Default log limit |
| `AUTO_IMPORT` | `false` | Auto-import configuration flag |
| `AUTO_UPDATE_MINUTES` | empty | Auto-update interval setting |
| `ALL_PARTITIONS` | `false` | All-partitions setting |
| `DISPLAY_LOG_TYPE` | Portuguese UI label | Display setting |
| `JWT_SECRET` | insecure placeholder in source | JWT signing key; unsafe default must not be used |
| `DEBUG_AUTH` | `false` | Authentication debug logging toggle |

Example `.env` values (replace placeholders; do not commit real credentials):

```dotenv
PORT=3000
NETBOX_HOST=example-host
NETBOX_PORT=80
NETBOX_USER=replace-me
NETBOX_PASSWORD=replace-me
NETBOX_PARTITION_KEY=3
NETBOX_DB_NAME=s2config
DB_HOST=localhost
DB_PORT=5432
DB_NAME=netbox_history
DB_USER=replace-me
DB_PASSWORD=replace-me
JWT_SECRET=replace-with-a-long-random-secret
DEBUG_AUTH=false
```


## Authentication

Authentication endpoints are under `/api/auth`:

- `POST /api/auth/login` — returns a JWT after authentication.
- `POST /api/auth/register` — registers a regular user; password length must be at least six characters.
- `GET /api/auth/me` — returns the current authenticated user.
- `POST /api/auth/password` — changes the current user's password.
- `POST /api/auth/logout` — returns a confirmation; server-side token revocation is not implemented.

Protected requests use:

```http
Authorization: Bearer <token>
```

Tokens are configured to expire after 24 hours. Passwords are stored using bcrypt hashes.


## API overview

Unless otherwise noted, endpoints require a valid Bearer token. The authentication routes are public where indicated.


### Authentication

| Method | Endpoint | Authentication | Notes |
|---|---|---|
| POST | `/api/auth/login` | No | JSON body: `username`, `password` |
| POST | `/api/auth/register` | No | JSON body: `username`, `password` (minimum 6 chars) |
| GET | `/api/auth/me` | Yes | Current user details |
| POST | `/api/auth/password` | Yes | JSON body: `oldPassword`, `newPassword` |
| POST | `/api/auth/logout` | Yes | No token invalidation on the server |

### Synchronization and configuration

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/sync` | Run synchronization |
| POST | `/api/reload` | Reprocess/reload imported data |
| POST | `/api/partition` | JSON body: `partitionKey` |
| GET | `/api/logs?limit=50` | `limit` from 1 to 500 |
| GET | `/api/connections/test` | Test configured connections |
| GET | `/api/config` | Return configuration with secret values masked |
| POST | `/api/config` | Save configuration settings |
| POST | `/api/config/test` | Test settings submitted in the request body |
| GET | `/api/status` | Basic status response |
| GET | `/api/getEvent` | Fetch event history; accepts start/end and event-name filters |
| GET | `/api/sync/progress` | Current synchronization progress |
| POST | `/api/autosync/on` | Enable periodic sync; body may include `minutes` (1–1440) |
| POST | `/api/autosync/off` | Disable periodic sync |
| GET | `/api/autosync/status` | Scheduler status |
| GET | `/api/partitions` | List local partitions |

### Reports

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/report` | Top readers/access summary |
| GET | `/api/report/by-hour` | Access grouping (implementation groups by partition) |
| GET | `/api/report/accessDistribution` | Access totals for filters |
| GET | `/api/report/by-day` | Access counts by day |
| GET | `/api/report/total-event` | Event totals by type |
| GET | `/api/report/partitions/access` | Access counts by partition |
| GET | `/api/report/dayPartition/access` | Access counts by date and partition |
| GET | `/api/report/hourPartition/access` | Access counts by hour for a day |
| GET | `/api/report/partitions/event` | Event counts by partition |
| GET | `/api/report/dayPartition/event` | Event counts by day |
| GET | `/api/report/hourPartition/event` | Event counts by hour and partition |
| GET | `/api/report/readers?partitionKey=3` | Readers for a partition |
| GET | `/api/report/eventType` | Event counts by event type |
| GET | `/api/report/pdf` | PDF report export |

Filter names and formats vary by endpoint. Inspect the relevant controller before relying on a filter.


## Database

The SQL model and startup initialization create tables for users, event types, system configuration, ETL control, access types, readers, partitions, access history, and event history. The schema is initialized by the application when possible. The SQL file contains schema statements embedded in backticks and is not a conventional standalone SQL migration file.


## Security review — findings

A source-level review of this archive found security issues. **This project should not be exposed to the Internet or used with real credentials in its current state.**


### High / critical concerns

1. **Default administrator credentials:** startup code creates an `admin` account with the password `admin` when the user table has no admin account, and the server logs these credentials. This is a direct credential exposure.
2. **Weak JWT fallback:** `JWT_SECRET` falls back to a known placeholder (`your-secret-key-change-in-production`). If deployed without a strong environment value, tokens can be forged.
3. **TLS certificate verification disabled:** two NetBox request implementations configure `rejectUnauthorized: false`, allowing insecure TLS connections and possible interception.
4. **Sensitive debug logging:** source contains logs that print session IDs, raw request bodies, parsed event payloads, and event records. These may include personal data, access activity, identifiers, and authentication/session information.
5. **Public registration:** `/api/auth/register` is not protected and creates regular users. Registration may be inappropriate for an internal dashboard unless access is otherwise restricted.

### Additional concerns

- `src/config/users.json` contained a bcrypt password hash but was not referenced by the active database-backed authentication implementation. The unused file was removed from this package and added to `.gitignore`. If it was ever committed to a remote repository, consider the hash exposed and rotate the associated credential if known.
- Logout only returns a success message; it does not revoke the JWT.
- Password minimum length is six characters, which is weak for modern deployments.
- Some API errors return raw exception messages to clients.
- The security-header middleware sets HSTS even though the app itself is shown serving HTTP; HSTS should be configured at the HTTPS edge and only when HTTPS is correctly deployed.
- No automated test suite is configured, so security and functional behavior have not been validated.

### Recommended remediation (not implemented in this archived snapshot)

- Remove the default `admin/admin` bootstrap credentials; require a secure one-time admin provisioning flow.
- Require `JWT_SECRET` at startup and fail if missing or weak.
- Restore TLS certificate validation and configure trusted certificates instead of disabling verification.
- Remove/redact session IDs, raw XML/body data, and event/person payloads from logs.
- Restrict registration or disable it; require admin approval for user creation.
- Add rate limiting, CSRF protections where cookie-based auth is used, and a proper HTTPS deployment.
- Review authorization on every configuration, synchronization, and report endpoint.
- Add automated tests and dependency/security scanning.
- Rotate any credentials that may have been logged or committed.


## Known limitations and unfinished work

- The code has no configured automated test suite.
- `npm test` is a placeholder that exits with an error.
- The `package.json` does not define a start script.
- Some implementation files contain legacy, test-oriented, duplicate, or apparently unused code paths.
- API behavior, filters, and UI controls have not been fully validated end-to-end.
- Some feature descriptions in this document reflect code presence only, not verified operational correctness.


## Maintenance notice

This project is **incomplete and discontinued**. It will not receive updates or support. No guarantees are made regarding compatibility, stability, correctness, or security. If you fork it, perform a full review and remediation before using it for real systems or data.


## License

The package currently declares the license as `ISC`; verify whether this is the intended license before redistributing the project.
