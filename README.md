# Naqd GST

A standalone multi-client **GST compliance dashboard** for Indian GST practitioners, built on the
**WhiteBooks GST API** (a GSTN-licensed GSP). Track filing status across all your clients, pull
every return, and reconcile GSTR-1/2A/2B against GSTR-3B.

## Features

- **Client dashboard** — add client GSTINs; see **GSTR-1 & GSTR-3B filing status for every client
  on one page**, month-by-month, colour coded:
  🟩 filed on time · 🟥 *light* red = filed late · 🟥 solid red = not filed · ⬜ not due yet.
- **Per-client return status** — full financial-year grid with filing dates and ARNs.
  (Due dates: GSTR-1 by the 11th, GSTR-3B by the 20th of the following month.)
- **Reports** — GSTR-1/1A (all sections incl. amendments & credit/debit notes), GSTR-2A
  (all sections), GSTR-2B, GSTR-3B summary, and the **Electronic Cash & Credit ledgers**,
  each with period/date selectors and **Excel / CSV / JSON** export.
- **Comparison** — head-wise reconciliation of **GSTR-1 ↔ 3B** (outward liability) and
  **GSTR-2B ↔ 3B** / **GSTR-2A ↔ 3B** (ITC), flagging matches and mismatches per tax head.
- **Low API usage** — filing status uses the public no-OTP endpoint, everything is cached, and
  the comparison reuses the reports cache.

## How it works

```
Browser (React SPA)  ──▶  /api/gst?action=…  (Vercel serverless)  ──▶  WhiteBooks GST API
                              injects client_id / secret / email / ip
```

Credentials **never reach the browser** — they live only in Vercel environment variables. Reports
require a one-time **OTP per client** (GSTN rule); the resulting ~6-hour session token is held in
the browser and replayed, so the serverless function stays stateless.

The client list is stored in the browser (`localStorage`) — there is no database.

## Environment variables

Set these in **Vercel → Settings → Environment Variables** (never prefix with `VITE_`, which would
expose them to the browser):

| Variable | Required | Notes |
|---|---|---|
| `WB_CLIENT_ID` | ✅ | From the WhiteBooks credentials tab |
| `WB_CLIENT_SECRET` | ✅ | |
| `WB_EMAIL` | ✅ | Your WhiteBooks-registered email |
| `WB_IP` | ✅ | Any valid public IP — WhiteBooks rejects auth calls without `ip_address` |
| `WB_BASE_URL` | – | Defaults to `https://api.whitebooks.in` (sandbox: `https://apisandbox.whitebooks.in`) |

## Local development

```bash
npm install
npm run dev      # UI only — /api/gst is a serverless function
vercel dev       # full stack, including the /api/gst proxy
```

Verify credentials without touching the UI:

```bash
WB_CLIENT_ID=… WB_CLIENT_SECRET=… WB_EMAIL=… WB_IP=… node scripts/wb-smoke.mjs <GSTIN>
```

## Deployment

Vercel, zero-config (Vite preset). `vercel.json` only rewrites unknown paths to `index.html` for
the SPA router — `/api/gst` is a **static** function path, so it is matched before that rewrite.

## Notes

- ⚠️ **No login.** The deployed URL is open — anyone with the link can use it and trigger OTPs.
  Keep the URL private, or add an auth gate before sharing it.
- GST **refund status is not available** — the WhiteBooks API exposes no refund endpoint.
- API reference: `api/gst-README.md`.
