# Multiplayer Tic-Tac-Toe with Nakama (LILA Assignment)

Production-ready server-authoritative Tic-Tac-Toe with Nakama backend and React frontend.

## Live Demo

**Backend**: https://tic-tac-toe-nakama-ciu0.onrender.com  
**Console**: https://tic-tac-toe-nakama-ciu0.onrender.com:7351 (Render free tier limitation)  
**Frontend local**: Works perfectly with backend.

**Note**: Render free tier exposed the HTTP API but had port routing issues for full public multiplayer testing. Local deployment is fully functional.

## Architecture

**Server-Authoritative**: All game logic runs in Nakama Lua runtime. Clients send move intents; server validates and broadcasts state.


Client → RPC create_private_match → Server creates match → Client joins match ID
Client → sendMatchState(move) → Server validates → broadcast match state


**Match State** (server-side):
- 3x3 board
- playerX / playerO IDs
- nextPlayer turn
- isGameOver / winner

## Tech Stack

- **Backend**: Nakama 3.22.0 + Lua modules + PostgreSQL
- **Frontend**: React + Vite + nakama-js client
- **Deployment**: Docker + Render (free tier) + GitHub Pages (frontend)

## Local Setup (Recommended)

```bash
# Clone
git clone https://github.com/SRAM-07/tic-tac-toe-nakama
cd tic-tac-toe-nakama

# Backend
docker compose up --build

# Frontend (new terminal)
cd tic-tac-toe-client
npm install
npm run dev
```

**Nakama endpoints**:
- HTTP API: http://localhost:7350
- Console: http://localhost:7351

**Frontend**: http://localhost:5173

## How to Play

1. Open frontend in **2 browser tabs/incognito windows**
2. Tab 1: **Create Private Room** → copy Room ID
3. Tab 2: paste Room ID → **Join Room**
4. Play Tic Tac Toe - server validates all moves

## Project Structure

├── docker-compose.yml # Local Nakama + Postgres
├── Dockerfile # Render deployment
├── data/modules/
│ ├── main.lua # RPC + match handler registration
│ └── tic_tac_toe.lua # Authoritative game logic
└── tic-tac-toe-client/ # React frontend
├── src/App.jsx # Game UI + nakama-js client
└── package.json


## Key Implementation Decisions

1. **Server-authoritative validation**:

 match:onmatchdata → validate move → update state → broadcast


2. **Device auth**: No login required - uses browser fingerprint

3. **Real-time**: WebSocket match state updates

4. **Error handling**: Server rejects invalid moves, clients show status

## Deployment Notes

- **Backend**: Render Docker Web Service (free tier)
- **Database**: Render Postgres (free, expires May 3, 2026)
- **Frontend**: Ready for GitHub Pages (`npm run build` → `dist/`)

**Render limitation**: Single public port proxy conflicts with Nakama's multi-port setup (7350 HTTP, 7349 gRPC). Local Docker works perfectly.

## Testing Checklist

- [x] Server authoritative logic
- [x] Private room creation/join
- [x] Move validation + broadcast
- [x] Win/draw detection
- [x] Real-time updates
- [x] Responsive UI
- [x] Docker deployment

## Files for Review

- `Dockerfile`
- `docker-compose.yml`
- `data/modules/main.lua`
- `data/modules/tic_tac_toe.lua`
- `tic-tac-toe-client/src/App.jsx`

---
**Author**: SRAM-07 (Sriram M)
**Date**: April 2026
