# GST Returns — serverless proxy (`api/gst.ts`)

One **static** Vercel function at **`/api/gst?action=<action>`** proxies the WhiteBooks
GST API. Static matters: a static route is matched *before* the vercel.json
`/api/*` → ERPNext rewrite, whereas a dynamic `/api/gst/[action]` route loses to it
(the request gets proxied to ERPNext and 404s). Self-contained too — no relative imports
or `_`-prefixed helpers (those crash Vercel's ESM runtime → `FUNCTION_INVOCATION_FAILED`).
Raw Node req/res; every path returns JSON, errors included.

## Env vars (Vercel → Settings → Environment Variables — never `VITE_`-prefixed)
`WB_CLIENT_ID`, `WB_CLIENT_SECRET`, `WB_EMAIL`, `WB_IP` (all required);
`WB_BASE_URL` (default prod), `ERP_BASE_URL` (default `erp.naqdexim.com`, used to
validate the caller's ERPNext session).

## Actions — `GET /api/gst?action=<action>&…`
| action | WhiteBooks | params |
|---|---|---|
| `search` | `/public/search` | `gstin` |
| `track` | `/public/rettrack` | `gstin`, `fy` (YYYY-YY) |
| `otp-request` | `/authentication/otprequest` | `gstin`, `gst_username` → `header.txn` |
| `verify-otp` | `/authentication/authtoken` | + `txn`, `otp` |
| `refresh` | `/authentication/refreshtoken` | + `txn` |
| `fetch` | `/{rtn}/{section}` | `rtn`, `section`, `gstin`, `ret_period` (MMYYYY), `txn`, `gst_username` |

Every call is gated: forwards the caller's ERPNext `sid` cookie to
`frappe.auth.get_logged_user` and rejects non-logged-in requests.

**Status (verified live vs HAIMAS TRADING):** `search`, `track`, OTP auth and **GSTR-2B**
(uses `rtnprd`) all work. **GSTR-1 & GSTR-2A `fetch` return an empty body for every param
tried** (`ret_period`/`rtnprd`/`fp`/`action`/`fy`, bare path or `/section`) — pending the
exact query from the WhiteBooks Swagger. WhiteBooks echoes `client_secret` in
`body.header`; the function strips it.

## Test credentials
```bash
WB_CLIENT_ID=… WB_CLIENT_SECRET=… WB_EMAIL=you@x.com WB_IP=1.2.3.4 \
  node scripts/wb-smoke.mjs 29AAAAA0000A1Z5
```
