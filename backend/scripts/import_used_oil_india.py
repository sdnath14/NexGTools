from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.app.config import settings  # noqa: E402
from backend.app.database import _connect  # noqa: E402

PREFIX = "uoi_"
CREATE_RE = re.compile(r"CREATE TABLE public\.([a-zA-Z0-9_]+) \((.*?)\n\);", re.S)
COPY_HEADER_RE = re.compile(r"^COPY public\.([a-zA-Z0-9_]+) \((.*?)\) FROM stdin;$")
COLUMN_RE = re.compile(r'^\s*(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))\s+(.+?)(?:,)?$')
PRIMARY_RE = re.compile(r"ALTER TABLE ONLY public\.([a-zA-Z0-9_]+)\s+ADD CONSTRAINT [^\n]+ PRIMARY KEY \((.*?)\);", re.S)
FK_RE = re.compile(
    r"ALTER TABLE ONLY public\.([a-zA-Z0-9_]+)\s+ADD CONSTRAINT (?:\"[^\"]+\"|[^\s]+) "
    r"FOREIGN KEY \((.*?)\) REFERENCES public\.([a-zA-Z0-9_]+)\((.*?)\)",
    re.S,
)


def clean_identifier(name: str) -> str:
    cleaned = re.sub(r"[^0-9a-zA-Z_]", "_", name)
    if cleaned and cleaned[0].isdigit():
        cleaned = f"c_{cleaned}"
    return cleaned[:60]


def split_copy_columns(raw: str) -> list[str]:
    return [part.strip().strip('"') for part in raw.split(",")]


def parse_schema(sql: str) -> dict[str, list[str]]:
    tables: dict[str, list[str]] = {}
    for table, body in CREATE_RE.findall(sql):
        columns = []
        for raw_line in body.splitlines():
            line = raw_line.rstrip()
            if not line.strip() or line.lstrip().startswith(("CONSTRAINT", "PRIMARY ", "UNIQUE ", "FOREIGN ")):
                continue
            match = COLUMN_RE.match(line)
            if not match:
                continue
            columns.append(match.group(1) or match.group(2))
        tables[table] = columns
    return tables


def parse_primary_keys(sql: str) -> dict[str, list[str]]:
    primary_keys: dict[str, list[str]] = {}
    for table, raw_columns in PRIMARY_RE.findall(sql):
        primary_keys[table] = split_copy_columns(raw_columns)
    return primary_keys


def parse_foreign_keys(sql: str) -> list[tuple[str, str, str, str]]:
    relationships = []
    for source_table, source_columns, target_table, target_columns in FK_RE.findall(sql):
        relationships.append((
            mysql_table_name(source_table),
            mysql_column_name(split_copy_columns(source_columns)[0]),
            mysql_table_name(target_table),
            mysql_column_name(split_copy_columns(target_columns)[0]),
        ))
    return relationships


def mysql_table_name(pg_table: str) -> str:
    return clean_identifier(f"{PREFIX}{pg_table}")


def mysql_column_name(pg_column: str) -> str:
    return clean_identifier(pg_column)


def decode_copy_value(value: str) -> str | None:
    if value == r"\N":
        return None
    return (
        value.replace(r"\t", "\t")
        .replace(r"\n", "\n")
        .replace(r"\r", "\r")
        .replace(r"\\", "\\")
    )


def copy_rows(block: str) -> list[list[str | None]]:
    return [[decode_copy_value(value) for value in line.split("\t")] for line in block.splitlines()]


def parse_copy_blocks(sql: str) -> list[tuple[str, str, str]]:
    blocks: list[tuple[str, str, str]] = []
    lines = sql.splitlines()
    index = 0
    while index < len(lines):
        match = COPY_HEADER_RE.match(lines[index])
        if not match:
            index += 1
            continue
        table, columns = match.groups()
        index += 1
        data_lines = []
        while index < len(lines) and lines[index] != r"\.":
            data_lines.append(lines[index])
            index += 1
        blocks.append((table, columns, "\n".join(data_lines)))
        index += 1
    return blocks


def main() -> None:
    dump_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "used-oil-india-live-20260907.sql"
    sql = dump_path.read_text(encoding="utf-8")
    schemas = parse_schema(sql)
    primary_keys = parse_primary_keys(sql)
    foreign_keys = parse_foreign_keys(sql)

    with _connect(None) as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{settings.mysql_database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        connection.commit()

    with _connect(settings.mysql_database) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
            for table, columns in schemas.items():
                mysql_table = mysql_table_name(table)
                cursor.execute(f"DROP TABLE IF EXISTS `{mysql_table}`")
                column_defs = []
                pk_columns = [mysql_column_name(column) for column in primary_keys.get(table, []) if column in columns]
                for column in columns:
                    mysql_column = mysql_column_name(column)
                    if mysql_column in pk_columns:
                        column_defs.append(f"`{mysql_column}` VARCHAR(191) NOT NULL")
                    else:
                        column_defs.append(f"`{mysql_column}` LONGTEXT NULL")
                if pk_columns:
                    column_defs.append("PRIMARY KEY (" + ", ".join(f"`{column}`" for column in pk_columns) + ")")
                cursor.execute(
                    f"CREATE TABLE `{mysql_table}` (\n  "
                    + ",\n  ".join(column_defs)
                    + "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
                )
            cursor.execute("DROP TABLE IF EXISTS `uoi_relationships`")
            cursor.execute(
                """
                CREATE TABLE `uoi_relationships` (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  source_table VARCHAR(128) NOT NULL,
                  source_column VARCHAR(128) NOT NULL,
                  target_table VARCHAR(128) NOT NULL,
                  target_column VARCHAR(128) NOT NULL,
                  INDEX idx_uoi_rel_source (source_table, source_column),
                  INDEX idx_uoi_rel_target (target_table, target_column)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            if foreign_keys:
                cursor.executemany(
                    "INSERT INTO `uoi_relationships` (source_table, source_column, target_table, target_column) VALUES (%s, %s, %s, %s)",
                    foreign_keys,
                )
            connection.commit()

            imported = []
            for table, raw_columns, block in parse_copy_blocks(sql):
                columns = [mysql_column_name(column) for column in split_copy_columns(raw_columns)]
                rows = [] if not block.strip() else copy_rows(block)
                bad_row = next((index for index, row in enumerate(rows, start=1) if len(row) != len(columns)), None)
                if bad_row is not None:
                    raise ValueError(f"{table} COPY row {bad_row} has {len(rows[bad_row - 1])} values for {len(columns)} columns")
                if not rows:
                    imported.append((table, 0))
                    continue
                placeholders = ", ".join(["%s"] * len(columns))
                column_sql = ", ".join(f"`{column}`" for column in columns)
                insert_sql = f"INSERT INTO `{mysql_table_name(table)}` ({column_sql}) VALUES ({placeholders})"
                for start in range(0, len(rows), 500):
                    cursor.executemany(insert_sql, rows[start : start + 500])
                connection.commit()
                imported.append((table, len(rows)))

            cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
            connection.commit()

    print(f"Imported {len(imported)} Used Oil India tables into `{settings.mysql_database}` with `{PREFIX}` prefix.")
    print(f"Imported {len(foreign_keys)} Used Oil India relationships into `uoi_relationships`.")
    for table, count in imported:
        print(f"{mysql_table_name(table)}\t{count}")


if __name__ == "__main__":
    main()
