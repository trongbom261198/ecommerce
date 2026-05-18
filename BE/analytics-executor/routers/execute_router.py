from fastapi import APIRouter, HTTPException

from models.execute_models import ExecuteRequest, ExecuteResponse
from services.duckdb_service import execute_sql
from services.python_sandbox import execute_python
from services.r_executor import execute_r
from config import settings

router = APIRouter()


@router.post("/execute", response_model=ExecuteResponse)
def execute(req: ExecuteRequest):
    timeout = req.timeout or (
        settings.sql_timeout_sec if req.language == "sql" else settings.script_timeout_sec
    )
    try:
        if req.language == "sql":
            return execute_sql(req.code, timeout)
        elif req.language == "python":
            return execute_python(req.code, timeout)
        else:
            return execute_r(req.code, timeout)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
