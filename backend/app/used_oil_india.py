from __future__ import annotations

from decimal import Decimal
import re
from typing import Any

from fastapi import HTTPException

from .config import settings
from .database import db_connection

PREFIX = "uoi_"
FORBIDDEN_SQL_RE = re.compile(r"\b(insert|update|delete|alter|drop|create|truncate|replace|grant|revoke|call|set|use|load|outfile|infile)\b", re.IGNORECASE)


def _table_name(name: str) -> str:
    if not name.startswith(PREFIX) or not name.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid Used Oil India table.")
    return name


def _columns(table_name: str) -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT column_name, column_key, is_nullable
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                ORDER BY ordinal_position
                """,
                (settings.mysql_database, table_name),
            )
            columns = [
                {
                    "column_name": row.get("column_name") or row.get("COLUMN_NAME"),
                    "column_key": row.get("column_key") or row.get("COLUMN_KEY") or "",
                    "is_nullable": row.get("is_nullable") or row.get("IS_NULLABLE") or "YES",
                }
                for row in cursor.fetchall()
            ]
    if not columns:
        raise HTTPException(status_code=404, detail="Used Oil India table not found.")
    return columns


def _primary_key(columns: list[dict[str, Any]]) -> str:
    primary = next((column["column_name"] for column in columns if column["column_key"] == "PRI"), None)
    if not primary:
        raise HTTPException(status_code=400, detail="This table does not have an editable primary key.")
    return primary


def list_tables() -> list[dict[str, Any]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT t.table_name, COALESCE(s.table_rows, 0) AS estimated_rows
                FROM information_schema.tables t
                LEFT JOIN information_schema.tables s
                    ON s.table_schema = t.table_schema AND s.table_name = t.table_name
                WHERE t.table_schema = %s AND t.table_name LIKE %s
                ORDER BY t.table_name
                """,
                (settings.mysql_database, f"{PREFIX}%"),
            )
            return [
                {
                    "table_name": row.get("table_name") or row.get("TABLE_NAME"),
                    "estimated_rows": int(row.get("estimated_rows") or 0),
                }
                for row in cursor.fetchall()
                if (row.get("table_name") or row.get("TABLE_NAME")) != "uoi_relationships"
            ]


def list_relationships(table_names: set[str] | None = None) -> list[dict[str, str]]:
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT source_table, source_column, target_table, target_column
                FROM uoi_relationships
                ORDER BY source_table, target_table
                """
            )
            rows = cursor.fetchall()
    relationships = [
        {
            "source_table": row.get("source_table") or row.get("SOURCE_TABLE"),
            "source_column": row.get("source_column") or row.get("SOURCE_COLUMN"),
            "target_table": row.get("target_table") or row.get("TARGET_TABLE"),
            "target_column": row.get("target_column") or row.get("TARGET_COLUMN"),
        }
        for row in rows
    ]
    if table_names is None:
        return relationships
    return [
        relationship for relationship in relationships
        if relationship["source_table"] in table_names and relationship["target_table"] in table_names
    ]


def table_schema(table_name: str) -> dict[str, Any]:
    table_name = _table_name(table_name)
    columns = _columns(table_name)
    return {"table": table_name, "columns": columns, "primary_key": next((column["column_name"] for column in columns if column["column_key"] == "PRI"), None)}


def list_rows(table_name: str, limit: int, offset: int, search: str = "") -> dict[str, Any]:
    table_name = _table_name(table_name)
    columns = _columns(table_name)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    where = ""
    params: list[Any] = []
    if search.strip():
        term = f"%{search.strip()}%"
        where = " WHERE " + " OR ".join(f"`{column['column_name']}` LIKE %s" for column in columns)
        params = [term] * len(columns)

    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) AS total FROM `{table_name}`{where}", params)
            total = cursor.fetchone()["total"]
            order_column = next((column["column_name"] for column in columns if column["column_key"] == "PRI"), columns[0]["column_name"])
            cursor.execute(f"SELECT * FROM `{table_name}`{where} ORDER BY `{order_column}` LIMIT %s OFFSET %s", [*params, limit, offset])
            rows = cursor.fetchall()
    return {"table": table_name, "columns": columns, "rows": rows, "total": total, "limit": limit, "offset": offset}


def create_row(table_name: str, values: dict[str, Any]) -> dict[str, Any]:
    table_name = _table_name(table_name)
    columns = _columns(table_name)
    allowed = {column["column_name"] for column in columns}
    payload = {key: (None if value == "" else value) for key, value in values.items() if key in allowed}
    if not payload:
        raise HTTPException(status_code=400, detail="No valid fields were provided.")
    names = list(payload)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"INSERT INTO `{table_name}` ({', '.join(f'`{name}`' for name in names)}) VALUES ({', '.join(['%s'] * len(names))})",
                [payload[name] for name in names],
            )
    return {"ok": True}


def update_row(table_name: str, row_id: str, values: dict[str, Any]) -> dict[str, Any]:
    table_name = _table_name(table_name)
    columns = _columns(table_name)
    primary_key = _primary_key(columns)
    allowed = {column["column_name"] for column in columns if column["column_name"] != primary_key}
    payload = {key: (None if value == "" else value) for key, value in values.items() if key in allowed}
    if not payload:
        raise HTTPException(status_code=400, detail="No editable fields were provided.")
    names = list(payload)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE `{table_name}` SET {', '.join(f'`{name}` = %s' for name in names)} WHERE `{primary_key}` = %s",
                [*[payload[name] for name in names], row_id],
            )
    return {"ok": True}


def delete_row(table_name: str, row_id: str) -> dict[str, Any]:
    table_name = _table_name(table_name)
    columns = _columns(table_name)
    primary_key = _primary_key(columns)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM `{table_name}` WHERE `{primary_key}` = %s", (row_id,))
    return {"ok": True}


def schema_overview() -> dict[str, Any]:
    tables = list_tables()
    overview_tables = []
    for table in tables:
        table_name = table["table_name"]
        columns = _columns(table_name)
        overview_tables.append({
            "table_name": table_name,
            "label": table_name.removeprefix(PREFIX).replace("_", " "),
            "estimated_rows": table["estimated_rows"],
            "columns": [column["column_name"] for column in columns],
            "column_count": len(columns),
            "primary_key": next((column["column_name"] for column in columns if column["column_key"] == "PRI"), None),
        })
    return {"database": settings.mysql_database, "prefix": PREFIX, "tables": overview_tables, "relationships": list_relationships()}


def focused_schema(table_names: set[str]) -> dict[str, Any]:
    full = schema_overview()
    selected = {name for name in table_names if name.startswith(PREFIX)}
    tables = [table for table in full["tables"] if table["table_name"] in selected]
    relationships = list_relationships({table["table_name"] for table in tables})
    return {**full, "tables": tables, "relationships": relationships}


def sample_rows(table_names: list[str], limit: int = 3) -> list[dict[str, Any]]:
    samples = []
    for table_name in table_names[:8]:
        table_name = _table_name(table_name)
        columns = _columns(table_name)
        order_column = next((column["column_name"] for column in columns if column["column_key"] == "PRI"), columns[0]["column_name"])
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(f"SELECT * FROM `{table_name}` ORDER BY `{order_column}` LIMIT %s", (limit,))
                rows = _json_rows(cursor.fetchall())
        samples.append({"table_name": table_name, "rows": rows})
    return samples


def validate_select(sql: str, allowed_tables: set[str]) -> str:
    clean = sql.strip().rstrip(";").strip()
    if not re.match(r"^select\b", clean, re.IGNORECASE):
        raise ValueError("Only SELECT queries are allowed.")
    masked = re.sub(r"'(?:''|[^'])*'", "''", clean)
    masked = re.sub(r'"(?:""|[^"])*"', '""', masked)
    if ";" in masked or "--" in masked or "/*" in masked or "#" in masked:
        raise ValueError("Multiple statements and comments are not allowed.")
    forbidden = FORBIDDEN_SQL_RE.search(masked)
    if forbidden:
        raise ValueError(f"Generated SQL used a forbidden operation: {forbidden.group(1).upper()}.")
    references = {match.group(1) for match in re.finditer(r"\b(?:from|join)\s+`?([A-Za-z_][A-Za-z0-9_]*)`?", masked, re.IGNORECASE)}
    if not references:
        raise ValueError("Generated SQL must read from Used Oil India tables.")
    if not references.issubset(allowed_tables):
        raise ValueError("Generated SQL referenced a table outside Used Oil India data.")
    if not re.search(r"\blimit\s+\d+\b", masked, re.IGNORECASE):
        clean = f"{clean} LIMIT 1000"
    return clean


def execute_select(sql: str, allowed_tables: set[str]) -> dict[str, Any]:
    clean = validate_select(sql, allowed_tables)
    with db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(clean)
            rows = _json_rows(cursor.fetchall())
    return {"sql": clean, "rows": rows}


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
