"""Small, dependency-free reader for the curated XLSX sheets used by this case."""

from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

MAIN = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PKG_REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'


def _cell_value(cell, shared):
    value = cell.find(MAIN + 'v')
    if value is not None:
        if cell.get('t') == 's':
            return shared[int(value.text)]
        return value.text
    inline = cell.find(MAIN + 'is')
    if inline is not None:
        return ''.join(t.text or '' for t in inline.iter(MAIN + 't'))
    return None


def iter_sheet(path: Path, sheet_name: str):
    """Yield nonempty curated rows as header-keyed strings/None, using cached values."""
    with ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        sheet = next((s for s in workbook.find(MAIN + 'sheets') if s.get('name') == sheet_name), None)
        if sheet is None:
            raise KeyError(f'{sheet_name} missing in {path}')
        rel_id = sheet.get(REL + 'id')
        rels = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        target = next(r.get('Target') for r in rels.findall(PKG_REL + 'Relationship') if r.get('Id') == rel_id)
        member = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            string_root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            shared = [''.join(t.text or '' for t in item.iter(MAIN + 't')) for item in string_root]
        headers = {}
        with archive.open(member) as stream:
            for _, elem in ET.iterparse(stream, events=('end',)):
                if elem.tag != MAIN + 'row':
                    continue
                cells = {}
                for cell in elem.findall(MAIN + 'c'):
                    ref = cell.get('r', '')
                    col = ''.join(ch for ch in ref if ch.isalpha())
                    cells[col] = _cell_value(cell, shared)
                if not headers:
                    headers = {col: name for col, name in cells.items() if name}
                elif any(value is not None for value in cells.values()):
                    yield {name: cells.get(col) for col, name in headers.items()}
                elem.clear()
