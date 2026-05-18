from fastapi import FastAPI

from routers.execute_router import router as execute_router
from routers.dataset_router import router as dataset_router
from routers.pipeline_router import router as pipeline_router

app = FastAPI(title="Analytics Executor", docs_url=None, redoc_url=None)

app.include_router(execute_router)
app.include_router(dataset_router)
app.include_router(pipeline_router)


@app.get("/health")
def health():
    return {"status": "ok"}
