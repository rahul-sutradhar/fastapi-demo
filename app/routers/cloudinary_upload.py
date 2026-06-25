import time
import hashlib
from fastapi import APIRouter, HTTPException
from app.config import settings

router = APIRouter(tags=["Cloudinary Upload"])

@router.get("/upload-signature")
def get_upload_signature(folder: str = "picto"):
    if not settings.cloudinary_api_secret:
        raise HTTPException(status_code=403, detail="Cloudinary not configured")

    timestamp = int(time.time())
    params = f"folder={folder}&timestamp={timestamp}&upload_preset={settings.cloudinary_upload_preset}"
    signature = hashlib.sha1((params + settings.cloudinary_api_secret).encode()).hexdigest()

    return {
        "cloud_name": settings.cloudinary_cloud_name,
        "api_key": settings.cloudinary_api_key,
        "upload_preset": settings.cloudinary_upload_preset,
        "timestamp": timestamp,
        "signature": signature,
        "folder": folder,
    }
