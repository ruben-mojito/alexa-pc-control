# 🖥️ Alexa PC Control

> **Wake-on-LAN + Remote Shutdown** – Control your PC with your voice via Alexa.  
> Self-hosted, open source, no third-party cloud services required.

---

## 🎯 What it does

| Voice command | Effect |
|---|---|
| "Alexa, shut down my computer" | Shuts down the PC |
| "Alexa, reboot my computer" | Reboots the PC |
| "Alexa, wake up my PC" | Sends a WoL Magic Packet |
| "Alexa, is my computer on?" | Pings the agent |
| "Alexa, list my devices" | Lists connected PCs |

---

## 🧱 Architecture

```
Alexa → Skill → Lambda → Backend Server (HTTP + WebSocket)
                                   ↓
                         WoL Service (UDP broadcast)
                                   ↓
                           PC Agent (WS client)
                                   ↓
                         System commands (shutdown/reboot)
```

See [docs/architecture.md](docs/architecture.md) for full details.

---

## 📦 Repository structure

```
alexa-pc-control/
├── server/           # Node.js backend (Express + WebSockets + JWT)
├── agent/            # Node.js PC agent (WebSocket client)
├── wol-service/      # Node.js Wake-on-LAN HTTP service
├── alexa-skill/      # Alexa interaction model + Lambda handler
├── docs/             # Architecture and setup guides
├── docker-compose.yml
├── CONTRIBUTING.md
└── CODE_OF_CONDUCT.md
```

---

## 🚀 Quick start

```bash
# 1. Configure secrets
cp server/.env.example server/.env      # set JWT_SECRET and API_KEY
cp wol-service/.env.example wol-service/.env

# 2. Start backend services
docker-compose up -d

# 3. Run the agent on the PC you want to control
cd agent && cp .env.example .env       # set SERVER_URL, API_KEY, DEVICE_ID
npm install && npm start
```

Full setup instructions: [docs/setup.md](docs/setup.md)

---

## 🔐 Security

* JWT-based authentication for all protected endpoints.
* API key exchange for obtaining short-lived tokens.
* Rate limiting on all API routes.
* Command allowlist (`shutdown`, `reboot`, `ping`).
* HTTPS recommended in production (use a reverse proxy).

---

## 🧪 Tests

```bash
cd server      && npm install && npm test
cd agent       && npm install && npm test
cd wol-service && npm install && npm test
```

---

## 🗺️ Roadmap

### MVP ✅
- [x] Backend with WebSockets
- [x] Agent that executes shutdown/reboot
- [x] `/api/commands/:deviceId` endpoint
- [x] JWT authentication

### v1
- [ ] Wake-on-LAN integrated (service ready, Lambda wired)
- [ ] Structured logging
- [ ] Full Docker Compose

### v2
- [ ] Web dashboard (device management UI)
- [ ] Custom scripts
- [ ] Push notifications

---

## 🤝 Contributing

Pull Requests are welcome! For large changes, please open an issue first.  
See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## 📜 License

[MIT](LICENSE) © 2026 ruben-mojito
