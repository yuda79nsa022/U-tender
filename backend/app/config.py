from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "mysql+pymysql://utender:utender@localhost:3306/utender"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 30
    jwt_refresh_ttl_days: int = 30

    # local: files live under storage_root, served through a signed backend
    # route. s3: boto3 presigned URLs. Switching is config-only.
    storage_backend: str = "local"  # "local" | "s3"
    storage_root: str = "./storage"
    storage_signing_secret: str = "change-me-in-production"

    s3_bucket_drawings: str = "project-drawings"
    s3_bucket_documents: str = "contractor-documents"
    s3_region: str | None = None
    s3_endpoint_url: str | None = None  # set for MinIO / S3-compatible hosts
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_id_monthly: str | None = None
    stripe_price_id_annual: str | None = None

    resend_api_key: str | None = None
    email_from: str = "U-Tender <notifications@u-tender.example>"

    cron_secret: str | None = None
    app_url: str = "http://localhost:5173"  # frontend origin, used in email links
    api_url: str = "http://localhost:8000"  # this backend's own public origin

    cors_origins: str = "http://localhost:5173"

    # Matches the original app's raised Server Action body limit (25MB ->
    # 50MB) to accommodate zipped folders of drawings.
    max_upload_mb: int = 50


@lru_cache
def get_settings() -> Settings:
    return Settings()
