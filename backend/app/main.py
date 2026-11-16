from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth, todos

app = FastAPI(title="Todo API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(todos.router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
