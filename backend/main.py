from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import players, owners, transactions, leaderboard

app = FastAPI(title="WAR STREET API", version="1.0.0")

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(players.router)
app.include_router(owners.router)
app.include_router(transactions.router)
app.include_router(leaderboard.router)


@app.get("/health")
def health():
    return {"status": "ok", "game": "WAR STREET"}
