# NexGTools

React/Vite frontend with a FastAPI backend and MySQL storage.

## Run locally in VS Code

### Requirements

- [Git](https://git-scm.com/downloads)
- [VS Code](https://code.visualstudio.com/)
- [Node.js 20+](https://nodejs.org/)
- [Python 3.12+](https://www.python.org/downloads/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### First-time setup

Clone and open the project:

```bash
git clone https://github.com/sdnath14/NexGTools.git
cd NexGTools
code .
```

Install the frontend:

```bash
npm install
```

Create the Python environment and install the backend:

macOS/Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
```

Windows PowerShell:

```powershell
py -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Copy `.env.example` to `.env`, then replace the API-key placeholders. The included
database defaults match `compose.yaml`.

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### Start everything

In VS Code, open **Terminal → Run Task → NexGTools: Start all**. This starts:

- Persistent MySQL on port `3306`
- FastAPI on <http://localhost:8000>
- Vite on <http://localhost:5173>

MySQL data is stored in the Docker volume `nexgtools_mysql_data`, so normal
container and computer restarts do not erase accounts or history.

To stop the database, run the **MySQL: Stop** VS Code task. To remove the database
and all stored data, manually run `docker compose down --volumes`.

### Health check

Open <http://localhost:8000/health>. A working database reports:

```json
{"database":{"ok":true,"database":"nextgtools"}}
```

Never commit `.env`; it contains private API keys and passwords.

### Luna voice assistant

The Work Assignments assistant uses GPT-Realtime-2.1 for native speech-to-speech
conversation and tool calls. GPT-6 Luna plus dedicated transcription and speech
models remain configured as the fallback. Configure the models in the root `.env`:

```dotenv
OPENAI_MODEL=gpt-6-luna
OPENAI_REASONING_EFFORT=none
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=marin
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=marin
```

Open Work Assignments and select **Start realtime voice mode**. WebRTC carries
microphone and speaker audio directly through GPT-Realtime-2.1, including natural
turn detection and interruptions. The assistant uses function tools to save work
assignments before confirming them aloud. If Realtime is unavailable, the app
falls back to the transcription → Luna → speech pipeline.

## WhatsApp task notifications

Task creation saves the task first, then attempts a Meta WhatsApp template message and an email. The response includes `notifications.whatsapp` with `success` and either `message_id` or `error`, plus `email_status`. A delivery failure leaves the saved task intact. The voice assistant uses the same task route and reports the send result.

Add these server-side values to the root `.env`:

```dotenv
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_API_VERSION=v23.0
WHATSAPP_TASK_TEMPLATE_NAME=employee_task_assignment
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_USE_TLS=true
```

In Meta's WhatsApp Business Platform setup, obtain the phone number ID and access token for your sending number. Create and get approval for an English (`en`) message template named `employee_task_assignment` with three body parameters in order: employee name, task, and due date. Set the webhook callback URL to `https://YOUR_PUBLIC_HOST/webhook/whatsapp`, use the same verify token as `.env`, and subscribe to message events for status updates. The business account ID is stored in configuration for account setup; sending uses the phone number ID. Meta must be able to reach the callback over public HTTPS.

Start the backend with `.venv/bin/python -m uvicorn backend.app.main:app --reload --port 8000` and the frontend with `npm run dev`. The usual **NexGTools: Start all** task starts MySQL too. Add an employee in Work Assignments and enter a WhatsApp number; if that field is empty, the employee's phone number is used. Existing employees can be edited to add a separate WhatsApp number.

To test WhatsApp without voice, log in, then send an authenticated `POST /api/work-assignments/whatsapp/test` with JSON such as `{"employee_id":1}`. This sends Meta's `hello_world` template to that employee and returns the Meta message ID or a structured error. To test the complete flow, say “Assign Rahul the task of contacting BPCL tomorrow” in Work Assignments. The assistant resolves Rahul, saves the task, and reports whether WhatsApp and email were sent. SMTP email is attempted only when the employee has an email address and SMTP is configured.
