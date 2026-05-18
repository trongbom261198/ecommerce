import json
import os
import subprocess
import tempfile
import time

from models.execute_models import ExecuteResponse
from config import settings

# R variable names cannot start with _ — use .result (dot-prefix is valid R)
_R_WRAPPER = """
suppressPackageStartupMessages({{
  library(jsonlite)
}})
{user_code}
if (exists(".result")) {{
  cat(toJSON(as.data.frame(.result), na = "null", auto_unbox = TRUE))
}} else {{
  cat(toJSON(list(list(output = "(no output — assign a data.frame to .result)"))))
}}
"""


def execute_r(code: str, timeout: int) -> ExecuteResponse:
    start = time.monotonic()
    script = _R_WRAPPER.format(user_code=code)

    with tempfile.NamedTemporaryFile(suffix=".R", mode="w", delete=False) as f:
        f.write(script)
        script_path = f.name

    try:
        proc = subprocess.run(
            ["Rscript", "--vanilla", script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        ms = int((time.monotonic() - start) * 1000)

        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "R execution failed")

        data: list[dict] = json.loads(proc.stdout)
        if not data:
            return ExecuteResponse(
                columns=[], rows=[], row_count=0, execution_ms=ms, truncated=False
            )

        columns = list(data[0].keys())
        rows = [[row.get(c) for c in columns] for row in data]
        truncated = len(rows) > settings.max_result_rows
        rows = rows[: settings.max_result_rows]

        return ExecuteResponse(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            execution_ms=ms,
            truncated=truncated,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"R execution timed out after {timeout}s")
    finally:
        os.unlink(script_path)
