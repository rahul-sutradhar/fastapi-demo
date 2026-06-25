import pytest
import hashlib
import time
from app.config import settings


def test_cloudinary_returns_403_when_not_configured(client):
    if settings.cloudinary_api_secret:
        pytest.skip("Cloudinary is configured — skipping 403 test")
    res = client.get("/upload-signature?folder=picto")
    assert res.status_code == 403
    assert res.json()["detail"] == "Cloudinary not configured"


@pytest.mark.parametrize("folder", ["picto", "test-folder", "my_posts"])
def test_upload_signature_returns_correct_structure(client, monkeypatch, folder):
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "testcloud")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "123456789")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "test_api_secret_key_12345")
    monkeypatch.setenv("CLOUDINARY_UPLOAD_PRESET", "test_preset")

    from app.config import Settings
    test_settings = Settings()
    monkeypatch.setattr("app.config.settings", test_settings)
    monkeypatch.setattr("app.routers.cloudinary_upload.settings", test_settings)

    res = client.get(f"/upload-signature?folder={folder}")
    assert res.status_code == 200
    data = res.json()

    assert data["cloud_name"] == "testcloud"
    assert data["api_key"] == "123456789"
    assert data["upload_preset"] == "test_preset"
    assert data["folder"] == folder
    assert isinstance(data["timestamp"], int)

    expected_params = f"folder={folder}&timestamp={data['timestamp']}&upload_preset=test_preset"
    expected_sig = hashlib.sha1(
        (expected_params + "test_api_secret_key_12345").encode()
    ).hexdigest()
    assert data["signature"] == expected_sig, "Signature does not match expected SHA1 hash"


def test_upload_signature_defaults_folder(client, monkeypatch):
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "testcloud")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "123456789")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "test_api_secret_key_12345")
    monkeypatch.setenv("CLOUDINARY_UPLOAD_PRESET", "test_preset")

    from app.config import Settings
    test_settings = Settings()
    monkeypatch.setattr("app.config.settings", test_settings)
    monkeypatch.setattr("app.routers.cloudinary_upload.settings", test_settings)

    res = client.get("/upload-signature")
    assert res.status_code == 200
    assert res.json()["folder"] == "picto"
