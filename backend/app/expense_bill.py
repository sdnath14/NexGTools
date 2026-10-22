"""Small dependency-free PDF renderer for expense statements."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from pathlib import Path
import unicodedata


PAGE_WIDTH, PAGE_HEIGHT = 595, 842
LEFT, RIGHT = 42, 553
BLUE = (0.02, 0.48, 0.89)
YELLOW = (1.0, 0.68, 0.0)
RED = (0.88, 0.10, 0.13)
GREEN = (0.08, 0.52, 0.37)
INK = (0.10, 0.16, 0.23)
MUTED = (0.43, 0.49, 0.56)
PALE_BLUE = (0.91, 0.96, 1.0)
PALE_YELLOW = (1.0, 0.97, 0.88)
PALE_GREEN = (0.91, 0.97, 0.93)
PALE_RED = (1.0, 0.93, 0.93)


def _ascii(value: object) -> str:
    value = str(value or '').replace('₹', 'INR ')
    return unicodedata.normalize('NFKD', value).encode('ascii', 'replace').decode('ascii')


def _escape(value: object) -> str:
    return _ascii(value).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _money(value: object) -> str:
    return f"INR {Decimal(str(value or 0)):,.2f}"


def _short(value: object, length: int) -> str:
    value = _ascii(value)
    return value if len(value) <= length else value[:length - 3].rstrip() + '...'


class _Page:
    def __init__(self):
        self.commands: list[str] = []

    def fill(self, color: tuple[float, float, float]):
        self.commands.append(f'{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg')

    def stroke(self, color: tuple[float, float, float]):
        self.commands.append(f'{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG')

    def rect(self, x: float, y: float, width: float, height: float, color: tuple[float, float, float]):
        self.fill(color)
        self.commands.append(f'{x} {y} {width} {height} re f')

    def line(self, x1: float, y1: float, x2: float, y2: float, color=MUTED):
        self.stroke(color)
        self.commands.append(f'{x1} {y1} m {x2} {y2} l S')

    def text(self, x: float, y: float, value: object, size: float = 10, bold: bool = False, color=INK):
        self.fill(color)
        self.commands.append(f'BT /F{2 if bold else 1} {size} Tf {x} {y} Td ({_escape(value)}) Tj ET')

    def image(self, x: float, y: float, width: float, height: float):
        self.commands.append(f'q {width} 0 0 {height} {x} {y} cm /Im1 Do Q')

    def bytes(self) -> bytes:
        return ('\n'.join(self.commands) + '\n').encode('ascii')


def _encode_pdf(pages: list[_Page]) -> bytes:
    image_id = 5 + len(pages) * 2
    objects: list[bytes] = [b''] * image_id
    objects[0] = b'<< /Type /Catalog /Pages 2 0 R >>'
    objects[2] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    objects[3] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
    kids = []
    for index, page in enumerate(pages):
        page_id = 5 + index * 2
        content_id = page_id + 1
        kids.append(f'{page_id} 0 R')
        objects[page_id - 1] = (f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] '
                                f'/Resources << /Font << /F1 3 0 R /F2 4 0 R >> '
                                f'/XObject << /Im1 {image_id} 0 R >> >> /Contents {content_id} 0 R >>').encode()
        contents = page.bytes()
        objects[content_id - 1] = f'<< /Length {len(contents)} >>\nstream\n'.encode() + contents + b'endstream'
    objects[1] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(pages)} >>'.encode()
    image = (Path(__file__).parent / 'assets' / 'nexg-logo-mark.jpg').read_bytes()
    objects[image_id - 1] = (f'<< /Type /XObject /Subtype /Image /Width 370 /Height 128 '
                             f'/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode '
                             f'/Length {len(image)} >>\nstream\n').encode() + image + b'\nendstream'
    output = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for number, body in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f'{number} 0 obj\n'.encode() + body + b'\nendobj\n')
    xref = len(output)
    output.extend(f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:
        output.extend(f'{offset:010d} 00000 n \n'.encode())
    output.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    return bytes(output)


def render_expense_bill(rows: list[dict], scope: str, period: str, generated_at: datetime | None = None) -> bytes:
    generated_at = generated_at or datetime.now()
    totals = {status: sum((Decimal(str(row['amount'])) for row in rows if row['status'] == status), Decimal('0'))
              for status in ('Pending', 'Issue Raised', 'Approved', 'Reimbursed', 'Rejected')}
    totals['Pending'] += totals['Issue Raised']
    grand_total = sum((Decimal(str(row['amount'])) for row in rows), Decimal('0'))
    pages: list[_Page] = []

    def new_page(first: bool) -> tuple[_Page, int]:
        page = _Page()
        pages.append(page)
        page.rect(LEFT, 815, 220, 5, BLUE)
        page.rect(LEFT + 220, 815, 145, 5, YELLOW)
        page.rect(LEFT + 365, 815, RIGHT - LEFT - 365, 5, RED)
        page.image(LEFT, 741, 179, 62)
        page.text(106, 734, 'PETROLUBE', 12, True, BLUE)
        page.text(322, 779, 'Expense Bill', 23, True, INK)
        page.text(323, 759, 'NEXG PETROLUBE  /  FINANCE', 8, True, BLUE)
        page.line(LEFT, 715, RIGHT, 715, (0.83, 0.88, 0.92))
        page.text(LEFT, 696, f'Prepared for: {_short(scope, 50)}', 9, True, INK)
        page.text(LEFT, 678, f'Period: {period}', 9, color=MUTED)
        page.text(326, 678, f'Generated: {generated_at:%d %b %Y, %I:%M %p}', 8.5, color=MUTED)
        if first:
            cards = [('TOTAL RECORDED', grand_total, PALE_BLUE, BLUE),
                     ('APPROVED TO PAY', totals['Approved'], PALE_GREEN, GREEN),
                     ('REIMBURSED', totals['Reimbursed'], PALE_YELLOW, YELLOW),
                     ('PENDING', totals['Pending'], PALE_RED, RED)]
            for index, (label, value, background, accent) in enumerate(cards):
                x = LEFT + index * 130
                page.rect(x, 585, 121, 68, background)
                page.rect(x, 647, 121, 6, accent)
                page.text(x + 9, 625, label, 7.1, True, MUTED)
                page.text(x + 9, 601, _money(value), 11, True, INK)
            y = 550
        else:
            y = 645
        page.text(LEFT, y, 'EXPENSE DETAILS', 9, True, BLUE)
        y -= 25
        page.rect(LEFT, y - 4, RIGHT - LEFT, 23, BLUE)
        columns = [(48, 'Date'), (104, 'User'), (173, 'Particulars'), (300, 'Category'),
                   (377, 'Type'), (435, 'Status'), (496, 'Amount')]
        for x, label in columns:
            page.text(x, y + 4, label, 7.4, True, (1, 1, 1))
        return page, y - 24

    page, y = new_page(True)
    if not rows:
        page.text(LEFT + 10, y - 17, 'No expenses recorded for this selection.', 10, color=MUTED)
    for index, row in enumerate(rows):
        if y < 83:
            page, y = new_page(False)
        if index % 2 == 0:
            page.rect(LEFT, y - 7, RIGHT - LEFT, 26, (0.955, 0.974, 0.990))
        page.rect(LEFT, y - 7, 3, 26, {'Approved': GREEN, 'Pending': YELLOW, 'Issue Raised': YELLOW,
                                       'Reimbursed': BLUE, 'Rejected': RED}.get(row['status'], BLUE))
        date = row['created_at']
        if isinstance(date, str):
            date = datetime.fromisoformat(date)
        values = [(48, date.strftime('%d %b %y'), 12), (104, _short(row['submitted_by'], 12), 12),
                  (173, _short(row['particulars'], 22), 22), (300, _short(row['category'], 13), 13),
                  (377, _short(row['expense_type'], 10), 10),
                  (435, _short({'Issue Raised': 'Issue', 'Reimbursed': 'Paid'}.get(row['status'], row['status']), 10), 10),
                  (496, _money(row['amount']), 14)]
        for x, value, _ in values:
            page.text(x, y + 2, value, 7.5, x == 496)
        y -= 26
    if y < 112:
        page, y = new_page(False)
    page.line(LEFT, y + 4, RIGHT, y + 4, (0.84, 0.88, 0.89))
    page.text(LEFT, y - 16, f'{len(rows)} expense(s)  |  Rejected: {_money(totals["Rejected"])}', 9, color=MUTED)
    page.text(400, y - 16, f'Total: {_money(grand_total)}', 10, True, BLUE)
    for number, item in enumerate(pages, 1):
        item.line(LEFT, 53, RIGHT, 53, (0.84, 0.88, 0.89))
        item.text(LEFT, 38, 'NexG Petrolube  |  Generated from saved expense records', 7.5, color=MUTED)
        item.text(505, 38, f'Page {number}/{len(pages)}', 7.5, color=MUTED)
    return _encode_pdf(pages)
