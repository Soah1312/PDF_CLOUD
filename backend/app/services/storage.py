import io
import os
import logging
from pathlib import Path
from typing import Optional, Union, Dict, Any
import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from fastapi import HTTPException, status

from app.core.config import config
from app.services.file_validator import sanitize_filename

logger = logging.getLogger("cloudpdf.storage")

# Local fallback storage root
LOCAL_STORAGE_DIR = Path(__file__).resolve().parent.parent.parent / "storage"
LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class StorageService:
    """
    Amazon S3 Storage Service with dual-access logical structure and local disk fallback.

    Logical S3 Layout:
      cloudpdf-studio-storage-2026/
          guest/
              {session_id}/
                  raw/
                  processed/
          users/
              {cognito_user_id}/
                  raw/
                  processed/
          forensic/
              watermark_records/
    """

    def __init__(self, bucket_name: Optional[str] = None, region: Optional[str] = None):
        self.bucket_name = bucket_name or config.S3_BUCKET_NAME
        self.region = region or config.AWS_REGION
        self._s3_client = None
        self._s3_available = False
        self._init_s3()

    def _is_production(self) -> bool:
        return config.ENVIRONMENT.lower() in ("production", "prod")

    def _init_s3(self):
        """
        Initializes boto3 S3 client using the standard AWS SDK credential provider chain.
        In AWS environments (EC2), automatically adopts IAM instance role credentials.
        In local dev without credentials, gracefully activates local fallback.
        """
        try:
            client = boto3.client("s3", region_name=self.region)
            # Lightweight credentials validation test
            try:
                client.head_bucket(Bucket=self.bucket_name)
                self._s3_client = client
                self._s3_available = True
                logger.info(f"[Storage] Connected to Amazon S3 bucket '{self.bucket_name}' (region: {self.region}).")
            except ClientError as ce:
                error_code = str(ce.response.get("Error", {}).get("Code", ""))
                if error_code in ("403", "AccessDenied"):
                    # Credentials exist but head_bucket is restricted or bucket belongs to role
                    self._s3_client = client
                    self._s3_available = True
                    logger.info(f"[Storage] S3 client configured with active credentials for bucket '{self.bucket_name}'.")
                elif error_code in ("404", "NoSuchBucket"):
                    if self._is_production():
                        logger.error(f"[Storage Production Alert] Target S3 bucket '{self.bucket_name}' not found!")
                    else:
                        logger.warning(f"[Storage] Target S3 bucket '{self.bucket_name}' not found. Using local fallback.")
                    self._s3_available = False
                else:
                    self._s3_client = client
                    self._s3_available = True
        except (NoCredentialsError, Exception) as e:
            if self._is_production():
                logger.error(f"[Storage Production Alert] Failed to initialize AWS S3 client in production: {e.__class__.__name__}")
            else:
                logger.info(
                    f"[Storage] AWS credentials not detected locally ({e.__class__.__name__}). "
                    "Defaulting to local filesystem storage mirror. Full S3 operations will activate automatically in AWS EC2."
                )
            self._s3_available = False

    def is_s3_active(self) -> bool:
        return self._s3_available

    # --- Path & Key Builders ---
    @staticmethod
    def build_guest_raw_key(session_id: str, filename: str) -> str:
        safe_name = sanitize_filename(filename)
        return f"guest/{session_id}/raw/{safe_name}"

    @staticmethod
    def build_guest_processed_key(session_id: str, filename: str) -> str:
        safe_name = sanitize_filename(filename)
        return f"guest/{session_id}/processed/{safe_name}"

    @staticmethod
    def build_user_raw_key(cognito_sub: str, filename: str) -> str:
        safe_name = sanitize_filename(filename)
        return f"users/{cognito_sub}/raw/{safe_name}"

    @staticmethod
    def build_user_processed_key(cognito_sub: str, filename: str) -> str:
        safe_name = sanitize_filename(filename)
        return f"users/{cognito_sub}/processed/{safe_name}"

    @staticmethod
    def build_forensic_key(token_id: str) -> str:
        safe_token = sanitize_filename(token_id)
        return f"forensic/watermark_records/{safe_token}.json"

    # --- Security & Isolation Checks ---
    @staticmethod
    def validate_storage_path(key: str):
        """Rejects path traversal attempts."""
        if ".." in key or key.startswith("/") or "\\" in key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid storage key: path traversal sequence detected."
            )

    @classmethod
    def verify_access(
        cls,
        key: str,
        user_sub: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> bool:
        """
        Enforces tenant isolation:
        - Authenticated members may only access objects under users/{cognito_sub}/
        - Guests may only access objects under guest/{session_id}/
        Raises HTTP 403 Forbidden if mismatched.
        """
        cls.validate_storage_path(key)

        if user_sub:
            expected_prefix = f"users/{user_sub}/"
            if not key.startswith(expected_prefix):
                logger.warning(f"[Storage Security] Access denied: User '{user_sub}' tried accessing key '{key}'")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to access this document."
                )
            return True

        if session_id:
            expected_prefix = f"guest/{session_id}/"
            if not key.startswith(expected_prefix):
                logger.warning(f"[Storage Security] Access denied: Session '{session_id}' tried accessing key '{key}'")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Invalid session ownership for requested document."
                )
            return True

        # Neither user nor guest session provided
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication or session identifier required to access storage."
        )

    # --- Storage Operations ---
    def upload_file(
        self,
        file_data: Union[bytes, io.BytesIO],
        key: str,
        content_type: str = "application/pdf",
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Uploads file to Amazon S3. In production, requires active S3 and raises explicit
        HTTP 500 errors on failure. In development, provides local filesystem mirror fallback.
        """
        self.validate_storage_path(key)

        if isinstance(file_data, io.BytesIO):
            file_bytes = file_data.getvalue()
        else:
            file_bytes = file_data

        if self._is_production():
            if not self._s3_available or not self._s3_client:
                logger.error("[Storage] S3 client unavailable during production upload.")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Amazon S3 storage service is unavailable in production."
                )
            try:
                extra_args = {"ContentType": content_type}
                if metadata:
                    extra_args["Metadata"] = metadata

                self._s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=file_bytes,
                    **extra_args
                )
                logger.info(f"[Storage] Production S3 put_object successful: s3://{self.bucket_name}/{key} ({len(file_bytes)} bytes)")
                return key
            except (BotoCoreError, ClientError) as e:
                logger.error(f"[Storage] Production S3 put_object failed for key '{key}': {e.__class__.__name__}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to upload file to Amazon S3."
                )

        # Development / Testing mode: attempt S3 if available, otherwise fall back to local disk
        if self._s3_available and self._s3_client:
            try:
                extra_args = {"ContentType": content_type}
                if metadata:
                    extra_args["Metadata"] = metadata

                self._s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=file_bytes,
                    **extra_args
                )
                logger.info(f"[Storage] Uploaded {len(file_bytes)} bytes to s3://{self.bucket_name}/{key}")
                return key
            except (BotoCoreError, ClientError) as e:
                logger.warning(f"[Storage] Development S3 put_object failed ({e.__class__.__name__}). Saving to local mirror fallback.")

        # Local development mirror
        local_path = LOCAL_STORAGE_DIR / key.replace("/", os.sep)
        local_path.parent.mkdir(parents=True, exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(file_bytes)
        logger.info(f"[Storage] Stored {len(file_bytes)} bytes in local mirror: {local_path}")
        return key

    def download_file(self, key: str) -> bytes:
        """
        Retrieves file bytes from Amazon S3. In production, never falls back to local disk.
        """
        self.validate_storage_path(key)

        if self._is_production():
            if not self._s3_available or not self._s3_client:
                logger.error("[Storage] S3 client unavailable during production download.")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Amazon S3 storage service is unavailable in production."
                )
            try:
                response = self._s3_client.get_object(Bucket=self.bucket_name, Key=key)
                return response["Body"].read()
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if error_code in ("NoSuchKey", "404"):
                    logger.warning(f"[Storage] Production S3 key '{key}' not found.")
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Requested document object not found."
                    )
                logger.error(f"[Storage] Production S3 get_object failed for '{key}': {error_code}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to retrieve file from Amazon S3."
                )
            except Exception as e:
                logger.error(f"[Storage] Production S3 download unexpected error for '{key}': {e.__class__.__name__}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to retrieve file from Amazon S3."
                )

        # Development / Testing mode
        if self._s3_available and self._s3_client:
            try:
                response = self._s3_client.get_object(Bucket=self.bucket_name, Key=key)
                return response["Body"].read()
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if error_code == "NoSuchKey":
                    logger.warning(f"[Storage] S3 key '{key}' not found.")
                else:
                    logger.warning(f"[Storage] S3 get_object failed for '{key}': {e.__class__.__name__}")
            except Exception as e:
                logger.warning(f"[Storage] S3 get_object error for '{key}': {e.__class__.__name__}")

        # Check local fallback mirror (development only)
        local_path = LOCAL_STORAGE_DIR / key.replace("/", os.sep)
        if not local_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Requested document object not found."
            )
        with open(local_path, "rb") as f:
            return f.read()

    def object_exists(self, key: str) -> bool:
        """
        Checks whether an object exists in S3. In production, queries S3 only.
        """
        self.validate_storage_path(key)

        if self._is_production():
            if not self._s3_available or not self._s3_client:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Amazon S3 storage service is unavailable in production."
                )
            try:
                self._s3_client.head_object(Bucket=self.bucket_name, Key=key)
                return True
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                    return False
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to verify object existence in Amazon S3."
                )

        if self._s3_available and self._s3_client:
            try:
                self._s3_client.head_object(Bucket=self.bucket_name, Key=key)
                return True
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                    return False
            except Exception:
                pass

        local_path = LOCAL_STORAGE_DIR / key.replace("/", os.sep)
        return local_path.exists()

    def get_object_metadata(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Returns metadata for an object. In production, queries S3 only.
        """
        self.validate_storage_path(key)

        if self._is_production():
            if not self._s3_available or not self._s3_client:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Amazon S3 storage service is unavailable in production."
                )
            try:
                resp = self._s3_client.head_object(Bucket=self.bucket_name, Key=key)
                return {
                    "content_length": resp.get("ContentLength", 0),
                    "content_type": resp.get("ContentType", "application/octet-stream"),
                    "last_modified": resp.get("LastModified"),
                    "metadata": resp.get("Metadata", {}),
                }
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                    return None
                logger.error(f"[Storage] Production S3 head_object error for '{key}': {e.__class__.__name__}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to retrieve object metadata from Amazon S3."
                )

        if self._s3_available and self._s3_client:
            try:
                resp = self._s3_client.head_object(Bucket=self.bucket_name, Key=key)
                return {
                    "content_length": resp.get("ContentLength", 0),
                    "content_type": resp.get("ContentType", "application/octet-stream"),
                    "last_modified": resp.get("LastModified"),
                    "metadata": resp.get("Metadata", {}),
                }
            except Exception as e:
                logger.warning(f"[Storage] head_object error for '{key}': {e.__class__.__name__}")

        local_path = LOCAL_STORAGE_DIR / key.replace("/", os.sep)
        if local_path.exists():
            stat = local_path.stat()
            return {
                "content_length": stat.st_size,
                "content_type": "application/pdf" if key.endswith(".pdf") else "application/octet-stream",
                "last_modified": stat.st_mtime,
                "metadata": {},
            }
        return None

    def delete_file(self, key: str) -> bool:
        """
        Deletes a file from Amazon S3. In production, never touches local disk.
        """
        self.validate_storage_path(key)

        if self._is_production():
            if not self._s3_available or not self._s3_client:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Amazon S3 storage service is unavailable in production."
                )
            try:
                self._s3_client.delete_object(Bucket=self.bucket_name, Key=key)
                logger.info(f"[Storage] Deleted object from production S3: s3://{self.bucket_name}/{key}")
                return True
            except Exception as e:
                logger.error(f"[Storage] Production S3 delete_object failed for '{key}': {e.__class__.__name__}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to delete object from Amazon S3."
                )

        deleted = False
        if self._s3_available and self._s3_client:
            try:
                self._s3_client.delete_object(Bucket=self.bucket_name, Key=key)
                deleted = True
                logger.info(f"[Storage] Deleted object from S3: s3://{self.bucket_name}/{key}")
            except Exception as e:
                logger.warning(f"[Storage] S3 delete_object failed for '{key}': {e.__class__.__name__}")

        local_path = LOCAL_STORAGE_DIR / key.replace("/", os.sep)
        if local_path.exists():
            try:
                local_path.unlink()
                deleted = True
                logger.info(f"[Storage] Deleted local mirror file: {local_path}")
            except Exception as e:
                logger.warning(f"[Storage] Local unlink failed for '{local_path}': {e.__class__.__name__}")

        return deleted

    def generate_presigned_url(
        self,
        key: str,
        expiration: int = 3600,
        download_filename: Optional[str] = None
    ) -> Optional[str]:
        """
        Generates a pre-signed URL for direct browser downloads from S3.
        Sets Content-Disposition header with the desired filename.
        Returns None if using local storage fallback.
        """
        self.validate_storage_path(key)

        if self._is_production():
            if not self._s3_available or not self._s3_client:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Amazon S3 storage service is unavailable in production."
                )
            try:
                params = {
                    "Bucket": self.bucket_name,
                    "Key": key,
                }
                if download_filename:
                    safe_download_name = sanitize_filename(download_filename)
                    params["ResponseContentDisposition"] = f'attachment; filename="{safe_download_name}"'

                return self._s3_client.generate_presigned_url(
                    "get_object",
                    Params=params,
                    ExpiresIn=expiration,
                )
            except Exception as e:
                logger.error(f"[Storage] Failed to generate presigned URL for '{key}': {e.__class__.__name__}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to generate download URL from Amazon S3."
                )

        if not self._s3_available or not self._s3_client:
            return None

        try:
            params = {
                "Bucket": self.bucket_name,
                "Key": key,
            }
            if download_filename:
                safe_download_name = sanitize_filename(download_filename)
                params["ResponseContentDisposition"] = f'attachment; filename="{safe_download_name}"'

            return self._s3_client.generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=expiration,
            )
        except Exception as e:
            logger.warning(f"[Storage] Failed to generate presigned URL for '{key}': {e.__class__.__name__}")
            return None


# Global singleton instance
storage_service = StorageService()
