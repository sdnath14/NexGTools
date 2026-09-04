from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any
from decimal import Decimal
import json
import math
import re

import pandas as pd

from .database import db_connection
from .config import settings


IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
FORBIDDEN_SQL_RE = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|load|outfile|into\s+dumpfile|set|call)\b",
    re.IGNORECASE,
)

REVENUE_PATTERNS = ["revenue", "sales", "amount", "value", "total"]
QUANTITY_PATTERNS = ["quantity", "qty", "kl", "volume", "litre", "liter"]
CUSTOMER_PATTERNS = ["customer", "client", "company", "party", "buyer"]
PRODUCT_PATTERNS = ["product", "item", "material", "grade"]
DATE_PATTERNS = ["date", "month", "period"]


def _quote_identifier(identifier: str) -> str:
    if not IDENTIFIER_RE.fullmatch(identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier}")
    return f"`{identifier}`"


def _mask_sql_literals(sql: str) -> str:
    masked = []
    index = 0
    quote = ""
    while index < len(sql):
        char = sql[index]
        if quote:
            if char == "\\" and quote in {"'", '"'} and index + 1 < len(sql):
                masked.extend("  ")
                index += 2
                continue
            if char == quote:
                quote = ""
            masked.append(" ")
            index += 1
            continue
        if char in {"'", '"', "`"}:
            quote = char
            masked.append(" ")
            index += 1
            continue
        masked.append(char)
        index += 1
    return "".join(masked)


def _slug(value: str, fallback: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", value or "").strip("_").lower()
    if not slug or not re.match(r"^[A-Za-z_]", slug):
        slug = fallback
    return slug[:48]


def _clean_column(value: Any, index: int, used: set[str]) -> tuple[str, str]:
    original = str(value or f"Column {index + 1}").strip()
    base = _slug(original, f"column_{index + 1}")
    if base in {"select", "from", "where", "group", "order", "limit", "table", "date"}:
        base = f"{base}_value"
    name = base
    suffix = 2
    while name in used:
        name = f"{base[:42]}_{suffix}"
        suffix += 1
    used.add(name)
    return original, name


def _mysql_type(series: pd.Series) -> str:
    non_empty = series.dropna()
    if non_empty.empty:
        return "TEXT"
    if pd.api.types.is_integer_dtype(non_empty):
        return "BIGINT"
    if pd.api.types.is_float_dtype(non_empty):
        return "DOUBLE"
    if pd.api.types.is_datetime64_any_dtype(non_empty):
        return "DATETIME"
    if pd.api.types.is_bool_dtype(non_empty):
        return "TINYINT(1)"
    return "TEXT"


def _cell_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    if hasattr(value, "to_pydatetime"):
        return value.to_pydatetime()
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def ensure_analytics_tables() -> None:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS analytics_datasets (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    filename VARCHAR(500) NOT NULL,
                    table_count INT NOT NULL DEFAULT 0,
                    row_count INT NOT NULL DEFAULT 0,
                    status VARCHAR(32) NOT NULL DEFAULT 'completed',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_analytics_datasets_user (user_id),
                    CONSTRAINT fk_analytics_datasets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS analytics_tables (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    dataset_id BIGINT UNSIGNED NOT NULL,
                    sheet_name VARCHAR(255) NOT NULL,
                    table_name VARCHAR(128) NOT NULL,
                    row_count INT NOT NULL DEFAULT 0,
                    columns_json JSON NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_analytics_table_name (table_name),
                    INDEX idx_analytics_tables_dataset (dataset_id),
                    CONSTRAINT fk_analytics_tables_dataset FOREIGN KEY (dataset_id) REFERENCES analytics_datasets(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )


def upload_dataset(user_id: int, filename: str, content: bytes) -> dict[str, Any]:
    ensure_analytics_tables()
    extension = Path(filename).suffix.lower()
    if extension not in {".xlsx", ".xlsm", ".xls", ".csv"}:
        raise ValueError("Upload an Excel workbook or CSV file.")

    if extension == ".csv":
        frames = {"Data": pd.read_csv(BytesIO(content))}
    else:
        frames = pd.read_excel(BytesIO(content), sheet_name=None)

    frames = {name: frame.dropna(how="all") for name, frame in frames.items() if not frame.dropna(how="all").empty}
    if not frames:
        raise ValueError("No usable rows were found in the uploaded file.")

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO analytics_datasets (user_id, filename, status) VALUES (%s, %s, 'processing')",
                (user_id, filename[:500]),
            )
            dataset_id = cursor.lastrowid
            total_rows = 0
            table_count = 0
            for sheet_index, (sheet_name, frame) in enumerate(frames.items(), start=1):
                used: set[str] = {"__row_id"}
                columns = []
                for index, column in enumerate(frame.columns):
                    original, clean = _clean_column(column, index, used)
                    columns.append({"name": clean, "original_name": original, "type": _mysql_type(frame.iloc[:, index])})
                table_name = f"analytics_data_{dataset_id}_{_slug(sheet_name, f'sheet_{sheet_index}')}"
                table_name = table_name[:120]
                frame = frame.copy()
                frame.columns = [column["name"] for column in columns]
                column_defs = ["`__row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY"]
                column_defs.extend(f"{_quote_identifier(column['name'])} {column['type']}" for column in columns)
                cursor.execute(f"CREATE TABLE {_quote_identifier(table_name)} ({', '.join(column_defs)}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
                if len(frame):
                    db_columns = [column["name"] for column in columns]
                    placeholders = ", ".join(["%s"] * len(db_columns))
                    names = ", ".join(_quote_identifier(column) for column in db_columns)
                    rows = [tuple(_cell_value(value) for value in row) for row in frame[db_columns].itertuples(index=False, name=None)]
                    cursor.executemany(f"INSERT INTO {_quote_identifier(table_name)} ({names}) VALUES ({placeholders})", rows)
                row_count = int(len(frame))
                total_rows += row_count
                table_count += 1
                cursor.execute(
                    """
                    INSERT INTO analytics_tables (dataset_id, sheet_name, table_name, row_count, columns_json)
                    VALUES (%s, %s, %s, %s, CAST(%s AS JSON))
                    """,
                    (dataset_id, str(sheet_name)[:255], table_name, row_count, json.dumps(columns)),
                )
            cursor.execute(
                "UPDATE analytics_datasets SET table_count=%s, row_count=%s, status='completed' WHERE id=%s",
                (table_count, total_rows, dataset_id),
            )
    return get_dataset(user_id, dataset_id)


def list_datasets(user_id: int) -> list[dict[str, Any]]:
    ensure_analytics_tables()
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, filename, table_count, row_count, status, created_at
                FROM analytics_datasets
                WHERE user_id = %s
                ORDER BY created_at DESC, id DESC
                """,
                (user_id,),
            )
            rows = cursor.fetchall()
    for row in rows:
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()
    return rows


def get_dataset(user_id: int, dataset_id: int) -> dict[str, Any]:
    ensure_analytics_tables()
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, filename, table_count, row_count, status, created_at
                FROM analytics_datasets
                WHERE id = %s AND user_id = %s
                """,
                (dataset_id, user_id),
            )
            dataset = cursor.fetchone()
            if not dataset:
                raise ValueError("Dataset not found.")
            cursor.execute(
                "SELECT id, sheet_name, table_name, row_count, columns_json FROM analytics_tables WHERE dataset_id=%s ORDER BY id",
                (dataset_id,),
            )
            tables = cursor.fetchall()
    if dataset.get("created_at"):
        dataset["created_at"] = dataset["created_at"].isoformat()
    for table in tables:
        value = table.pop("columns_json", [])
        table["columns"] = json.loads(value) if isinstance(value, str) else value
    dataset["tables"] = tables
    return dataset


def preview_table(user_id: int, dataset_id: int, table_name: str, limit: int = 50) -> dict[str, Any]:
    dataset = get_dataset(user_id, dataset_id)
    table = next((item for item in dataset["tables"] if item["table_name"] == table_name), None)
    if not table:
        raise ValueError("Table not found.")
    row_limit = min(max(limit, 1), max(int(table.get("row_count") or 1), 1))
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT * FROM {_quote_identifier(table_name)} LIMIT %s", (row_limit,))
            rows = cursor.fetchall()
    return {"table": table, "rows": _json_rows(rows), "returned_rows": len(rows), "total_rows": table["row_count"]}


def _column_matches(column: dict[str, Any], patterns: list[str]) -> bool:
    haystack = f"{column.get('name', '')} {column.get('original_name', '')}".lower()
    return any(pattern in haystack for pattern in patterns)


def _find_column(columns: list[dict[str, Any]], patterns: list[str], numeric: bool = False) -> dict[str, Any] | None:
    matches = [column for column in columns if _column_matches(column, patterns)]
    if numeric:
        numeric_matches = [column for column in matches if str(column.get("type", "")).upper() in {"BIGINT", "DOUBLE", "DECIMAL", "FLOAT", "INT"}]
        if numeric_matches:
            return numeric_matches[0]
    return matches[0] if matches else None


def _sum_expression(column_name: str) -> str:
    quoted = _quote_identifier(column_name)
    return f"SUM(CAST(NULLIF(REPLACE(REPLACE({quoted}, ',', ''), '₹', ''), '') AS DECIMAL(18, 4)))"


def _full_dataset_metrics(schema: dict[str, Any]) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "revenue": None,
        "quantity": None,
        "customers": None,
        "product_mix": [],
        "trend": [],
        "detected_columns": {},
    }
    product_totals: dict[str, float] = {}
    trend_totals: dict[str, float] = {}
    customer_values: set[str] = set()
    revenue_total = 0.0
    quantity_total = 0.0
    has_revenue = False
    has_quantity = False
    has_customer = False

    with db_connection() as connection:
        with connection.cursor() as cursor:
            for table in schema["tables"]:
                columns = table["columns"]
                table_name = table["table_name"]
                revenue_column = _find_column(columns, REVENUE_PATTERNS, numeric=True)
                quantity_column = _find_column(columns, QUANTITY_PATTERNS, numeric=True)
                customer_column = _find_column(columns, CUSTOMER_PATTERNS)
                product_column = _find_column(columns, PRODUCT_PATTERNS)
                date_column = _find_column(columns, DATE_PATTERNS)
                detected = metrics["detected_columns"].setdefault(table_name, {})

                if revenue_column:
                    has_revenue = True
                    detected["revenue"] = revenue_column
                    cursor.execute(f"SELECT COALESCE({_sum_expression(revenue_column['name'])}, 0) AS value FROM {_quote_identifier(table_name)}")
                    revenue_total += float((cursor.fetchone() or {}).get("value") or 0)
                if quantity_column:
                    has_quantity = True
                    detected["quantity"] = quantity_column
                    cursor.execute(f"SELECT COALESCE({_sum_expression(quantity_column['name'])}, 0) AS value FROM {_quote_identifier(table_name)}")
                    quantity_total += float((cursor.fetchone() or {}).get("value") or 0)
                if customer_column:
                    has_customer = True
                    detected["customers"] = customer_column
                    cursor.execute(
                        f"SELECT DISTINCT {_quote_identifier(customer_column['name'])} AS value FROM {_quote_identifier(table_name)} "
                        f"WHERE {_quote_identifier(customer_column['name'])} IS NOT NULL AND TRIM(CAST({_quote_identifier(customer_column['name'])} AS CHAR)) != ''"
                    )
                    customer_values.update(str(row["value"]).strip() for row in cursor.fetchall() if row.get("value") is not None)
                if product_column:
                    detected["product"] = product_column
                    measure = _sum_expression(revenue_column["name"]) if revenue_column else "COUNT(*)"
                    cursor.execute(
                        f"SELECT {_quote_identifier(product_column['name'])} AS label, COALESCE({measure}, 0) AS value "
                        f"FROM {_quote_identifier(table_name)} "
                        f"WHERE {_quote_identifier(product_column['name'])} IS NOT NULL AND TRIM(CAST({_quote_identifier(product_column['name'])} AS CHAR)) != '' "
                        f"GROUP BY {_quote_identifier(product_column['name'])} ORDER BY value DESC LIMIT 8"
                    )
                    for row in cursor.fetchall():
                        label = str(row.get("label") or "Unknown").strip()
                        product_totals[label] = product_totals.get(label, 0.0) + float(row.get("value") or 0)
                if date_column:
                    detected["date"] = date_column
                    date_name = date_column["name"]
                    date_expr = f"DATE_FORMAT({_quote_identifier(date_name)}, '%Y-%m')" if str(date_column.get("type", "")).upper() == "DATETIME" else f"LEFT(CAST({_quote_identifier(date_name)} AS CHAR), 10)"
                    measure = _sum_expression(revenue_column["name"]) if revenue_column else "COUNT(*)"
                    cursor.execute(
                        f"SELECT {date_expr} AS label, COALESCE({measure}, 0) AS value "
                        f"FROM {_quote_identifier(table_name)} "
                        f"WHERE {_quote_identifier(date_name)} IS NOT NULL AND TRIM(CAST({_quote_identifier(date_name)} AS CHAR)) != '' "
                        f"GROUP BY label ORDER BY label ASC LIMIT 24"
                    )
                    for row in cursor.fetchall():
                        label = str(row.get("label") or "Unknown").strip()
                        trend_totals[label] = trend_totals.get(label, 0.0) + float(row.get("value") or 0)

    metrics["revenue"] = revenue_total if has_revenue else None
    metrics["quantity"] = quantity_total if has_quantity else None
    metrics["customers"] = len(customer_values) if has_customer else None
    metrics["product_mix"] = [
        {"label": label, "value": value}
        for label, value in sorted(product_totals.items(), key=lambda item: item[1], reverse=True)[:8]
    ]
    metrics["trend"] = [
        {"label": label, "value": value}
        for label, value in sorted(trend_totals.items(), key=lambda item: item[0])[-12:]
    ]
    return metrics


def schema_for_dataset(user_id: int, dataset_id: int) -> dict[str, Any]:
    dataset = get_dataset(user_id, dataset_id)
    return {
        "dataset_id": dataset["id"],
        "filename": dataset["filename"],
        "tables": [
            {
                "sheet_name": table["sheet_name"],
                "table_name": table["table_name"],
                "row_count": table["row_count"],
                "columns": table["columns"],
            }
            for table in dataset["tables"]
        ],
        "relationships": "Each table represents one uploaded workbook sheet. No joins are required unless the user asks to compare sheets with matching columns.",
    }


def validate_sql(sql: str, allowed_tables: set[str]) -> str:
    clean = sql.strip().rstrip(";").strip()
    if not clean.lower().startswith("select"):
        raise ValueError("Only SELECT queries are allowed.")
    if ";" in clean or "--" in clean or "/*" in clean:
        raise ValueError("Multiple statements and comments are not allowed.")
    forbidden = FORBIDDEN_SQL_RE.search(_mask_sql_literals(clean))
    if forbidden:
        raise ValueError(f"Generated SQL used a forbidden operation: {forbidden.group(1).upper()}.")
    referenced = set(re.findall(r"(?:from|join)\s+`?([A-Za-z_][A-Za-z0-9_]*)`?", clean, flags=re.IGNORECASE))
    if not referenced:
        raise ValueError("Generated SQL must read from an uploaded analytics table.")
    if not referenced.issubset(allowed_tables):
        raise ValueError("Generated SQL referenced a table outside this dataset.")
    if not re.search(r"\blimit\s+\d+\b", clean, re.IGNORECASE):
        clean = f"{clean} LIMIT 1000"
    return clean


def execute_sql(user_id: int, dataset_id: int, sql: str) -> dict[str, Any]:
    schema = schema_for_dataset(user_id, dataset_id)
    allowed_tables = {table["table_name"] for table in schema["tables"]}
    clean = validate_sql(sql, allowed_tables)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(clean)
            rows = cursor.fetchall()
    return {"sql": clean, "rows": _json_rows(rows)}


def analytics_summary(user_id: int, dataset_id: int) -> dict[str, Any]:
    schema = schema_for_dataset(user_id, dataset_id)
    previews = []
    for table in schema["tables"][:3]:
        previews.append(preview_table(user_id, dataset_id, table["table_name"], 8))
    return {"schema": schema, "previews": previews, "metrics": _full_dataset_metrics(schema)}


def _json_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for row in rows:
        item = {}
        for key, value in row.items():
            if hasattr(value, "isoformat"):
                item[key] = value.isoformat()
            elif isinstance(value, Decimal):
                item[key] = float(value)
            else:
                item[key] = value
        output.append(item)
    return output
