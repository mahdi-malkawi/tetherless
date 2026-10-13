# Tetherless

> Run your own always-on agent. Steer it from anywhere. Approve what matters.

**Tetherless** is a self-hosted automation agent you own and control. It runs 24/7 on
any machine you choose — your PC, a Raspberry Pi, or a cheap cloud box — and takes its
orders through a **private Git repository** that acts as a message bus. An AI assistant
(or you) writes a task into the repo; the agent picks it up, runs it, and writes the
result back. You watch and approve everything from your phone.

Nothing in Tetherless is tied to a single browser or a single machine. That's the point.

```
┌────────────┐     writes task      ┌──────────────┐     pulls task     ┌──────────────┐
│  You / AI  │ ───────────────────▶ │  Git repo    │ ─────────────────▶ │  Tetherless  │
│  (phone,   │                      │  (private    │                    │  agent       │
│   chat)    │ ◀─────────────────── │   message    │ ◀───────────────── │  (any host)  │
└────────────┘     reads result     │   bus)       │     pushes result  └──────┬───────┘
                                     └──────────────┘                           │
                                                                                ▼
                                                        ┌───────────────────────────────┐
                                                        │ runners: browser · command ·  │
                                                        │ http/api (official APIs)      │
                                                        └───────────────────────────────┘
```

## Why Git as the bus?

The agent, you, and your AI assistant can all reach GitHub, even across networks and
firewalls — no inbound ports, no public server, no exposed machine. Every task and every
result is a committed file, so you get a full, permanent audit trail for free.

## Core principles

- **You own it.** Runs on your hardware. Your secrets never leave the machine.
- **Approval gate.** Any task marked `sensitive` halts until *you* approve it — the agent
  never sends money, deletes data, posts, or messages on its own.
- **Portable.** Ships as a Docker image; moves to any host unchanged.
- **Auditable.** Every task and outcome is logged and committed.
- **API-first.** Prefers official APIs (e.g. the Facebook/Meta Marketing API) over fragile,
  ToS-breaking browser scraping. Browser automation is available for sites that have no API,
  used responsibly.

## How it works

1. A task is a JSON file dropped into `inbox/` of your private bus repo.
2. The agent polls the repo on an interval, pulls new tasks, and validates them.
3. If a task is `sensitive`, the agent waits for a matching approval file in `approvals/`
   before running it.
4. The agent dispatches the task to a **runner** by `type`:
   - `command` — run an allow-listed shell command / script.
   - `browser` — drive a headless browser (Playwright) for sites without an API.
   - `http` — call an official HTTP API with a locally stored token.
5. The result is written to `outbox/` and committed. You (or your AI) read it back.

## Quick start

```bash
git clone https://github.com/<you>/tetherless.git
cd tetherless
cp .env.example .env            # fill in BUS_REPO + secrets (never committed)
npm install
npx playwright install chromium # only if you use the browser runner
npm start
```

Or with Docker:

```bash
docker build -t tetherless .
docker run --env-file .env -v $PWD/data:/app/data tetherless
```

## Security model

- The bus repo is **private**, and only you can push tasks to it. The agent treats every
  task as untrusted input: commands are checked against an allow-list, and `sensitive`
  tasks require explicit approval.
- Secrets (API tokens, browser sessions) live only in `.env` and `data/` on the host and
  are listed in `.gitignore` — they are **never** committed to the bus.
- Every action is appended to `data/audit.log`.

## Plans (open-core)

Tetherless is free and fully usable on its own. Paid features are unlocked with a
signed license key — verified **offline** by the agent, no phone-home.

| | **Free** | **Trial** (14 days) | **Pro** |
|---|---|---|---|
| Command runner (shell, allow-listed) | ✅ | ✅ | ✅ |
| HTTP / official-API runner | ✅ | ✅ | ✅ |
| Approval gate + audit log | ✅ | ✅ | ✅ |
| **Browser runner** (Playwright) | — | ✅ | ✅ |
| Tasks per day | 50 | 200 | ∞ |
| Polling speed | ≥ 60s | down to 5s | down to 5s |

Activate a plan by setting `LICENSE_KEY=...` in `.env`. The plan comes only from the
signed key. There is no `PLAN` setting. A missing, invalid, or expired key runs Free.
Restart the agent after changing the key.

**Paid runners are not in this repo.** The browser runner ships in a separate private
package, `tetherless-pro`, which goes into `pro/` inside your install. It checks the license
itself and exports no runners without a valid Trial or Pro key. Customers get it after
payment. See that package's README for setup.

**Enforcement, honestly:** a determined person with the private package could still
read it. The split makes bypassing it much harder than editing one `if` in public code.

**Licenses are bound to one install.** The agent prints its install ID at startup, and
`node src/agent.js --install-id` prints it on its own. The customer sends you that ID.
A key only works on the install it was issued for, so a copied key fails on another machine.

**For the vendor (you):** generate your keypair once with
`node scripts/make-keypair.mjs` (keep `tetherless-private.pem` secret, paste the public
key into `src/license.js` and `pro/index.js` in the private package). Then mint keys with
the customer's install ID:
`node scripts/make-license.mjs pro 365 buyer@email.com TL-XXXXXXXXXXXXXXXX`
(use `trial 14` for a trial). Keys are Ed25519-signed, so they can't be forged, and
verification needs no server.

## Install

See **[INSTALL.md](INSTALL.md)** for copy-paste setup on Linux, macOS, Windows, Android
(Termux), iPhone (controller), and Docker.

## Status

MVP scaffold. See `examples/` for sample tasks, including a safe Facebook Marketing API
report as the first use case.

## License

MIT — see `LICENSE`.
