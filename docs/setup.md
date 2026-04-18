# Setup Guide

## Prerequisites

* Docker & Docker Compose (or Node.js 20+ for local development)
* An Amazon Developer account (for the Alexa Skill)
* AWS account with Lambda access
* An Echo device on the same local network as your PC (required for WoL)

---

## 1. Clone the repository

```bash
git clone https://github.com/ruben-mojito/alexa-pc-control.git
cd alexa-pc-control
```

---

## 2. Configure environment variables

Copy the example files and fill in the values:

```bash
cp server/.env.example server/.env
cp agent/.env.example agent/.env
```

| Variable | Where | Description |
|---|---|---|
| `JWT_SECRET` | server | Secret key for signing JWTs. |
| `API_KEY` | server, agent, lambda | Shared API key for obtaining JWTs. |
| `PORT` | server | HTTP port to listen on. |
| `SERVER_URL` | agent | WebSocket URL of the backend server. |
| `SERVER_HTTP_URL` | agent | HTTP URL of the backend server. |
| `DEVICE_ID` | agent | Unique identifier for this PC. |
| `DEVICE_NAME` | agent | Human-friendly device name shown in Alexa. |
| `SERVER_URL` | lambda | HTTP URL of the backend server (for shutdown calls). |
| `API_KEY` | lambda | Must match the server's `API_KEY`. |
| `DEVICES` | lambda | JSON array of device definitions (see below). |
| `DEFAULT_DEVICE_ID` | lambda | Fallback device ID when `DEVICES` is not set. |
| `DEFAULT_DEVICE_NAME` | lambda | Fallback device friendly name. |
| `DEFAULT_MAC` | lambda | Fallback MAC address for WoL. |

> ⚠️ **Security**: Change `JWT_SECRET` and `API_KEY` to strong random values before deploying. Never commit `.env` files.

### Lambda `DEVICES` format

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

The `macAddress` is registered in the `Alexa.WakeOnLANController` capability. When
you say *"Alexa, turn on My PC"*, the Echo device on your LAN reads this MAC address
and sends the UDP WoL magic packet **directly** — your backend is not involved.

---

## 3. Start the backend server with Docker Compose

```bash
# Create a .env file in the project root with your secrets
cat > .env << 'EOF'
JWT_SECRET=your-strong-secret-here
API_KEY=your-strong-api-key-here
EOF

docker-compose up -d
```

Verify the server is healthy:

```bash
curl http://localhost:3000/health   # → {"status":"ok"}
```

---

## 4. Run the PC Agent

Install dependencies and start the agent on the machine you want to control:

```bash
cd agent
npm install
cp .env.example .env
# Edit .env with your server URL and API key
npm start
```

The agent will:
1. Obtain a JWT from the server.
2. Connect via WebSocket.
3. Wait for commands.
4. Reconnect automatically if the connection drops.

### Run as a system service (Linux)

Create `/etc/systemd/system/alexa-pc-agent.service`:

```ini
[Unit]
Description=Alexa PC Control Agent
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/alexa-pc-control/agent
ExecStart=/usr/bin/node src/index.js
Restart=always
EnvironmentFile=/path/to/alexa-pc-control/agent/.env

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now alexa-pc-agent
```

---

## 5. Deploy the Alexa Skill (Smart Home)

The skill uses the **Smart Home Skill API** with the `Alexa.WakeOnLANController`
interface. No custom interaction model is needed — Alexa's built-in phrases handle
everything.

Two deployment options are available. Choose the one that fits your setup:

| | Option A – AWS Lambda | Option B – Docker HTTP server |
|---|---|---|
| Requires AWS account | ✅ | ❌ |
| Runs entirely self-hosted | ❌ | ✅ |
| Already included in `docker-compose.yml` | ❌ | ✅ |
| Code location | `alexa-skill/lambda/` | `alexa-skill/http-server/` |

### 5a. Set up account linking (required for both options)

Smart Home skills require OAuth 2.0 account linking. For a self-hosted setup:
1. Use an OAuth provider such as [Auth0](https://auth0.com) (free tier available) or
   implement a simple OAuth server.
2. In the Alexa Developer Console → **Account Linking**, configure the authorization
   and token endpoints.
3. The `AcceptGrant` handler in both the Lambda and the HTTP server receives the grant
   code — you can store or exchange it here if you implement full OAuth.

---

### Option A – AWS Lambda

#### 5b-A. Create the Lambda function

1. Go to the [AWS Lambda console](https://console.aws.amazon.com/lambda).
2. Create a new function (Node.js 20.x runtime).
3. Set the following environment variables:
   * `SERVER_URL` – e.g. `https://your-server.example.com`
   * `API_KEY` – must match the server's `API_KEY`
   * `DEVICES` – JSON array of device definitions (see §2 above)
4. Package and upload the Lambda:

```bash
cd alexa-skill/lambda
npm install --omit=dev
zip -r lambda.zip index.js package.json node_modules
# Upload via the AWS console or CLI
aws lambda update-function-code \
  --function-name alexa-pc-control \
  --zip-file fileb://lambda.zip
```

5. Add a **resource-based policy** to allow the Alexa Smart Home service to invoke
   your function:

```bash
aws lambda add-permission \
  --function-name alexa-pc-control \
  --statement-id alexa-smart-home \
  --action lambda:InvokeFunction \
  --principal alexa-connectedhome.amazon.com \
  --event-source-token YOUR_SKILL_ID
```

#### 5c-A. Create the Alexa Skill (Lambda endpoint)

The skill manifest for this option is at `alexa-skill/lambda/skill.json`. Replace
`ACCOUNT_ID` with your AWS account ID before using it.

1. Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2. Create a new **Smart Home** skill.
3. Under **Smart Home service endpoint**, select **AWS Lambda ARN** and enter your
   Lambda ARN (e.g. `arn:aws:lambda:us-east-1:ACCOUNT_ID:function:alexa-pc-control`).
4. Configure **Account Linking** as described in §5a.
5. Enable the skill in the Alexa app on your phone.
6. Discover devices: *"Alexa, discover my devices"*.
7. Test: *"Alexa, turn on My PC"* (WoL) and *"Alexa, turn off My PC"* (shutdown).

---

### Option B – Docker HTTP server

The `alexa-skill/http-server` service is a self-hosted Express server that handles
Alexa Smart Home directives directly. It is already included in `docker-compose.yml`
as the `skill` service and starts alongside the backend server.

#### 5b-B. Start the HTTP server

The service starts automatically when you run `docker-compose up -d` (see §3). It
listens on port **3001** and exposes a single Alexa endpoint at `POST /skill`.

Verify the service is healthy:

```bash
curl http://localhost:3001/health   # → {"status":"ok"}
```

#### 5c-B. Expose the HTTP server over HTTPS

Alexa requires a publicly reachable **HTTPS** endpoint with a valid TLS certificate.
Use a reverse proxy (nginx or Caddy) to terminate TLS and forward traffic to port 3001.

Example Caddy configuration:

```
alexa.your-server.example.com {
    reverse_proxy localhost:3001
}
```

Example nginx snippet:

```nginx
server {
    listen 443 ssl;
    server_name alexa.your-server.example.com;
    # ... TLS certificate configuration ...

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### 5d-B. Create the Alexa Skill (HTTPS endpoint)

The skill manifest for this option is at `alexa-skill/http-server/skill.json`. Replace
`https://alexa.your-server.example.com/skill` with your actual public HTTPS URL before
using it.

1. Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2. Create a new **Smart Home** skill.
3. Under **Smart Home service endpoint**, select **HTTPS** and enter your public URL,
   e.g. `https://alexa.your-server.example.com/skill`.
4. Configure **Account Linking** as described in §5a.
5. Enable the skill in the Alexa app on your phone.
6. Discover devices: *"Alexa, discover my devices"*.
7. Test: *"Alexa, turn on My PC"* (WoL) and *"Alexa, turn off My PC"* (shutdown).

> **Note**: The HTTP server uses `ask-sdk-express-adapter` which automatically
> verifies the Alexa request signature, certificate chain, and timestamp before
> processing any directive.

---

## 6. Test the API manually

```bash
# Get a JWT
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"apiKey":"your-api-key","deviceId":"my-pc"}' | jq -r .token)

# List connected devices
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/devices

# Send a shutdown command directly
curl -s -X POST http://localhost:3000/api/commands/my-pc \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"command":"shutdown"}'
```

---

## 7. Production recommendations

* Put the server behind a reverse proxy (nginx / Caddy) with a TLS certificate.
* Use strong, randomly generated `JWT_SECRET` and `API_KEY` values.
* Enable firewall rules to restrict access to port 3000.
* Rotate `API_KEY` periodically and update it in the Lambda environment variables.
* Consider using [Amazon Secrets Manager](https://aws.amazon.com/secrets-manager/) for the Lambda secrets.
* Ensure your Echo device and target PC are on the same LAN subnet for WoL to work.
* Enable Wake-on-LAN in your PC's BIOS/UEFI settings.

---

## 8. Run the unit tests

```bash
# Server
cd server && npm install && npm test

# Agent
cd agent && npm install && npm test
```

