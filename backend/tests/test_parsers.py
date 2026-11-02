import io
import unittest

from docx import Document as DocxDocument

from app.services.parsers import extract_text


def make_text_pdf(text: str) -> bytes:
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode())
        pdf.extend(body)
        pdf.extend(b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    )
    return bytes(pdf)


class ParserTests(unittest.TestCase):
    def test_pdf_extraction_preserves_page_number(self) -> None:
        result = extract_text("brief.pdf", make_text_pdf("Pilot launch is scheduled for 15 October."))
        self.assertEqual(result.page_count, 1)
        self.assertEqual(result.segments[0]["page_number"], 1)
        self.assertIn("15 October", result.text)

    def test_docx_and_csv_extraction(self) -> None:
        document = DocxDocument()
        document.add_paragraph("The pilot opens in October for ten customers.")
        docx_bytes = io.BytesIO()
        document.save(docx_bytes)
        docx_result = extract_text("brief.docx", docx_bytes.getvalue())
        self.assertIn("ten customers", docx_result.text)

        csv_result = extract_text("brief.csv", b"topic,details\nPilot,Ten customers start in October.\n")
        self.assertEqual(csv_result.page_count, 1)
        self.assertIn("Ten customers start in October", csv_result.text)

    def test_empty_and_scanned_documents_are_rejected(self) -> None:
        empty_document = DocxDocument()
        empty_docx = io.BytesIO()
        empty_document.save(empty_docx)
        with self.assertRaisesRegex(ValueError, "No readable text"):
            extract_text("empty.docx", empty_docx.getvalue())
        with self.assertRaisesRegex(ValueError, "No readable rows"):
            extract_text("empty.csv", b",\n")
        with self.assertRaisesRegex(ValueError, "Scanned documents need OCR"):
            extract_text("scanned.pdf", make_text_pdf(""))


if __name__ == "__main__":
    unittest.main()
