"""
K8S Job sandbox — chạy user code trong Pod cô lập hoàn toàn.

Isolation guarantees:
- Pod riêng biệt, không chia sẻ process với FastAPI
- Không có env vars của host (MINIO_SECRET_KEY, POSTGRES_PASSWORD, ...)
- runAsNonRoot + allowPrivilegeEscalation=false
- Resource limits (CPU + memory)
- Job tự xóa sau k8s_job_ttl_sec giây (TTL)
"""
import json
import time
import uuid

from kubernetes import client, config as k8s_config
from kubernetes.client.rest import ApiException

from config import settings
from models.execute_models import ExecuteResponse


def _load_k8s():
    """Load kubeconfig: in-cluster nếu chạy trong Pod, local nếu dev."""
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()


def _build_job_spec(job_id: str, code_b64: str, timeout: int) -> client.V1Job:
    """Tạo K8S Job spec để chạy user code trong sandbox container."""
    meta = client.V1ObjectMeta(
        name=f"sandbox-{job_id}",
        labels={"app": "analytics-sandbox", "job-id": job_id},
    )
    security_ctx = client.V1SecurityContext(
        run_as_non_root=True,
        run_as_user=1000,
        allow_privilege_escalation=False,
    )
    resources = client.V1ResourceRequirements(
        limits={"cpu": "500m", "memory": "256Mi"},
        requests={"cpu": "100m", "memory": "128Mi"},
    )
    container = client.V1Container(
        name="sandbox",
        image=settings.k8s_sandbox_image,
        image_pull_policy="IfNotPresent",
        # Pass code via env var (base64) — no shell injection risk
        env=[
            client.V1EnvVar(name="USER_CODE_B64", value=code_b64),
            client.V1EnvVar(name="MAX_ROWS", value=str(settings.max_result_rows)),
        ],
        # Intentionally NO secrets — sandbox must not see host credentials
        resources=resources,
        security_context=security_ctx,
    )
    pod_spec = client.V1PodSpec(
        restart_policy="Never",
        containers=[container],
        automount_service_account_token=False,  # block K8S API access from pod
    )
    job_spec = client.V1JobSpec(
        template=client.V1PodTemplateSpec(
            metadata=client.V1ObjectMeta(labels={"job-id": job_id}),
            spec=pod_spec,
        ),
        backoff_limit=0,
        active_deadline_seconds=timeout,
        ttl_seconds_after_finished=settings.k8s_job_ttl_sec,
    )
    return client.V1Job(
        api_version="batch/v1",
        kind="Job",
        metadata=meta,
        spec=job_spec,
    )


def execute_python_k8s(code: str, timeout: int) -> ExecuteResponse:
    """Gửi code tới K8S Job, chờ kết quả, trả về ExecuteResponse."""
    import base64

    _load_k8s()
    batch = client.BatchV1Api()
    core = client.CoreV1Api()

    job_id = uuid.uuid4().hex[:10]
    code_b64 = base64.b64encode(code.encode()).decode()
    job = _build_job_spec(job_id, code_b64, timeout)

    start = time.monotonic()
    batch.create_namespaced_job(settings.k8s_namespace, job)

    # Poll cho đến khi Job xong hoặc timeout
    try:
        while True:
            elapsed = time.monotonic() - start
            if elapsed > timeout + 5:
                raise RuntimeError(f"K8S Job timed out after {timeout}s")

            status = batch.read_namespaced_job_status(
                f"sandbox-{job_id}", settings.k8s_namespace
            ).status
            if status.succeeded or status.failed:
                break
            time.sleep(settings.k8s_poll_interval_sec)

        # Đọc logs từ Pod
        pods = core.list_namespaced_pod(
            settings.k8s_namespace, label_selector=f"job-id={job_id}"
        ).items
        if not pods:
            raise RuntimeError("Sandbox Pod not found")

        logs = core.read_namespaced_pod_log(pods[0].metadata.name, settings.k8s_namespace)
        exec_ms = int((time.monotonic() - start) * 1000)

        result = json.loads(logs.strip().split("\n")[-1])  # last JSON line
        return _parse_result(result, exec_ms)

    except ApiException as e:
        raise RuntimeError(f"K8S API error: {e.reason}")
    finally:
        # Best-effort cleanup (TTL handles it too)
        try:
            batch.delete_namespaced_job(
                f"sandbox-{job_id}", settings.k8s_namespace,
                body=client.V1DeleteOptions(propagation_policy="Foreground"),
            )
        except ApiException:
            pass


def _parse_result(result: dict, exec_ms: int) -> ExecuteResponse:
    if "error" in result:
        raise RuntimeError(result["error"])
    if "df" in result:
        rows_data = result["df"]
        if not rows_data:
            return ExecuteResponse(columns=[], rows=[], row_count=0,
                                   execution_ms=exec_ms, truncated=False)
        columns = list(rows_data[0].keys())
        rows = [[r.get(c) for c in columns] for r in rows_data]
        truncated = result.get("truncated", False)
        return ExecuteResponse(columns=columns, rows=rows, row_count=len(rows),
                               execution_ms=exec_ms, truncated=truncated)
    output = result.get("output", ["(no output)"])
    return ExecuteResponse(columns=["output"], rows=[[ln] for ln in output],
                           row_count=len(output), execution_ms=exec_ms, truncated=False)
