"""Convert PROJECT_OVERVIEW.md to a neat Word file."""
import re
from pathlib import Path
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsmap
from docx.oxml import OxmlElement

SRC = Path(r"c:\naim\catalog-app\docs\PROJECT_OVERVIEW.md")
DST = Path(r"c:\naim\catalog-app\docs\PROJECT_OVERVIEW.docx")

PURPLE = RGBColor(0x6D, 0x28, 0xD9)
DARK = RGBColor(0x1F, 0x29, 0x37)
GREY = RGBColor(0x6B, 0x72, 0x80)
LIGHT_BG = "F3F4F6"
CODE_BG = "F5F5F5"

INLINE_CODE = re.compile(r"`([^`]+)`")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
ITALIC = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")

def set_cell_shading(cell, hex_color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    shd.set(qn("w:val"), "clear")
    tc_pr.append(shd)

def set_paragraph_shading(paragraph, hex_color):
    p_pr = paragraph._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    shd.set(qn("w:val"), "clear")
    p_pr.append(shd)

def add_horizontal_rule(paragraph):
    p_pr = paragraph._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "8")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "D1D5DB")
    pbdr.append(bottom)
    p_pr.append(pbdr)

def add_runs_with_inline_formatting(paragraph, text, base_size=11, base_color=DARK):
    """Parse **bold**, *italic*, `code` and emit styled runs."""
    pattern = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)")
    pos = 0
    for m in pattern.finditer(text):
        if m.start() > pos:
            run = paragraph.add_run(text[pos:m.start()])
            run.font.size = Pt(base_size)
            run.font.color.rgb = base_color
        tok = m.group(0)
        if tok.startswith("**"):
            run = paragraph.add_run(tok[2:-2])
            run.bold = True
            run.font.size = Pt(base_size)
            run.font.color.rgb = base_color
        elif tok.startswith("`"):
            run = paragraph.add_run(tok[1:-1])
            run.font.name = "Consolas"
            run.font.size = Pt(base_size - 1)
            run.font.color.rgb = RGBColor(0xBE, 0x18, 0x5D)
        elif tok.startswith("*"):
            run = paragraph.add_run(tok[1:-1])
            run.italic = True
            run.font.size = Pt(base_size)
            run.font.color.rgb = base_color
        pos = m.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        run.font.size = Pt(base_size)
        run.font.color.rgb = base_color

def style_heading(p, level):
    sizes = {0: 28, 1: 20, 2: 15, 3: 13}
    p.paragraph_format.space_before = Pt(18 if level <= 1 else 12)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = True
    for run in p.runs:
        run.font.size = Pt(sizes.get(level, 12))
        run.font.color.rgb = PURPLE if level <= 1 else DARK
        run.font.bold = True
        run.font.name = "Calibri"

def parse_markdown(lines):
    """Yield blocks: ('h', level, text), ('p', text), ('bullet', text), ('num', text),
       ('code', text), ('table', [rows]), ('hr',), ('quote', text), ('blank',)."""
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i].rstrip("\n")
        stripped = line.strip()

        if not stripped:
            yield ("blank",)
            i += 1
            continue

        if stripped.startswith("```"):
            buf = []
            i += 1
            while i < n and not lines[i].lstrip().startswith("```"):
                buf.append(lines[i].rstrip("\n"))
                i += 1
            i += 1  # skip closing ```
            yield ("code", "\n".join(buf))
            continue

        if stripped.startswith("#"):
            m = re.match(r"^(#+)\s+(.*)$", stripped)
            if m:
                level = len(m.group(1)) - 1
                yield ("h", level, m.group(2))
                i += 1
                continue

        if stripped == "---" or re.match(r"^-{3,}$", stripped):
            yield ("hr",)
            i += 1
            continue

        if stripped.startswith("> "):
            yield ("quote", stripped[2:])
            i += 1
            continue

        # Tables
        if "|" in stripped and i + 1 < n and re.match(r"^\s*\|?[\s\-:|]+\|?\s*$", lines[i + 1]):
            rows = []
            header = [c.strip() for c in stripped.strip("|").split("|")]
            rows.append(header)
            i += 2  # skip header + divider
            while i < n and "|" in lines[i] and lines[i].strip():
                row = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                rows.append(row)
                i += 1
            yield ("table", rows)
            continue

        m = re.match(r"^(\s*)[-*]\s+(.*)$", line)
        if m:
            indent = len(m.group(1))
            yield ("bullet", indent, m.group(2))
            i += 1
            continue

        m = re.match(r"^(\s*)(\d+)\.\s+(.*)$", line)
        if m:
            indent = len(m.group(1))
            yield ("num", indent, m.group(3))
            i += 1
            continue

        # Paragraph (potentially multi-line until blank)
        buf = [stripped]
        i += 1
        while i < n and lines[i].strip() and not re.match(r"^(#|\s*[-*]\s|\s*\d+\.\s|>\s|```|\|)", lines[i]):
            # also break if next line is a table divider candidate
            if "|" in lines[i] and i + 1 < n and re.match(r"^\s*\|?[\s\-:|]+\|?\s*$", lines[i] if False else "x"):
                break
            buf.append(lines[i].strip())
            i += 1
        yield ("p", " ".join(buf))

def build_doc():
    text = SRC.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=False)

    doc = Document()

    # Page setup
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.2)

    # Default style
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    style.font.color.rgb = DARK
    style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.line_spacing = 1.25

    blocks = list(parse_markdown(lines))

    for block in blocks:
        kind = block[0]

        if kind == "blank":
            continue

        if kind == "hr":
            p = doc.add_paragraph()
            add_horizontal_rule(p)
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(8)
            continue

        if kind == "h":
            _, level, txt = block
            if level == 0:
                # Title
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run(txt)
                run.font.name = "Calibri"
                run.font.size = Pt(32)
                run.font.bold = True
                run.font.color.rgb = PURPLE
                p.paragraph_format.space_before = Pt(0)
                p.paragraph_format.space_after = Pt(4)
            else:
                p = doc.add_paragraph()
                add_runs_with_inline_formatting(p, txt)
                style_heading(p, level)
            continue

        if kind == "quote":
            _, txt = block
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.space_after = Pt(8)
            run = p.add_run(txt)
            run.italic = True
            run.font.size = Pt(11)
            run.font.color.rgb = GREY
            continue

        if kind == "code":
            _, txt = block
            for line in txt.split("\n"):
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.1
                set_paragraph_shading(p, CODE_BG)
                run = p.add_run(line if line else " ")
                run.font.name = "Consolas"
                run.font.size = Pt(9)
                run.font.color.rgb = DARK
            # spacing after the block
            spacer = doc.add_paragraph()
            spacer.paragraph_format.space_after = Pt(4)
            continue

        if kind == "bullet":
            _, indent, txt = block
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.space_after = Pt(3)
            if indent >= 2:
                p.paragraph_format.left_indent = Cm(1.2)
            add_runs_with_inline_formatting(p, txt)
            continue

        if kind == "num":
            _, indent, txt = block
            p = doc.add_paragraph(style="List Number")
            p.paragraph_format.space_after = Pt(3)
            add_runs_with_inline_formatting(p, txt)
            continue

        if kind == "table":
            _, rows = block
            if not rows:
                continue
            cols = max(len(r) for r in rows)
            table = doc.add_table(rows=len(rows), cols=cols)
            table.alignment = WD_TABLE_ALIGNMENT.CENTER
            table.autofit = True
            try:
                table.style = "Light Grid Accent 1"
            except KeyError:
                pass
            for r_idx, row in enumerate(rows):
                for c_idx in range(cols):
                    cell = table.rows[r_idx].cells[c_idx]
                    cell_text = row[c_idx] if c_idx < len(row) else ""
                    cell.text = ""
                    p = cell.paragraphs[0]
                    p.paragraph_format.space_after = Pt(2)
                    if r_idx == 0:
                        set_cell_shading(cell, "EDE9FE")
                        add_runs_with_inline_formatting(p, cell_text, base_size=10)
                        for run in p.runs:
                            run.bold = True
                            run.font.color.rgb = PURPLE
                    else:
                        add_runs_with_inline_formatting(p, cell_text, base_size=10)
                    cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP
            # spacer
            doc.add_paragraph()
            continue

        if kind == "p":
            _, txt = block
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(8)
            add_runs_with_inline_formatting(p, txt)
            continue

    doc.save(DST)
    print(f"Saved: {DST}")

if __name__ == "__main__":
    build_doc()
