# NextGTools Backend

Python API layer for search and AI features.

## Setup

Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

The backend loads environment variables from the project root `.env`.

## Run

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

Scrape a website and same-domain inner links:

```bash
curl http://localhost:8000/api/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","max_pages":10}'
```
