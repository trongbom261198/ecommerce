import time
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

import numpy as np
import pandas as pd

from models.execute_models import ExecuteResponse
from config import settings

# --- Strategy dispatch -------------------------------------------------
# EXECUTION_MODE=subprocess  → chạy trực tiếp trong process này (dev only)
# EXECUTION_MODE=k8s         → tạo K8S Job cô lập (production)
# ----------------------------------------------------------------------

def execute_python(code: str, timeout: int) -> ExecuteResponse:
    if settings.execution_mode == "k8s":
        from services.k8s_sandbox import execute_python_k8s
        return execute_python_k8s(code, timeout)
    return _execute_subprocess(code, timeout)


# --- Subprocess sandbox (dev) -----------------------------------------
# Block only the most dangerous builtins; keep __import__ so `import pandas` works.
# WARNING: Security relies on Docker container isolation — NOT Python builtins alone.
# An attacker can still read env vars, make network calls, fork processes.
_BLOCKED = {"open", "exec", "eval", "compile", "input"}

_raw = __builtins__ if isinstance(__builtins__, dict) else vars(__builtins__)
_SAFE_BUILTINS = {k: v for k, v in _raw.items() if k not in _BLOCKED}

_print_lines: list[str] = []


def _captured_print(*args, **kwargs):
    _print_lines.append(" ".join(str(a) for a in args))


def _execute_subprocess(code: str, timeout: int) -> ExecuteResponse:
    start = time.monotonic()
    _print_lines.clear()

    _safe_builtins = dict(_SAFE_BUILTINS)
    _safe_builtins["print"] = _captured_print

    local_ns: dict = {
        "__builtins__": _safe_builtins,
        "pd": pd,
        "pandas": pd,
        "np": np,
        "numpy": np,
        "_result": None,
    }

    def _run():
        exec(compile(code, "<user_code>", "exec"), local_ns)  # noqa: S102

    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(_run)
        try:
            fut.result(timeout=timeout)
        except FuturesTimeoutError:
            raise RuntimeError(f"Execution timed out after {timeout}s")
        except Exception:
            raise RuntimeError(traceback.format_exc())

    ms = int((time.monotonic() - start) * 1000)
    result = local_ns.get("_result")

    if result is None:
        lines = _print_lines or ["(no output — assign a DataFrame to `_result`)"]
        return ExecuteResponse(
            columns=["output"],
            rows=[[ln] for ln in lines],
            row_count=len(lines),
            execution_ms=ms,
            truncated=False,
        )

    if isinstance(result, pd.DataFrame):
        truncated = len(result) > settings.max_result_rows
        df = result.head(settings.max_result_rows)
        rows = df.where(df.notna(), other=None).values.tolist()
        return ExecuteResponse(
            columns=df.columns.tolist(),
            rows=rows,
            row_count=len(df),
            execution_ms=ms,
            truncated=truncated,
        )

    return ExecuteResponse(
        columns=["result"],
        rows=[[str(result)]],
        row_count=1,
        execution_ms=ms,
        truncated=False,
    )
