# Architecture

## Overview

```
                    ┌─ Option A ──────────────────────────────┐
Alexa (Smart Home)  │  AWS Lambda                             │
                    └─ Option B ──────────────────────────────┘
                         │  Docker HTTP server (port 3001)
                         ▼
               Backend Server (HTTP API + WebSocket, port 3000)
                         ↓
               PC Agent (WebSocket client)
                         ↓
              System commands (shutdown / reboot)

Alexa Echo device ─── WoL Magic Packet (UDP) ──→ PC NIC
   (on same LAN)      (sent automatically when TurnOn is invoked,
                       using the MAC address from Alexa.WakeOnLANController)
```

Wake-on-LAN packets are sent **directly by the Echo device** using the
`Alexa.WakeOnLANController` Smart Home interface — no separate WoL service is
needed in the backend.

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

### 3. Alexa Skill (`alexa-skill/`)

The skill is a **Smart Home skill** (not a Custom Skill). This means:
- No custom interaction model — Alexa's built-in phrases are used.
- Directives are received as JSON events from the Alexa Smart Home API.

Two deployment options share the same directive-handling logic:

#### Option A – AWS Lambda (`alexa-skill/lambda/`)

| Property | Value |
|---|---|
| Type | **Smart Home Skill** |
| Runtime | AWS Lambda (Node.js 20) |

Alexa invokes the Lambda function directly via the Alexa Smart Home service. The
function URL is configured as the **Lambda ARN** in the Alexa Developer Console.

#### Option B – Docker HTTP server (`alexa-skill/http-server/`)

| Property | Value |
|---|---|
| Type | **Smart Home Skill** |
| Runtime | Node.js 20 (Express, port 3001) |
| Request verification | `ask-sdk-express-adapter` |

A self-hosted Express server that handles Alexa Smart Home directives over HTTPS.
The endpoint (`POST /skill`) is configured as an **HTTPS URL** in the Alexa Developer
Console. `ask-sdk-express-adapter` verifies the Alexa request signature, certificate
chain, and timestamp before any directive is processed. Included in
`docker-compose.yml` as the `skill` service.

**Declared capabilities per endpoint**

| Capability | Version | Purpose |
|---|---|---|
| `Alexa` | 3 | Base interface (required) |
| `Alexa.PowerController` | 3 | TurnOn / TurnOff voice commands |
| `Alexa.WakeOnLANController` | 3 | Tells the Echo the MAC address so it can send the WoL magic packet |

**Directive handlers**

| Namespace | Directive | Handler |
|---|---|---|
| `Alexa.Authorization` | `AcceptGrant` | Acknowledges account-linking grant |
| `Alexa.Discovery` | `Discover` | Returns endpoint list with capabilities + MAC address |
| `Alexa.PowerController` | `TurnOn` | Returns success; Echo sends WoL packet to the MAC |
| `Alexa.PowerController` | `TurnOff` | Sends `shutdown` command to the agent via the backend |

**Device configuration**

Devices are configured via the `DEVICES` Lambda environment variable (JSON array):

```json
[
  {
    "deviceId": "my-pc",
    "friendlyName": "My PC",
    "macAddress": "AA:BB:CC:DD:EE:FF",
    "description": "Gaming PC in the living room"
  }
]
```

---

## Security

* **API Key** – shared secret used to obtain short-lived JWTs.
* **JWT** – all protected HTTP and WebSocket endpoints require a valid Bearer JWT.
* **Rate limiting** – 100 requests / 15 min per IP on all API routes.
* **HTTPS** – use a reverse proxy (nginx / Caddy) with TLS in production.
* **Command allowlist** – only `shutdown`, `reboot`, and `ping` are accepted.
* **Account linking** – required by Alexa Smart Home skills; configure an OAuth 2.0 provider.

---

## Data flow

### Wake-on-LAN (TurnOn)

```
1. User: "Alexa, turn on my PC"
2. Alexa Smart Home → Lambda: Alexa.PowerController/TurnOn
3. Lambda → returns Alexa.Response (success)
4. Echo device (on same LAN) → UDP Magic Packet → PC NIC
5. PC wakes up
```

The WoL magic packet is sent by the **Echo device itself**, using the `macAddress`
registered in the `Alexa.WakeOnLANController` capability during discovery.

### Shutdown (TurnOff)

```
1. User: "Alexa, turn off my PC"
2. Alexa Smart Home → Lambda: Alexa.PowerController/TurnOff
3. Lambda → POST /api/auth/token  → JWT
4. Lambda → POST /api/commands/my-pc { command: "shutdown" }
5. Server → WebSocket → Agent
6. Agent → execSync("shutdown -h now")
```

