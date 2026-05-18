from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from auth import require_internal_key
from services.minio_service import list_datasets, upload_csv_as_parquet

router = APIRouter(prefix="/datasets", dependencies=[Depends(require_internal_key)])


@router.get("")
def list_all():
    return {"datasets": list_datasets()}


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    name = file.filename.removesuffix(".csv").removesuffix(".CSV")
    data = await file.read()
    try:
        key = upload_csv_as_parquet(data, name)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"key": key, "message": "Uploaded and converted to Parquet"}
