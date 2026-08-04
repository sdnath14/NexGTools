from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator
from urllib.parse import urlparse
import hashlib
import json
import re
import uuid

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
                CREATE TABLE IF NOT EXISTS outreach_contacts (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    lead_place_id VARCHAR(255),
                    company_name VARCHAR(500) NOT NULL,
                    search_name VARCHAR(500),
                    category VARCHAR(120),
                    contact_key VARCHAR(64),
                    website TEXT,
                    email VARCHAR(255),
                    phone VARCHAR(160),
                    scrape_id BIGINT UNSIGNED,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_outreach_contact (user_id, lead_place_id, email, phone),
                    UNIQUE KEY uq_outreach_contact_key (user_id, contact_key),
                    INDEX idx_outreach_user (user_id),
                    CONSTRAINT fk_outreach_contact_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    CONSTRAINT fk_outreach_contact_scrape FOREIGN KEY (scrape_id) REFERENCES website_scrapes(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                SELECT COLUMN_NAME AS column_name FROM information_schema.columns
                WHERE table_schema = %s AND table_name = 'outreach_contacts'
                """,
                (settings.mysql_database,),
            )
            outreach_columns = {row["column_name"] for row in cursor.fetchall()}
            if "category" not in outreach_columns:
                cursor.execute("ALTER TABLE outreach_contacts ADD COLUMN category VARCHAR(120) AFTER search_name")
            if "contact_key" not in outreach_columns:
                cursor.execute("ALTER TABLE outreach_contacts ADD COLUMN contact_key VARCHAR(64) AFTER category")
                cursor.execute("ALTER TABLE outreach_contacts ADD UNIQUE KEY uq_outreach_contact_key (user_id, contact_key)")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS outreach_messages (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    contact_id BIGINT UNSIGNED NOT NULL,
                    channel VARCHAR(32) NOT NULL,
                    recipient VARCHAR(255) NOT NULL,
                    subject VARCHAR(500),
                    message TEXT NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    provider_response TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_outreach_messages_user (user_id),
                    CONSTRAINT fk_outreach_message_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    CONSTRAINT fk_outreach_message_contact FOREIGN KEY (contact_id) REFERENCES outreach_contacts(id) ON DELETE CASCADE
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
                CREATE TABLE IF NOT EXISTS knowledge_documents (
                    id CHAR(32) NOT NULL PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    filename VARCHAR(500) NOT NULL,
                    content_type VARCHAR(255),
                    file_size BIGINT UNSIGNED NOT NULL,
                    file_hash CHAR(64) NOT NULL,
                    file_data LONGBLOB NULL,
                    file_type VARCHAR(20),
                    records_created INT UNSIGNED NOT NULL DEFAULT 0,
                    vectors_created INT UNSIGNED NOT NULL DEFAULT 0,
                    chunk_count INT UNSIGNED NOT NULL DEFAULT 0,
                    status VARCHAR(32) NOT NULL DEFAULT 'processing',
                    error_message TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_knowledge_user_hash (user_id, file_hash),
                    INDEX idx_knowledge_user_created (user_id, created_at),
                    CONSTRAINT fk_knowledge_document_user
                        FOREIGN KEY (user_id) REFERENCES users(id)
                        ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                "SELECT COLUMN_NAME AS column_name, IS_NULLABLE AS is_nullable FROM information_schema.columns WHERE table_schema = %s AND table_name = 'knowledge_documents'",
                (settings.mysql_database,),
            )
            document_columns = {row["column_name"]: row for row in cursor.fetchall()}
            if document_columns.get("file_data", {}).get("is_nullable") == "NO":
                cursor.execute("ALTER TABLE knowledge_documents MODIFY file_data LONGBLOB NULL")
            for column, definition in {
                "file_type": "VARCHAR(20)",
                "records_created": "INT UNSIGNED NOT NULL DEFAULT 0",
                "vectors_created": "INT UNSIGNED NOT NULL DEFAULT 0",
            }.items():
                if column not in document_columns:
                    cursor.execute(f"ALTER TABLE knowledge_documents ADD COLUMN `{column}` {definition}")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS knowledge_records (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    document_id CHAR(32) NOT NULL,
                    user_id BIGINT UNSIGNED NOT NULL,
                    record_number INT UNSIGNED NOT NULL,
                    record_text MEDIUMTEXT NOT NULL,
                    metadata_json JSON NOT NULL,
                    record_id VARCHAR(150),
                    structured_data JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_knowledge_document_record (document_id, record_number),
                    INDEX idx_knowledge_records_user (user_id),
                    INDEX idx_knowledge_records_document (document_id),
                    CONSTRAINT fk_knowledge_record_document
                        FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
                        ON DELETE CASCADE,
                    CONSTRAINT fk_knowledge_record_user
                        FOREIGN KEY (user_id) REFERENCES users(id)
                        ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                "SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = %s AND table_name = 'knowledge_records'",
                (settings.mysql_database,),
            )
            record_columns = {row["column_name"] for row in cursor.fetchall()}
            if "record_id" not in record_columns:
                cursor.execute("ALTER TABLE knowledge_records ADD COLUMN record_id VARCHAR(150)")
                cursor.execute("ALTER TABLE knowledge_records ADD UNIQUE KEY uq_knowledge_record_id (record_id)")
            if "structured_data" not in record_columns:
                cursor.execute("ALTER TABLE knowledge_records ADD COLUMN structured_data JSON")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS knowledge_conversations (
                    id VARCHAR(80) NOT NULL PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_knowledge_conversations_user_updated (user_id, updated_at),
                    CONSTRAINT fk_knowledge_conversation_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS knowledge_chat_messages (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    conversation_id VARCHAR(80) NOT NULL DEFAULT 'shared',
                    role VARCHAR(16) NOT NULL,
                    content MEDIUMTEXT NOT NULL,
                    sources_json JSON,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_knowledge_chat_user_conversation (user_id, conversation_id, id),
                    CONSTRAINT fk_knowledge_chat_user
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """SELECT user_id FROM knowledge_conversations
                   WHERE id = 'shared' AND title = 'Shared conversation'"""
            )
            for conversation in cursor.fetchall():
                cursor.execute(
                    """SELECT content FROM knowledge_chat_messages
                       WHERE user_id = %s AND conversation_id = 'shared' AND role = 'user'
                       ORDER BY id ASC LIMIT 1""",
                    (conversation["user_id"],),
                )
                first_question = cursor.fetchone()
                cursor.execute(
                    "UPDATE knowledge_conversations SET title = %s WHERE id = 'shared' AND user_id = %s",
                    ((first_question or {}).get("content", "Conversation history")[:255], conversation["user_id"]),
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


def save_outreach_contacts(
    user_id: int,
    lead: dict[str, Any],
    scrape: dict[str, Any],
    search_name: str = "",
) -> int:
    emails = [str(value).strip().lower() for value in scrape.get("emails") or [] if str(value).strip()]
    phones = [str(value).strip() for value in scrape.get("phones") or [] if str(value).strip()]
    email = emails[0] if emails else str(lead.get("email") or "").strip().lower()
    phone = str(lead.get("phone") or (phones[0] if phones else "")).strip()
    if not email and not phone:
        return 0
    company_name = str(lead.get("name") or "Unknown company").strip()
    website = str(lead.get("website") or scrape.get("start_url") or "").strip()
    place_id = str(lead.get("id") or "").strip()
    normalized_phone = re.sub(r"\D", "", phone)
    parsed_website = urlparse(website if "://" in website else f"https://{website}")
    normalized_website = parsed_website.netloc.lower().removeprefix("www.")
    identity = place_id or email or normalized_phone or normalized_website or company_name.lower()
    contact_key = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    category_source = " ".join(
        str(value or "") for value in (lead.get("business_type"), search_name)
    ).lower()
    category = next(
        (name for name, terms in {
            "restaurants": ("restaurant", "food", "cafe"),
            "garage": ("garage", "car repair", "auto repair", "automotive"),
            "hotels": ("hotel", "lodging", "resort"),
            "manufacturing": ("manufactur", "factory", "industrial"),
        }.items() if any(term in category_source for term in terms)),
        "general",
    )
    with db_connection() as connection:
        with connection.cursor() as cursor:
            match_conditions = ["contact_key = %s"]
            match_values: list[Any] = [contact_key]
            for column, value in (("lead_place_id", place_id), ("email", email), ("phone", phone), ("website", website)):
                if value:
                    match_conditions.append(f"{column} = %s")
                    match_values.append(value)
            match_conditions.append("LOWER(company_name) = %s")
            match_values.append(company_name.lower())
            cursor.execute(
                f"""SELECT id, email, phone, contact_key FROM outreach_contacts
                    WHERE user_id = %s AND ({' OR '.join(match_conditions)})
                    ORDER BY updated_at DESC, id DESC LIMIT 1""",
                (user_id, *match_values),
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    """UPDATE outreach_contacts
                       SET company_name = %s, search_name = %s, category = %s, contact_key = %s, website = %s,
                           email = %s, phone = %s, scrape_id = %s,
                           updated_at = CURRENT_TIMESTAMP
                       WHERE id = %s""",
                    (
                        company_name,
                        search_name,
                        category,
                        existing.get("contact_key") or contact_key,
                        website,
                        email or existing.get("email") or "",
                        phone or existing.get("phone") or "",
                        scrape.get("database_scrape_id"),
                        existing["id"],
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO outreach_contacts (
                        user_id, lead_place_id, company_name, search_name, category, contact_key,
                        website, email, phone, scrape_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        company_name = VALUES(company_name), search_name = VALUES(search_name),
                        category = VALUES(category), website = VALUES(website),
                        email = COALESCE(NULLIF(VALUES(email), ''), email),
                        phone = COALESCE(NULLIF(VALUES(phone), ''), phone),
                        scrape_id = VALUES(scrape_id), updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        user_id,
                        place_id or None,
                        company_name,
                        search_name,
                        category,
                        contact_key,
                        website,
                        email,
                        phone,
                        scrape.get("database_scrape_id"),
                    ),
                )
    return 1


def list_outreach_contacts(user_id: int) -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, company_name, search_name, category, website, email, phone, created_at, updated_at
                FROM outreach_contacts WHERE user_id = %s
                ORDER BY updated_at DESC, id DESC
                """,
                (user_id,),
            )
            rows = cursor.fetchall()
    # Older scrapes stored email and phone as separate rows. Merge those rows in
    # the response so each company is shown once without destroying message history.
    merged: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.get("website") or row.get("company_name") or row["id"]).strip().lower()
        if key not in merged:
            merged[key] = row
        else:
            merged[key]["email"] = merged[key].get("email") or row.get("email") or ""
            merged[key]["phone"] = merged[key].get("phone") or row.get("phone") or ""
    rows = list(merged.values())
    for row in rows:
        for key in ("created_at", "updated_at"):
            if row.get(key): row[key] = row[key].isoformat()
    return rows


def save_outreach_message(user_id: int, contact_id: int, channel: str, recipient: str, subject: str, message: str, status: str, provider_response: str = "") -> int:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO outreach_messages (user_id, contact_id, channel, recipient, subject, message, status, provider_response)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (user_id, contact_id, channel, recipient, subject, message, status, provider_response[:4000]),
            )
            return cursor.lastrowid


def list_outreach_messages(user_id: int) -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT outreach_messages.id, outreach_messages.channel, outreach_messages.recipient,
                       outreach_messages.subject, outreach_messages.message, outreach_messages.status,
                       outreach_messages.created_at, outreach_contacts.company_name
                FROM outreach_messages
                JOIN outreach_contacts ON outreach_contacts.id = outreach_messages.contact_id
                WHERE outreach_messages.user_id = %s
                ORDER BY outreach_messages.created_at DESC, outreach_messages.id DESC LIMIT 250
                """,
                (user_id,),
            )
            rows = cursor.fetchall()
    for row in rows:
        if row.get("created_at"): row["created_at"] = row["created_at"].isoformat()
    return rows


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


def get_knowledge_document_by_hash(user_id: int, file_hash: str) -> dict[str, Any] | None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id, filename, file_size, file_hash, chunk_count, status, created_at
                   FROM knowledge_documents WHERE user_id = %s AND file_hash = %s""",
                (user_id, file_hash),
            )
            return cursor.fetchone()


def create_knowledge_document(
    document_id: str,
    user_id: int,
    filename: str,
    content_type: str,
    file_hash: str,
    file_size: int,
    file_type: str,
) -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO knowledge_documents
                   (id, user_id, filename, content_type, file_size, file_hash, file_type, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 'processing')""",
                (document_id, user_id, filename, content_type, file_size, file_hash, file_type),
            )


def complete_knowledge_document(document_id: str, user_id: int, record_count: int, vector_count: int) -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """UPDATE knowledge_documents SET status = 'completed', chunk_count = %s,
                   records_created = %s, vectors_created = %s, error_message = NULL
                   WHERE id = %s AND user_id = %s""",
                (vector_count, record_count, vector_count, document_id, user_id),
            )


def replace_knowledge_records(document_id: str, user_id: int, records: list[dict[str, Any]]) -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM knowledge_records WHERE document_id = %s AND user_id = %s", (document_id, user_id))
            if records:
                cursor.executemany(
                    """INSERT INTO knowledge_records
                       (document_id, user_id, record_number, record_text, metadata_json, record_id, structured_data)
                       VALUES (%s, %s, %s, %s, CAST(%s AS JSON), %s, CAST(%s AS JSON))""",
                    [
                        (document_id, user_id, index, record["content"], json.dumps(record.get("metadata") or {}),
                         record["record_id"], json.dumps(record.get("structured_data") or {}))
                        for index, record in enumerate(records, start=1)
                    ],
                )


def count_knowledge_records(document_id: str, user_id: int) -> int:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) AS record_count FROM knowledge_records WHERE document_id = %s AND user_id = %s",
                (document_id, user_id),
            )
            return int((cursor.fetchone() or {}).get("record_count") or 0)


def list_knowledge_records(
    user_id: int,
    document_ids: list[str] | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    conditions = ["r.user_id = %s"]
    values: list[Any] = [user_id]
    if document_ids:
        placeholders = ", ".join(["%s"] * len(document_ids))
        conditions.append(f"r.document_id IN ({placeholders})")
        values.extend(document_ids)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            if limit is not None:
                cursor.execute(
                    f"""WITH ranked_records AS (
                            SELECT r.id, r.record_id, r.document_id, d.filename,
                                   d.created_at AS document_created_at,
                                   r.record_number, r.record_text,
                                   r.metadata_json AS metadata, r.structured_data,
                                   ROW_NUMBER() OVER (
                                       PARTITION BY r.document_id,
                                           COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.metadata_json, '$.sheet_name')), '')
                                       ORDER BY r.record_number
                                   ) AS sheet_row_number
                            FROM knowledge_records r
                            JOIN knowledge_documents d ON d.id = r.document_id
                            WHERE {' AND '.join(conditions)}
                        )
                        SELECT id, record_id, document_id, filename, record_number,
                               record_text, metadata, structured_data, sheet_row_number
                        FROM ranked_records
                        WHERE sheet_row_number <= %s
                        ORDER BY document_created_at DESC, document_id,
                                 JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.sheet_name')),
                                 record_number""",
                    (*values, limit),
                )
            else:
                cursor.execute(
                    f"""SELECT r.id, r.record_id, r.document_id, d.filename, r.record_number, r.record_text,
                           r.metadata_json AS metadata, r.structured_data
                    FROM knowledge_records r
                    JOIN knowledge_documents d ON d.id = r.document_id
                    WHERE {' AND '.join(conditions)}
                    ORDER BY d.created_at DESC, r.record_number ASC""",
                    values,
                )
            rows = list(cursor.fetchall())
    for row in rows:
        if isinstance(row.get("metadata"), str):
            row["metadata"] = json.loads(row["metadata"])
        if isinstance(row.get("structured_data"), str):
            row["structured_data"] = json.loads(row["structured_data"])
        row.pop("sheet_row_number", None)
        stored_data = row.pop("structured_data", None) or {}
        # New records retain both the lossless extraction and cleaned JSON.
        # The records table is a source preview, so it must show the original
        # headers and cell values exactly. Cleaned fields remain available to
        # the knowledge-answering pipeline but must not alter this view.
        if isinstance(stored_data, dict) and (
            "cleaned_fields" in stored_data or "source_fields" in stored_data
        ):
            cleaned_fields = stored_data.get("cleaned_fields")
            source_fields = stored_data.get("source_fields")
            fields = source_fields if isinstance(source_fields, dict) and source_fields else cleaned_fields
            fields = fields if isinstance(fields, dict) else {}
        else:
            # Compatibility for records indexed before the flexible JSON format.
            fields = stored_data if isinstance(stored_data, dict) else {}
        text = str(row.pop("record_text", ""))
        if not fields:
            fields = {"Content": text}
        row["fields"] = fields
    return rows


def get_knowledge_records_by_ids(user_id: int, record_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch normalized JSON only inside the authenticated tenant boundary."""
    if not record_ids:
        return {}
    placeholders = ", ".join(["%s"] * len(record_ids))
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""SELECT record_id, record_text AS content, structured_data,
                           metadata_json AS metadata
                    FROM knowledge_records
                    WHERE user_id = %s AND record_id IN ({placeholders})""",
                (user_id, *record_ids),
            )
            rows = cursor.fetchall()
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        for key in ("structured_data", "metadata"):
            if isinstance(row.get(key), str):
                row[key] = json.loads(row[key])
        result[row["record_id"]] = row
    return result


def list_knowledge_structured_records(user_id: int, document_ids: list[str] | None = None) -> list[dict[str, Any]]:
    """Return canonical JSON records for exact, tenant-scoped knowledge queries."""
    conditions = ["r.user_id = %s"]
    values: list[Any] = [user_id]
    if document_ids:
        placeholders = ", ".join(["%s"] * len(document_ids))
        conditions.append(f"r.document_id IN ({placeholders})")
        values.extend(document_ids)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""SELECT r.record_id, r.document_id, r.structured_data, r.metadata_json AS metadata
                    FROM knowledge_records r
                    WHERE {' AND '.join(conditions)}
                    ORDER BY r.id""",
                values,
            )
            rows = cursor.fetchall()
    for row in rows:
        for key in ("structured_data", "metadata"):
            if isinstance(row.get(key), str):
                row[key] = json.loads(row[key])
    return rows


def search_knowledge_structured_records(
    user_id: int,
    terms: list[str],
    document_ids: list[str] | None = None,
    limit: int = 5000,
) -> list[dict[str, Any]]:
    """Use MySQL to narrow exact-value candidates without transferring every row."""
    conditions = ["r.user_id = %s"]
    values: list[Any] = [user_id]
    if document_ids:
        placeholders = ", ".join(["%s"] * len(document_ids))
        conditions.append(f"r.document_id IN ({placeholders})")
        values.extend(document_ids)
    for term in terms:
        conditions.append("LOWER(CAST(r.structured_data AS CHAR)) LIKE %s")
        values.append(f"%{term.lower()}%")
    values.append(limit)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""SELECT r.record_id, r.document_id, r.structured_data,
                           r.metadata_json AS metadata
                    FROM knowledge_records r
                    WHERE {' AND '.join(conditions)}
                    ORDER BY r.id LIMIT %s""",
                values,
            )
            rows = list(cursor.fetchall())
    for row in rows:
        for key in ("structured_data", "metadata"):
            if isinstance(row.get(key), str):
                row[key] = json.loads(row[key])
    return rows


def count_knowledge_records_for_user(user_id: int, document_ids: list[str] | None = None) -> int:
    conditions = ["user_id = %s"]
    values: list[Any] = [user_id]
    if document_ids:
        placeholders = ", ".join(["%s"] * len(document_ids))
        conditions.append(f"document_id IN ({placeholders})")
        values.extend(document_ids)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT COUNT(*) AS total FROM knowledge_records WHERE {' AND '.join(conditions)}",
                values,
            )
            return int((cursor.fetchone() or {}).get("total") or 0)


def save_knowledge_chat_message(
    user_id: int, conversation_id: str, role: str, content: str, sources: list[dict[str, Any]] | None = None
) -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT IGNORE INTO knowledge_conversations (id, user_id, title)
                   VALUES (%s, %s, %s)""",
                (conversation_id, user_id, "Shared conversation" if conversation_id == "shared" else "New conversation"),
            )
            cursor.execute(
                """INSERT INTO knowledge_chat_messages (user_id, conversation_id, role, content, sources_json)
                   VALUES (%s, %s, %s, %s, CAST(%s AS JSON))""",
                (user_id, conversation_id, role, content, json.dumps(sources or [])),
            )
            if role == "user":
                cursor.execute(
                    """UPDATE knowledge_conversations
                       SET title = CASE WHEN title = 'New conversation' THEN %s ELSE title END,
                           updated_at = CURRENT_TIMESTAMP
                       WHERE id = %s AND user_id = %s""",
                    (content.strip()[:255] or "New conversation", conversation_id, user_id),
                )
            else:
                cursor.execute(
                    "UPDATE knowledge_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = %s AND user_id = %s",
                    (conversation_id, user_id),
                )


def list_knowledge_chat_messages(user_id: int, conversation_id: str, limit: int = 100) -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id, role, content, sources_json AS sources, created_at
                   FROM knowledge_chat_messages
                   WHERE user_id = %s AND conversation_id = %s
                   ORDER BY id DESC LIMIT %s""",
                (user_id, conversation_id, limit),
            )
            rows = list(cursor.fetchall())
    rows.reverse()
    for row in rows:
        if isinstance(row.get("sources"), str):
            row["sources"] = json.loads(row["sources"])
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()
    return rows


def search_knowledge_chat_messages(user_id: int, conversation_id: str, query: str, limit: int = 20) -> list[dict[str, Any]]:
    term = query.strip()
    if not term:
        return []
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id, role, content, created_at
                   FROM knowledge_chat_messages
                   WHERE user_id = %s AND conversation_id = %s AND content LIKE %s
                   ORDER BY id DESC LIMIT %s""",
                (user_id, conversation_id, f"%{term}%", limit),
            )
            rows = list(cursor.fetchall())
    for row in rows:
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()
    return rows


def delete_knowledge_chat_messages(user_id: int, conversation_id: str) -> int:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM knowledge_chat_messages WHERE user_id = %s AND conversation_id = %s",
                (user_id, conversation_id),
            )
            return cursor.rowcount


def list_knowledge_conversations(user_id: int) -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) AS message_count
                   FROM knowledge_conversations c
                   LEFT JOIN knowledge_chat_messages m ON m.user_id = c.user_id AND m.conversation_id = c.id
                   WHERE c.user_id = %s
                   GROUP BY c.id, c.title, c.created_at, c.updated_at
                   ORDER BY c.updated_at DESC, c.id DESC""",
                (user_id,),
            )
            rows = list(cursor.fetchall())
    for row in rows:
        for key in ("created_at", "updated_at"):
            if row.get(key):
                row[key] = row[key].isoformat()
    return rows


def create_knowledge_conversation(user_id: int) -> dict[str, Any]:
    conversation_id = uuid.uuid4().hex
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO knowledge_conversations (id, user_id, title) VALUES (%s, %s, 'New conversation')",
                (conversation_id, user_id),
            )
            cursor.execute(
                "SELECT id, title, created_at, updated_at, 0 AS message_count FROM knowledge_conversations WHERE id = %s AND user_id = %s",
                (conversation_id, user_id),
            )
            row = cursor.fetchone() or {}
    for key in ("created_at", "updated_at"):
        if row.get(key):
            row[key] = row[key].isoformat()
    return row


def delete_knowledge_conversation(user_id: int, conversation_id: str) -> bool:
    if conversation_id == "shared":
        return False
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM knowledge_conversations WHERE id = %s AND user_id = %s",
                (conversation_id, user_id),
            )
            if not cursor.rowcount:
                return False
            cursor.execute(
                "DELETE FROM knowledge_chat_messages WHERE user_id = %s AND conversation_id = %s",
                (user_id, conversation_id),
            )
    return True


def get_knowledge_documents_with_data(user_id: int) -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id, filename, content_type, file_data
                   FROM knowledge_documents WHERE user_id = %s AND status IN ('ready', 'completed')""",
                (user_id,),
            )
            return list(cursor.fetchall())


def fail_knowledge_document(document_id: str, user_id: int, error: str) -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """UPDATE knowledge_documents SET status = 'failed', error_message = %s
                   WHERE id = %s AND user_id = %s""",
                (error[:2000], document_id, user_id),
            )


def list_knowledge_documents(user_id: int) -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id, filename, content_type, file_size, file_hash, chunk_count AS chunks,
                          status, error_message, created_at AS uploaded_at
                   FROM knowledge_documents WHERE user_id = %s
                   ORDER BY created_at DESC""",
                (user_id,),
            )
            return list(cursor.fetchall())


def delete_knowledge_document_record(document_id: str, user_id: int) -> bool:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM knowledge_documents WHERE id = %s AND user_id = %s",
                (document_id, user_id),
            )
            return cursor.rowcount > 0


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
    "outreach_contacts": {
        "label": "Outreach Contacts",
        "fields": ["id", "user_id", "lead_place_id", "company_name", "search_name", "category", "website", "email", "phone", "created_at", "updated_at"],
        "editable": ["lead_place_id", "company_name", "search_name", "category", "website", "email", "phone"],
        "order": "updated_at DESC, id DESC",
    },
    "outreach_messages": {
        "label": "Outreach Messages",
        "fields": ["id", "user_id", "contact_id", "channel", "recipient", "subject", "message", "status", "provider_response", "created_at"],
        "editable": ["channel", "recipient", "subject", "message", "status", "provider_response"],
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


def delete_admin_record(table_name: str, record_id: int) -> dict[str, Any]:
    if table_name not in ADMIN_TABLES:
        raise ValueError("Unknown admin table.")
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM `{table_name}` WHERE id = %s", (record_id,))
            if cursor.rowcount != 1:
                raise ValueError("Record not found.")
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
