# Horror Radar

Horror indie game breakout detection platform. Tracks newly released indie horror games on Steam, collects engagement data from multiple sources, and computes an Overperformance Score (OPS) to identify games that are breaking out.

## Structure

```
backend/     Python/FastAPI — collectors, scheduler, SQLite DB, API
frontend/    React 19 + TypeScript + Vite + Tailwind CSS
```

## Quick Start

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your API keys
python3 -m uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`, proxies `/api` to the backend at `http://localhost:8000`.

## Environment Variables

**Required:** `YOUTUBE_API_KEY`

**Optional:** `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`

## Vercel Deployment (Frontend)

The frontend deploys as a static SPA. Set `VITE_API_URL` in Vercel environment variables to point to your backend server (e.g. `https://your-api.example.com`).

The backend must be hosted separately (VPS, Railway, Fly.io, etc.) since it requires SQLite, APScheduler, and long-running collector jobs.
