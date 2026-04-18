# Architecture

## Overview

```
Alexa → Lambda Skill → Backend Server (HTTP API + WebSocket)
                                  ↓
                       WoL Service (UDP broadcast)
                                  ↓
                         PC Agent (WebSocket client)
                                  ↓
                        System commands (shutdown / reboot)
```

---

## Components

### 1. Backend Server (`server/`)

| Property | Value |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express |
| Real-time | WebSockets (`ws`) |
| Auth | JWT (Bearer token) |
| Rate limiting | `express-rate-limit` |

**Responsibilities**

* Expose an HTTP API consumed by the Alexa Lambda function.
* Maintain persistent WebSocket connections from PC agents.
* Dispatch commands (`shutdown`, `reboot`, `ping`) to connected agents.
* Manage an in-memory device registry.

**Key endpoints**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/api/auth/token` | No | Exchange API key for JWT |
| GET | `/api/devices` | JWT | List connected devices |
| GET | `/api/devices/:id` | JWT | Get a single device |
| POST | `/api/commands/:id` | JWT | Send a command to a device |

**WebSocket protocol** (`/ws`)

1. Client connects.
2. Client sends `{ type: "auth", token: "<JWT>", name?: "<friendly name>" }`.
3. Server replies `{ type: "auth_ok", deviceId: "..." }` on success.
4. Server sends `{ type: "command", command: "shutdown"|"reboot"|"ping", delaySeconds: 0 }`.
5. Client replies with `{ type: "pong", timestamp: ... }` for `ping` commands.

---

### 2. PC Agent (`agent/`)

| Property | Value |
|---|---|
| Runtime | Node.js 20 |
| Connection | WebSocket (reconnects automatically) |

**Responsibilities**

* Connect to the backend server via WebSocket.
* Authenticate with a JWT obtained from `/api/auth/token`.
* Receive and execute system commands.
* Reconnect automatically after disconnect.

**Supported commands**

| Command | Effect |
|---|---|
| `shutdown` | Calls `shutdown -h now` (Linux/macOS) or `shutdown /s /t 0` (Windows) |
| `reboot` | Calls `shutdown -r now` (Linux/macOS) or `shutdown /r /t 0` (Windows) |
| `ping` | Sends a `pong` message back to the server |

---

### 3. WoL Service (`wol-service/`)

| Property | Value |
|---|---|
| Runtime | Node.js 20 |
| Protocol | UDP broadcast (Magic Packet) |
| Network | Must run on the same LAN as the target PCs |

**Responsibilities**

* Receive an HTTP request with a MAC address.
* Send a Wake-on-LAN Magic Packet via UDP broadcast.

**Key endpoints**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/wake` | JWT | Send a WoL magic packet |

---

### 4. Alexa Skill (`alexa-skill/`)

| Property | Value |
|---|---|
| Type | Custom Skill |
| Invocation | "PC Control" (en-US) / "Control PC" (es-ES) |
| Runtime | AWS Lambda (Node.js 20) |

**Supported intents**

| Intent | Example utterances |
|---|---|
| `ShutdownIntent` | "shut down my computer", "turn off my PC in 5 minutes" |
| `RebootIntent` | "reboot my computer", "restart my PC" |
| `WakeIntent` | "wake up my computer", "turn on my PC" |
| `PingIntent` | "is my computer on?", "check my PC" |
| `ListDevicesIntent` | "list my devices", "which devices are connected" |

---

## Security

* **API Key** – shared secret used to obtain short-lived JWTs.
* **JWT** – all protected HTTP and WebSocket endpoints require a valid Bearer JWT.
* **Rate limiting** – 100 requests / 15 min per IP on all API routes.
* **HTTPS** – use a reverse proxy (nginx / Caddy) with TLS in production.
* **Command allowlist** – only `shutdown`, `reboot`, and `ping` are accepted.

---

## Data flow

### Shutdown

```
1. User: "Alexa, shut down my computer"
2. Alexa → Lambda: ShutdownIntent
3. Lambda → POST /api/auth/token  → JWT
4. Lambda → POST /api/commands/my-pc { command: "shutdown" }
5. Server → WebSocket → Agent
6. Agent → execSync("shutdown -h now")
```

### Wake-on-LAN

```
1. User: "Alexa, wake up my PC"
2. Alexa → Lambda: WakeIntent
3. Lambda → POST /api/auth/token  → JWT
4. Lambda → POST /wake { mac: "AA:BB:CC:DD:EE:FF" }
5. WoL Service → UDP broadcast (Magic Packet) → PC NIC
```
