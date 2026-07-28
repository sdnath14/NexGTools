from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from time import perf_counter
from typing import Any
from urllib.parse import urldefrag, urljoin, urlparse
import re

from bs4 import BeautifulSoup
import requests


ASSET_EXTENSIONS = (
    ".7z",
    ".avi",
    ".css",
    ".csv",
    ".doc",
    ".docx",
    ".gif",
    ".gz",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".json",
    ".mov",
    ".mp3",
    ".mp4",
    ".mpeg",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".rar",
    ".svg",
    ".tar",
    ".webm",
    ".webp",
    ".xls",
    ".xlsx",
    ".xml",
    ".zip",
)
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")


@dataclass(frozen=True)
class CrawlOptions:
    max_pages: int = 10
    max_chars_per_page: int = 15000
    timeout: int = 12


def scrape_website(start_url: str, options: CrawlOptions | None = None) -> dict[str, Any]:
    crawl_options = options or CrawlOptions()
    normalized_start = _normalize_start_url(start_url)
    start_host = _host(normalized_start)
    queue: deque[str] = deque([normalized_start])
    queued = {normalized_start}
    visited: set[str] = set()
    pages: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    started_at = perf_counter()

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "NexGToolsScraper/0.1 "
                "(compatible; business lead research; +http://localhost)"
            )
        }
    )

    while queue and len(visited) < crawl_options.max_pages:
        url = queue.popleft()
        if url in visited:
            continue

        visited.add(url)
        try:
            response = session.get(url, timeout=crawl_options.timeout, allow_redirects=True)
            content_type = response.headers.get("content-type", "")
            if response.status_code >= 400:
                errors.append({"url": url, "error": f"HTTP {response.status_code}"})
                continue
            if "text/html" not in content_type.lower():
                errors.append({"url": url, "error": f"Skipped non-HTML content: {content_type}"})
                continue
        except requests.RequestException as exc:
            errors.append({"url": url, "error": str(exc)})
            continue

        final_url = _clean_url(response.url)
        soup = BeautifulSoup(response.text, "html.parser")
        page_links = _extract_links(soup, final_url, start_host)
        page_text = _extract_text(soup)
        pages.append(
            {
                "url": final_url,
                "status_code": response.status_code,
                "title": _title(soup),
                "description": _meta_description(soup),
                "headings": _headings(soup),
                "text": page_text[: crawl_options.max_chars_per_page],
                "emails": sorted(set(EMAIL_RE.findall(response.text))),
                "phones": sorted(set(match.strip() for match in PHONE_RE.findall(page_text))),
                "links": page_links,
            }
        )

        for link in page_links["internal"]:
            href = link["url"]
            if href not in queued and href not in visited and len(queued) + len(visited) < crawl_options.max_pages:
                queued.add(href)
                queue.append(href)

    all_emails = sorted({email for page in pages for email in page["emails"]})
    all_phones = sorted({phone for page in pages for phone in page["phones"]})
    internal_links = sorted({link["url"] for page in pages for link in page["links"]["internal"]})
    external_links = sorted({link["url"] for page in pages for link in page["links"]["external"]})

    return {
        "start_url": normalized_start,
        "domain": start_host,
        "pages_scraped": len(pages),
        "pages_requested": len(visited),
        "max_pages": crawl_options.max_pages,
        "duration_seconds": round(perf_counter() - started_at, 2),
        "emails": all_emails,
        "phones": all_phones,
        "internal_links": internal_links,
        "external_links": external_links,
        "pages": pages,
        "errors": errors,
    }


def _normalize_start_url(url: str) -> str:
    candidate = url.strip()
    if not candidate:
        raise ValueError("Website URL is required.")
    if not candidate.startswith(("http://", "https://")):
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Enter a valid http or https website URL.")

    return _clean_url(candidate)


def _host(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.lower().removeprefix("www.")


def _clean_url(url: str) -> str:
    without_fragment, _fragment = urldefrag(url)
    parsed = urlparse(without_fragment)
    normalized = parsed._replace(query="", fragment="")
    return normalized.geturl().rstrip("/")


def _is_html_link(url: str) -> bool:
    parsed = urlparse(url)
    path = parsed.path.lower()
    return not path.endswith(ASSET_EXTENSIONS)


def _extract_links(soup: BeautifulSoup, base_url: str, start_host: str) -> dict[str, list[dict[str, str]]]:
    internal: dict[str, str] = {}
    external: dict[str, str] = {}

    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue

        absolute_url = _clean_url(urljoin(base_url, href))
        parsed = urlparse(absolute_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or not _is_html_link(absolute_url):
            continue

        label = " ".join(anchor.get_text(" ", strip=True).split()) or absolute_url
        if _host(absolute_url) == start_host:
            internal.setdefault(absolute_url, label)
        else:
            external.setdefault(absolute_url, label)

    return {
        "internal": [{"url": url, "text": text} for url, text in internal.items()],
        "external": [{"url": url, "text": text} for url, text in external.items()],
    }


def _extract_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return "\n".join(
        line for line in (" ".join(chunk.split()) for chunk in soup.get_text("\n").splitlines()) if line
    )


def _title(soup: BeautifulSoup) -> str:
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    return ""


def _meta_description(soup: BeautifulSoup) -> str:
    tag = soup.find("meta", attrs={"name": "description"})
    if not tag:
        tag = soup.find("meta", attrs={"property": "og:description"})
    return str(tag.get("content", "")).strip() if tag else ""


def _headings(soup: BeautifulSoup) -> dict[str, list[str]]:
    return {
        level: [" ".join(tag.get_text(" ", strip=True).split()) for tag in soup.find_all(level)]
        for level in ("h1", "h2", "h3")
    }
