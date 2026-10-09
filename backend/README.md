# NexGTools Backend

Python API layer for search and AI features.

## Setup

Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

The backend loads environment variables from the project root `.env`.

For the work assignment voice agent, set `ELEVENLABS_API_KEY` in that file or in the backend process environment and restart the backend. Spoken requests use ElevenLabs Scribe v2 for transcription and ElevenLabs Multilingual v2 for replies. `ELEVENLABS_STT_MODEL`, `ELEVENLABS_TTS_MODEL`, and `ELEVENLABS_VOICE_ID` can override the defaults. The default voice ID is the George voice shown in the ElevenLabs API documentation. `OPENAI_API_KEY` is still needed to interpret commands and save assignments. Without the ElevenLabs key, voice requests return a configuration error.

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
