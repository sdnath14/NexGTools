"""Structured document ingestion and direct keyword retrieval."""
from __future__ import annotations

import hashlib
import json
import math
import re
import uuid
from collections import Counter
from pathlib import Path
from typing import Any, Iterator

import pandas as pd
from docx import Document
from pypdf import PdfReader

try:
    from rank_bm25 import BM25Okapi
except ImportError:  # pragma: no cover - local fallback keeps search usable without the optional package.
    BM25Okapi = None

from .database import db_connection

TABULAR_EXTENSIONS = {".csv", ".xls", ".xlsx", ".xlsm"}
TEXT_EXTENSIONS = {".pdf", ".docx", ".txt"}
SUPPORTED_EXTENSIONS = TABULAR_EXTENSIONS | TEXT_EXTENSIONS

TEMPLATE_COLUMNS = (
    "GSTIN", "LEGAL NAME", "Pincode", "Trade Name", "BUSINESS_CONST",
    "Mobile No.", "E-Mail", "Address", "Location",
)
GSTIN_PATTERN = re.compile(r"^[A-Z\d]{15}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
TAG_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9 _-]{0,39}$")


def validate_upload(filename: str) -> tuple[str, str]:
    safe_name = Path(filename).name.strip() or "document"
    extension = Path(safe_name).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError("Only CSV, Excel, PDF, DOCX, and TXT files can be uploaded.")
    return safe_name, extension


def _is_empty(value: Any) -> bool:
    return value is None or (isinstance(value, float) and pd.isna(value)) or (isinstance(value, str) and not value.strip())


def _validate_contact_values(values: dict[str, Any], sheet_name: str, row_number: int) -> list[str]:
    """Validate populated values whose column has a defined input type."""
    errors: list[str] = []
    gstin = values.get("GSTIN")
    if not _is_empty(gstin) and not GSTIN_PATTERN.fullmatch(str(gstin).strip().upper()):
        errors.append(f"{sheet_name} row {row_number}: GSTIN must contain exactly 15 letters or digits")

    for column in ("Pincode", "Mobile No."):
        value = values.get(column)
        if not _is_empty(value) and not re.fullmatch(r"\d+", str(value).strip()):
            errors.append(f"{sheet_name} row {row_number}: {column} must contain numbers only")

    email = values.get("E-Mail")
    if not _is_empty(email) and not EMAIL_PATTERN.fullmatch(str(email).strip()):
        errors.append(f"{sheet_name} row {row_number}: E-Mail must be a valid email address")
    return errors


def _read_csv(path: Path, header: int | None = 0) -> pd.DataFrame:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin1"):
        try:
            return pd.read_csv(path, header=header, dtype=object, encoding=encoding)
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error:
        raise last_error
    return pd.read_csv(path, header=header, dtype=object)


def validate_workbook(path: Path, extension: str) -> dict[str, int]:
    """Validate that uploaded files are readable before accepting them."""
    if extension in TEXT_EXTENSIONS:
        try:
            records = list(_text_records(path, extension))
        except Exception as exc:
            raise ValueError("The file could not be read. Upload a valid PDF, DOCX, TXT, CSV, or Excel file.") from exc
        rows_checked = sum(len(group_records) for _, _, _, group_records in records)
        if not rows_checked:
            raise ValueError("The document does not contain any readable text to import.")
        return {"sheets_checked": len(records)}

    try:
        sheets = (
            # Read without a header so duplicate spreadsheet headers are retained
            # instead of silently being renamed by pandas.
            {"CSV": _read_csv(path, header=None)}
            if extension == ".csv"
            else pd.read_excel(path, sheet_name=None, header=None, dtype=object)
        )
    except Exception as exc:
        raise ValueError("The file could not be read. Upload a valid CSV, XLS, or XLSX file.") from exc
    if not sheets:
        raise ValueError("The workbook does not contain a worksheet.")

    sheets_checked = 0
    for sheet_name, frame in sheets.items():
        frame = frame.dropna(how="all").dropna(axis=1, how="all")
        if frame.empty:
            continue
        sheets_checked += 1

    if not sheets_checked:
        raise ValueError("The workbook does not contain any rows to import.")
    return {"sheets_checked": sheets_checked}


def _value(value: Any) -> Any:
    if _is_empty(value):
        return None
    return str(value).strip()


def run_diagnostics(user_id: int, file_id: str) -> dict[str, Any]:
    """Report type errors and duplicate rows after an upload completes."""
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT s.name, r.record_number, r.record_json FROM document_records r "
                "JOIN document_sheets s ON s.id=r.sheet_id "
                "WHERE r.file_id=%s AND EXISTS (SELECT 1 FROM document_files WHERE id=%s AND user_id=%s) "
                "ORDER BY s.position, r.record_number",
                (file_id, file_id, user_id),
            )
            records = list(cursor.fetchall())
            if not records:
                cursor.execute("SELECT id, status FROM document_files WHERE id=%s AND user_id=%s", (file_id, user_id))
                file_row = cursor.fetchone()
                if not file_row:
                    raise ValueError("Document not found.")
                if file_row["status"] != "completed":
                    raise ValueError("Diagnostics are available after processing completes.")

    issues: list[dict[str, Any]] = []
    seen_rows: dict[tuple[str, tuple[str, ...]], int] = {}
    for record in records:
        values = record["record_json"]
        if isinstance(values, str):
            values = json.loads(values)
        for error in _validate_contact_values(values, record["name"], record["record_number"]):
            column = error.rsplit(": ", 1)[-1].split(" must ", 1)[0]
            if len(issues) < 100:
                issues.append({
                    "sheet": record["name"],
                    "row": record["record_number"],
                    "column": column,
                    "message": error.rsplit(": ", 1)[-1],
                    "value": values.get(column),
                    "fixable": True,
                })
        row_key = tuple(
            (column, "" if _is_empty(values.get(column)) else str(values.get(column)).strip())
            for column in sorted(values)
        )
        identity = (record["name"], row_key)
        if identity in seen_rows and len(issues) < 100:
            issues.append({
                "sheet": record["name"],
                "row": record["record_number"],
                "column": "Row",
                "message": f"Duplicate of row {seen_rows[identity]}",
                "value": None,
                "fixable": True,
                "target_column": "GSTIN",
            })
        else:
            seen_rows[identity] = record["record_number"]
    return {"rows_checked": len(records), "issues": issues, "has_more": len(issues) >= 100}


def _clean_headers(columns: list[Any]) -> list[str]:
    seen: dict[str, int] = {}
    result = []
    for index, column in enumerate(columns, 1):
        base = re.sub(r"\s+", " ", str(column).strip()) or f"column_{index}"
        seen[base] = seen.get(base, 0) + 1
        result.append(base if seen[base] == 1 else f"{base}_{seen[base]}")
    return result


def _tabular_records(path: Path, extension: str) -> Iterator[tuple[str, int, list[str], list[dict[str, Any]]]]:
    sheets = pd.read_excel(path, sheet_name=None, dtype=object) if extension in {".xls", ".xlsx", ".xlsm"} else {"CSV": _read_csv(path)}
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
    groups = _tabular_records(path, extension) if extension in TABULAR_EXTENSIONS else _text_records(path, extension)
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
    try:
        Path(file_row["storage_path"]).unlink(missing_ok=True)
    except OSError:
        pass


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
                cursor.execute("SELECT record_number, record_json, tags_json FROM document_records WHERE sheet_id=%s ORDER BY record_number", (sheet["id"],))
                sheet["records"] = list(cursor.fetchall())
                for record in sheet["records"]:
                    if isinstance(record["record_json"], str): record["record_json"] = json.loads(record["record_json"])
                    if isinstance(record.get("tags_json"), str): record["tags_json"] = json.loads(record["tags_json"] or "[]")
                    record["tags"] = record.pop("tags_json", None) or []
    return sheets


def update_cell(user_id: int, file_id: str, sheet_id: int, record_number: int, column: str, value: Any) -> None:
    """Update or clear one imported workbook cell and refresh its search text."""
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT r.id, r.record_json FROM document_records r JOIN document_sheets s ON s.id=r.sheet_id "
                "JOIN document_files f ON f.id=r.file_id WHERE r.file_id=%s AND r.sheet_id=%s "
                "AND r.record_number=%s AND f.user_id=%s",
                (file_id, sheet_id, record_number, user_id),
            )
            record = cursor.fetchone()
            if not record:
                raise ValueError("Workbook cell not found.")
            record_json = record["record_json"]
            if isinstance(record_json, str):
                record_json = json.loads(record_json)
            if column not in record_json:
                raise ValueError("Workbook column not found.")
            record_json[column] = value if value not in (None, "") else None
            searchable_text = " | ".join(f"{key}: {item}" for key, item in record_json.items() if item not in (None, ""))
            cursor.execute(
                "UPDATE document_records SET record_json=CAST(%s AS JSON), searchable_text=%s WHERE id=%s",
                (json.dumps(record_json, default=str), searchable_text, record["id"]),
            )


def update_record_tag(user_id: int, file_id: str, sheet_id: int, record_number: int, tag: str, enabled: bool) -> list[str]:
    """Add or remove a workbook row tag for an authorized record."""
    normalized_tag = tag.strip().upper()
    if not TAG_PATTERN.fullmatch(normalized_tag):
        raise ValueError("Tags can use letters, numbers, spaces, hyphens, and underscores up to 40 characters.")
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT r.id, r.tags_json FROM document_records r JOIN document_files f ON f.id=r.file_id "
                "WHERE r.file_id=%s AND r.sheet_id=%s AND r.record_number=%s AND f.user_id=%s",
                (file_id, sheet_id, record_number, user_id),
            )
            record = cursor.fetchone()
            if not record:
                raise ValueError("Workbook row not found.")
            tags = record.get("tags_json") or []
            if isinstance(tags, str):
                tags = json.loads(tags or "[]")
            tags = [str(item).upper() for item in tags if str(item).strip()]
            if enabled and normalized_tag not in tags:
                tags.append(normalized_tag)
            if not enabled:
                tags = [item for item in tags if item != normalized_tag]
            cursor.execute(
                "UPDATE document_records SET tags_json=CAST(%s AS JSON) WHERE id=%s",
                (json.dumps(tags), record["id"]),
            )
    return tags


def update_file_tag(user_id: int, file_id: str, tag: str, enabled: bool) -> int:
    """Add or remove a tag from every row in one authorized workbook."""
    normalized_tag = tag.strip().upper()
    if not TAG_PATTERN.fullmatch(normalized_tag):
        raise ValueError("Tags can use letters, numbers, spaces, hyphens, and underscores up to 40 characters.")
    updated = 0
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT r.id, r.tags_json FROM document_records r JOIN document_files f ON f.id=r.file_id "
                "WHERE r.file_id=%s AND f.user_id=%s",
                (file_id, user_id),
            )
            records = list(cursor.fetchall())
            if not records:
                cursor.execute("SELECT id FROM document_files WHERE id=%s AND user_id=%s", (file_id, user_id))
                if not cursor.fetchone():
                    raise ValueError("Document not found.")
            rows = []
            for record in records:
                tags = record.get("tags_json") or []
                if isinstance(tags, str):
                    tags = json.loads(tags or "[]")
                tags = [str(item).upper() for item in tags if str(item).strip()]
                previous = tags[:]
                if enabled and normalized_tag not in tags:
                    tags.append(normalized_tag)
                if not enabled:
                    tags = [item for item in tags if item != normalized_tag]
                if tags != previous:
                    rows.append((json.dumps(tags), record["id"]))
            if rows:
                cursor.executemany("UPDATE document_records SET tags_json=CAST(%s AS JSON) WHERE id=%s", rows)
                updated = cursor.rowcount
    return updated


def delete_record(user_id: int, file_id: str, sheet_name: str, record_number: int) -> None:
    """Delete one authorized imported record and keep its sheet count accurate."""
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT r.id, s.id AS sheet_id FROM document_records r "
                "JOIN document_sheets s ON s.id=r.sheet_id JOIN document_files f ON f.id=r.file_id "
                "WHERE r.file_id=%s AND s.name=%s AND r.record_number=%s AND f.user_id=%s",
                (file_id, sheet_name, record_number, user_id),
            )
            record = cursor.fetchone()
            if not record:
                raise ValueError("Workbook row not found.")
            cursor.execute("DELETE FROM document_records WHERE id=%s", (record["id"],))
            cursor.execute("UPDATE document_sheets SET row_count=GREATEST(row_count - 1, 0) WHERE id=%s", (record["sheet_id"],))


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


def _bm25_tokens(text: str) -> list[str]:
    return re.findall(r"[\w@.+-]+", text.casefold())


def _fallback_bm25_scores(corpus: list[list[str]], query_terms: list[str], k1: float = 1.5, b: float = 0.75) -> list[float]:
    if not corpus or not query_terms:
        return [0.0 for _ in corpus]
    document_count = len(corpus)
    average_length = sum(len(document) for document in corpus) / max(document_count, 1)
    document_frequencies = Counter(
        term
        for document in corpus
        for term in set(document)
    )
    scores: list[float] = []
    for document in corpus:
        frequencies = Counter(document)
        document_length = len(document) or 1
        score = 0.0
        for term in query_terms:
            if not frequencies[term]:
                continue
            idf = math.log(1 + (document_count - document_frequencies[term] + 0.5) / (document_frequencies[term] + 0.5))
            denominator = frequencies[term] + k1 * (1 - b + b * document_length / max(average_length, 1))
            score += idf * (frequencies[term] * (k1 + 1) / denominator)
        scores.append(score)
    return scores


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


def search(user_id: int, query: str, limit: int = 50, offset: int = 0, file_ids: list[str] | None = None, tag: str | None = None) -> tuple[list[dict[str, Any]], int, list[dict[str, Any]]]:
    """Return BM25-ranked workbook rows matching the supplied keywords."""
    normalized_query = query.casefold().strip()
    terms = _search_terms(query)
    normalized_tag = tag.strip().upper() if tag else ""
    if normalized_tag and not TAG_PATTERN.fullmatch(normalized_tag):
        raise ValueError("Tags can use letters, numbers, spaces, hyphens, and underscores up to 40 characters.")
    if not terms and not normalized_tag:
        return [], 0, []

    tag_filter = " AND JSON_CONTAINS(COALESCE(r.tags_json, CAST('[]' AS JSON)), CAST(%s AS JSON))" if normalized_tag else ""
    file_filter = ""
    params: list[Any] = [user_id]
    if file_ids:
        file_filter = f" AND f.id IN ({','.join(['%s'] * len(file_ids))})"
        params.extend(file_ids)
    if normalized_tag:
        params.append(json.dumps(normalized_tag))
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT r.id, f.id AS file_id, f.filename, s.id AS sheet_id, s.name AS sheet_name, r.record_number, r.record_json, r.tags_json, r.searchable_text "
                f"FROM document_records r JOIN document_files f ON f.id=r.file_id "
                f"LEFT JOIN document_sheets s ON s.id=r.sheet_id "
                f"WHERE f.user_id=%s{file_filter}{tag_filter}",
                params,
            )
            rows = list(cursor.fetchall())
    for row in rows:
        if isinstance(row["record_json"], str):
            row["record_json"] = json.loads(row["record_json"])
        if isinstance(row.get("tags_json"), str):
            row["tags_json"] = json.loads(row["tags_json"] or "[]")
        row["tags"] = row.pop("tags_json", None) or []
    if not rows:
        return [], 0, []

    if terms:
        corpus = [_bm25_tokens(row["searchable_text"]) for row in rows]
        if BM25Okapi:
            scores = BM25Okapi(corpus).get_scores(terms).tolist()
        else:
            scores = _fallback_bm25_scores(corpus, terms)
        matched_rows = []
        for row, score in zip(rows, scores):
            text = row["searchable_text"].casefold()
            phrase_score = 4.0 if normalized_query and normalized_query in text else 0.0
            coverage_score = sum(1 for term in terms if term in text) / max(len(terms), 1)
            final_score = float(score) + phrase_score + coverage_score
            if final_score > 0:
                row["_search_score"] = final_score
                matched_rows.append(row)
    else:
        matched_rows = rows

    source_counter = Counter(row["filename"] for row in matched_rows)
    source_counts = [
        {"filename": filename, "count": count}
        for filename, count in source_counter.most_common()
    ]
    total = len(matched_rows)
    ranked = sorted(
        matched_rows,
        key=lambda row: (row.get("_search_score", 0), -len(row["searchable_text"]), -row["record_number"]),
        reverse=True,
    )[offset:offset + limit]
    for row in ranked:
        row.pop("searchable_text", None)
        row.pop("_search_score", None)
    return ranked, total, source_counts


def answer(user_id: int, question: str) -> dict[str, Any]:
    records, total, _source_counts = search(user_id, question)
    if not records:
        return {"answer": "No matching rows were found in your uploaded data.", "sources": []}
    return {"answer": f"Found {total} keyword match{'' if total == 1 else 'es'} in your uploaded data.", "sources": records}
