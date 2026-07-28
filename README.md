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
