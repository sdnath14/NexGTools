"""Structured document ingestion and direct keyword retrieval."""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from pathlib import Path
from typing import Any, Iterator

import pandas as pd
from docx import Document
from pypdf import PdfReader

from .database import db_connection

SUPPORTED_EXTENSIONS = {".csv", ".xls", ".xlsx", ".pdf", ".docx", ".txt", ".md"}


def validate_upload(filename: str) -> tuple[str, str]:
    safe_name = Path(filename).name.strip() or "document"
    extension = Path(safe_name).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError("Supported files: CSV, XLS, XLSX, PDF, DOCX, TXT and Markdown.")
    return safe_name, extension


def _value(value: Any) -> Any:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value).strip() if isinstance(value, str) else value


def _clean_headers(columns: list[Any]) -> list[str]:
    seen: dict[str, int] = {}
    result = []
    for index, column in enumerate(columns, 1):
        base = re.sub(r"\s+", " ", str(column).strip()) or f"column_{index}"
        seen[base] = seen.get(base, 0) + 1
        result.append(base if seen[base] == 1 else f"{base}_{seen[base]}")
    return result


def _tabular_records(path: Path, extension: str) -> Iterator[tuple[str, int, list[str], list[dict[str, Any]]]]:
    sheets = pd.read_excel(path, sheet_name=None, dtype=object) if extension in {".xls", ".xlsx"} else {"CSV": pd.read_csv(path, dtype=object)}
    for position, (name, frame) in enumerate(sheets.items()):
        frame = frame.dropna(how="all").dropna(axis=1, how="all")
        headers = _clean_headers(list(frame.columns))
        records = []
        for _, row in frame.iterrows():
            record = {headers[i]: _value(value) for i, value in enumerate(row.tolist())}
            if any(value not in (None, "") for value in record.values()): records.append(record)
        yield str(name), position, headers, records


def _text_records(path: Path, extension: str) -> Iterator[tuple[str, int, list[str], list[dict[str, Any]]]]:
    if extension == ".pdf":
        pages = [page.extract_text() or "" for page in PdfReader(str(path)).pages]
        records = [{"page": index + 1, "content": text.strip()} for index, text in enumerate(pages) if text.strip()]
    elif extension == ".docx":
        document = Document(str(path)); records = [{"paragraph": i + 1, "content": p.text.strip()} for i, p in enumerate(document.paragraphs) if p.text.strip()]
    else:
        records = [{"line": i + 1, "content": line.strip()} for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines()) if line.strip()]
    yield "Content", 0, list(records[0].keys()) if records else ["content"], records


def ingest(file_id: str) -> int:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT storage_path, file_type FROM document_files WHERE id = %s", (file_id,))
            file_row = cursor.fetchone()
            if not file_row: raise ValueError("Document not found.")
            cursor.execute("UPDATE document_files SET status = 'processing', error_message = NULL WHERE id = %s", (file_id,))
    path, extension = Path(file_row["storage_path"]), file_row["file_type"]
    groups = _tabular_records(path, extension) if extension in {".csv", ".xls", ".xlsx"} else _text_records(path, extension)
    total = 0
    with db_connection() as connection:
        with connection.cursor() as cursor:
            for sheet_name, position, headers, records in groups:
                cursor.execute("INSERT INTO document_sheets (file_id, name, position, headers_json, row_count) VALUES (%s,%s,%s,CAST(%s AS JSON),%s)", (file_id, sheet_name, position, json.dumps(headers), len(records)))
                sheet_id = cursor.lastrowid
                record_rows = []
                for number, record in enumerate(records, 1):
                    text = " | ".join(f"{key}: {value}" for key, value in record.items() if value not in (None, ""))
                    record_id = hashlib.sha1(f"{file_id}:{sheet_id}:{number}".encode()).hexdigest()
                    record_rows.append((record_id, file_id, sheet_id, number, json.dumps(record, default=str), text))
                if record_rows:
                    cursor.executemany(
                        "INSERT INTO document_records (id,file_id,sheet_id,record_number,record_json,searchable_text) VALUES (%s,%s,%s,%s,CAST(%s AS JSON),%s)",
                        record_rows,
                    )
                    total += len(record_rows)
            cursor.execute("UPDATE document_files SET status = 'completed' WHERE id = %s", (file_id,))
    return total


def create_file(user_id: int, filename: str, content_type: str, file_path: Path) -> dict[str, str]:
    digest = hashlib.sha256(file_path.read_bytes()).hexdigest(); file_id = uuid.uuid4().hex; job_id = uuid.uuid4().hex
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO document_files (id,user_id,filename,content_type,file_type,file_hash,file_size,storage_path) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", (file_id,user_id,filename,content_type,Path(filename).suffix.lower(),digest,file_path.stat().st_size,str(file_path)))
            cursor.execute("INSERT INTO document_processing_jobs (id,file_id,status,stage) VALUES (%s,%s,'queued','uploaded')", (job_id,file_id))
    return {"file_id": file_id, "job_id": job_id}


def list_files(user_id: int) -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT f.id, f.filename, f.file_type, f.file_size, f.status, f.error_message, f.created_at, COUNT(r.id) AS records FROM document_files f LEFT JOIN document_records r ON r.file_id=f.id WHERE f.user_id=%s GROUP BY f.id ORDER BY f.created_at DESC", (user_id,))
            return list(cursor.fetchall())


def delete_file(user_id: int, file_id: str) -> None:
    """Remove an owned upload, its indexed rows, and its stored original."""
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT storage_path FROM document_files WHERE id=%s AND user_id=%s", (file_id, user_id))
            file_row = cursor.fetchone()
            if not file_row:
                raise ValueError("Document not found.")
            cursor.execute("DELETE FROM document_files WHERE id=%s AND user_id=%s", (file_id, user_id))
    Path(file_row["storage_path"]).unlink(missing_ok=True)


def file_contents(user_id: int, file_id: str) -> list[dict[str, Any]]:
    """Return all workbook rows; the client virtualizes rendering for large sheets."""
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name, position, headers_json, row_count FROM document_sheets WHERE file_id=%s AND EXISTS (SELECT 1 FROM document_files WHERE id=%s AND user_id=%s)", (file_id, file_id, user_id))
            sheets = list(cursor.fetchall())
            if not sheets:
                cursor.execute("SELECT id FROM document_files WHERE id=%s AND user_id=%s", (file_id, user_id))
                if not cursor.fetchone(): raise ValueError("Document not found.")
            for sheet in sheets:
                if isinstance(sheet["headers_json"], str): sheet["headers_json"] = json.loads(sheet["headers_json"])
                cursor.execute("SELECT record_number, record_json FROM document_records WHERE sheet_id=%s ORDER BY record_number", (sheet["id"],))
                sheet["records"] = list(cursor.fetchall())
                for record in sheet["records"]:
                    if isinstance(record["record_json"], str): record["record_json"] = json.loads(record["record_json"])
    return sheets


def file_download(user_id: int, file_id: str) -> tuple[Path, str, str]:
    """Return an authorized original upload for download."""
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT filename, content_type, storage_path FROM document_files WHERE id=%s AND user_id=%s",
                (file_id, user_id),
            )
            file_row = cursor.fetchone()
    if not file_row:
        raise ValueError("Document not found.")
    path = Path(file_row["storage_path"])
    if not path.is_file():
        raise ValueError("The original uploaded file is no longer available.")
    return path, file_row["filename"], file_row["content_type"] or "application/octet-stream"


_SEARCH_STOP_WORDS = {"a", "about", "all", "an", "and", "are", "at", "can", "database", "find", "for", "from", "get", "give", "i", "in", "info", "information", "is", "it", "like", "me", "my", "of", "or", "please", "record", "records", "search", "searching", "show", "that", "the", "this", "to", "want", "where", "with"}
_FIELD_ALIASES = {"zip": "pincode", "zipcode": "pincode", "postal": "pincode", "postcode": "pincode", "pin": "pincode", "company": "name", "business": "name", "organisation": "organization"}


def _search_terms(query: str) -> list[str]:
    terms = re.findall(r"[\w@.+-]+", query.casefold())
    terms = [_FIELD_ALIASES.get(term, term) for term in terms]
    return list(dict.fromkeys(term for term in terms if term not in _SEARCH_STOP_WORDS))


def _source_columns(user_id: int, file_ids: list[str] | None) -> set[str]:
    """Read available source columns before interpreting a natural query."""
    statement = "SELECT s.headers_json FROM document_sheets s JOIN document_files f ON f.id=s.file_id WHERE f.user_id=%s"
    params: list[Any] = [user_id]
    if file_ids:
        statement += f" AND f.id IN ({','.join(['%s'] * len(file_ids))})"
        params.extend(file_ids)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(statement, params)
            rows = list(cursor.fetchall())
    columns: set[str] = set()
    for row in rows:
        headers = row["headers_json"]
        if isinstance(headers, str):
            headers = json.loads(headers)
        for header in headers or []:
            columns.update(re.findall(r"[\w@.+-]+", str(header).casefold()))
    return columns


def _ai_search_terms(question: str, columns: set[str]) -> list[str] | None:
    """Use AI only to translate intent into safe database search terms."""
    if not settings.openai_api_key or not columns:
        return None
    try:
        from openai import OpenAI

        response = OpenAI(api_key=settings.openai_api_key, timeout=1.5).chat.completions.create(
            model=settings.openai_model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Convert the user request into database lookup terms. "
                        "Use only relevant column names from the supplied list and literal values from the question. "
                        "Return JSON only: {\"terms\":[\"term\"]}. Never invent values or SQL."
                    ),
                },
                {"role": "user", "content": f"Columns: {sorted(columns)}\nRequest: {question}"},
            ],
        )
        data = json.loads(response.choices[0].message.content or "{}")
        terms = data.get("terms", [])
        if not isinstance(terms, list):
            return None
        allowed_terms = set(_search_terms(question)) | columns
        safe_terms = [str(term).casefold().strip() for term in terms if str(term).casefold().strip() in allowed_terms]
        return safe_terms[:12] or None
    except Exception:
        return None


def search(user_id: int, query: str, limit: int = 50, offset: int = 0, file_ids: list[str] | None = None) -> tuple[list[dict[str, Any]], int]:
    """Return top workbook rows containing the supplied keywords, without AI."""
    normalized_query = query.casefold().strip()
    terms = _search_terms(query)
    if not terms:
        return [], 0

    # Every keyword must be present in the same source row.
    predicates = " AND ".join(["LOWER(r.searchable_text) LIKE %s"] * len(terms))
    file_filter = ""
    params: list[Any] = [user_id]
    if file_ids:
        file_filter = f" AND f.id IN ({','.join(['%s'] * len(file_ids))})"
        params.extend(file_ids)
    params.extend(f"%{term}%" for term in terms)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT r.id, f.filename, s.name AS sheet_name, r.record_number, r.record_json, r.searchable_text "
                f"FROM document_records r JOIN document_files f ON f.id=r.file_id "
                f"LEFT JOIN document_sheets s ON s.id=r.sheet_id "
                f"WHERE f.user_id=%s{file_filter} AND ({predicates})",
                params,
            )
            rows = list(cursor.fetchall())
    for row in rows:
        if isinstance(row["record_json"], str):
            row["record_json"] = json.loads(row["record_json"])

    def rank(row: dict[str, Any]) -> tuple[int, int, int]:
        text = row["searchable_text"].casefold()
        phrase_score = 1000 if normalized_query in text else 0
        term_score = sum(text.count(term) for term in terms)
        return (phrase_score + term_score, -len(text), -row["record_number"])

    total = len(rows)
    ranked = sorted(rows, key=rank, reverse=True)[offset:offset + limit]
    for row in ranked:
        row.pop("searchable_text", None)
    return ranked, total


def answer(user_id: int, question: str) -> dict[str, Any]:
    records, total = search(user_id, question)
    if not records:
        return {"answer": "No matching rows were found in your uploaded data.", "sources": []}
    return {"answer": f"Found {total} keyword match{'' if total == 1 else 'es'} in your uploaded data.", "sources": records}
