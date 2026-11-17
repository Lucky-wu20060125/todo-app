from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, dashboard, todos

app = FastAPI(title="Todo API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(todos.router)


@app.middleware("http")
async def disable_api_caching(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
