from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote_plus, unquote, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.message import EmailMessage
from email.utils import formataddr
from io import BytesIO
import json
import math
import re
import smtplib
import tempfile
import time
from pathlib import Path

from bs4 import BeautifulSoup
from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel, Field
import requests

from .auth import create_token, hash_password, verify_password
from .analytics import (
    analytics_summary,
    delete_dataset,
    execute_sql,
    get_dataset,
    list_datasets,
    preview_table,
    schema_for_dataset,
    upload_dataset,
    validate_sql,
)
from .config import settings
from .database import (
    admin_overview,
    admin_table_records,
    create_session,
    create_admin_session,
    create_user,
    database_status,
    delete_admin_record,
    delete_outreach_contact,
    delete_outreach_draft,
    delete_role,
    delete_session,
    ensure_default_user,
    get_admin_session,
    get_csv_export,
    get_business_search_history,
    get_lead_search_history,
    get_user_by_email,
    get_user_by_token,
    initialize_database,
    list_csv_exports,
    list_business_search_history,
    list_lead_search_history,
    list_outreach_contacts,
    list_outreach_drafts,
    list_outreach_messages,
    list_roles,
    list_users_with_roles,
    save_role,
    set_user_role,
    save_csv_export,
    save_business_search,
    save_lead_search,
    save_manual_outreach_contact,
    save_outreach_message,
    save_outreach_draft,
    save_website_scrape,
    update_outreach_contact,
    verify_admin_password,
)
from .scraper import CrawlOptions, EMAIL_RE, PHONE_RE, scrape_website
from .documents import answer as answer_documents, create_file, delete_file, delete_record, file_contents, file_download, ingest, list_files, run_diagnostics, search as search_documents, update_cell, update_file_tag, update_record_tag, validate_upload, validate_workbook
from .used_oil_india import create_row as create_used_oil_row, delete_row as delete_used_oil_row, execute_select as execute_used_oil_select, focused_schema as used_oil_focused_schema, list_rows as list_used_oil_rows, list_tables as list_used_oil_tables, sample_rows as sample_used_oil_rows, schema_overview as used_oil_schema_overview, table_schema as used_oil_table_schema, update_row as update_used_oil_row, validate_select as validate_used_oil_select


app = FastAPI(title="NexGTools API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    try:
        initialize_database()
        ensure_default_user(
            "NexG Admin",
            settings.default_login_email,
            settings.default_login_password,
        )
    except Exception:
        pass


@app.get("/health")
def health() -> dict[str, object]:
    missing = settings.missing_keys()
    db_status = database_status()
    return {
        "ok": not missing,
        "model": settings.openai_model,
        "missing": missing,
        "database": db_status,
    }


@app.get("/config/status")
def config_status() -> dict[str, object]:
    return {
        "openai_api_key": bool(settings.openai_api_key),
        "openai_model": settings.openai_model,
        "google_places_api_key": bool(settings.google_places_api_key),
        "google_search_api_key": bool(settings.google_search_api_key),
        "google_search_engine_id": bool(settings.google_search_engine_id),
        "mysql_host": settings.mysql_host,
        "mysql_port": settings.mysql_port,
        "mysql_user": bool(settings.mysql_user),
        "mysql_database": settings.mysql_database,
        "mysql": database_status(),
    }


class LeadSearchRequest(BaseModel):
    company_name: str = ""
    pincode: str = ""
    city_area: str = ""
    radius_km: int = Field(default=10, ge=1, le=50)
    business_type: str = ""
    max_pages: int = Field(default=5, ge=1, le=10)


class WebsiteScrapeRequest(BaseModel):
    url: str
    max_pages: int = Field(default=10, ge=1, le=25)
    lead: dict[str, Any] | None = None
    search_name: str = ""


class OutreachSendRequest(BaseModel):
    contact_ids: list[int]
    channel: str
    subject: str = "Business invitation"
    message: str
    sender_name: str = ""
    reply_to_email: str = ""
    cc_email: str = ""
    bcc_email: str = ""
    use_selected_leads_as_bcc: bool = False


class OutreachContactRequest(BaseModel):
    company_name: str
    contact_person: str = ""
    email: str = ""
    phone: str = ""
    website: str = ""
    category: str = "manual"


class OutreachDraftRequest(BaseModel):
    contact_ids: list[int] = Field(default_factory=list)
    channel: str = "email"
    subject: str = "Business invitation"
    message: str


class OutreachGenerateRequest(BaseModel):
    contact_ids: list[int]
    channel: str = "email"
    tone: str = "professional"
    campaign_goal: str = ""
    brand_name: str = ""
    key_points: list[str] = Field(default_factory=list)
    existing_draft: str = ""
    rewrite_prompt: str = ""
    sender_name: str = ""


class ChatMessage(BaseModel):
    role: str
    content: str


class DocumentCellUpdate(BaseModel):
    sheet_id: int
    record_number: int
    column: str
    value: str | None = None


class DocumentRecordTagUpdate(BaseModel):
    sheet_id: int
    record_number: int
    tag: str = "BPCL"
    enabled: bool = True


class DocumentFileTagUpdate(BaseModel):
    tag: str
    enabled: bool = True


class LeadAiChatRequest(BaseModel):
    question: str
    lead: dict[str, Any] | None = None
    scrape: dict[str, Any] | None = None
    history: list[ChatMessage] = Field(default_factory=list)


class UsedOilRowRequest(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


class UsedOilChatRequest(BaseModel):
    question: str
    table_name: str = ""
    history: list[ChatMessage] = Field(default_factory=list)


class BusinessAiChatRequest(BaseModel):
    question: str
    business: dict[str, Any] | None = None
    search_context: dict[str, Any] | None = None
    history: list[ChatMessage] = Field(default_factory=list)


class AuthRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(AuthRequest):
    name: str


class AdminCreateUserRequest(RegisterRequest):
    pass


class RoleRequest(BaseModel):
    name: str
    permissions: list[str] = Field(default_factory=list)


class UserRoleRequest(BaseModel):
    role_id: int


class CsvExportRequest(BaseModel):
    export_name: str = "Lead export"
    leads: list[dict[str, Any]]
    source: str = "lead_search"


class SocialProfileRequest(BaseModel):
    name: str
    address: str = ""
    website: str = ""


class BusinessSearchRequest(BaseModel):
    query: str
    location: str = ""
    source: str = "all"
    sources: list[str] = Field(default_factory=list)
    radius_km: int = Field(default=25, ge=1, le=50)
    max_results: int = Field(default=24, ge=3, le=60)


class AdminLoginRequest(BaseModel):
    password: str


class AdminUpdateRecordRequest(BaseModel):
    values: dict[str, Any]


class DocumentQueryRequest(BaseModel):
    query: str
    limit: int = Field(default=50, ge=1, le=50)
    offset: int = Field(default=0, ge=0)
    file_ids: list[str] = Field(default_factory=list)
    tag: str | None = None


class AnalyticsChatRequest(BaseModel):
    dataset_id: int
    question: str
    table_name: str = ""
    history: list[ChatMessage] = Field(default_factory=list)




BUSINESS_SOURCES: dict[str, dict[str, str]] = {
    "zomato": {
        "label": "Zomato",
        "domain": "zomato.com",
        "url": "https://www.google.com/search?q={query}+{location}+site%3Azomato.com",
    },
    "swiggy": {
        "label": "Swiggy",
        "domain": "swiggy.com",
        "url": "https://www.google.com/search?q={query}+{location}+site%3Aswiggy.com",
    },
    "exportersindia": {
        "label": "ExportersIndia",
        "domain": "exportersindia.com",
        "url": "https://www.exportersindia.com/search.php?srch_catg_ty=prod&term={query}&cont=IN",
    },
    "mouthshut": {
        "label": "MouthShut",
        "domain": "mouthshut.com",
        "url": "https://www.google.com/search?q={query}+{location}+site%3Amouthshut.com",
    },
    "indiacom": {
        "label": "Indiacom",
        "domain": "indiacom.com",
        "url": "https://www.indiacom.com/yellow-pages/{query}/{location}",
    },
    "clickindia": {
        "label": "ClickIndia",
        "domain": "clickindia.com",
        "url": "https://www.clickindia.com/search.php?q={query}&city={location}",
    },
    "linkedin": {
        "label": "LinkedIn",
        "domain": "linkedin.com",
        "url": "https://www.linkedin.com/search/results/companies/?keywords={query}%20{location}",
    },
    "tofler": {
        "label": "Tofler",
        "domain": "tofler.in",
        "url": "https://www.tofler.in/companylist?q={query}",
    },
    "zaubacorp": {
        "label": "Zauba Corp",
        "domain": "zaubacorp.com",
        "url": "https://www.zaubacorp.com/companysearchresults/{query}",
    },
    "instagram": {
        "label": "Instagram",
        "domain": "instagram.com",
        "url": "https://www.google.com/search?q={query}+{location}+site%3Ainstagram.com",
    },
    "facebook": {
        "label": "Facebook",
        "domain": "facebook.com",
        "url": "https://www.google.com/search?q={query}+{location}+site%3Afacebook.com",
    },
    "justdial": {
        "label": "JustDial",
        "domain": "justdial.com",
        "url": "https://www.justdial.com/{location}/{query}",
    },
    "indiamart": {
        "label": "IndiaMart",
        "domain": "dir.indiamart.com",
        "url": "https://dir.indiamart.com/search.mp?ss={query}&cq={location}",
    },
    "tradeindia": {
        "label": "TradeIndia",
        "domain": "tradeindia.com",
        "url": "https://www.tradeindia.com/search.html?keyword={query}",
    },
    "sulekha": {
        "label": "Sulekha",
        "domain": "sulekha.com",
        "url": "https://www.sulekha.com/search?keyword={query}&location={location}",
    },
    "google_business": {
        "label": "Google Business",
        "domain": "google.com/business",
        "url": "https://www.google.com/search?q={query}+{location}+site%3Agoogle.com%2Fbusiness",
    },
    "startupindia": {
        "label": "Startup India",
        "domain": "startupindia.gov.in",
        "url": "https://www.startupindia.gov.in/content/sih/en/search.html?query={query}",
    },
    "mca": {
        "label": "MCA",
        "domain": "mca.gov.in",
        "url": "https://www.google.com/search?q={query}+{location}+site%3Amca.gov.in",
    },
}


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return token.strip()


def _current_user(authorization: str | None) -> dict[str, Any] | None:
    return get_user_by_token(_bearer_token(authorization))


def _require_user(authorization: str | None) -> dict[str, Any]:
    user = _current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Login required.")
    return user


def _require_admin(authorization: str | None, admin_token: str | None) -> dict[str, Any]:
    user = _require_user(authorization)
    if not user.get("is_nexg_admin"):
        raise HTTPException(status_code=403, detail="NexG Admin access required.")
    session = get_admin_session(admin_token or "", user["id"])
    if not session:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


def _require_permission(authorization: str | None, permission: str) -> dict[str, Any]:
    user = _require_user(authorization)
    if permission not in user.get("permissions", []):
        raise HTTPException(status_code=403, detail=f"You do not have access to {permission.replace('_', ' ')}.")
    return user


def _build_places_query(payload: LeadSearchRequest) -> str:
    parts = [
        payload.company_name.strip(),
        payload.business_type.strip(),
    ]

    return " ".join(part for part in parts if part).strip() or "businesses"


def _build_geocode_address(payload: LeadSearchRequest) -> str:
    parts = [
        payload.city_area.strip(),
        payload.pincode.strip(),
        "India",
    ]
    return " ".join(part for part in parts if part).strip()


def _geocode_address(address: str) -> dict[str, Any] | None:
    if not address or address == "India":
        return None

    query = urlencode({"address": address, "region": "in", "key": settings.google_places_api_key})
    request = Request(f"https://maps.googleapis.com/maps/api/geocode/json?{query}")

    try:
        with urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError):
        return None

    results = data.get("results") or []
    if data.get("status") != "OK" or not results:
        return None

    first = results[0]
    location = first.get("geometry", {}).get("location", {})
    if "lat" not in location or "lng" not in location:
        return None

    return {
        "latitude": location["lat"],
        "longitude": location["lng"],
        "formatted_address": first.get("formatted_address", address),
    }


def _display_name(place: dict[str, Any]) -> str:
    display_name = place.get("displayName") or {}
    return display_name.get("text") or "Unnamed business"


def _primary_type(place: dict[str, Any]) -> str:
    primary_type = place.get("primaryTypeDisplayName") or {}
    if primary_type.get("text"):
        return primary_type["text"]

    if place.get("primaryType"):
        return str(place["primaryType"]).replace("_", " ").title()

    types = place.get("types") or []
    if types:
        return str(types[0]).replace("_", " ").title()

    return "Business"


def _normalize_place(place: dict[str, Any]) -> dict[str, Any]:
    location = place.get("location") or {}
    return {
        "id": place.get("id") or place.get("name") or _display_name(place),
        "name": _display_name(place),
        "phone": place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber") or "",
        "address": place.get("formattedAddress") or place.get("shortFormattedAddress") or "",
        "business_type": _primary_type(place),
        "website": place.get("websiteUri") or "",
        "google_maps_url": place.get("googleMapsUri") or "",
        "rating": place.get("rating"),
        "status": place.get("businessStatus") or "",
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
    }


def _distance_km(
    first_latitude: float | None,
    first_longitude: float | None,
    second_latitude: float | None,
    second_longitude: float | None,
) -> float | None:
    if None in (first_latitude, first_longitude, second_latitude, second_longitude):
        return None

    earth_radius_km = 6371
    lat_1 = math.radians(float(first_latitude))
    lat_2 = math.radians(float(second_latitude))
    delta_lat = math.radians(float(second_latitude) - float(first_latitude))
    delta_lng = math.radians(float(second_longitude) - float(first_longitude))
    calculation = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_1) * math.cos(lat_2) * math.sin(delta_lng / 2) ** 2
    )
    return earth_radius_km * 2 * math.atan2(math.sqrt(calculation), math.sqrt(1 - calculation))


def _trim_json(data: Any, limit: int = 24000) -> str:
    if not data:
        return "{}"
    serialized = json.dumps(data, ensure_ascii=False, indent=2, default=str)
    if len(serialized) <= limit:
        return serialized
    return f"{serialized[:limit]}\n... [truncated]"


def _parse_json_object(value: str) -> dict[str, Any]:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(text[start:end + 1])
    if not isinstance(parsed, dict):
        raise json.JSONDecodeError("Expected a JSON object.", text, 0)
    return parsed


def _business_source_url(source_id: str, query: str, location: str) -> str:
    source = BUSINESS_SOURCES[source_id]
    formatted_location = quote_plus(location.strip() or "India")
    formatted_query = quote_plus(query.strip())
    return source["url"].format(query=formatted_query, location=formatted_location)


def _business_source_domain(source_id: str) -> str:
    return BUSINESS_SOURCES[source_id].get("domain", "")


def _clean_business_text(text: str, limit: int = 700) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return cleaned[:limit].strip()


def _is_business_result_link(href: str) -> bool:
    if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
        return False
    lowered = href.lower()
    blocked_extensions = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".css", ".js", ".pdf", ".zip")
    return not lowered.endswith(blocked_extensions)


def _domain_matches(url: str, source_domain: str) -> bool:
    if not source_domain:
        return True
    parsed = urlparse(url)
    source_domain = source_domain.lower().removeprefix("www.")
    host = parsed.netloc.lower().removeprefix("www.")
    path = parsed.path.lower()
    if "/" in source_domain:
        domain_host, domain_path = source_domain.split("/", 1)
        return host.endswith(domain_host) and path.startswith(f"/{domain_path}")
    return host.endswith(source_domain)


def _extract_google_target_url(href: str) -> str:
    parsed = urlparse(href)
    query = parse_qs(parsed.query)
    for key in ("q", "url"):
        values = query.get(key) or []
        for value in values:
            if value.startswith(("http://", "https://")):
                return value
    return href


def _source_lookup_result(source_id: str, query: str, location: str, error: str = "") -> dict[str, Any]:
    source = BUSINESS_SOURCES[source_id]
    search_url = _business_source_url(source_id, query, location)
    return {
        "id": f"{source_id}-lookup",
        "name": f"{source['label']} lookup for {query}",
        "source": source_id,
        "source_label": source["label"],
        "url": search_url,
        "search_url": search_url,
        "snippet": error or f"Open this {source['label']} search link to inspect matching profiles or listings.",
        "address": "",
        "phone": "",
        "email": "",
        "website": search_url,
        "business_type": query,
        "lookup_only": True,
    }


def _business_link_score(
    source_id: str,
    absolute_url: str,
    title: str,
    parent_text: str,
    query: str,
    location: str,
) -> int:
    parsed = urlparse(absolute_url)
    path = parsed.path.lower()
    combined_text = f"{title} {parent_text} {path}".lower()
    generic_titles = {
        "home",
        "login",
        "sign in",
        "register",
        "about us",
        "contact us",
        "privacy policy",
        "terms",
        "advertise",
        "help",
        "next",
        "previous",
    }
    if title.strip().lower() in generic_titles:
        return -20

    score = 0
    if len(title.strip()) >= 4:
        score += 10
    if len(parent_text) > len(title) + 20:
        score += 8
    if any(marker in path for marker in ("company", "business", "dealer", "supplier", "manufacturer", "service")):
        score += 10
    if source_id == "justdial" and any(part in path for part in ("-", "ct-", "pid-")):
        score += 8
    if source_id == "indiamart" and any(part in path for part in ("proddetail", "company", "impcat")):
        score += 8
    if source_id == "tradeindia" and any(part in path for part in ("supplier", "manufacturer", "company")):
        score += 8
    if source_id == "zaubacorp" and "/company/" in path:
        score += 14

    query_terms = [part.lower() for part in re.findall(r"[a-zA-Z0-9]+", query) if len(part) > 2]
    location_terms = [part.lower() for part in re.findall(r"[a-zA-Z0-9]+", location) if len(part) > 2]
    score += sum(4 for term in query_terms[:5] if term in combined_text)
    score += sum(3 for term in location_terms[:3] if term in combined_text)

    if any(skip in combined_text for skip in ("cookie", "javascript", "download app", "forgot password")):
        score -= 8
    return score


def _json_ld_values(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        values: list[dict[str, Any]] = []
        for item in data:
            values.extend(_json_ld_values(item))
        return values
    if not isinstance(data, dict):
        return []
    graph = data.get("@graph")
    values = _json_ld_values(graph) if graph else []
    entity_type = data.get("@type", "")
    entity_types = entity_type if isinstance(entity_type, list) else [entity_type]
    business_markers = {
        "LocalBusiness",
        "Organization",
        "Corporation",
        "Store",
        "Restaurant",
        "ProfessionalService",
        "Product",
    }
    if any(str(marker) in business_markers for marker in entity_types) or data.get("telephone") or data.get("address"):
        values.append(data)
    return values


def _flatten_address(address: Any) -> str:
    if isinstance(address, str):
        return _clean_business_text(address, 320)
    if isinstance(address, dict):
        parts = [
            address.get("streetAddress"),
            address.get("addressLocality"),
            address.get("addressRegion"),
            address.get("postalCode"),
            address.get("addressCountry"),
        ]
        return _clean_business_text(", ".join(str(part) for part in parts if part), 320)
    return ""


def _extract_structured_business_data(soup: BeautifulSoup) -> dict[str, str]:
    extracted: dict[str, str] = {}
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw_json = script.string or script.get_text(strip=True)
        if not raw_json:
            continue
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        for entity in _json_ld_values(parsed):
            if entity.get("name") and not extracted.get("name"):
                extracted["name"] = _clean_business_text(str(entity["name"]), 160)
            if entity.get("telephone") and not extracted.get("phone"):
                extracted["phone"] = _clean_business_text(str(entity["telephone"]), 80)
            if entity.get("email") and not extracted.get("email"):
                extracted["email"] = _clean_business_text(str(entity["email"]), 120)
            if entity.get("url") and not extracted.get("website"):
                extracted["website"] = _clean_business_text(str(entity["url"]), 300)
            address = _flatten_address(entity.get("address"))
            if address and not extracted.get("address"):
                extracted["address"] = address
    return extracted


def _reader_url(url: str) -> str:
    return f"https://r.jina.ai/{url}"


def _reader_detail(url: str, session: requests.Session) -> dict[str, Any]:
    try:
        response = session.get(_reader_url(url), timeout=18, allow_redirects=True)
        if response.status_code >= 400:
            return {}
    except requests.RequestException:
        return {}

    text = _clean_business_text(response.text, 3200)
    if not text:
        return {}

    title = ""
    description = ""
    for line in response.text.splitlines():
        clean_line = line.strip()
        if clean_line.lower().startswith("title:") and not title:
            title = _clean_business_text(clean_line.split(":", 1)[1], 180)
        elif clean_line and not clean_line.lower().startswith(("url source:", "markdown content:")) and not description:
            description = _clean_business_text(clean_line, 500)
        if title and description:
            break

    links: list[str] = []
    for _label, link in re.findall(r"\[([^\]]{2,180})\]\((https?://[^)\s]+)\)", response.text):
        if _is_business_result_link(link) and link not in links:
            links.append(link)
        if len(links) >= 8:
            break

    return {
        "detail_title": title,
        "detail_description": description,
        "detail_text": text,
        "structured_name": title,
        "structured_address": "",
        "structured_phone": "",
        "structured_email": "",
        "structured_website": url,
        "emails": sorted(set(EMAIL_RE.findall(response.text))),
        "phones": sorted(set(match.strip() for match in PHONE_RE.findall(text)))[:8],
        "external_links": links,
        "reader_fallback": True,
    }


def _scrape_business_detail(url: str, session: requests.Session) -> dict[str, Any]:
    try:
        response = session.get(url, timeout=10, allow_redirects=True)
        if response.status_code >= 400 or "text/html" not in response.headers.get("content-type", "").lower():
            return _reader_detail(url, session)
    except requests.RequestException:
        return _reader_detail(url, session)

    soup = BeautifulSoup(response.text, "html.parser")
    structured_data = _extract_structured_business_data(soup)
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = _clean_business_text(soup.get_text(" ", strip=True), 1800)
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    description_tag = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    description = str(description_tag.get("content", "")).strip() if description_tag else ""
    website_links: list[str] = []
    current_host = urlparse(response.url).netloc.lower().removeprefix("www.")

    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        if not _is_business_result_link(href):
            continue
        absolute_url = urljoin(response.url, href)
        parsed = urlparse(absolute_url)
        if parsed.scheme not in {"http", "https"}:
            continue
        host = parsed.netloc.lower().removeprefix("www.")
        if host and host != current_host and absolute_url not in website_links:
            website_links.append(absolute_url)
        if len(website_links) >= 5:
            break

    return {
        "detail_title": title,
        "detail_description": description,
        "detail_text": text,
        "structured_name": structured_data.get("name", ""),
        "structured_address": structured_data.get("address", ""),
        "structured_phone": structured_data.get("phone", ""),
        "structured_email": structured_data.get("email", ""),
        "structured_website": structured_data.get("website", ""),
        "emails": sorted(set(EMAIL_RE.findall(response.text))),
        "phones": sorted(set(match.strip() for match in PHONE_RE.findall(text)))[:8],
        "external_links": website_links,
    }


def _reader_business_source_results(source_id: str, query: str, location: str, limit: int, search_url: str, previous_error: str = "") -> dict[str, Any]:
    source = BUSINESS_SOURCES[source_id]
    source_domain = _business_source_domain(source_id)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        }
    )
    detail = _reader_detail(search_url, session)
    if not detail:
        return {
            "source": source_id,
            "label": source["label"],
            "search_url": search_url,
            "results": [],
            "error": previous_error or f"{source['label']} could not be read with the fallback reader.",
        }

    seen: set[str] = set()
    candidates: list[dict[str, Any]] = []
    for label, link in re.findall(r"\[([^\]]{2,180})\]\((https?://[^)\s]+)\)", detail.get("detail_text", "")):
        if link in seen or not _is_business_result_link(link):
            continue
        if source_domain and not _domain_matches(link, source_domain):
            continue
        seen.add(link)
        title = _clean_business_text(label, 140)
        parent_text = _clean_business_text(title, 500)
        score = _business_link_score(source_id, link, title, parent_text, query, location)
        if score < 0:
            continue
        candidates.append({"score": score, "title": title, "url": link, "parent_text": parent_text})

    candidates.sort(key=lambda item: item["score"], reverse=True)
    results: list[dict[str, Any]] = []
    for candidate in candidates[:limit]:
        result = {
            "id": f"{source_id}-{len(results) + 1}",
            "name": candidate["title"],
            "source": source_id,
            "source_label": source["label"],
            "url": candidate["url"],
            "search_url": search_url,
            "snippet": candidate["parent_text"],
            "address": "",
            "phone": "",
            "email": "",
            "website": candidate["url"],
            "business_type": query,
            "source_score": candidate["score"],
            "reader_fallback": True,
        }
        page_detail = _scrape_business_detail(candidate["url"], session)
        if page_detail:
            result.update(page_detail)
            result["name"] = page_detail.get("structured_name") or result["name"] or page_detail.get("detail_title", "")
            result["snippet"] = page_detail.get("detail_description") or result["snippet"] or page_detail.get("detail_text", "")[:500]
            phones = page_detail.get("phones") or []
            emails = page_detail.get("emails") or []
            external_links = page_detail.get("external_links") or []
            result["phone"] = page_detail.get("structured_phone") or (phones[0] if phones else "")
            result["email"] = page_detail.get("structured_email") or (emails[0] if emails else "")
            result["address"] = page_detail.get("structured_address") or result["address"]
            result["website"] = page_detail.get("structured_website") or (external_links[0] if external_links else result["website"])
        results.append(result)

    if not results:
        results.append(
            {
                "id": f"{source_id}-1",
                "name": detail.get("detail_title") or source["label"],
                "source": source_id,
                "source_label": source["label"],
                "url": search_url,
                "search_url": search_url,
                "snippet": detail.get("detail_description") or detail.get("detail_text", "")[:500],
                "detail_text": detail.get("detail_text", ""),
                "address": "",
                "phone": (detail.get("phones") or [""])[0],
                "email": (detail.get("emails") or [""])[0],
                "website": search_url,
                "business_type": query,
                "source_score": 0,
                "reader_fallback": True,
            }
        )

    return {
        "source": source_id,
        "label": source["label"],
        "search_url": search_url,
        "results": results,
        "error": previous_error,
        "fallback": "jina_reader",
    }


def _scrape_business_source(source_id: str, query: str, location: str, limit: int) -> dict[str, Any]:
    search_url = _business_source_url(source_id, query, location)
    source = BUSINESS_SOURCES[source_id]
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        }
    )

    try:
        response = session.get(search_url, timeout=14, allow_redirects=True)
    except requests.RequestException as exc:
        return _reader_business_source_results(source_id, query, location, limit, search_url, str(exc))

    if response.status_code >= 400:
        return _reader_business_source_results(
            source_id,
            query,
            location,
            limit,
            search_url,
            f"{source['label']} returned HTTP {response.status_code}.",
        )

    soup = BeautifulSoup(response.text, "html.parser")
    parsed_search_url = urlparse(response.url)
    search_host = parsed_search_url.netloc.lower().removeprefix("www.")
    source_domain = _business_source_domain(source_id)
    is_google_search_page = "google." in search_host
    seen: set[str] = set()
    candidates: list[dict[str, Any]] = []

    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        if not _is_business_result_link(href):
            continue

        absolute_url = urljoin(response.url, href)
        if is_google_search_page:
            absolute_url = _extract_google_target_url(absolute_url)
        parsed = urlparse(absolute_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue

        host = parsed.netloc.lower().removeprefix("www.")
        if is_google_search_page:
            if source_domain and not _domain_matches(absolute_url, source_domain):
                continue
        elif search_host and host != search_host:
            continue

        title = _clean_business_text(anchor.get_text(" ", strip=True), 140)
        if len(title) < 3:
            continue
        if absolute_url in seen:
            continue
        seen.add(absolute_url)

        parent_text = _clean_business_text(anchor.parent.get_text(" ", strip=True) if anchor.parent else title)
        score = _business_link_score(source_id, absolute_url, title, parent_text, query, location)
        if score < 0:
            continue
        candidates.append(
            {
                "score": score,
                "title": title,
                "url": absolute_url,
                "parent_text": parent_text,
            }
        )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    results: list[dict[str, Any]] = []
    for candidate in candidates[:limit]:
        results.append(
            {
                "id": f"{source_id}-{len(results) + 1}",
                "name": candidate["title"],
                "source": source_id,
                "source_label": source["label"],
                "url": candidate["url"],
                "search_url": response.url,
                "snippet": candidate["parent_text"],
                "address": "",
                "phone": "",
                "website": "",
                "business_type": query,
                "source_score": candidate["score"],
            }
        )

    if not results:
        reader_report = _reader_business_source_results(source_id, query, location, limit, response.url)
        if reader_report.get("results"):
            return reader_report
        page_title = soup.title.string.strip() if soup.title and soup.title.string else source["label"]
        page_text = _clean_business_text(soup.get_text(" ", strip=True), 900)
        results.append({"id": f"{source_id}-1", "name": page_title, "source": source_id, "source_label": source["label"], "url": response.url, "search_url": response.url, "snippet": page_text, "address": "", "phone": "", "website": "", "business_type": query, "source_score": 0})

    for result in results[: min(8, len(results))]:
        detail = _scrape_business_detail(result["url"], session)
        if detail:
            result.update(detail)
            result["name"] = detail.get("structured_name") or result["name"] or detail.get("detail_title", "")
            result["snippet"] = detail.get("detail_description") or result["snippet"] or detail.get("detail_text", "")[:500]
            phones = detail.get("phones") or []
            emails = detail.get("emails") or []
            external_links = detail.get("external_links") or []
            result["phone"] = detail.get("structured_phone") or (phones[0] if phones else "")
            result["email"] = detail.get("structured_email") or (emails[0] if emails else "")
            result["address"] = detail.get("structured_address") or result["address"]
            result["website"] = detail.get("structured_website") or (external_links[0] if external_links else "")

    return {
        "source": source_id,
        "label": source["label"],
        "search_url": response.url,
        "results": results,
        "error": "" if results else f"No scrapeable {source['label']} results were found on the returned page.",
    }


def _custom_search_business_source(source_id: str, query: str, location: str, limit: int) -> dict[str, Any]:
    source = BUSINESS_SOURCES[source_id]
    domain = _business_source_domain(source_id)
    search_url = _business_source_url(source_id, query, location)
    if not settings.google_search_api_key or not settings.google_search_engine_id:
        return {
            "source": source_id,
            "label": source["label"],
            "search_url": search_url,
            "results": [],
            "error": "GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID is not configured.",
        }

    search_text = " ".join(part for part in [query.strip(), location.strip()] if part)
    site_query = f"{search_text} site:{domain}" if domain else search_text
    params = urlencode(
        {
            "key": settings.google_search_api_key,
            "cx": settings.google_search_engine_id,
            "q": site_query,
            "num": min(10, max(1, limit)),
        }
    )
    api_url = f"https://www.googleapis.com/customsearch/v1?{params}"
    try:
        request = Request(api_url)
        with urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        try:
            parsed_error = json.loads(details)
            message = parsed_error.get("error", {}).get("message", details)
        except json.JSONDecodeError:
            message = details
        return {
            "source": source_id,
            "label": source["label"],
            "search_url": search_url,
            "results": [],
            "error": f"Google Custom Search failed: {message}",
        }
    except URLError as exc:
        return {
            "source": source_id,
            "label": source["label"],
            "search_url": search_url,
            "results": [],
            "error": f"Could not reach Google Custom Search: {exc.reason}",
        }

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        }
    )
    results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for item in data.get("items") or []:
        link = item.get("link", "")
        if not link or link in seen_urls:
            continue
        if domain and domain.replace("www.", "") not in urlparse(link).netloc.lower() + urlparse(link).path.lower():
            continue
        seen_urls.add(link)
        pagemap = item.get("pagemap") or {}
        metatags = (pagemap.get("metatags") or [{}])[0]
        result = {
            "id": f"{source_id}-{len(results) + 1}",
            "name": item.get("title") or source["label"],
            "source": source_id,
            "source_label": source["label"],
            "url": link,
            "search_url": search_url,
            "snippet": item.get("snippet") or "",
            "address": "",
            "phone": metatags.get("telephone", ""),
            "email": metatags.get("email", ""),
            "website": metatags.get("og:url", "") or link,
            "business_type": query,
            "custom_search": True,
        }
        results.append(result)
        if len(results) >= limit:
            break

    for result in results[: min(6, len(results))]:
        detail = _scrape_business_detail(result["url"], session)
        if detail:
            result.update(detail)
            result["name"] = detail.get("structured_name") or result["name"] or detail.get("detail_title", "")
            result["snippet"] = detail.get("detail_description") or result["snippet"] or detail.get("detail_text", "")[:500]
            phones = detail.get("phones") or []
            emails = detail.get("emails") or []
            external_links = detail.get("external_links") or []
            result["phone"] = detail.get("structured_phone") or result.get("phone") or (phones[0] if phones else "")
            result["email"] = detail.get("structured_email") or result.get("email") or (emails[0] if emails else "")
            result["address"] = detail.get("structured_address") or result["address"]
            result["website"] = detail.get("structured_website") or result.get("website") or (external_links[0] if external_links else "")

    return {
        "source": source_id,
        "label": source["label"],
        "search_url": search_url,
        "results": results,
        "error": "" if results else f"No Custom Search results found for {source['label']}.",
    }


def _business_places_results(query: str, location: str, limit: int, radius_km: int = 25) -> dict[str, Any]:
    if not settings.google_places_api_key:
        return {
            "source": "google_maps",
            "label": "Google Maps",
            "search_url": "",
            "results": [],
            "error": "GOOGLE_PLACES_API_KEY is not configured.",
        }

    center = _geocode_address(f"{location} India".strip())
    request_body: dict[str, Any] = {
        "textQuery": " ".join(part for part in [query.strip(), location.strip()] if part),
        "pageSize": min(20, max(3, limit)),
        "regionCode": "IN",
        "languageCode": "en",
        "includePureServiceAreaBusinesses": True,
    }
    if center:
        request_body["locationBias"] = {
            "circle": {
                "center": {"latitude": center["latitude"], "longitude": center["longitude"]},
                "radius": radius_km * 1000,
            }
        }

    request = Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps(request_body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": settings.google_places_api_key,
            "X-Goog-FieldMask": (
                "places.id,places.name,places.displayName,places.formattedAddress,"
                "places.shortFormattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,"
                "places.websiteUri,places.googleMapsUri,places.rating,places.businessStatus,places.types,"
                "places.primaryType,places.primaryTypeDisplayName"
            ),
        },
    )

    try:
        with urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        return {
            "source": "google_maps",
            "label": "Google Maps",
            "search_url": "",
            "results": [],
            "error": f"Google Places API request failed: {details}",
        }
    except URLError as exc:
        return {
            "source": "google_maps",
            "label": "Google Maps",
            "search_url": "",
            "results": [],
            "error": f"Could not reach Google Places API: {exc.reason}",
        }

    results = []
    for index, place in enumerate((data.get("places") or [])[:limit], start=1):
        lead = _normalize_place(place)
        results.append(
            {
                "id": f"google_maps-{index}",
                "name": lead["name"],
                "source": "google_maps",
                "source_label": "Google Maps",
                "url": lead["google_maps_url"],
                "search_url": lead["google_maps_url"],
                "snippet": lead["address"],
                "address": lead["address"],
                "phone": lead["phone"],
                "website": lead["website"],
                "business_type": lead["business_type"],
                "rating": lead["rating"],
                "status": lead["status"],
            }
        )

    return {
        "source": "google_maps",
        "label": "Google Maps",
        "search_url": "",
        "results": results,
        "error": "" if results else "No Google Maps results found.",
    }


def _chat_completion(messages: list[dict[str, str]], *, response_format: dict[str, Any] | None = None, max_tokens: int = 750) -> str:
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured.")

    request_body = {
        "model": settings.openai_model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }
    if response_format is not None:
        request_body["response_format"] = response_format
    request = Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(request_body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(request, timeout=28) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        try:
            parsed_details = json.loads(details)
            message = parsed_details.get("error", {}).get("message", "OpenAI request failed.")
        except json.JSONDecodeError:
            message = "OpenAI request failed."
        raise HTTPException(status_code=exc.code, detail=message) from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach OpenAI: {exc.reason}") from exc

    try:
        if data["choices"][0].get("finish_reason") == "length":
            raise HTTPException(status_code=502, detail="The AI response was cut short. Please simplify the question and try again.")
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="OpenAI returned an unexpected response.") from exc


def _find_company_website_with_places(name: str, address: str = "") -> str:
    if not settings.google_places_api_key:
        return ""

    request = Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps(
            {
                "textQuery": " ".join(part for part in [name.strip(), address.strip()] if part),
                "pageSize": 3,
                "languageCode": "en",
            }
        ).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": settings.google_places_api_key,
            "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError):
        return ""

    for place in data.get("places") or []:
        if place.get("websiteUri"):
            return str(place["websiteUri"])
    return ""


def _find_social_profiles_with_openai(name: str, address: str = "", website: str = "") -> dict[str, Any]:
    if not settings.openai_api_key:
        return {"profiles": [], "error": "OPENAI_API_KEY is not configured."}

    allowed_domains = {
        "instagram": "instagram.com",
        "facebook": "facebook.com",
        "youtube": "youtube.com",
        "linkedin": "linkedin.com",
    }
    prompt = (
        "Find the official social media profiles for the company described below. "
        "Use web search and return only profiles that clearly belong to this company. "
        "Return only valid JSON in this exact shape: "
        '{"profiles":[{"platform":"instagram|facebook|youtube|linkedin",'
        '"label":"Instagram|Facebook|YouTube|LinkedIn","url":"https://...",'
        '"title":"profile title"}]}. '
        "Do not return search-result URLs, guessed URLs, explanations, or markdown.\n"
        f"Company name: {name}\nAddress: {address}\nOfficial website: {website}"
    )
    request_body = {
        "model": settings.openai_model,
        "tools": [{"type": "web_search"}],
        "input": prompt,
        "max_output_tokens": 1000,
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=35) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(details).get("error", {}).get("message", "OpenAI web search failed.")
        except json.JSONDecodeError:
            message = "OpenAI web search failed."
        return {"profiles": [], "error": message}
    except URLError as exc:
        return {"profiles": [], "error": f"Could not reach OpenAI: {exc.reason}"}

    output_text = "".join(
        content.get("text", "")
        for item in data.get("output") or []
        if item.get("type") == "message"
        for content in item.get("content") or []
        if content.get("type") == "output_text"
    ).strip()
    try:
        start, end = output_text.index("{"), output_text.rindex("}") + 1
        candidates = json.loads(output_text[start:end]).get("profiles") or []
    except (ValueError, json.JSONDecodeError, AttributeError):
        return {"profiles": [], "error": "OpenAI web search returned an unreadable result."}

    profiles: list[dict[str, str]] = []
    seen_platforms: set[str] = set()
    for candidate in candidates:
        platform = str(candidate.get("platform", "")).lower()
        url = str(candidate.get("url", "")).strip()
        parsed = urlparse(url)
        expected_domain = allowed_domains.get(platform)
        host = parsed.netloc.lower().removeprefix("www.")
        if (
            not expected_domain
            or platform in seen_platforms
            or parsed.scheme != "https"
            or (host != expected_domain and not host.endswith(f".{expected_domain}"))
        ):
            continue
        seen_platforms.add(platform)
        profiles.append(
            {
                "platform": platform,
                "label": str(candidate.get("label") or platform.title()),
                "url": url,
                "title": str(candidate.get("title") or f"{name} on {platform.title()}"),
            }
        )
    return {"profiles": profiles, "error": ""}


def _find_social_profiles(name: str, address: str = "", website: str = "") -> dict[str, Any]:
    platforms = [
        ("instagram", "Instagram", "instagram.com"),
        ("facebook", "Facebook", "facebook.com"),
        ("youtube", "YouTube", "youtube.com"),
        ("linkedin", "LinkedIn", "linkedin.com/company"),
    ]
    location_hint = " ".join(address.split(",")[:2])
    fallback_searches = [
        {
            "platform": platform_id,
            "label": label,
            "url": f"https://www.google.com/search?{urlencode({'q': f'{name} {location_hint} site:{domain}'})}",
        }
        for platform_id, label, domain in platforms
    ]

    if not settings.google_search_api_key or not settings.google_search_engine_id:
        return {
            "profiles": [],
            "fallback_searches": fallback_searches,
            "error": "GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID is not configured.",
        }

    profiles: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    errors: list[str] = []

    resolved_website = website.strip() or _find_company_website_with_places(name, address)

    # Google Places supplies the selected company's official website. Prefer
    # social links published by that website because they are stronger matches
    # than similarly named accounts returned by a general web search.
    if resolved_website:
        try:
            website_scrape = scrape_website(resolved_website, CrawlOptions(max_pages=4, timeout=12))
            external_links = [
                link.get("url", "")
                for page in website_scrape.get("pages") or []
                for link in (page.get("links") or {}).get("external") or []
            ]
            for platform_id, label, domain in platforms:
                domain_root = domain.split("/")[0]
                for link in external_links:
                    parsed_host = urlparse(link).netloc.lower().removeprefix("www.")
                    if parsed_host != domain_root and not parsed_host.endswith(f".{domain_root}"):
                        continue
                    if platform_id == "linkedin" and "/company/" not in urlparse(link).path.lower():
                        continue
                    clean_link = link.split("?", 1)[0].rstrip("/")
                    if clean_link in seen_urls:
                        continue
                    seen_urls.add(clean_link)
                    profiles.append(
                        {
                            "platform": platform_id,
                            "label": label,
                            "url": clean_link,
                            "title": f"{name} on {label}",
                        }
                    )
                    break
        except (ValueError, requests.RequestException):
            pass

    for platform_id, label, domain in platforms:
        if any(profile["platform"] == platform_id for profile in profiles):
            continue
        query_variants = [
            f'"{name}" {location_hint} site:{domain}'.strip(),
            f'{name} {location_hint} {label}'.strip(),
            f'"{name}" "{label}"'.strip(),
        ]
        for query_text in query_variants:
            query = urlencode(
                {
                    "key": settings.google_search_api_key,
                    "cx": settings.google_search_engine_id,
                    "q": query_text,
                    "num": 5,
                }
            )
            request = Request(f"https://www.googleapis.com/customsearch/v1?{query}")
            try:
                with urlopen(request, timeout=12) as response:
                    data = json.loads(response.read().decode("utf-8"))
            except HTTPError as exc:
                details = exc.read().decode("utf-8", errors="replace")
                try:
                    error_data = json.loads(details)
                    message = error_data.get("error", {}).get("message", details)
                except json.JSONDecodeError:
                    message = details
                errors.append(message)
                break
            except URLError as exc:
                errors.append(f"Could not reach Google Custom Search: {exc.reason}")
                break

            matched_profile = None
            for item in data.get("items") or []:
                link = item.get("link", "")
                if domain.replace("/company", "") not in link or link in seen_urls:
                    continue
                matched_profile = {
                    "platform": platform_id,
                    "label": label,
                    "url": link,
                    "title": item.get("title", label),
                }
                break

            if matched_profile:
                seen_urls.add(matched_profile["url"])
                profiles.append(matched_profile)
                break

    if not profiles:
        openai_result = _find_social_profiles_with_openai(name, address, resolved_website)
        profiles = openai_result.get("profiles") or []
        if not profiles and openai_result.get("error"):
            errors.append(str(openai_result["error"]))

    return {
        "profiles": profiles,
        "fallback_searches": fallback_searches,
        "error": errors[0] if errors and not profiles else "",
    }


@app.post("/api/auth/register")
def register(payload: RegisterRequest) -> dict[str, Any]:
    raise HTTPException(status_code=403, detail="Account registration is disabled for this internal workspace.")


@app.post("/api/auth/login")
def login(payload: AuthRequest) -> dict[str, Any]:
    email = payload.email.strip().lower()
    user_row = get_user_by_email(email)
    if not user_row or not verify_password(payload.password, user_row["password_salt"], user_row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_token()
    create_session(user_row["id"], token)
    session_user = get_user_by_token(token)
    return {
        "token": token,
        "user": session_user or {
            "id": user_row["id"],
            "name": user_row["name"],
            "email": user_row["email"],
        },
    }


@app.get("/api/auth/me")
def me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_user(authorization)
    return {"user": user}


@app.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)) -> dict[str, bool]:
    token = _bearer_token(authorization)
    if token:
        delete_session(token)
    return {"ok": True}


@app.get("/api/used-oil-india/tables")
def used_oil_india_tables(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "used_oil_india")
    return {"tables": list_used_oil_tables()}


@app.get("/api/used-oil-india/tables/{table_name}/schema")
def used_oil_india_schema(table_name: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "used_oil_india")
    return used_oil_table_schema(table_name)


@app.get("/api/used-oil-india/tables/{table_name}/rows")
def used_oil_india_rows(table_name: str, limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0), search: str = "", authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "used_oil_india")
    return list_used_oil_rows(table_name, limit, offset, search)


@app.post("/api/used-oil-india/tables/{table_name}/rows")
def used_oil_india_create_row(table_name: str, payload: UsedOilRowRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "used_oil_india")
    return create_used_oil_row(table_name, payload.values)


@app.put("/api/used-oil-india/tables/{table_name}/rows/{row_id}")
def used_oil_india_update_row(table_name: str, row_id: str, payload: UsedOilRowRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "used_oil_india")
    return update_used_oil_row(table_name, row_id, payload.values)


@app.delete("/api/used-oil-india/tables/{table_name}/rows/{row_id}")
def used_oil_india_delete_row(table_name: str, row_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "used_oil_india")
    return delete_used_oil_row(table_name, row_id)


@app.post("/api/used-oil-india/chat")
def used_oil_india_chat(payload: UsedOilChatRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "used_oil_india")
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="A question is required.")
    if not settings.openai_api_key or settings.openai_api_key.startswith("your_"):
        return {
            "answer": "Neha is connected to the Used Oil India database, but the OpenAI API key is not configured yet. Add a real OPENAI_API_KEY in .env, restart the backend, and I can answer questions from these tables.",
            "sql": None,
            "rows": [],
            "model": settings.openai_model,
        }

    selected_table = payload.table_name.strip()
    catalog = used_oil_schema_overview()
    all_allowed_tables = {table["table_name"] for table in catalog["tables"]}
    relation_hints = [
        f"{item['source_table']}.{item['source_column']} -> {item['target_table']}.{item['target_column']}"
        for item in catalog["relationships"]
    ]
    selection_messages = [
        {
            "role": "system",
            "content": (
                "You select the Used Oil India MySQL tables needed to answer a user question. "
                "Return strict JSON with tables and notes. Choose exact table_name values only. "
                "Include bridge/parent tables required for joins using the relationship map. "
                "Prefer 1 to 8 tables. Include the currently viewed table when it is relevant. "
                "If the question is a greeting or not data-related, return an empty tables array."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Currently viewed table: {selected_table or 'none'}\n\n"
                f"Tables and columns:\n{_trim_json([{k: v for k, v in table.items() if k != 'primary_key'} for table in catalog['tables']], 22000)}\n\n"
                f"Relationships:\n{_trim_json(relation_hints, 12000)}\n\n"
                f"Question: {question}"
            ),
        },
    ]
    selection_raw = _chat_completion(selection_messages, response_format=USED_OIL_TABLE_SELECTION_FORMAT, max_tokens=1200)
    try:
        selection = _parse_json_object(selection_raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Neha could not identify the relevant Used Oil India tables.") from exc
    selected_tables = [table for table in selection.get("tables", []) if table in all_allowed_tables]
    if selected_table in all_allowed_tables and selected_table not in selected_tables:
        selected_tables.insert(0, selected_table)
    if not selected_tables:
        return {"answer": selection.get("notes") or "Ask me about a Used Oil India table, user, job, generator, recycler, city, or status.", "sql": None, "rows": [], "model": settings.openai_model}

    planning_schema = used_oil_focused_schema(set(selected_tables[:10]))
    allowed_tables = {table["table_name"] for table in planning_schema["tables"]}
    sample_table_names = [table["table_name"] for table in planning_schema["tables"][:8]]
    samples = sample_used_oil_rows(sample_table_names, 3)
    recent_history = [
        {"role": message.role, "content": message.content}
        for message in payload.history[-6:]
        if message.role in {"user", "assistant"} and message.content.strip()
    ]

    sql_messages = [
        {
            "role": "system",
            "content": (
                "You are Neha, the Used Oil India data assistant inside NexGTools. "
                "Generate one safe MySQL SELECT statement to answer the user's question from imported relational Used Oil India tables. "
                "Use only exact table_name values that start with uoi_ and exact column names from the provided schema. "
                "Never use INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, SET, CALL, comments, multiple statements, information_schema, or non-uoi tables. "
                "Return strict JSON only with keys sql and notes. For greetings, identity questions, or questions that need clarification, return sql:null and answer in notes. "
                "Use the provided relationships for joins. Join source_table.source_column to target_table.target_column exactly as shown. "
                "Use aliases for joined tables. When joining users multiple times, choose meaningful aliases such as generator_user, recycler_user, agent_user, retail_user, or agency_user. "
                "For broad questions, prefer useful summaries with counts, totals, statuses, cities, roles, jobs, generators, recyclers, agents, requirements, wallets, or recent records. "
                "For lookup questions about a person, company, phone, email, city, state, job code, GSTIN, PAN, recycler, generator, or agent, filter relevant text columns with LOWER(column) LIKE LOWER('%value%'). "
                "When showing records, select identifying columns and add LIMIT 100. For counts, totals, groups, and rankings, query the full table. "
                "Quote identifiers with backticks. Use CAST(REPLACE(column, ',', '') AS DECIMAL(18,2)) for numeric-looking text when needed. Do not invent data."
            ),
        },
        {"role": "user", "content": f"Relevant relational schema:\n{_trim_json(planning_schema, 24000)}\n\nSample rows:\n{_trim_json(samples, 12000)}"},
        *recent_history,
        {"role": "user", "content": question},
    ]
    generated = _chat_completion(sql_messages, response_format=ANALYTICS_QUERY_FORMAT, max_tokens=1800)
    sql, clarification = _analytics_query_plan(generated)
    if sql is None:
        return {"answer": clarification, "sql": None, "rows": [], "model": settings.openai_model}

    result = None
    validation_error = ""
    for attempt in range(2):
        try:
            sql = validate_used_oil_select(sql, allowed_tables)
            result = execute_used_oil_select(sql, allowed_tables)
            break
        except Exception as exc:
            validation_error = str(exc)
            if attempt == 1:
                break
            repair = _chat_completion(
                [
                    {
                        "role": "system",
                        "content": (
                            "Repair the MySQL SELECT for Used Oil India data. Return strict JSON with sql and notes. "
                            "Use only uoi_ tables, schema columns, and provided relationships for joins. If the question cannot be answered, return sql:null with a concise clarification."
                        ),
                    },
                    {"role": "user", "content": f"Relevant relational schema:\n{_trim_json(planning_schema, 24000)}\n\nQuestion: {question}\n\nRejected SQL:\n{sql}\n\nError: {validation_error}"},
                ],
                response_format=ANALYTICS_QUERY_FORMAT,
                max_tokens=1800,
            )
            sql, clarification = _analytics_query_plan(repair)
            if sql is None:
                return {"answer": clarification, "sql": None, "rows": [], "model": settings.openai_model}
    if result is None:
        raise HTTPException(status_code=400, detail={"message": "Neha could not create a valid Used Oil India query. Please ask about a specific table, city, user, job, wallet, generator, recycler, or status.", "sql": sql, "error": validation_error})

    answer = _chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You are Neha, the Used Oil India data assistant. Explain the executed query results in the user's language. "
                    "Answer directly, use only the rows provided, mention if no rows matched, and keep it concise. "
                    "If rows are limited, say the result is showing a limited set. Mention relevant joined context when it appears in the rows."
                ),
            },
            {"role": "user", "content": f"Question: {question}\n\nSQL executed:\n{result['sql']}\n\nRows:\n{_trim_json(result['rows'], 12000)}"},
        ],
        max_tokens=900,
    )
    return {"answer": answer, "sql": result["sql"], "rows": result["rows"], "model": settings.openai_model}



def _process_document(file_id: str, job_id: str) -> None:
    from .database import db_connection
    try:
        record_count = ingest(file_id)
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE document_processing_jobs SET status='completed', stage='keyword search', records_created=%s WHERE id=%s", (record_count, job_id))
    except Exception as exc:
        with db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE document_files SET status='failed', error_message=%s WHERE id=%s", (str(exc)[:2000], file_id))
                cursor.execute("UPDATE document_processing_jobs SET status='failed', error_message=%s WHERE id=%s", (str(exc)[:2000], job_id))


@app.get("/api/documents/template")
def download_document_template(authorization: str | None = Header(default=None)) -> StreamingResponse:
    _require_permission(authorization, "data_library")
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Data Upload"
    worksheet.append([
        "GSTIN", "LEGAL NAME", "Pincode", "Trade Name", "BUSINESS_CONST",
        "Mobile No.", "E-Mail", "Address", "Location",
    ])
    for cell in worksheet[1]:
        cell.font = cell.font.copy(bold=True)
    worksheet.freeze_panes = "A2"
    for column in worksheet.columns:
        letter = column[0].column_letter
        worksheet.column_dimensions[letter].width = max(14, len(str(column[0].value)) + 2)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="data-upload-template.xlsx"'},
    )


@app.get("/api/documents")
def get_documents(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_library")
    return {"files": list_files(user["id"])}


@app.post("/api/documents", status_code=202)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_permission(authorization, "data_library")
    temporary: Path | None = None
    try:
        filename, extension = validate_upload(file.filename or "document")
        storage = Path(settings.document_storage_directory) / str(user["id"])
        storage.mkdir(parents=True, exist_ok=True)
        temporary = Path(tempfile.mkstemp(prefix="upload-", suffix=Path(filename).suffix, dir=storage)[1])
        total = 0
        with temporary.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > settings.document_max_upload_mb * 1024 * 1024:
                    raise ValueError(f"File exceeds the {settings.document_max_upload_mb} MB limit.")
                output.write(chunk)
        validate_workbook(temporary, extension)
        created = create_file(user["id"], filename, file.content_type or "", temporary)
        background_tasks.add_task(_process_document, created["file_id"], created["job_id"])
        return {"file": created, "status": "queued"}
    except ValueError as exc:
        if temporary:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()


@app.delete("/api/documents/{file_id}")
def delete_document(file_id: str, authorization: str | None = Header(default=None)) -> dict[str, bool]:
    user = _require_permission(authorization, "data_library")
    try:
        delete_file(user["id"], file_id)
        return {"deleted": True}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/documents/{file_id}/contents")
def get_document_contents(file_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_library")
    try:
        return {"sheets": file_contents(user["id"], file_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/documents/{file_id}/diagnostics")
def get_document_diagnostics(file_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_library")
    try:
        return run_diagnostics(user["id"], file_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/documents/{file_id}/cell")
def update_document_cell(file_id: str, payload: DocumentCellUpdate, authorization: str | None = Header(default=None)) -> dict[str, bool]:
    user = _require_permission(authorization, "data_library")
    try:
        update_cell(user["id"], file_id, payload.sheet_id, payload.record_number, payload.column, payload.value)
        return {"updated": True}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/api/documents/{file_id}/records/tag")
def update_document_record_tag(file_id: str, payload: DocumentRecordTagUpdate, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_library")
    try:
        tags = update_record_tag(user["id"], file_id, payload.sheet_id, payload.record_number, payload.tag, payload.enabled)
        return {"updated": True, "tags": tags}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/api/documents/{file_id}/records/tags")
def update_document_file_tag(file_id: str, payload: DocumentFileTagUpdate, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_library")
    try:
        updated_count = update_file_tag(user["id"], file_id, payload.tag, payload.enabled)
        return {"updated": True, "updated_count": updated_count}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/documents/{file_id}/records/{sheet_name}/{record_number}")
def delete_document_record(file_id: str, sheet_name: str, record_number: int, authorization: str | None = Header(default=None)) -> dict[str, bool]:
    user = _require_permission(authorization, "data_library")
    try:
        delete_record(user["id"], file_id, sheet_name, record_number)
        return {"deleted": True}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/documents/{file_id}/download")
def download_document(file_id: str, authorization: str | None = Header(default=None)) -> FileResponse:
    user = _require_permission(authorization, "data_library")
    try:
        path, filename, content_type = file_download(user["id"], file_id)
        return FileResponse(path, media_type=content_type, filename=filename)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/documents/search")
def keyword_document_search(payload: DocumentQueryRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_library")
    question = payload.query.strip()
    tag = payload.tag.strip().upper() if payload.tag else None
    if not question and not tag:
        raise HTTPException(status_code=400, detail="A query or tag filter is required.")
    try:
        records, total, source_counts = search_documents(user["id"], question, payload.limit, payload.offset, payload.file_ids or None, tag)
        return {
            "records": records,
            "total": total,
            "source_counts": source_counts,
            "offset": payload.offset,
            "limit": payload.limit,
            "has_more": payload.offset + len(records) < total,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Document search unavailable: {exc}") from exc


@app.post("/api/documents/ask")
def ask_documents(payload: DocumentQueryRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_library")
    if not payload.query.strip():
        raise HTTPException(status_code=400, detail="A question is required.")
    try:
        return answer_documents(user["id"], payload.query.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Document answer unavailable: {exc}") from exc


@app.get("/api/analytics/datasets")
def get_analytics_datasets(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_analytics")
    return {"datasets": list_datasets(user["id"])}


@app.post("/api/analytics/datasets")
async def create_analytics_dataset(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_permission(authorization, "data_analytics")
    try:
        content = await file.read()
        if not content:
            raise ValueError("Upload a non-empty Excel or CSV file.")
        dataset = upload_dataset(user["id"], file.filename or "analytics-upload.xlsx", content)
        return {"dataset": dataset}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()


@app.get("/api/analytics/datasets/{dataset_id}")
def get_analytics_dataset(dataset_id: int, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_analytics")
    try:
        return {"dataset": get_dataset(user["id"], dataset_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/analytics/datasets/{dataset_id}")
def delete_analytics_dataset(dataset_id: int, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_analytics")
    try:
        delete_dataset(user["id"], dataset_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not finish deleting the dataset. Please try again.") from exc
    return {"deleted": True, "dataset_id": dataset_id}


@app.get("/api/analytics/datasets/{dataset_id}/summary")
def get_analytics_summary(dataset_id: int, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_analytics")
    try:
        return analytics_summary(user["id"], dataset_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/analytics/datasets/{dataset_id}/tables/{table_name}/preview")
def get_analytics_table_preview(
    dataset_id: int,
    table_name: str,
    limit: int = Query(default=5000, ge=1, le=100000),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_permission(authorization, "data_analytics")
    try:
        return preview_table(user["id"], dataset_id, table_name, limit)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


ANALYTICS_QUERY_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "analytics_query",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {"sql": {"type": ["string", "null"]}, "notes": {"type": "string"}},
            "required": ["sql", "notes"],
            "additionalProperties": False,
        },
    },
}

USED_OIL_TABLE_SELECTION_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "used_oil_table_selection",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "tables": {"type": "array", "items": {"type": "string"}},
                "notes": {"type": "string"},
            },
            "required": ["tables", "notes"],
            "additionalProperties": False,
        },
    },
}


def _analytics_query_plan(value: str) -> tuple[str | None, str]:
    try:
        plan = _parse_json_object(value)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="The analyst returned an invalid query plan. Please try again.") from exc
    if not isinstance(plan, dict) or "sql" not in plan:
        raise HTTPException(status_code=502, detail="The analyst returned an incomplete query plan. Please try again.")
    sql = plan["sql"]
    notes = plan.get("notes")
    if sql is None and isinstance(notes, str) and notes.strip():
        return None, notes.strip()
    if isinstance(sql, str) and sql.strip():
        return sql.strip(), ""
    raise HTTPException(status_code=502, detail="The analyst returned an empty query plan. Please try again.")


@app.post("/api/analytics/chat")
def analytics_chat(payload: AnalyticsChatRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "data_analytics")
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="A question is required.")

    try:
        schema = schema_for_dataset(user["id"], payload.dataset_id)
        selected_table_name = payload.table_name.strip()
        if selected_table_name:
            selected_tables = [table for table in schema["tables"] if table["table_name"] == selected_table_name]
            if not selected_tables:
                raise ValueError("Selected table was not found in this dataset.")
            schema = {**schema, "tables": selected_tables}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    schema = {**schema, "tables": [{**table, "column_count": len(table["columns"])} for table in schema["tables"]]}
    sample_rows = []
    for table in schema["tables"][:3]:
        try:
            preview = preview_table(user["id"], payload.dataset_id, table["table_name"], 5)
            sample_rows.append({
                "sheet_name": table["sheet_name"],
                "table_name": table["table_name"],
                "sample_rows": preview.get("rows", []),
            })
        except Exception:
            sample_rows.append({
                "sheet_name": table["sheet_name"],
                "table_name": table["table_name"],
                "sample_rows": [],
            })

    recent_history = [
        {"role": message.role, "content": message.content}
        for message in payload.history[-6:]
        if message.role in {"user", "assistant"} and message.content.strip()
    ]
    sql_messages = [
        {
            "role": "system",
            "content": (
                "You generate MySQL SELECT statements for NexGTools AI Business Analytics. "
                "Use only the selected uploaded dataset and the provided schema table_name and column name values. "
                "Never use INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, SET, CALL, comments, or multiple statements. "
                "Return strict JSON only with keys sql and notes. For answerable data questions, sql must be one valid MySQL SELECT "
                "with a FROM clause referencing an exact table_name from the selected schema. Never encode an explanation as SELECT 'text'. "
                "Inspect every column name and type in the supplied schema before choosing the relevant fields. "
                "Understand free-form questions including Hindi, English and Hinglish, using original_name to map business terms "
                "to the actual SQL column name. Handle counts, totals, averages, min/max, rankings, grouping, date ranges, "
                "comparisons, duplicates, missing values and record lookups when the schema supports them. "
                "Preserve every requested filter and sort condition. Compute totals over the full selected table, never sample rows. "
                "Samples describe formats only; a value absent from samples may still exist elsewhere in the table. "
                "Quote column and table identifiers with backticks. Use native numeric columns directly; for text numbers "
                "use REPLACE and CAST as needed. Use SELECT with derived subqueries rather than WITH statements. "
                "Column-count questions ARE answerable: use the supplied column_count metadata as an integer literal "
                "and query the selected table, for example SELECT 21 AS column_count, COUNT(*) AS row_count FROM `actual_table_name`. "
                "Replace 21 and actual_table_name with the exact schema values; COUNT(*) ensures a result even for an empty table. "
                "Do not query information_schema or other tables outside the selected dataset. "
                "For greetings, questions about your identity, ambiguous requests, or requests requiring unavailable columns, "
                "return sql: null and use notes to reply or ask a specific clarification in plain language. "
                "You are Neha from NexG Analyst. Do not invent data or claim a query ran when sql is null. "
                "For multi-part questions, combine the answer into one SELECT using scalar subqueries or UNION ALL. "
                "For mixed summaries plus lists, return columns named section, label, and value so the result table is clear. "
                "For lookup questions about a named dealer, customer, company, GSTIN, city, state, phone, product, or status, "
                "filter the most relevant text column with case-insensitive LIKE/LOWER instead of returning unrelated rows. "
                "When the question asks for one entity's details, select the identifying column plus the requested detail columns and use a small LIMIT. "
                "For distinct text counts, use COUNT(DISTINCT NULLIF(TRIM(column), '')). "
                "For numeric totals, cast text-like numeric columns after removing commas. "
                "If the user asks to show records, include enough selected columns and add LIMIT 1000."
            ),
        },
        {"role": "user", "content": f"Selected dataset schema:\n{json.dumps(schema, ensure_ascii=False, default=str)}\n\nSample rows from selected table(s):\n{_trim_json(sample_rows, 12000)}"},
        *recent_history,
        {"role": "user", "content": question},
    ]
    generated = _chat_completion(sql_messages, response_format=ANALYTICS_QUERY_FORMAT, max_tokens=1800)
    sql, clarification = _analytics_query_plan(generated)
    if sql is None:
        return {"answer": clarification, "sql": None, "rows": [], "model": settings.openai_model}
    allowed_tables = {table["table_name"] for table in schema["tables"]}
    result = None
    validation_error = ""
    for attempt in range(2):
        try:
            sql = validate_sql(sql, allowed_tables)
            result = execute_sql(user["id"], payload.dataset_id, sql)
            break
        except Exception as exc:
            validation_error = str(exc) if isinstance(exc, ValueError) else f"SQL execution failed: {exc}"
            if attempt == 1:
                break
            repair_messages = [
                {
                    "role": "system",
                    "content": (
                        "Repair this MySQL analytics query. Return strict JSON only with keys sql and notes. "
                        "The sql must be exactly one safe SELECT statement with a FROM clause referencing an exact table_name "
                        "from the schema, with no comments and no semicolon. Never use SELECT 'explanation' without a data table. "
                        "If this is a greeting, identity question, ambiguous request or the schema lacks required fields, "
                        "return sql: null and notes containing a helpful reply or specific clarification as Neha from NexG Analyst. "
                        "Do not invent data or claim a query ran when sql is null. "
                        "Use only the provided table and column names. Use UNION ALL or scalar subqueries if needed. "
                        "For column counts, use the exact column_count from the schema as a literal alongside COUNT(*), "
                        "for example SELECT 21 AS column_count, COUNT(*) AS row_count FROM `actual_table_name`, "
                        "substituting the actual schema values. Inspect all columns before repairing other queries. "
                        "For lookup questions, preserve the user's named value in a case-insensitive filter. "
                        "For mixed summaries plus lists, return clear columns named section, label, and value."
                    ),
                },
                {"role": "user", "content": f"Schema:\n{json.dumps(schema, ensure_ascii=False, default=str)}\n\nSample rows:\n{_trim_json(sample_rows, 12000)}"},
                *recent_history,
                {
                    "role": "user",
                    "content": (
                        f"Question: {question}\n\n"
                        f"Rejected SQL:\n{sql}\n\n"
                        f"Validator error: {validation_error}"
                    ),
                },
            ]
            repaired = _chat_completion(repair_messages, response_format=ANALYTICS_QUERY_FORMAT, max_tokens=1800)
            sql, clarification = _analytics_query_plan(repaired)
            if sql is None:
                return {"answer": clarification, "sql": None, "rows": [], "model": settings.openai_model}
    if result is None:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "I couldn't create a valid query for this dataset. Please specify the field or records you want to analyze.",
                "sql": sql,
            },
        )

    explain_messages = [
        {
            "role": "system",
            "content": (
                "You are Neha from NexG Analyst. Explain the SQL results returned by FastAPI in the user's language. "
                "Answer the exact question first and preserve the units and requested filters. "
                "When there are no result rows, say no matching records were found; do not substitute sample records. "
                "Use only the query result and selected dataset schema. Do not invent missing facts. Keep the answer concise, include the key number, "
                "and mention when the result is limited by the returned rows."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {question}\n\n"
                f"Schema:\n{_trim_json(schema, 8000)}\n\n"
                f"SQL executed:\n{result['sql']}\n\n"
                f"Rows:\n{_trim_json(result['rows'], 12000)}"
            ),
        },
    ]
    answer = _chat_completion(explain_messages)
    return {
        "answer": answer,
        "sql": result["sql"],
        "rows": result["rows"],
        "model": settings.openai_model,
    }


@app.post("/api/csv-exports")
def create_csv_export(payload: CsvExportRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not payload.leads:
        raise HTTPException(status_code=400, detail="Select at least one lead to export.")

    user = _require_permission(authorization, "exports")
    unique_leads: list[dict[str, Any]] = []
    seen: set[str] = set()
    for lead in payload.leads:
        identity = str(lead.get("id") or "").strip().lower() or "|".join(
            str(lead.get(key) or "").strip().lower() for key in ("name", "website", "phone", "email")
        )
        if identity in seen:
            continue
        seen.add(identity)
        unique_leads.append(lead)
    export_id = save_csv_export(unique_leads, payload.export_name.strip() or "Lead export", user["id"], payload.source)
    if not export_id:
        raise HTTPException(status_code=500, detail="Could not save CSV export.")

    return {"id": export_id, "row_count": len(unique_leads)}


@app.get("/api/csv-exports")
def csv_exports(
    source: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_permission(authorization, "exports")
    return {"exports": list_csv_exports(user["id"], source)}


@app.get("/api/csv-exports/{export_id}")
def csv_export_detail(export_id: int, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "exports")
    export = get_csv_export(export_id, user["id"])
    if not export:
        raise HTTPException(status_code=404, detail="CSV export not found.")
    return {"export": export}


@app.get("/api/search-history")
def search_history(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "lead_search_history")
    return {"history": list_lead_search_history()}


@app.get("/api/search-history/{search_id}")
def search_history_detail(search_id: int, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "lead_search_history")
    search = get_lead_search_history(search_id)
    if not search:
        raise HTTPException(status_code=404, detail="Search history record not found.")
    return {"search": search}


@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_user(authorization)
    if not user.get("is_nexg_admin"):
        raise HTTPException(status_code=403, detail="NexG Admin access required.")
    if not verify_admin_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid admin password.")
    token = create_admin_session(user["id"])
    return {"admin_token": token, "user": user}


@app.get("/api/admin/me")
def admin_me(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _require_admin(authorization, x_admin_token)
    return {"admin": True, "user": user}


@app.get("/api/admin/overview")
def admin_dashboard(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    return admin_overview()


@app.post("/api/admin/users")
def admin_create_user(
    payload: AdminCreateUserRequest,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    name = payload.name.strip()
    email = payload.email.strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="User name is required.")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if get_user_by_email(email):
        raise HTTPException(status_code=409, detail="A user with this email already exists.")
    salt, password_hash = hash_password(payload.password)
    return {"user": create_user(name, email, salt, password_hash)}


@app.get("/api/admin/roles")
def admin_roles(authorization: str | None = Header(default=None), x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    return {"roles": list_roles(), "permissions": ["dashboard", "lead_search", "lead_search_history", "business_search", "business_search_history", "outreach", "data_library", "data_analytics", "used_oil_india", "exports", "settings"]}


@app.get("/api/admin/users-with-roles")
def admin_users_with_roles(authorization: str | None = Header(default=None), x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    return {"users": list_users_with_roles()}


@app.post("/api/admin/roles")
def admin_create_role(payload: RoleRequest, authorization: str | None = Header(default=None), x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    try:
        return {"role": save_role(payload.name, payload.permissions)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/admin/roles/{role_id}")
def admin_update_role(role_id: int, payload: RoleRequest, authorization: str | None = Header(default=None), x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    try:
        return {"role": save_role(payload.name, payload.permissions, role_id)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/admin/roles/{role_id}")
def admin_delete_role(role_id: int, authorization: str | None = Header(default=None), x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    try:
        delete_role(role_id)
        return {"deleted": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/admin/users/{user_id}/role")
def admin_assign_role(user_id: int, payload: UserRoleRequest, authorization: str | None = Header(default=None), x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    try:
        return set_user_role(user_id, payload.role_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/admin/tables/{table_name}")
def admin_records(
    table_name: str,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    try:
        return admin_table_records(table_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.put("/api/admin/tables/{table_name}/{record_id}")
def admin_update_record(
    table_name: str,
    record_id: int,
    payload: AdminUpdateRecordRequest,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    try:
        return update_admin_record(table_name, record_id, payload.values)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/admin/tables/{table_name}/{record_id}")
def admin_delete_record(
    table_name: str,
    record_id: int,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_admin(authorization, x_admin_token)
    try:
        return delete_admin_record(table_name, record_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/social-profiles")
def social_profiles(payload: SocialProfileRequest) -> dict[str, Any]:
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Company name is required.")
    return _find_social_profiles(payload.name.strip(), payload.address, payload.website)


@app.get("/api/business-search/history")
def business_search_history(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "business_search_history")
    return {"history": list_business_search_history(user["id"])}


@app.get("/api/business-search/history/{search_id}")
def business_search_history_detail(search_id: int, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "business_search_history")
    search = get_business_search_history(search_id, user["id"])
    if not search:
        raise HTTPException(status_code=404, detail="Business search history record not found.")
    return {"search": search}


@app.post("/api/business-search")
def business_search(payload: BusinessSearchRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "business_search")
    query = payload.query.strip()
    location = payload.location.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Enter a business, product, or service to search.")

    available_source_ids = list(BUSINESS_SOURCES.keys())
    available_sources = set(available_source_ids)
    requested_sources = list(dict.fromkeys(payload.sources))
    if not requested_sources:
        requested_sources = available_source_ids if payload.source == "all" else [payload.source]
    unknown_sources = set(requested_sources) - available_sources
    if unknown_sources:
        raise HTTPException(status_code=400, detail=f"Unknown business search source: {sorted(unknown_sources)[0]}.")
    if not requested_sources:
        raise HTTPException(status_code=400, detail="Select at least one business search source.")

    source_ids = requested_sources
    per_source_limit = max(3, math.ceil(payload.max_results / len(source_ids)))
    source_reports: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []

    def search_source(source_id: str) -> dict[str, Any]:
        report = _scrape_business_source(source_id, query, location, per_source_limit)
        if not report.get("results"):
            report["results"] = [_source_lookup_result(source_id, query, location, report.get("error", ""))]
        return report

    reports_by_source: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=min(8, len(source_ids))) as executor:
        future_sources = {executor.submit(search_source, source_id): source_id for source_id in source_ids}
        for future in as_completed(future_sources):
            source_id = future_sources[future]
            try:
                reports_by_source[source_id] = future.result()
            except Exception as exc:
                reports_by_source[source_id] = {
                    "source": source_id, "label": BUSINESS_SOURCES[source_id]["label"],
                    "search_url": _business_source_url(source_id, query, location),
                    "results": [_source_lookup_result(source_id, query, location, str(exc))],
                    "error": str(exc),
                }

    for source_id in source_ids:
        report = reports_by_source[source_id]
        source_reports.append(
            {
                "source": report["source"],
                "label": report["label"],
                "search_url": report.get("search_url", ""),
                "count": len(report.get("results") or []),
                "error": report.get("error", ""),
            }
        )
        results.extend(report.get("results") or [])

    unique_results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for result in results:
        dedupe_key = result.get("url") or f"{result.get('source')}:{result.get('name')}"
        if dedupe_key in seen_urls:
            continue
        seen_urls.add(dedupe_key)
        result["id"] = f"business-{len(unique_results) + 1}"
        unique_results.append(result)
        if len(unique_results) >= payload.max_results:
            break

    response = {
        "query": query,
        "location": location,
        "source": ",".join(source_ids),
        "selected_sources": source_ids,
        "radius_km": payload.radius_km,
        "count": len(unique_results),
        "results": unique_results,
        "sources": source_reports,
    }
    response["database_search_id"] = save_business_search(payload, response, user["id"])
    return response


@app.post("/api/leads/search")
def search_leads(payload: LeadSearchRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "lead_search")
    if not settings.google_places_api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_PLACES_API_KEY is not configured.")

    text_query = _build_places_query(payload)
    if not text_query:
        raise HTTPException(
            status_code=400,
            detail="Enter a company name, city/area, pincode, or business type.",
        )

    center = _geocode_address(_build_geocode_address(payload))
    request_body = {
        "textQuery": text_query,
        "pageSize": 20,
        "regionCode": "IN",
        "languageCode": "en",
        "includePureServiceAreaBusinesses": True,
    }
    if center:
        request_body["locationBias"] = {
            "circle": {
                "center": {
                    "latitude": center["latitude"],
                    "longitude": center["longitude"],
                },
                "radius": payload.radius_km * 1000,
            }
        }

    places: list[dict[str, Any]] = []
    next_page_token: str | None = None
    pages_fetched = 0

    while pages_fetched < payload.max_pages:
        page_body = dict(request_body)
        if next_page_token:
            page_body["pageToken"] = next_page_token

        encoded_body = json.dumps(page_body).encode("utf-8")
        request = Request(
            "https://places.googleapis.com/v1/places:searchText",
            data=encoded_body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": settings.google_places_api_key,
                "X-Goog-FieldMask": (
                    "places.id,places.name,places.displayName,places.formattedAddress,"
                    "places.shortFormattedAddress,places.nationalPhoneNumber,"
                    "places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,"
                    "places.rating,places.businessStatus,places.types,places.primaryType,"
                    "places.primaryTypeDisplayName,places.location,nextPageToken,searchUri"
                ),
            },
        )

        try:
            with urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise HTTPException(
                status_code=exc.code,
                detail=f"Google Places API request failed: {details}",
            ) from exc
        except URLError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Could not reach Google Places API: {exc.reason}",
            ) from exc

        pages_fetched += 1
        places.extend(data.get("places") or [])
        next_page_token = data.get("nextPageToken")
        if not next_page_token:
            break

        time.sleep(0.35)

    seen_place_ids: set[str] = set()
    leads: list[dict[str, Any]] = []
    for place in places:
        lead = _normalize_place(place)
        if lead["id"] in seen_place_ids:
            continue
        seen_place_ids.add(lead["id"])

        distance = None
        if center:
            distance = _distance_km(
                center["latitude"],
                center["longitude"],
                lead["latitude"],
                lead["longitude"],
            )
            if distance is not None and distance > payload.radius_km:
                continue

        lead["distance_km"] = round(distance, 2) if distance is not None else None
        leads.append(lead)

    leads.sort(key=lambda lead: lead["distance_km"] if lead["distance_km"] is not None else 999999)

    # Return Google Places results immediately. Crawling every company website
    # here delayed the whole search by minutes when many leads were found.
    # Individual website scraping is still available after selecting a lead.
    for lead in leads:
        lead["email"] = str(lead.get("email") or "")
        lead["emails"] = list(lead.get("emails") or [])
        lead["phones"] = [lead["phone"]] if lead.get("phone") else []

    response = {
        "query": text_query,
        "radius_km": payload.radius_km,
        "center": center,
        "pages_fetched": pages_fetched,
        "count": len(leads),
        "leads": leads,
    }
    response["database_search_id"] = save_lead_search(payload, response)
    return response


@app.post("/api/scrape")
def scrape(payload: WebsiteScrapeRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_permission(authorization, "lead_search")
    try:
        response = scrape_website(payload.url, CrawlOptions(max_pages=payload.max_pages))
        response["database_scrape_id"] = save_website_scrape(response)
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/outreach")
def outreach_workspace(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "outreach")
    return {
        "contacts": list_outreach_contacts(user["id"]),
        "history": list_outreach_messages(user["id"]),
        "drafts": list_outreach_drafts(user["id"]),
        "providers": {
            "smtp": bool(settings.smtp_host and settings.smtp_from_email),
            "whatsapp": bool(settings.whatsapp_api_url and settings.whatsapp_access_token),
        },
        "sender": {
            "name": user.get("name") or "",
            "email": settings.smtp_from_email,
        },
    }


@app.post("/api/outreach/contacts", status_code=201)
def create_outreach_contact(payload: OutreachContactRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "outreach")
    try:
        contact = save_manual_outreach_contact(
            user["id"],
            payload.company_name,
            payload.contact_person,
            payload.email,
            payload.phone,
            payload.website,
            payload.category,
        )
        return {"contact": contact}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/outreach/contacts/{contact_id}")
def update_outreach_contact_endpoint(contact_id: int, payload: OutreachContactRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "outreach")
    try:
        contact = update_outreach_contact(
            user["id"],
            contact_id,
            payload.company_name,
            payload.contact_person,
            payload.email,
            payload.phone,
            payload.website,
            payload.category,
        )
        return {"contact": contact}
    except ValueError as exc:
        status_code = 404 if str(exc) == "Lead not found." else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@app.delete("/api/outreach/contacts/{contact_id}")
def remove_outreach_contact(contact_id: int, authorization: str | None = Header(default=None)) -> dict[str, bool]:
    user = _require_permission(authorization, "outreach")
    if not delete_outreach_contact(user["id"], contact_id):
        raise HTTPException(status_code=404, detail="Lead not found.")
    return {"deleted": True}


@app.post("/api/outreach/drafts", status_code=201)
def create_outreach_draft(payload: OutreachDraftRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "outreach")
    channel = payload.channel.strip().lower()
    if channel not in {"email", "whatsapp"}:
        raise HTTPException(status_code=400, detail="Channel must be email or whatsapp.")
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Write a draft before saving.")
    contacts = {contact["id"] for contact in list_outreach_contacts(user["id"])}
    contact_ids = [contact_id for contact_id in payload.contact_ids if contact_id in contacts]
    draft_id = save_outreach_draft(user["id"], channel, payload.subject.strip(), payload.message.strip(), contact_ids)
    draft = next((item for item in list_outreach_drafts(user["id"]) if item["id"] == draft_id), None)
    return {"draft": draft}


@app.delete("/api/outreach/drafts/{draft_id}")
def remove_outreach_draft(draft_id: int, authorization: str | None = Header(default=None)) -> dict[str, bool]:
    user = _require_permission(authorization, "outreach")
    if not delete_outreach_draft(user["id"], draft_id):
        raise HTTPException(status_code=404, detail="Draft not found.")
    return {"deleted": True}


@app.post("/api/outreach/generate")
def generate_outreach(payload: OutreachGenerateRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "outreach")
    channel = payload.channel.strip().lower()
    if channel not in {"email", "whatsapp"}:
        raise HTTPException(status_code=400, detail="Channel must be email or whatsapp.")
    if not payload.contact_ids:
        raise HTTPException(status_code=400, detail="Select at least one lead before generating content.")

    contacts = {contact["id"]: contact for contact in list_outreach_contacts(user["id"])}
    selected = [contacts[contact_id] for contact_id in payload.contact_ids if contact_id in contacts]
    if not selected:
        raise HTTPException(status_code=404, detail="No matching contacts were found.")

    reachable = [
        contact for contact in selected
        if (contact.get("email") if channel == "email" else contact.get("phone"))
    ]
    if not reachable:
        raise HTTPException(
            status_code=400,
            detail=f"Select at least one lead with {'a business email' if channel == 'email' else 'a WhatsApp phone number'}.",
        )

    primary = reachable[0]
    key_points = [point.strip() for point in payload.key_points if point.strip()]
    goal = payload.campaign_goal.strip() or "start a short business conversation"
    brand_name = payload.brand_name.strip()
    sender_identity = brand_name or payload.sender_name.strip() or user.get("name") or "our team"
    context = {
        "channel": channel,
        "tone": payload.tone.strip() or "professional",
        "campaign_goal": goal,
        "brand_name": brand_name,
        "key_points": key_points,
        "sender_name": sender_identity,
        "primary_lead": primary,
        "target_leads": reachable[:20],
        "business_search_context_fields": [
            "company_name",
            "contact_person",
            "search_name",
            "category",
            "website",
            "email",
            "phone",
        ],
    }
    is_rewrite = bool(payload.existing_draft.strip() and payload.rewrite_prompt.strip())
    messages = [
        {
            "role": "system",
            "content": (
                "You are NexGTools Business Outreach AI. Generate practical outbound outreach using only "
                "the selected workbook or manually saved leads provided in context. "
                "Do not invent products, partnerships, discounts, owners, testimonials, metrics, or prior meetings. "
                "If a fact is not present, keep it generic. Write a message that is ready to send. "
                "For email, include a concise subject and body. For WhatsApp, return an empty subject and a short body. "
                "Keep the body under 130 words, personalize the greeting with the contact person when present, "
                "and include one clear call to action. If brand_name is provided, write from that company/team "
                "using natural wording such as 'we are from the {brand_name} team' when appropriate. "
                "End the message with a sign-off using 'Best regards,' followed by the brand_name/team name when provided. "
                "Return strict JSON with keys subject and message only."
            ),
        },
        {
            "role": "user",
            "content": f"Workbook and outreach context:\n{_trim_json(context, 12000)}",
        },
    ]
    if is_rewrite:
        messages.append(
            {
                "role": "user",
                "content": (
                    "Rewrite this existing draft according to the instruction. Preserve factual accuracy and return "
                    f"strict JSON only.\nInstruction: {payload.rewrite_prompt.strip()}\nDraft:\n{payload.existing_draft.strip()}"
                ),
            }
        )
    else:
        messages.append({"role": "user", "content": "Generate the outreach content now."})

    answer = _chat_completion(messages)
    try:
        parsed = json.loads(answer)
    except json.JSONDecodeError:
        parsed = {"subject": "Business invitation", "message": answer}

    subject = str(parsed.get("subject") or ("Business invitation" if channel == "email" else "")).strip()
    message = str(parsed.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=502, detail="OpenAI returned an empty outreach draft.")
    return {
        "subject": subject,
        "message": message,
        "model": settings.openai_model,
    }


def _split_email_recipients(value: str, field_name: str) -> list[str]:
    recipients = [item.strip() for item in re.split(r"[,;]", value or "") if item.strip()]
    invalid = [item for item in recipients if not EMAIL_RE.fullmatch(item)]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}: {invalid[0]}")
    return recipients


@app.post("/api/outreach/send")
def send_outreach(payload: OutreachSendRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user = _require_permission(authorization, "outreach")
    channel = payload.channel.strip().lower()
    if channel not in {"email", "whatsapp"}:
        raise HTTPException(status_code=400, detail="Channel must be email or whatsapp.")
    if not payload.contact_ids or not payload.message.strip():
        raise HTTPException(status_code=400, detail="Select contacts and enter a message.")

    contacts = {contact["id"]: contact for contact in list_outreach_contacts(user["id"])}
    selected = [contacts[contact_id] for contact_id in payload.contact_ids if contact_id in contacts]
    if not selected:
        raise HTTPException(status_code=404, detail="No matching contacts were found.")

    cc_recipients = _split_email_recipients(payload.cc_email, "CC email")
    bcc_recipients = _split_email_recipients(payload.bcc_email, "BCC email")
    results = []
    smtp = None
    try:
        if channel == "email":
            if not settings.smtp_host or not settings.smtp_from_email:
                raise HTTPException(status_code=503, detail="SMTP is not configured on the server.")
            use_ssl = settings.smtp_port == 465
            smtp = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) if use_ssl else smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
            if settings.smtp_use_tls and not use_ssl:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)

        if channel == "email" and payload.use_selected_leads_as_bcc and len(selected) > 1:
            email_contacts = [contact for contact in selected if contact.get("email")]
            if not email_contacts:
                raise HTTPException(status_code=400, detail="Select at least one lead with a business email.")
            selected_bcc = []
            for contact in email_contacts:
                recipient = str(contact.get("email") or "").strip()
                if recipient and recipient not in selected_bcc:
                    selected_bcc.append(recipient)
            all_bcc_recipients = list(dict.fromkeys([*selected_bcc, *bcc_recipients]))
            sender_name = payload.sender_name.strip()
            bulk_email = EmailMessage()
            bulk_email["From"] = formataddr((sender_name, settings.smtp_from_email)) if sender_name else settings.smtp_from_email
            if payload.reply_to_email.strip():
                bulk_email["Reply-To"] = payload.reply_to_email.strip()
            bulk_email["To"] = payload.reply_to_email.strip() or settings.smtp_from_email
            if cc_recipients:
                bulk_email["Cc"] = ", ".join(cc_recipients)
            bulk_email["Bcc"] = ", ".join(all_bcc_recipients)
            bulk_email["Subject"] = payload.subject.strip() or "Business invitation"
            bulk_message = (
                payload.message
                .replace("{{company_name}}", "your company")
                .replace("{{contact_person}}", "there")
                .replace("{{sender_name}}", payload.sender_name.strip() or "our team")
                .replace("{{sender_email}}", payload.reply_to_email.strip() or settings.smtp_from_email)
            )
            try:
                bulk_email.set_content(bulk_message)
                smtp.send_message(bulk_email)
                provider_response = "SMTP accepted BCC message"
                for contact in selected:
                    recipient = (contact.get("email") if contact.get("email") else "") or ""
                    result_base = {
                        "contact_id": contact["id"],
                        "company_name": contact.get("company_name", ""),
                        "recipient": recipient,
                    }
                    if not recipient:
                        results.append({**result_base, "status": "skipped", "detail": "No email address"})
                        continue
                    save_outreach_message(user["id"], contact["id"], channel, recipient, payload.subject, bulk_message, "sent", provider_response)
                    results.append({**result_base, "status": "sent"})
                return {"results": results}
            except Exception as exc:
                for contact in selected:
                    recipient = (contact.get("email") if contact.get("email") else "") or ""
                    result_base = {
                        "contact_id": contact["id"],
                        "company_name": contact.get("company_name", ""),
                        "recipient": recipient,
                    }
                    if not recipient:
                        results.append({**result_base, "status": "skipped", "detail": "No email address"})
                        continue
                    save_outreach_message(user["id"], contact["id"], channel, recipient, payload.subject, bulk_message, "failed", str(exc))
                    results.append({**result_base, "status": "failed", "detail": str(exc)})
                return {"results": results}

        for contact in selected:
            recipient = (contact.get("email") if channel == "email" else contact.get("phone")) or ""
            result_base = {
                "contact_id": contact["id"],
                "company_name": contact.get("company_name", ""),
                "recipient": recipient,
            }
            if not recipient:
                results.append({**result_base, "status": "skipped", "detail": f"No {channel} address"})
                continue
            personalized = (
                payload.message
                .replace("{{company_name}}", contact.get("company_name", ""))
                .replace("{{contact_person}}", contact.get("contact_person") or "there")
                .replace("{{sender_name}}", payload.sender_name.strip() or "our team")
                .replace("{{sender_email}}", payload.reply_to_email.strip() or settings.smtp_from_email)
            )
            try:
                if channel == "email":
                    email = EmailMessage()
                    sender_name = payload.sender_name.strip()
                    email["From"] = formataddr((sender_name, settings.smtp_from_email)) if sender_name else settings.smtp_from_email
                    if payload.reply_to_email.strip():
                        email["Reply-To"] = payload.reply_to_email.strip()
                    email["To"] = recipient
                    if cc_recipients:
                        email["Cc"] = ", ".join(cc_recipients)
                    if bcc_recipients:
                        email["Bcc"] = ", ".join(bcc_recipients)
                    email["Subject"] = payload.subject.strip() or "Business invitation"
                    email.set_content(personalized)
                    smtp.send_message(email)
                    provider_response = "SMTP accepted message"
                else:
                    if not settings.whatsapp_api_url or not settings.whatsapp_access_token:
                        raise RuntimeError("WhatsApp API is not configured on the server.")
                    api_response = requests.post(
                        settings.whatsapp_api_url,
                        headers={"Authorization": f"Bearer {settings.whatsapp_access_token}", "Content-Type": "application/json"},
                        json={"messaging_product": "whatsapp", "to": recipient, "type": "text", "text": {"body": personalized}},
                        timeout=20,
                    )
                    api_response.raise_for_status()
                    provider_response = api_response.text
                save_outreach_message(user["id"], contact["id"], channel, recipient, payload.subject, personalized, "sent", provider_response)
                results.append({**result_base, "status": "sent"})
            except Exception as exc:
                save_outreach_message(user["id"], contact["id"], channel, recipient, payload.subject, personalized, "failed", str(exc))
                results.append({**result_base, "status": "failed", "detail": str(exc)})
    finally:
        if smtp:
            smtp.quit()
    return {"results": results}


@app.post("/api/lead-ai/chat")
def lead_ai_chat(payload: LeadAiChatRequest) -> dict[str, Any]:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    context = {
        "selected_google_places_lead": payload.lead or {},
        "latest_website_scrape": payload.scrape or {},
    }
    has_lead_context = bool(payload.lead)
    has_scrape_context = bool(payload.scrape)
    recent_history = [
        {"role": message.role, "content": message.content}
        for message in payload.history[-8:]
        if message.role in {"user", "assistant"} and message.content.strip()
    ]
    messages = [
        {
            "role": "system",
            "content": (
                "You are Lead AI for NexGTools, a fast business-research assistant. "
                "Give responsive, direct answers in plain English. Prefer short sections and bullets. "
                "Use the selected Google Places lead and website scrape context whenever available. "
                "If asked for phone numbers, emails, websites, addresses, products, services, owners, "
                "or social links, extract only what appears in the provided context. "
                "If context is missing, answer generally but clearly say what data is missing and what to scrape next. "
                "Never invent contact details, prices, people, services, or company facts. "
                "Keep normal answers under 180 words unless the user asks for more detail."
            ),
        },
        {
            "role": "user",
            "content": (
                "Available context flags:\n"
                f"- selected_lead_loaded: {has_lead_context}\n"
                f"- website_scrape_loaded: {has_scrape_context}\n\n"
                f"Available lead and scrape context:\n{_trim_json(context)}"
            ),
        },
        *recent_history,
        {"role": "user", "content": question},
    ]

    answer = _chat_completion(messages)
    return{
        "answer": answer,
    "model": settings.openai_model,
    }



    

@app.post("/api/business-ai/chat")
def business_ai_chat(payload: BusinessAiChatRequest) -> dict[str, Any]:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    selected_business = payload.business or {}
    source_scrape = selected_business.get("source_scrape") or {}
    source_scrape_context = {
        "source": selected_business.get("source_label") or selected_business.get("source"),
        "start_url": source_scrape.get("start_url"),
        "domain": source_scrape.get("domain"),
        "pages_scraped": source_scrape.get("pages_scraped", 0),
        "emails": source_scrape.get("emails") or [],
        "phones": source_scrape.get("phones") or [],
        "errors": source_scrape.get("errors") or [],
        "pages": [
            {
                "url": page.get("url"),
                "title": page.get("title"),
                "description": page.get("description"),
                "headings": page.get("headings"),
                "text": (page.get("text") or "")[:6000],
            }
            for page in (source_scrape.get("pages") or [])[:3]
        ],
    } if source_scrape else {}
    context = {
        "source_page_scrape": source_scrape_context,
        "selected_business_result": {
            key: value
            for key, value in selected_business.items()
            if key != "source_scrape"
        },
        "business_search_context": payload.search_context or {},
    }
    recent_history = [
        {"role": message.role, "content": message.content}
        for message in payload.history[-8:]
        if message.role in {"user", "assistant"} and message.content.strip()
    ]
    messages = [
        {
            "role": "system",
            "content": (
                "You are Business AI for NexGTools. Answer using the selected business result, "
                "source page scrape, Custom Search snippets, and Business Search context. "
                "Treat source_page_scrape as the primary evidence when it is present. Read its page text, "
                "descriptions, headings, emails, and phones before answering. Clearly distinguish facts found "
                "in the scraped source from facts found only in search snippets. "
                "Be fast, direct, and practical. Use short sections or bullets. "
                "When asked for contact info, products, services, website, social profile, source, "
                "or summary, extract only details present in the context. "
                "If the context does not include the answer, say what is missing and suggest which source "
                "or website page to inspect next. Do not invent contacts, claims, owners, prices, or services. "
                "Keep normal answers under 180 words."
            ),
        },
        {
            "role": "user",
            "content": f"Available Business Search context:\n{_trim_json(context)}",
        },
        *recent_history,
        {"role": "user", "content": question},
    ]
    
    answer = _chat_completion(messages)

    return {
        "answer": answer,
        "model": settings.openai_model,
    }  
