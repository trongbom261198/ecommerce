"""
Sandbox runner — chạy trong K8S Pod cô lập.
Đọc code từ env var USER_CODE_B64, exec, xuất JSON ra stdout.

KHÔNG có: secrets, network unrestricted, shell access, root privileges.
"""
import base64
import json
import os
import sys
import traceback

import numpy as np
import pandas as pd

MAX_ROWS = int(os.environ.get("MAX_ROWS", "10000"))

# User code truyền qua env var (base64) — không expose qua command line (visible in `ps`)
code_b64 = os.environ.get("USER_CODE_B64", "")
if not code_b64:
    print(json.dumps({"error": "No code provided"}))
    sys.exit(1)

code = base64.b64decode(code_b64).decode()

_output_lines: list[str] = []


def _cap_print(*args, **kwargs):
    _output_lines.append(" ".join(str(a) for a in args))


local_ns: dict = {
    "pd": pd, "pandas": pd,
    "np": np, "numpy": np,
    "print": _cap_print,
    "_result": None,
}

try:
    exec(compile(code, "<user_code>", "exec"), local_ns)  # noqa: S102
except Exception:
    print(json.dumps({"error": traceback.format_exc()}))
    sys.exit(0)

result = local_ns.get("_result")

if result is None:
    print(json.dumps({"output": _output_lines or ["(no output — assign a DataFrame to _result)"]}))

elif isinstance(result, pd.DataFrame):
    truncated = len(result) > MAX_ROWS
    df = result.head(MAX_ROWS).where(result.head(MAX_ROWS).notna(), other=None)
    print(json.dumps({
        "df": df.to_dict(orient="records"),
        "truncated": truncated,
    }))

else:
    print(json.dumps({"output": [str(result)]}))
