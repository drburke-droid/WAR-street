from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import auth, players, owners, transactions, leaderboard, boxscores

app = FastAPI(title="WAR STREET API", version="1.0.0")

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://localhost:5179",
        "http://localhost:5180",
        "http://localhost:3000",
        "https://drburke-droid.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(players.router)
app.include_router(owners.router)
app.include_router(transactions.router)
app.include_router(leaderboard.router)
app.include_router(boxscores.router)


@app.get("/health")
def health():
    return {"status": "ok", "game": "WAR STREET"}
