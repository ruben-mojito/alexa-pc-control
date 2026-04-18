# 🖥️ Alexa PC Control

> **Wake-on-LAN + Remote Shutdown** – Control your PC with your voice via Alexa.  
> Self-hosted, open source, no third-party cloud services required.

---

## 🎯 What it does

| Voice command | Effect |
|---|---|
| "Alexa, turn on My PC" | Sends a WoL Magic Packet via `Alexa.WakeOnLANController` |
| "Alexa, turn off My PC" | Shuts down the PC via the backend + agent |

Wake-on-LAN is handled **natively by your Echo device** using the
[`Alexa.WakeOnLANController`](https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-wakeonlancontroller.html)
Smart Home interface — no separate WoL service needed in your infrastructure.

---

## 🧱 Architecture

```
                 ┌─ Option A: AWS Lambda ──────────────────┐
Alexa (Smart Home)                                         │
                 └─ Option B: Docker HTTP server (3001) ───┘
                                     ↓
                      Backend Server (HTTP + WebSocket)
                                     ↓
                           PC Agent (WS client)
                                     ↓
                       System commands (shutdown/reboot)

Echo device ── WoL Magic Packet (UDP) ──→ PC NIC
 (same LAN)      (sent automatically on TurnOn using the
                  MAC address from Alexa.WakeOnLANController)
```

See [docs/architecture.md](docs/architecture.md) for full details.

---

## 📦 Repository structure

```
alexa-pc-control/
├── server/           # Node.js backend (Express + WebSockets + JWT)
├── agent/            # Node.js PC agent (WebSocket client)
├── alexa-skill/      # Smart Home Skill manifests + handlers
│   ├── lambda/       #   AWS Lambda handler + skill manifest (skill.json)
│   └── http-server/  #   Docker HTTP server handler + skill manifest (skill.json)
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

# 2. Start the backend server
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
cd server && npm install && npm test
cd agent  && npm install && npm test
```

---

## 🗺️ Roadmap

### v1 ✅
- [x] Backend with WebSockets
- [x] Agent that executes shutdown/reboot
- [x] `/api/commands/:deviceId` endpoint
- [x] JWT authentication
- [x] Smart Home Skill with `Alexa.WakeOnLANController` (WoL via Echo, no extra service)

### v2
- [ ] Multi-device support via Alexa app device discovery
- [ ] Structured logging
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
