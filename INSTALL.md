# Installing Tetherless — copy & paste

Pick your platform, copy the whole block, paste it into a terminal. Each block
installs prerequisites, downloads Tetherless, and starts it. Replace
`YOUR_USERNAME` with your GitHub username where shown.

> You need two repos first (one-time): `tetherless` (this code, public) and
> `tetherless-bus` (private — the message bus). Create them on GitHub, then:

---

## 🐧 Linux (Ubuntu/Debian) — recommended host

```bash
sudo apt-get update && sudo apt-get install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
git clone https://github.com/YOUR_USERNAME/tetherless.git && cd tetherless
cp .env.example .env
echo ">> Edit .env now: set BUS_REPO and your secrets, then press Enter"; read; nano .env
npm install
sudo npm install -g pm2
pm2 start src/agent.js --name tetherless && pm2 save && pm2 startup
```

Your agent now runs 24/7 and restarts on reboot. Logs: `pm2 logs tetherless`.

---

## 🍎 macOS

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git node
git clone https://github.com/YOUR_USERNAME/tetherless.git && cd tetherless
cp .env.example .env
echo ">> Edit .env now: set BUS_REPO and your secrets"; nano .env
npm install
sudo npm install -g pm2
pm2 start src/agent.js --name tetherless && pm2 save
caffeinate -s -w $(pgrep -n node) &   # keep the Mac awake while the agent runs
```

---

## 🪟 Windows (PowerShell — run as Administrator)

```powershell
winget install -e --id Git.Git -h
winget install -e --id OpenJS.NodeJS.LTS -h
# Close and reopen PowerShell so PATH updates, then:
git clone https://github.com/YOUR_USERNAME/tetherless.git; cd tetherless
Copy-Item .env.example .env
notepad .env        # set BUS_REPO and secrets, save, close
npm install
npm install -g pm2 pm2-windows-startup
pm2 start src/agent.js --name tetherless; pm2 save; pm2-startup install
powercfg /change standby-timeout-ac 0   # never sleep on AC power
```

---

## 🤖 Android (via Termux — from F-Droid)

```bash
pkg update -y && pkg install -y git nodejs
git clone https://github.com/YOUR_USERNAME/tetherless.git && cd tetherless
cp .env.example .env
nano .env           # set BUS_REPO and secrets
npm install
termux-wake-lock    # keep running with the screen off
npm start
```

> On Android, use the **command** and **http** runners. The **browser** runner
> (Playwright) is not supported on Android — run browser tasks on a Linux/Win/Mac host.

---

## 📱 iPhone / iPad — controller only

iOS can't host a 24/7 background agent. Use your iPhone to **watch and approve**:

1. Install the **GitHub** app (or open your `tetherless-bus` repo in Safari).
2. Read results in the `outbox/` folder.
3. To approve a sensitive task `abc`, add an empty file `approvals/abc.approve`
   (GitHub app → Add file → commit). The agent on your host picks it up and runs it.

Your AI assistant can also write tasks and read results for you — you just tap approve.

---

## Docker (any host with Docker)

```bash
git clone https://github.com/YOUR_USERNAME/tetherless.git && cd tetherless
cp .env.example .env && nano .env
docker build -t tetherless .
docker run -d --restart unless-stopped --env-file .env -v "$PWD/data:/app/data" --name tetherless tetherless
```

---

## Verify it works

```bash
# drop the sample health-check task into your bus repo's inbox/, then watch:
pm2 logs tetherless        # (or) docker logs -f tetherless
```

You should see the task picked up and a result written to `outbox/`.
