from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


class Settings(BaseSettings):
    secret_key: str = Field(
        "change-me-in-production",
        alias="SECRET_KEY",
        min_length=16,
    )
    database_url: str = Field("sqlite:///./voxassess_dev.db", alias="DATABASE_URL")
    stream_api_key: str | None = Field(None, alias="STREAM_API_KEY")
    stream_api_secret: str | None = Field(None, alias="STREAM_API_SECRET")
    gemini_api_key: str | None = Field(None, alias="GEMINI_API_KEY")
    allowed_origins_raw: str = Field(
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
        alias="ALLOWED_ORIGINS",
    )
    upload_dir: Path = Field(BASE_DIR / "temp_uploads", alias="UPLOAD_DIR")
    recordings_dir: Path = Field(BASE_DIR / "recordings", alias="RECORDINGS_DIR")
    log_dir: Path = Field(BASE_DIR / "logs", alias="LOG_DIR")
    max_upload_size_mb: int = Field(50, alias="MAX_UPLOAD_SIZE_MB", ge=1)
    recording_retention_days: int = Field(30, alias="RECORDING_RETENTION_DAYS", ge=1)

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @field_validator("allowed_origins_raw")
    @classmethod
    def validate_allowed_origins(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        if not origins:
            raise ValueError("ALLOWED_ORIGINS must include at least one origin")
        return value

    @field_validator("upload_dir", "recordings_dir", "log_dir", mode="after")
    @classmethod
    def resolve_paths(cls, value: Path) -> Path:
        return value if value.is_absolute() else BASE_DIR / value

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_postgresql(self) -> bool:
        return self.database_url.startswith(("postgresql", "postgres"))

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.allowed_origins_raw.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
