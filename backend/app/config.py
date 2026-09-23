from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import os


ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT_DIR / ".env"


def getenv(name: str, default: str = "") -> str:
    return os.getenv(name, default).rstrip("\r\n")


def load_dotenv(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return

    parsed: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        parsed[key.strip()] = value.strip().strip('"').strip("'")

    for key, value in parsed.items():
        os.environ.setdefault(key, value)


@dataclass(frozen=True)
class Settings:
    openai_api_key: str
    openai_model: str
    openai_reasoning_effort: str
    openai_transcription_model: str
    openai_tts_model: str
    openai_tts_voice: str
    openai_realtime_model: str
    openai_realtime_voice: str
    google_places_api_key: str
    google_search_api_key: str
    google_search_engine_id: str
    mysql_host: str
    mysql_port: int
    mysql_user: str
    mysql_password: str
    mysql_database: str
    admin_password: str
    default_login_email: str
    default_login_password: str
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_from_email: str
    smtp_use_tls: bool
    whatsapp_api_url: str
    whatsapp_access_token: str
    whatsapp_phone_number_id: str
    whatsapp_business_account_id: str
    whatsapp_verify_token: str
    whatsapp_api_version: str
    whatsapp_task_template_name: str
    document_storage_directory: str
    chroma_persist_directory: str
    chroma_collection_name: str
    document_max_upload_mb: int

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()
        return cls(
            openai_api_key=getenv("OPENAI_API_KEY"),
            openai_model=getenv("OPENAI_MODEL", "gpt-6-luna"),
            openai_reasoning_effort=getenv("OPENAI_REASONING_EFFORT", "none"),
            openai_transcription_model=getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-transcribe"),
            openai_tts_model=getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
            openai_tts_voice=getenv("OPENAI_TTS_VOICE", "marin"),
            openai_realtime_model=getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-2.1"),
            openai_realtime_voice=getenv("OPENAI_REALTIME_VOICE", "marin"),
            google_places_api_key=getenv("GOOGLE_PLACES_API_KEY"),
            google_search_api_key=getenv("GOOGLE_SEARCH_API_KEY"),
            google_search_engine_id=getenv("GOOGLE_SEARCH_ENGINE_ID"),
            mysql_host=getenv("MYSQL_HOST", "127.0.0.1"),
            mysql_port=int(getenv("MYSQL_PORT", "3306")),
            mysql_user=getenv("MYSQL_USER"),
            mysql_password=getenv("MYSQL_PASSWORD"),
            mysql_database=getenv("MYSQL_DATABASE", "nextgtools"),
            admin_password=getenv("ADMIN_PASSWORD"),
            default_login_email=getenv("DEFAULT_LOGIN_EMAIL"),
            default_login_password=getenv("DEFAULT_LOGIN_PASSWORD"),
            smtp_host=getenv("SMTP_HOST"),
            smtp_port=int(getenv("SMTP_PORT", "587")),
            smtp_username=getenv("SMTP_USERNAME"),
            smtp_password=getenv("SMTP_PASSWORD"),
            smtp_from_email=getenv("SMTP_FROM_EMAIL"),
            smtp_use_tls=getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes"},
            whatsapp_api_url=getenv("WHATSAPP_API_URL"),
            whatsapp_access_token=getenv("WHATSAPP_ACCESS_TOKEN"),
            whatsapp_phone_number_id=getenv("WHATSAPP_PHONE_NUMBER_ID"),
            whatsapp_business_account_id=getenv("WHATSAPP_BUSINESS_ACCOUNT_ID"),
            whatsapp_verify_token=getenv("WHATSAPP_VERIFY_TOKEN"),
            whatsapp_api_version=getenv("WHATSAPP_API_VERSION", "v23.0"),
            whatsapp_task_template_name=getenv("WHATSAPP_TASK_TEMPLATE_NAME", "employee_task_assignment"),
            document_storage_directory=getenv("DOCUMENT_STORAGE_DIRECTORY", str(ROOT_DIR / ".data" / "documents")),
            chroma_persist_directory=getenv("CHROMA_PERSIST_DIRECTORY", str(ROOT_DIR / ".data" / "chroma")),
            chroma_collection_name=getenv("CHROMA_COLLECTION_NAME", "document_records"),
            document_max_upload_mb=int(getenv("DOCUMENT_MAX_UPLOAD_MB", "100")),
        )

    def missing_keys(self) -> list[str]:
        required: Iterable[tuple[str, str]] = (
            ("OPENAI_API_KEY", self.openai_api_key),
            ("OPENAI_MODEL", self.openai_model),
            ("GOOGLE_PLACES_API_KEY", self.google_places_api_key),
            ("GOOGLE_SEARCH_API_KEY", self.google_search_api_key),
            ("GOOGLE_SEARCH_ENGINE_ID", self.google_search_engine_id),
            ("MYSQL_HOST", self.mysql_host),
            ("MYSQL_PORT", str(self.mysql_port)),
            ("MYSQL_USER", self.mysql_user),
            ("MYSQL_DATABASE", self.mysql_database),
        )
        return [name for name, value in required if not value]


settings = Settings.from_env()
