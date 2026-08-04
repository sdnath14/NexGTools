from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import xlrd
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from backend.app.config import settings


class CleanCompany(BaseModel):
    source_key: str
    serial_number: int
    company_name: str
    office_address: list[str] = Field(default_factory=list)
    mill_addresses: list[str] = Field(default_factory=list)
    telephone_numbers: list[str] = Field(default_factory=list)
    fax_numbers: list[str] = Field(default_factory=list)
    email_addresses: list[str] = Field(default_factory=list)
    current_supplier: str = ""


class CleanBatch(BaseModel):
    companies: list[CleanCompany]


def grouped_rows(path: Path) -> list[dict[str, Any]]:
    workbook = xlrd.open_workbook(str(path))
    groups: list[dict[str, Any]] = []
    for sheet in workbook.sheets():
        current: dict[str, Any] | None = None
        for row_index in range(1, sheet.nrows):
            values = [str(sheet.cell_value(row_index, column)).strip() for column in range(sheet.ncols)]
            serial = values[0]
            if serial:
                if current:
                    groups.append(current)
                current = {
                    "source_key": f"{sheet.name}:{row_index + 1}",
                    "source_sheet": sheet.name,
                    "source_start_row": row_index + 1,
                    "serial_number": int(float(serial)),
                    "raw_rows": [],
                }
            if current and any(values):
                current["raw_rows"].append({
                    "excel_row": row_index + 1,
                    "name_or_address": values[1],
                    "telephone": values[2],
                    "fax": values[3],
                    "email": values[4],
                    "current_supplier": values[5],
                })
        if current:
            groups.append(current)
    return groups


def clean_with_openai(groups: list[dict[str, Any]], batch_size: int = 10) -> list[dict[str, Any]]:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    cleaner = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0,
    ).with_structured_output(CleanBatch)
    output: list[dict[str, Any]] = []
    instruction = """Clean the supplied grouped Excel company records into the required schema.
Each input object is exactly one company. Return exactly one output company for every input object, in the same order.
Copy source_key exactly from each input object. Never create, merge, split, or omit a source_key.
The first name_or_address value is normally the company name; remaining values are office or mill address lines.
Classify lines beginning with Mill, Mil, Works, or Factory as mill_addresses. Keep other address lines in office_address.
Split multiple emails and phone/fax values into arrays, including newline-separated values.
Do not invent, correct, geocode, expand, or infer any value. Preserve names, numbers, punctuation, and spelling from the input.
Do not put addresses into company_name. Empty fields must be empty strings or arrays."""
    def run_batch(batch: list[dict[str, Any]]) -> list[CleanCompany]:
        response = cleaner.invoke([
            ("system", instruction),
            ("human", json.dumps(batch, ensure_ascii=False)),
        ])
        expected = {item["source_key"] for item in batch}
        returned = {item.source_key for item in response.companies}
        if len(response.companies) != len(batch) or returned != expected:
            if len(batch) == 1:
                raise RuntimeError(f"OpenAI could not preserve source key {batch[0]['source_key']}")
            middle = len(batch) // 2
            return run_batch(batch[:middle]) + run_batch(batch[middle:])
        by_key = {item.source_key: item for item in response.companies}
        return [by_key[item["source_key"]] for item in batch]

    for start in range(0, len(groups), batch_size):
        batch = groups[start:start + batch_size]
        for source, cleaned in zip(batch, run_batch(batch)):
            item = cleaned.model_dump()
            item.pop("source_key", None)
            if item["serial_number"] != source["serial_number"]:
                raise RuntimeError("OpenAI changed a serial number")
            item["metadata"] = {
                "source": "Active Jute Mills Kolkata.xls",
                "sheet_name": source["source_sheet"],
                "source_start_row": source["source_start_row"],
                "cleaned_by": settings.openai_model,
            }
            output.append(item)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    groups = grouped_rows(args.input)
    cleaned = clean_with_openai(groups)
    payload = {
        "source_file": args.input.name,
        "record_count": len(cleaned),
        "records": cleaned,
    }
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "record_count": len(cleaned)}))


if __name__ == "__main__":
    main()
