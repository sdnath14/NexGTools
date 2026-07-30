from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import os


ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT_DIR / ".env"


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

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv()
        return cls(
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            openai_model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            google_places_api_key=os.getenv("GOOGLE_PLACES_API_KEY", ""),
            google_search_api_key=os.getenv("GOOGLE_SEARCH_API_KEY", ""),
            google_search_engine_id=os.getenv("GOOGLE_SEARCH_ENGINE_ID", ""),
            mysql_host=os.getenv("MYSQL_HOST", "127.0.0.1"),
            mysql_port=int(os.getenv("MYSQL_PORT", "3306")),
            mysql_user=os.getenv("MYSQL_USER", ""),
            mysql_password=os.getenv("MYSQL_PASSWORD", ""),
            mysql_database=os.getenv("MYSQL_DATABASE", "nextgtools"),
            admin_password=os.getenv("ADMIN_PASSWORD", ""),
            default_login_email=os.getenv("DEFAULT_LOGIN_EMAIL", ""),
            default_login_password=os.getenv("DEFAULT_LOGIN_PASSWORD", ""),
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
