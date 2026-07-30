from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator
import json

import pymysql
from pymysql.cursors import DictCursor

from .auth import create_token, hash_password, verify_password
from .config import settings


def _connect(database: str | None = None):
    return pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=database,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )


@contextmanager
def db_connection() -> Iterator[Any]:
    connection = _connect(settings.mysql_database)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    with _connect(None) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{settings.mysql_database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        connection.commit()

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS lead_searches (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    query_text VARCHAR(500) NOT NULL,
                    company_name VARCHAR(255),
                    business_type VARCHAR(255),
                    city_area VARCHAR(255),
                    pincode VARCHAR(32),
                    radius_km INT NOT NULL,
                    pages_fetched INT NOT NULL DEFAULT 0,
                    result_count INT NOT NULL DEFAULT 0,
                    center_json JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS lead_results (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    search_id BIGINT UNSIGNED NOT NULL,
                    place_id VARCHAR(255) NOT NULL,
                    name VARCHAR(500) NOT NULL,
                    phone VARCHAR(120),
                    address TEXT,
                    business_type VARCHAR(255),
                    website TEXT,
                    google_maps_url TEXT,
                    rating DECIMAL(3, 2),
                    status VARCHAR(120),
                    latitude DECIMAL(11, 8),
                    longitude DECIMAL(11, 8),
                    distance_km DECIMAL(8, 2),
                    raw_json JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_search_id (search_id),
                    INDEX idx_place_id (place_id),
                    CONSTRAINT fk_lead_results_search
                        FOREIGN KEY (search_id) REFERENCES lead_searches(id)
                        ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    password_salt VARCHAR(64) NOT NULL,
                    password_hash VARCHAR(128) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS business_searches (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED,
                    query_text VARCHAR(500) NOT NULL,
                    location VARCHAR(255),
                    source VARCHAR(120) NOT NULL,
                    result_count INT NOT NULL DEFAULT 0,
                    sources_json JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_business_searches_user (user_id),
                    CONSTRAINT fk_business_searches_user
                        FOREIGN KEY (user_id) REFERENCES users(id)
                        ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS business_search_results (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    search_id BIGINT UNSIGNED NOT NULL,
                    result_name VARCHAR(500) NOT NULL,
                    source VARCHAR(120),
                    source_label VARCHAR(255),
                    url TEXT,
                    phone VARCHAR(160),
                    email VARCHAR(255),
                    address TEXT,
                    website TEXT,
                    business_type VARCHAR(255),
                    raw_json JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_business_results_search (search_id),
                    CONSTRAINT fk_business_results_search
                        FOREIGN KEY (search_id) REFERENCES business_searches(id)
                        ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS website_scrapes (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    url TEXT NOT NULL,
                    domain VARCHAR(255),
                    pages_scraped INT NOT NULL DEFAULT 0,
                    emails_count INT NOT NULL DEFAULT 0,
                    phones_count INT NOT NULL DEFAULT 0,
                    scrape_json JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS lead_ai_messages (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    role VARCHAR(32) NOT NULL,
                    question TEXT,
                    answer MEDIUMTEXT,
                    lead_json JSON,
                    scrape_json JSON,
                    model VARCHAR(120),
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    token VARCHAR(255) NOT NULL UNIQUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_token (token),
                    CONSTRAINT fk_user_sessions_user
                        FOREIGN KEY (user_id) REFERENCES users(id)
                        ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS csv_exports (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED,
                    export_name VARCHAR(255) NOT NULL,
                    row_count INT NOT NULL DEFAULT 0,
                    source VARCHAR(120) NOT NULL DEFAULT 'lead_search',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_csv_exports_user (user_id),
                    CONSTRAINT fk_csv_exports_user
                        FOREIGN KEY (user_id) REFERENCES users(id)
                        ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS csv_export_rows (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    export_id BIGINT UNSIGNED NOT NULL,
                    lead_json JSON NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_csv_export_rows_export (export_id),
                    CONSTRAINT fk_csv_export_rows_export
                        FOREIGN KEY (export_id) REFERENCES csv_exports(id)
                        ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_settings (
                    setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
                    setting_value TEXT NOT NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_sessions (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    token VARCHAR(255) NOT NULL UNIQUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_admin_token (token),
                    CONSTRAINT fk_admin_sessions_user
                        FOREIGN KEY (user_id) REFERENCES users(id)
                        ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                "SELECT setting_key FROM admin_settings WHERE setting_key = 'admin_password'"
            )
            has_admin_password = cursor.fetchone()
            if settings.admin_password and not has_admin_password:
                salt, digest = hash_password(settings.admin_password)
                cursor.execute(
                    """
                    INSERT INTO admin_settings (setting_key, setting_value)
                    VALUES ('admin_password', %s)
                    """,
                    (json.dumps({"salt": salt, "hash": digest}),),
                )


def database_status() -> dict[str, Any]:
    try:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT DATABASE() AS database_name")
                row = cursor.fetchone() or {}
        return {"ok": True, "database": row.get("database_name")}
    except Exception as exc:
        return {"ok": False, "database": settings.mysql_database, "error": str(exc)}


def save_lead_search(payload: Any, response: dict[str, Any]) -> int | None:
    try:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO lead_searches (
                        query_text, company_name, business_type, city_area, pincode,
                        radius_km, pages_fetched, result_count, center_json
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CAST(%s AS JSON))
                    """,
                    (
                        response.get("query", ""),
                        payload.company_name,
                        payload.business_type,
                        payload.city_area,
                        payload.pincode,
                        response.get("radius_km", payload.radius_km),
                        response.get("pages_fetched", 0),
                        response.get("count", 0),
                        json.dumps(response.get("center")),
                    ),
                )
                search_id = cursor.lastrowid
                for lead in response.get("leads", []):
                    cursor.execute(
                        """
                        INSERT INTO lead_results (
                            search_id, place_id, name, phone, address, business_type,
                            website, google_maps_url, rating, status, latitude,
                            longitude, distance_km, raw_json
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CAST(%s AS JSON))
                        """,
                        (
                            search_id,
                            lead.get("id"),
                            lead.get("name"),
                            lead.get("phone"),
                            lead.get("address"),
                            lead.get("business_type"),
                            lead.get("website"),
                            lead.get("google_maps_url"),
                            lead.get("rating"),
                            lead.get("status"),
                            lead.get("latitude"),
                            lead.get("longitude"),
                            lead.get("distance_km"),
                            json.dumps(lead),
                        ),
                    )
                return search_id
    except Exception:
        return None


def save_business_search(payload: Any, response: dict[str, Any], user_id: int | None = None) -> int | None:
    try:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO business_searches (
                        user_id, query_text, location, source, result_count, sources_json
                    )
                    VALUES (%s, %s, %s, %s, %s, CAST(%s AS JSON))
                    """,
                    (
                        user_id,
                        response.get("query", payload.query),
                        response.get("location", payload.location),
                        response.get("source", payload.source),
                        response.get("count", 0),
                        json.dumps(response.get("sources") or []),
                    ),
                )
                search_id = cursor.lastrowid
                for result in response.get("results", []):
                    cursor.execute(
                        """
                        INSERT INTO business_search_results (
                            search_id, result_name, source, source_label, url, phone, email,
                            address, website, business_type, raw_json
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CAST(%s AS JSON))
                        """,
                        (
                            search_id,
                            result.get("name") or "Unnamed result",
                            result.get("source"),
                            result.get("source_label"),
                            result.get("url"),
                            result.get("phone"),
                            result.get("email"),
                            result.get("address"),
                            result.get("website"),
                            result.get("business_type"),
                            json.dumps(result),
                        ),
                    )
                return search_id
    except Exception:
        return None


def save_website_scrape(scrape: dict[str, Any]) -> int | None:
    try:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO website_scrapes (
                        url, domain, pages_scraped, emails_count, phones_count, scrape_json
                    )
                    VALUES (%s, %s, %s, %s, %s, CAST(%s AS JSON))
                    """,
                    (
                        scrape.get("start_url", ""),
                        scrape.get("domain"),
                        scrape.get("pages_scraped", 0),
                        len(scrape.get("emails") or []),
                        len(scrape.get("phones") or []),
                        json.dumps(scrape),
                    ),
                )
                return cursor.lastrowid
    except Exception:
        return None


def save_lead_ai_message(
    question: str,
    answer: str,
    lead: dict[str, Any] | None,
    scrape: dict[str, Any] | None,
    model: str,
) -> int | None:
    try:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO lead_ai_messages (
                        role, question, answer, lead_json, scrape_json, model
                    )
                    VALUES (%s, %s, %s, CAST(%s AS JSON), CAST(%s AS JSON), %s)
                    """,
                    (
                        "assistant",
                        question,
                        answer,
                        json.dumps(lead or {}),
                        json.dumps(scrape or {}),
                        model,
                    ),
                )
                return cursor.lastrowid
    except Exception:
        return None


def create_user(name: str, email: str, password_salt: str, password_hash: str) -> dict[str, Any]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (name, email, password_salt, password_hash)
                VALUES (%s, %s, %s, %s)
                """,
                (name, email, password_salt, password_hash),
            )
            user_id = cursor.lastrowid
            return {"id": user_id, "name": name, "email": email}


def ensure_default_user(name: str, email: str, password: str) -> None:
    if not email or not password:
        return
    normalized_email = email.strip().lower()
    salt, password_digest = hash_password(password)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE email = %s", (normalized_email,))
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    "UPDATE users SET name = %s, password_salt = %s, password_hash = %s WHERE id = %s",
                    (name, salt, password_digest, existing["id"]),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO users (name, email, password_salt, password_hash)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (name, normalized_email, salt, password_digest),
                )


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
            return cursor.fetchone()


def create_session(user_id: int, token: str) -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO user_sessions (user_id, token) VALUES (%s, %s)",
                (user_id, token),
            )


def delete_session(token: str) -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM user_sessions WHERE token = %s", (token,))


def get_user_by_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT users.id, users.name, users.email
                FROM user_sessions
                JOIN users ON users.id = user_sessions.user_id
                WHERE user_sessions.token = %s
                """,
                (token,),
            )
            return cursor.fetchone()


def verify_admin_password(password: str) -> bool:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_password'"
            )
            row = cursor.fetchone()
    if not row:
        return False
    value = row.get("setting_value")
    secret = json.loads(value) if isinstance(value, str) else value
    return verify_password(password, secret.get("salt", ""), secret.get("hash", ""))


def create_admin_session(user_id: int) -> str:
    token = create_token()
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO admin_sessions (user_id, token) VALUES (%s, %s)",
                (user_id, token),
            )
    return token


def get_admin_session(token: str, user_id: int) -> dict[str, Any] | None:
    if not token:
        return None
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT admin_sessions.id, admin_sessions.user_id, admin_sessions.created_at
                FROM admin_sessions
                WHERE admin_sessions.token = %s AND admin_sessions.user_id = %s
                """,
                (token, user_id),
            )
            row = cursor.fetchone()
    if row and row.get("created_at"):
        row["created_at"] = row["created_at"].isoformat()
    return row


ADMIN_TABLES: dict[str, dict[str, Any]] = {
    "users": {
        "label": "Users",
        "fields": ["id", "name", "email", "created_at"],
        "editable": ["name", "email"],
        "order": "created_at DESC, id DESC",
    },
    "lead_searches": {
        "label": "Lead Searches",
        "fields": [
            "id",
            "query_text",
            "company_name",
            "business_type",
            "city_area",
            "pincode",
            "radius_km",
            "pages_fetched",
            "result_count",
            "created_at",
        ],
        "editable": ["query_text", "company_name", "business_type", "city_area", "pincode", "radius_km"],
        "order": "created_at DESC, id DESC",
    },
    "lead_results": {
        "label": "Lead Results",
        "fields": ["id", "search_id", "name", "phone", "address", "business_type", "website", "google_maps_url", "rating", "status", "created_at"],
        "editable": ["name", "phone", "address", "business_type", "website", "google_maps_url", "rating", "status"],
        "order": "created_at DESC, id DESC",
    },
    "business_searches": {
        "label": "Business Searches",
        "fields": ["id", "user_id", "query_text", "location", "source", "result_count", "sources_json", "created_at"],
        "editable": ["query_text", "location", "source"],
        "order": "created_at DESC, id DESC",
    },
    "business_search_results": {
        "label": "Business Search Results",
        "fields": ["id", "search_id", "result_name", "source", "source_label", "url", "phone", "email", "address", "website", "business_type", "created_at"],
        "editable": ["result_name", "source", "source_label", "url", "phone", "email", "address", "website", "business_type"],
        "order": "created_at DESC, id DESC",
    },
    "website_scrapes": {
        "label": "Website Scrapes",
        "fields": ["id", "url", "domain", "pages_scraped", "emails_count", "phones_count", "created_at"],
        "editable": ["url", "domain"],
        "order": "created_at DESC, id DESC",
    },
    "lead_ai_messages": {
        "label": "Lead AI",
        "fields": ["id", "role", "question", "answer", "model", "created_at"],
        "editable": ["question", "answer", "model"],
        "order": "created_at DESC, id DESC",
    },
    "csv_exports": {
        "label": "CSV Exports",
        "fields": ["id", "user_id", "export_name", "row_count", "source", "created_at"],
        "editable": ["export_name", "source"],
        "order": "created_at DESC, id DESC",
    },
    "csv_export_rows": {
        "label": "CSV Export Rows",
        "fields": ["id", "export_id", "lead_json", "created_at"],
        "editable": ["lead_json"],
        "order": "created_at DESC, id DESC",
    },
}


def admin_overview() -> dict[str, Any]:
    overview: dict[str, Any] = {"tables": []}
    with db_connection() as connection:
        with connection.cursor() as cursor:
            for table_name, config in ADMIN_TABLES.items():
                cursor.execute(f"SELECT COUNT(*) AS count FROM `{table_name}`")
                count_row = cursor.fetchone() or {}
                cursor.execute(f"SELECT MAX(created_at) AS latest FROM `{table_name}`")
                latest_row = cursor.fetchone() or {}
                latest = latest_row.get("latest")
                overview["tables"].append(
                    {
                        "name": table_name,
                        "label": config["label"],
                        "count": count_row.get("count", 0),
                        "latest": latest.isoformat() if latest else None,
                        "editable": config["editable"],
                    }
                )
    return overview


def admin_table_records(table_name: str, limit: int = 100) -> dict[str, Any]:
    if table_name not in ADMIN_TABLES:
        raise ValueError("Unknown admin table.")
    config = ADMIN_TABLES[table_name]
    fields = ", ".join(f"`{field}`" for field in config["fields"])
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT {fields} FROM `{table_name}` ORDER BY {config['order']} LIMIT %s",
                (limit,),
            )
            rows = cursor.fetchall()

    for row in rows:
        for key, value in list(row.items()):
            if hasattr(value, "isoformat"):
                row[key] = value.isoformat()
            elif isinstance(value, (dict, list)):
                row[key] = json.dumps(value, ensure_ascii=False)
    return {
        "table": table_name,
        "label": config["label"],
        "fields": config["fields"],
        "editable": config["editable"],
        "records": rows,
    }


def update_admin_record(table_name: str, record_id: int, values: dict[str, Any]) -> dict[str, Any]:
    if table_name not in ADMIN_TABLES:
        raise ValueError("Unknown admin table.")
    config = ADMIN_TABLES[table_name]
    clean_values = {
        key: value
        for key, value in values.items()
        if key in config["editable"]
    }
    if not clean_values:
        raise ValueError("No editable fields were provided.")

    assignments = ", ".join(f"`{key}` = %s" for key in clean_values)
    params = [json.dumps(value) if isinstance(value, (dict, list)) else value for value in clean_values.values()]
    params.append(record_id)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE `{table_name}` SET {assignments} WHERE id = %s",
                tuple(params),
            )
    return admin_table_records(table_name, limit=100)


def save_csv_export(
    leads: list[dict[str, Any]],
    export_name: str,
    user_id: int | None = None,
    source: str = "lead_search",
) -> int | None:
    try:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO csv_exports (user_id, export_name, row_count, source)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, export_name, len(leads), source),
                )
                export_id = cursor.lastrowid
                for lead in leads:
                    cursor.execute(
                        """
                        INSERT INTO csv_export_rows (export_id, lead_json)
                        VALUES (%s, CAST(%s AS JSON))
                        """,
                        (export_id, json.dumps(lead)),
                    )
                return export_id
    except Exception:
        return None


def list_csv_exports(user_id: int | None = None, source: str | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT csv_exports.id, csv_exports.export_name, csv_exports.row_count,
               csv_exports.source, csv_exports.created_at, users.name AS user_name,
               users.email AS user_email
        FROM csv_exports
        LEFT JOIN users ON users.id = csv_exports.user_id
    """
    conditions: list[str] = []
    params_list: list[Any] = []
    if user_id:
        conditions.append("csv_exports.user_id = %s")
        params_list.append(user_id)
    if source:
        conditions.append("csv_exports.source = %s")
        params_list.append(source)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY csv_exports.created_at DESC, csv_exports.id DESC LIMIT 100"

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, tuple(params_list))
            rows = cursor.fetchall()

    for row in rows:
        created_at = row.get("created_at")
        if created_at:
            row["created_at"] = created_at.isoformat()
    return rows


def get_csv_export(export_id: int, user_id: int | None = None) -> dict[str, Any] | None:
    query = """
        SELECT csv_exports.id, csv_exports.export_name, csv_exports.row_count,
               csv_exports.source, csv_exports.created_at, users.name AS user_name,
               users.email AS user_email
        FROM csv_exports
        LEFT JOIN users ON users.id = csv_exports.user_id
        WHERE csv_exports.id = %s
    """
    params: list[Any] = [export_id]
    if user_id:
        query += " AND csv_exports.user_id = %s"
        params.append(user_id)

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, tuple(params))
            export = cursor.fetchone()
            if not export:
                return None
            cursor.execute(
                "SELECT lead_json FROM csv_export_rows WHERE export_id = %s ORDER BY id",
                (export_id,),
            )
            rows = cursor.fetchall()

    created_at = export.get("created_at")
    if created_at:
        export["created_at"] = created_at.isoformat()
    export["leads"] = [
        json.loads(row["lead_json"]) if isinstance(row["lead_json"], str) else row["lead_json"]
        for row in rows
    ]
    return export


def list_lead_search_history() -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, query_text, company_name, business_type, city_area, pincode,
                       radius_km, pages_fetched, result_count, center_json, created_at
                FROM lead_searches
                ORDER BY created_at DESC, id DESC
                """
            )
            rows = cursor.fetchall()

    for row in rows:
        created_at = row.get("created_at")
        if created_at:
            row["created_at"] = created_at.isoformat()
        if isinstance(row.get("center_json"), str):
            row["center"] = json.loads(row.pop("center_json"))
        else:
            row["center"] = row.pop("center_json", None)
    return rows


def get_lead_search_history(search_id: int) -> dict[str, Any] | None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, query_text, company_name, business_type, city_area, pincode,
                       radius_km, pages_fetched, result_count, center_json, created_at
                FROM lead_searches
                WHERE id = %s
                """,
                (search_id,),
            )
            search = cursor.fetchone()
            if not search:
                return None
            cursor.execute(
                """
                SELECT raw_json
                FROM lead_results
                WHERE search_id = %s
                ORDER BY distance_km IS NULL, distance_km ASC, id ASC
                """,
                (search_id,),
            )
            rows = cursor.fetchall()

    created_at = search.get("created_at")
    if created_at:
        search["created_at"] = created_at.isoformat()
    if isinstance(search.get("center_json"), str):
        search["center"] = json.loads(search.pop("center_json"))
    else:
        search["center"] = search.pop("center_json", None)
    search["leads"] = [
        json.loads(row["raw_json"]) if isinstance(row["raw_json"], str) else row["raw_json"]
        for row in rows
    ]
    return search


def list_business_search_history(user_id: int | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT business_searches.id, business_searches.user_id, business_searches.query_text,
               business_searches.location, business_searches.source, business_searches.result_count,
               business_searches.sources_json, business_searches.created_at,
               users.name AS user_name, users.email AS user_email
        FROM business_searches
        LEFT JOIN users ON users.id = business_searches.user_id
    """
    params: tuple[Any, ...] = ()
    if user_id:
        query += " WHERE business_searches.user_id = %s"
        params = (user_id,)
    query += " ORDER BY business_searches.created_at DESC, business_searches.id DESC"

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()

    for row in rows:
        created_at = row.get("created_at")
        if created_at:
            row["created_at"] = created_at.isoformat()
        if isinstance(row.get("sources_json"), str):
            row["sources"] = json.loads(row.pop("sources_json"))
        else:
            row["sources"] = row.pop("sources_json", None)
    return rows


def get_business_search_history(search_id: int, user_id: int | None = None) -> dict[str, Any] | None:
    query = """
        SELECT business_searches.id, business_searches.user_id, business_searches.query_text,
               business_searches.location, business_searches.source, business_searches.result_count,
               business_searches.sources_json, business_searches.created_at,
               users.name AS user_name, users.email AS user_email
        FROM business_searches
        LEFT JOIN users ON users.id = business_searches.user_id
        WHERE business_searches.id = %s
    """
    params: list[Any] = [search_id]
    if user_id:
        query += " AND business_searches.user_id = %s"
        params.append(user_id)

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, tuple(params))
            search = cursor.fetchone()
            if not search:
                return None
            cursor.execute(
                """
                SELECT raw_json
                FROM business_search_results
                WHERE search_id = %s
                ORDER BY id ASC
                """,
                (search_id,),
            )
            rows = cursor.fetchall()

    created_at = search.get("created_at")
    if created_at:
        search["created_at"] = created_at.isoformat()
    if isinstance(search.get("sources_json"), str):
        search["sources"] = json.loads(search.pop("sources_json"))
    else:
        search["sources"] = search.pop("sources_json", None)
    search["results"] = [
        json.loads(row["raw_json"]) if isinstance(row["raw_json"], str) else row["raw_json"]
        for row in rows
    ]
    return search
