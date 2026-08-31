import hashlib
import hmac
import time
from abc import ABC, abstractmethod
from pathlib import Path

from app.config import get_settings

settings = get_settings()

# Drawings must stay accessible for exactly as long as the owner said
# bidding is open — not an arbitrary short-lived link. Expiry is tied to
# the project's bid_deadline (plus a small buffer so a contractor mid-review
# right at the deadline doesn't get cut off). Ported verbatim from
# src/lib/storage.ts.
ONE_HOUR = 60 * 60
NINETY_DAYS = 60 * 60 * 24 * 90
POST_DEADLINE_BUFFER = 60 * 15  # 15 minutes grace after the deadline


def drawing_url_expiry_seconds(bid_deadline) -> int:
    seconds_remaining = int((bid_deadline.timestamp() + POST_DEADLINE_BUFFER) - time.time())
    return min(max(seconds_remaining, ONE_HOUR), NINETY_DAYS)


class Storage(ABC):
    @abstractmethod
    def save(self, bucket: str, key: str, content: bytes, content_type: str) -> None: ...

    @abstractmethod
    def signed_url(self, bucket: str, key: str, expires_in: int) -> str: ...

    @abstractmethod
    def download(self, bucket: str, key: str) -> bytes | None: ...

    @abstractmethod
    def delete(self, bucket: str, keys: list[str]) -> None: ...


class LocalFileStorage(Storage):
    """Files on disk under STORAGE_ROOT. 'Signed' URLs are an HMAC-signed
    path + expiry, verified by the /files route in app/routers/files.py —
    same calling convention and expiry semantics as the S3 backend, so
    switching STORAGE_BACKEND never changes any caller."""

    def __init__(self) -> None:
        self.root = Path(settings.storage_root)

    def _path(self, bucket: str, key: str) -> Path:
        return self.root / bucket / key

    def save(self, bucket: str, key: str, content: bytes, content_type: str) -> None:
        path = self._path(bucket, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def signed_url(self, bucket: str, key: str, expires_in: int) -> str:
        expires_at = int(time.time()) + expires_in
        signature = self._sign(bucket, key, expires_at)
        return f"{settings.api_url}/files/{bucket}/{key}?exp={expires_at}&sig={signature}"

    def download(self, bucket: str, key: str) -> bytes | None:
        path = self._path(bucket, key)
        if not path.is_file():
            return None
        return path.read_bytes()

    def delete(self, bucket: str, keys: list[str]) -> None:
        for key in keys:
            path = self._path(bucket, key)
            path.unlink(missing_ok=True)

    @staticmethod
    def _sign(bucket: str, key: str, expires_at: int) -> str:
        message = f"{bucket}:{key}:{expires_at}".encode()
        return hmac.new(settings.storage_signing_secret.encode(), message, hashlib.sha256).hexdigest()

    @classmethod
    def verify(cls, bucket: str, key: str, expires_at: int, signature: str) -> bool:
        if time.time() > expires_at:
            return False
        expected = cls._sign(bucket, key, expires_at)
        return hmac.compare_digest(expected, signature)


class S3Storage(Storage):
    """boto3 presigned URLs. Works against real S3 or an S3-compatible
    endpoint (e.g. MinIO) via S3_ENDPOINT_URL for local dev parity."""

    def __init__(self) -> None:
        import boto3

        self._client = boto3.client(
            "s3",
            region_name=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )

    def _resolve_bucket(self, bucket: str) -> str:
        return {
            "project-drawings": settings.s3_bucket_drawings,
            "contractor-documents": settings.s3_bucket_documents,
        }.get(bucket, bucket)

    def save(self, bucket: str, key: str, content: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self._resolve_bucket(bucket), Key=key, Body=content, ContentType=content_type)

    def signed_url(self, bucket: str, key: str, expires_in: int) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._resolve_bucket(bucket), "Key": key},
            ExpiresIn=expires_in,
        )

    def download(self, bucket: str, key: str) -> bytes | None:
        try:
            obj = self._client.get_object(Bucket=self._resolve_bucket(bucket), Key=key)
        except self._client.exceptions.NoSuchKey:
            return None
        except Exception:
            return None
        return obj["Body"].read()

    def delete(self, bucket: str, keys: list[str]) -> None:
        if not keys:
            return
        real_bucket = self._resolve_bucket(bucket)
        self._client.delete_objects(Bucket=real_bucket, Delete={"Objects": [{"Key": k} for k in keys]})


_storage_instance: Storage | None = None


def get_storage() -> Storage:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = S3Storage() if settings.storage_backend == "s3" else LocalFileStorage()
    return _storage_instance
