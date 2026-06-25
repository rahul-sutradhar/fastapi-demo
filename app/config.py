import os
from pathlib import Path
from pydantic_settings import BaseSettings



class Settings(BaseSettings):
    database_hostname: str
    database_port: str
    database_password: str
    database_name: str
    database_username: str
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    cloudinary_upload_preset: str = ""

    class Config:
        env_file = str(Path(__file__).resolve().parent.parent / ".env") if (Path(__file__).resolve().parent.parent / ".env").exists() else None


settings = Settings()