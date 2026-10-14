# Installing Tetherless

Three steps on any machine: install Node and Git, get the code, run setup.
Setup asks for two things (your bus repo and an optional license key), then does
everything else: GitHub sign-in, background start, and start-on-login.

> One-time, on GitHub: create a **private** repo for the bus (for example `tetherless-bus`)
> and share it with any account that should run an agent on its own machine.

---

## 🪟 Windows

Open PowerShell and run:

```powershell
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id GitHub.cli
```

Close PowerShell and open it again (so the new commands are found), then:

```powershell
git clone https://github.com/YOUR_USERNAME/tetherless.git
cd tetherless
npm install
npm run setup
```

Setup asks for your bus repo (`owner/tetherless-bus`) and a name for this computer.
If it asks you to sign in to GitHub, pick **GitHub.com → HTTPS → Login with a web browser**
and enter the code it shows. After that Tetherless runs in the background with no window,
and starts again every time you sign in.

---

## 🐧 Linux (Ubuntu / Debian)

```bash
sudo apt-get update && sudo apt-get install -y git curl nodejs npm
git clone https://github.com/YOUR_USERNAME/tetherless.git && cd tetherless
npm install
npm run setup
```

On Linux, start-on-boot is not automatic. Add this line to `crontab -e`:

```
@reboot cd /path/to/tetherless && node src/cli.js start
```

---

## 🍎 macOS

```bash
brew install git node gh
git clone https://github.com/YOUR_USERNAME/tetherless.git && cd tetherless
npm install
npm run setup
```

---

## Day-to-day commands

| What | Command |
|---|---|
| Start in the background | `npm start` |
| Stop | `npm stop` |
| Is it running? | `npm run status` |
| Run in the foreground (for debugging) | `npm run run` |
| Print the install ID (for a license) | `node src/cli.js install-id` |

Results and the log are in `data/agent.log` and `outbox/` (inside the bus folder).

---

## Verify it works

Add a file `inbox/test-uptime.json` to your bus repo:

```json
{ "id": "test-uptime", "type": "command", "command": "uptime" }
```

Within about a minute, `outbox/test-uptime.result.json` appears with `"ok": true`.

---

## Notes

- Only the **command** and **http** runners are in the public build. Browser tasks need a Linux or Windows host with Playwright installed.
- The **command** runner only runs commands listed in `COMMAND_ALLOWLIST` in `.env`.
- Anything sensitive waits for an approval file in `approvals/` before it runs.
