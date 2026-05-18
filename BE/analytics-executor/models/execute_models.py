from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class ExecuteRequest(BaseModel):
    language: Literal["sql", "python", "r"]
    code: str = Field(max_length=50_000)
    timeout: Optional[int] = None


class ExecuteResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_ms: int
    truncated: bool
    error: Optional[str] = None


class ExportTableRequest(BaseModel):
    table: str
    where_clause: str = "1=1"
    dest_key: str
