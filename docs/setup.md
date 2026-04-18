# Setup Guide

## Prerequisites

* Docker & Docker Compose (or Node.js 20+ for local development)
* An Amazon Developer account (for the Alexa Skill)
* AWS account with Lambda access

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
cp wol-service/.env.example wol-service/.env
```

| Variable | Where | Description |
|---|---|---|
| `JWT_SECRET` | server, wol-service | Secret key for signing JWTs. **Must match** in all services. |
| `API_KEY` | server, agent, lambda | Shared API key for obtaining JWTs. |
| `PORT` | server, wol-service | HTTP port to listen on. |
| `SERVER_URL` | agent | WebSocket URL of the backend server. |
| `SERVER_HTTP_URL` | agent | HTTP URL of the backend server. |
| `DEVICE_ID` | agent | Unique identifier for this PC. |
| `DEVICE_NAME` | agent | Human-friendly device name shown in Alexa. |
| `WOL_SERVICE_URL` | lambda | HTTP URL of the WoL service. |
| `DEFAULT_DEVICE_ID` | lambda | Default device to control when no name is spoken. |
| `DEFAULT_MAC` | lambda | MAC address of the default device for WoL. |

> ⚠️ **Security**: Change `JWT_SECRET` and `API_KEY` to strong random values before deploying to production. Never commit `.env` files.

---

## 3. Start the backend services with Docker Compose

```bash
# Create a .env file in the project root with your secrets
cat > .env << 'EOF'
JWT_SECRET=your-strong-secret-here
API_KEY=your-strong-api-key-here
EOF

docker-compose up -d
```

Verify the services are healthy:

```bash
curl http://localhost:3000/health   # → {"status":"ok"}
curl http://localhost:3001/health   # → {"status":"ok"}
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

## 5. Deploy the Alexa Skill

### 5a. Create the Lambda function

1. Go to the [AWS Lambda console](https://console.aws.amazon.com/lambda).
2. Create a new function (Node.js 20.x runtime).
3. Set the following environment variables:
   * `SERVER_URL` – e.g. `https://your-server.example.com`
   * `WOL_SERVICE_URL` – e.g. `https://your-wol.example.com`
   * `API_KEY` – must match the server's `API_KEY`
   * `DEFAULT_DEVICE_ID` – e.g. `my-pc`
   * `DEFAULT_MAC` – e.g. `AA:BB:CC:DD:EE:FF`
4. Package and upload the Lambda:

```bash
cd alexa-skill/lambda
npm install --omit=dev
zip -r lambda.zip index.js package.json node_modules
# Upload lambda.zip via the AWS console or CLI
aws lambda update-function-code --function-name alexa-pc-control --zip-file fileb://lambda.zip
```

### 5b. Create the Alexa Skill

1. Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2. Create a new **Custom** skill.
3. Choose **Alexa-hosted (Node.js)** or **Provision your own** endpoint pointing to your Lambda ARN.
4. In **Interaction Model** → **JSON Editor**, paste the content of:
   * `alexa-skill/interactionModel/en-US.json` for English
   * `alexa-skill/interactionModel/es-ES.json` for Spanish
5. Save and **Build** the model.
6. Test in the **Test** tab: *"Alexa, ask PC Control to shut down my computer"*.

---

## 6. Test the API manually

```bash
# Get a JWT
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"apiKey":"your-api-key","deviceId":"my-pc"}' | jq -r .token)

# List connected devices
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/devices

# Send a ping to a device
curl -s -X POST http://localhost:3000/api/commands/my-pc \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"command":"ping"}'

# Send a WoL magic packet
curl -s -X POST http://localhost:3001/wake \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mac":"AA:BB:CC:DD:EE:FF"}'
```

---

## 7. Production recommendations

* Put the server behind a reverse proxy (nginx / Caddy) with a TLS certificate.
* Use strong, randomly generated `JWT_SECRET` and `API_KEY` values.
* Enable firewall rules to restrict access to ports 3000/3001.
* Rotate `API_KEY` periodically and update it in the Lambda environment variables.
* Consider using [Amazon Secrets Manager](https://aws.amazon.com/secrets-manager/) for the Lambda secrets.

---

## 8. Run the unit tests

```bash
# Server
cd server && npm install && npm test

# Agent
cd ../agent && npm install && npm test

# WoL service
cd ../wol-service && npm install && npm test
```
