"""Create fictional PDF/DOCX integration fixtures with only the Python standard library."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape

ROOT = Path(__file__).parent / 'fixtures'
ROOT.mkdir(exist_ok=True)
LINES = ['Fictional candidate - document integration fixture',
         'Built Python services and SQL data pipelines.',
         'Developed React interfaces with TypeScript.',
         'Wrote automated testing with pytest and used Git.']

def pdf(path, lines, pages=1):
    # Standard PDF 1.4 with a Helvetica font and a real cross-reference table.
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    kids = []
    for n in range(pages):
        page_id = len(objects) + 1
        stream_id = page_id + 1
        kids.append(f'{page_id} 0 R')
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {stream_id} 0 R >>'.encode())
        stream = 'BT /F1 12 Tf 50 742 Td 18 TL\n'
        for line in lines:
            literal = line.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
            stream += f'({literal}) Tj T*\n'
        stream += 'ET'
        data = stream.encode('ascii')
        objects.append(f'<< /Length {len(data)} >>\nstream\n'.encode() + data + b'\nendstream')
    objects[1] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {pages} >>'.encode()
    data = b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n'
    xref = len(data)
    data += f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode()
    data += b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:])
    data += f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    path.write_bytes(data)

pdf(ROOT / 'resume.pdf', LINES)
pdf(ROOT / 'no-text.pdf', [])
pdf(ROOT / 'too-many-pages.pdf', LINES, pages=31)
(ROOT / 'malformed.pdf').write_text('Not a PDF document')
with ZipFile(ROOT / 'resume.docx', 'w', ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>''')
    z.writestr('_rels/.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>''')
    body = ''.join(f'<w:p><w:r><w:t>{escape(line)}</w:t></w:r></w:p>' for line in LINES)
    z.writestr('word/document.xml', f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>')
print('Created 5 fictional document fixtures in', ROOT)
