"""Cursor AI 활용 교육 PPT 생성 — Holiday 연차 관리 시스템 실전 사례."""

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import nsmap
from pptx.oxml.xmlchemy import OxmlElement
from pptx.util import Emu, Inches, Pt
from lxml import etree
from pathlib import Path

# 16:9
W, H = Inches(13.333), Inches(7.5)

NAVY = RGBColor(0x0B, 0x12, 0x20)
NAVY2 = RGBColor(0x16, 0x1E, 0x32)
VIOLET = RGBColor(0x6D, 0x28, 0xD9)
VIOLET_LT = RGBColor(0x8B, 0x5C, 0xF6)
PURPLE_BG = RGBColor(0xEE, 0xEB, 0xFF)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
OFF = RGBColor(0xF8, 0xF7, 0xFC)
SLATE = RGBColor(0x47, 0x55, 0x69)
SLATE_DK = RGBColor(0x1E, 0x29, 0x3B)
INK = RGBColor(0x0F, 0x17, 0x2A)
GREEN = RGBColor(0x05, 0x96, 0x69)
GREEN_BG = RGBColor(0xEC, 0xFD, 0xF5)
RED = RGBColor(0xDC, 0x26, 0x26)
RED_BG = RGBColor(0xFE, 0xF2, 0xF2)
AMBER = RGBColor(0xD9, 0x77, 0x06)
AMBER_BG = RGBColor(0xFF, 0xF7, 0xED)
BLUE = RGBColor(0x25, 0x63, 0xEB)
BLUE_BG = RGBColor(0xEF, 0xF6, 0xFF)
CARD = RGBColor(0xFF, 0xFF, 0xFF)
LINE = RGBColor(0xE2, 0xE8, 0xF0)
CODE_BG = RGBColor(0x1E, 0x1B, 0x4B)

FONT = "Malgun Gothic"
FONT_EN = "Segoe UI"


def _set_run(run, size, bold=False, color=INK, font=FONT):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    rPr = run._r.get_or_add_rPr()
    ea = OxmlElement("a:ea")
    ea.set("typeface", FONT)
    rPr.append(ea)


def add_box(slide, l, t, w, h, fill, line=None):
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, l, t, w, h)
    sh.fill.solid()
    sh.fill.fore_color.rgb = fill
    sh.line.fill.background() if line is None else None
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(1)
    # round corners a bit
    try:
        sh.adjustments[0] = 0.08
    except Exception:
        pass
    return sh


def add_rect(slide, l, t, w, h, fill):
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, w, h)
    sh.fill.solid()
    sh.fill.fore_color.rgb = fill
    sh.line.fill.background()
    return sh


def add_tb(slide, l, t, w, h, text, size=16, bold=False, color=INK, align=PP_ALIGN.LEFT, font=FONT, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(l, t, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    try:
        tf._txBody.bodyPr.set("anchor", {MSO_ANCHOR.TOP: "t", MSO_ANCHOR.MIDDLE: "ctr", MSO_ANCHOR.BOTTOM: "b"}.get(anchor, "t"))
    except Exception:
        pass
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    _set_run(run, size, bold, color, font)
    return box


def add_multi(slide, l, t, w, h, lines, default_size=15, default_color=INK, align=PP_ALIGN.LEFT):
    """lines: list of str or (text, size, bold, color)."""
    box = slide.shapes.add_textbox(l, t, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(lines):
        if isinstance(item, str):
            text, size, bold, color = item, default_size, False, default_color
        else:
            text = item[0]
            size = item[1] if len(item) > 1 else default_size
            bold = item[2] if len(item) > 2 else False
            color = item[3] if len(item) > 3 else default_color
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(6)
        run = p.add_run()
        run.text = text
        _set_run(run, size, bold, color)
    return box


def footer(slide, n, total, light=False):
    c = RGBColor(0x94, 0xA3, 0xB8) if not light else RGBColor(0xA5, 0xB4, 0xC8)
    add_tb(slide, Inches(0.5), Inches(7.15), Inches(9), Inches(0.28),
           "Cursor AI 활용 교육  ·  Holiday 연차 관리 시스템", 10, False, c)
    add_tb(slide, Inches(11.2), Inches(7.15), Inches(1.6), Inches(0.28),
           f"{n}  /  {total}", 10, False, c, PP_ALIGN.RIGHT)


def pill(slide, l, t, w, h, text, fill=VIOLET, color=WHITE, size=11):
    add_box(slide, l, t, w, h, fill)
    add_tb(slide, l, t, w, h, text, size, True, color, PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def card(slide, l, t, w, h, title, body, accent=VIOLET, title_size=15, body_size=13):
    add_box(slide, l, t, w, h, WHITE, LINE)
    add_rect(slide, l, t, Inches(0.08), h, accent)
    add_tb(slide, l + Inches(0.28), t + Inches(0.18), w - Inches(0.4), Inches(0.38),
           title, title_size, True, INK)
    add_tb(slide, l + Inches(0.28), t + Inches(0.55), w - Inches(0.4), h - Inches(0.7),
           body, body_size, False, SLATE)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def light_bg(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_rect(s, 0, 0, W, H, OFF)
    add_rect(s, 0, 0, W, Inches(0.08), VIOLET)
    return s


def dark_bg(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_rect(s, 0, 0, W, H, NAVY)
    return s


def section_slide(prs, num, title, subtitle, n, total):
    s = dark_bg(prs)
    add_rect(s, 0, 0, Inches(0.18), H, VIOLET)
    add_tb(s, Inches(0.8), Inches(2.15), Inches(11), Inches(0.4),
           f"PART  {num}", 14, True, VIOLET_LT)
    add_tb(s, Inches(0.8), Inches(2.6), Inches(11.5), Inches(1.1),
           title, 36, True, WHITE)
    add_tb(s, Inches(0.8), Inches(3.85), Inches(11), Inches(0.7),
           subtitle, 18, False, RGBColor(0xCB, 0xD5, 0xE1))
    footer(s, n, total, light=True)
    return s


def build():
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    TOTAL = 24

    # ── 1 Cover ──
    s = dark_bg(prs)
    add_rect(s, 0, 0, Inches(0.22), H, VIOLET)
    add_rect(s, Inches(10.8), 0, Inches(2.533), H, NAVY2)
    pill(s, Inches(0.8), Inches(1.55), Inches(2.4), Inches(0.36), "실전 교육 자료")
    add_tb(s, Inches(0.8), Inches(2.15), Inches(9.5), Inches(1.4),
           "Cursor AI로\n사내 웹앱 만들기", 40, True, WHITE)
    add_tb(s, Inches(0.8), Inches(4.65), Inches(9.2), Inches(0.7),
           "Holiday 연차 관리 시스템  ·  기획부터 배포까지 한 프로젝트로 배우기", 16, False,
           RGBColor(0xCB, 0xD5, 0xE1))
    add_tb(s, Inches(0.8), Inches(6.55), Inches(8), Inches(0.35),
           "2026  ·  Cursor + React + Express + SQLite", 13, False, RGBColor(0x94, 0xA3, 0xB8))
    add_tb(s, Inches(11.05), Inches(3.0), Inches(2.1), Inches(1.6),
           "74명\n실데이터", 20, True, WHITE, PP_ALIGN.CENTER)
    add_tb(s, Inches(11.05), Inches(4.7), Inches(2.1), Inches(0.8),
           "사내 연차\n풀스택 앱", 13, False, RGBColor(0xCB, 0xD5, 0xE1), PP_ALIGN.CENTER)
    notes(s, "오프닝: 이 교육은 이론이 아니라, 실제로 만든 사내 연차 앱 Holiday를 사례로 Cursor 활용법을 익힙니다.")
    footer(s, 1, TOTAL, light=True)

    # ── 2 Agenda ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "오늘 배울 것", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "약 50분  ·  개념 → 사례 → 프롬프트 → 배포 → 실습", 14, False, SLATE)
    items = [
        ("01", "Cursor가 바꾸는 개발", "채팅만 하는 AI가 아니라, 코드를 읽고 고치고 실행하는 에이전트"),
        ("02", "Holiday로 보는 실전", "엑셀 연차 대장 → 웹앱 → 모바일 → 호스팅까지"),
        ("03", "잘 시키는 법", "프롬프트, 컨텍스트, Rules, MCP — 결과가 갈리는 지점"),
        ("04", "따라하기", "이 프로젝트에서 바로 써볼 수 있는 요청 문장"),
    ]
    for i, (num, title, body) in enumerate(items):
        y = Inches(1.35) + Inches(i * 1.3)
        add_box(s, Inches(0.6), y, Inches(12.1), Inches(1.15), WHITE, LINE)
        add_tb(s, Inches(0.85), y + Inches(0.28), Inches(1.0), Inches(0.55), num, 24, True, VIOLET)
        add_tb(s, Inches(2.1), y + Inches(0.22), Inches(10), Inches(0.4), title, 18, True, INK)
        add_tb(s, Inches(2.1), y + Inches(0.62), Inches(10), Inches(0.4), body, 14, False, SLATE)
    footer(s, 2, TOTAL)

    # ── 3 Why ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "왜 Cursor인가", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.4),
           "코드를 ‘설명’하는 도구가 아니라, 프로젝트 안에서 ‘작업’하는 도구입니다.", 15, False, SLATE)
    cols = [
        (VIOLET, "읽는다", "폴더·파일·에러 로그·브라우저까지\n현재 프로젝트 맥락을 보고 답합니다."),
        (BLUE, "고친다", "여러 파일을 한꺼번에 수정하고\n린트·테스트까지 이어서 돌립니다."),
        (GREEN, "실행한다", "터미널 명령, 배포 MCP, 브라우저 확인까지\n한 대화에서 끝까지 갑니다."),
    ]
    for i, (c, t, b) in enumerate(cols):
        x = Inches(0.6) + Inches(i * 4.15)
        add_box(s, x, Inches(1.5), Inches(3.95), Inches(4.7), WHITE, LINE)
        add_box(s, x + Inches(0.3), Inches(1.8), Inches(0.7), Inches(0.7), c)
        add_tb(s, x + Inches(0.3), Inches(1.9), Inches(0.7), Inches(0.5), str(i + 1), 18, True, WHITE, PP_ALIGN.CENTER)
        add_tb(s, x + Inches(0.3), Inches(2.7), Inches(3.35), Inches(0.5), t, 22, True, INK)
        add_tb(s, x + Inches(0.3), Inches(3.35), Inches(3.35), Inches(2.4), b, 15, False, SLATE)
    footer(s, 3, TOTAL)

    # ── 4 Compare ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "비슷한 도구, 다른 역할", 28, True, INK)
    headers = ["", "ChatGPT 웹", "GitHub Copilot", "Cursor"]
    rows = [
        ["작업 장소", "브라우저 채팅", "에디터 자동완성", "프로젝트 전체 IDE"],
        ["코드 수정", "복사해서 붙임", "커서 근처 제안", "여러 파일 직접 편집"],
        ["실행", "불가", "제한적", "터미널·브라우저·배포"],
        ["맥락", "붙여넣은 만큼", "열린 파일 위주", "저장소 + Rules + MCP"],
        ["이 프로젝트에선", "아이디어 상의", "한 줄 보강", "앱을 처음부터 만듦"],
    ]
    # header
    add_box(s, Inches(0.5), Inches(1.15), Inches(12.3), Inches(0.55), NAVY)
    xs = [0.5, 2.7, 5.9, 9.1]
    ws = [2.2, 3.2, 3.2, 3.7]
    for x, w, htxt in zip(xs, ws, headers):
        add_tb(s, Inches(x), Inches(1.22), Inches(w), Inches(0.42), htxt, 13, True, WHITE, PP_ALIGN.CENTER)
    for ri, row in enumerate(rows):
        y = Inches(1.78) + Inches(ri * 0.85)
        bg = WHITE if ri % 2 == 0 else PURPLE_BG
        add_rect(s, Inches(0.5), y, Inches(12.3), Inches(0.85), bg)
        for ci, (x, w) in enumerate(zip(xs, ws)):
            bold = ci == 0 or (ci == 3)
            col = VIOLET if ci == 3 else INK
            add_tb(s, Inches(x) + Inches(0.1), y + Inches(0.22), Inches(w) - Inches(0.15), Inches(0.5),
                   row[ci], 13, bold, col, PP_ALIGN.CENTER if ci else PP_ALIGN.LEFT)
    footer(s, 4, TOTAL)

    # ── 5 section Holiday ──
    section_slide(prs, "02", "사례: Holiday 연차 관리",
                  "엑셀로 관리하던 사내 연차를, Cursor로 웹 서비스로 만든 실제 프로젝트", 5, TOTAL)

    # ── 6 Problem ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "해결한 문제", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "연차 대장을 엑셀로 관리하면 생기는 일을, 앱 한 개로 바꿨습니다.", 15, False, SLATE)
    before = [
        "74명 연차를 엑셀 파일 하나로 관리",
        "발생·사용·잔여 계산이 사람 손",
        "입사일·근속에 따른 규칙이 복잡",
        "모바일에서 보기 어렵고 공유가 불편",
        "퇴사·재직 처리가 파일 수정에 의존",
    ]
    after = [
        "직원/관리자 화면이 나뉜 웹앱",
        "규칙이 코드로 고정 (1/1 회계기준)",
        "신청·캘린더·명부·수정이 한곳",
        "PC·휴대폰 같은 Wi-Fi에서 접속",
        "카페24 AI Space로 배포 가능",
    ]
    add_box(s, Inches(0.55), Inches(1.35), Inches(5.9), Inches(5.35), WHITE, LINE)
    add_tb(s, Inches(0.85), Inches(1.55), Inches(5.3), Inches(0.4), "Before  ·  엑셀", 18, True, RED)
    for i, t in enumerate(before):
        add_tb(s, Inches(0.9), Inches(2.15) + Inches(i * 0.8), Inches(5.2), Inches(0.7), f"·  {t}", 15, False, SLATE_DK)

    add_box(s, Inches(6.85), Inches(1.35), Inches(5.9), Inches(5.35), WHITE, LINE)
    add_tb(s, Inches(7.15), Inches(1.55), Inches(5.3), Inches(0.4), "After  ·  Holiday 앱", 18, True, GREEN)
    for i, t in enumerate(after):
        add_tb(s, Inches(7.2), Inches(2.15) + Inches(i * 0.8), Inches(5.2), Inches(0.7), f"·  {t}", 15, False, SLATE_DK)
    footer(s, 6, TOTAL)

    # ── 7 Product map ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "한 앱에 들어간 화면", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "직원용 4화면 + 관리자 5화면. 포트 3001 하나로 PC·모바일 모두 접속합니다.", 15, False, SLATE)
    emp = [
        ("/employee", "대시보드", "잔여 연차 · 규칙 안내"),
        ("/employee/history", "발생 내역", "월차 · 비례 · 정규"),
        ("/employee/calendar", "캘린더", "사용한 날 한눈에"),
        ("/employee/request", "연차 신청", "모달로 바로 신청"),
    ]
    adm = [
        ("/admin", "Overview", "전사 현황"),
        ("/admin/roster", "사원 명부", "입사 · 퇴사 · 재직"),
        ("/admin/employees", "연차 현황", "사번 포함 목록"),
        ("/admin/leave-manage", "발생·사용 수정", "직원별 정정"),
    ]
    add_tb(s, Inches(0.6), Inches(1.25), Inches(6), Inches(0.35), "직원", 14, True, VIOLET)
    add_tb(s, Inches(6.85), Inches(1.25), Inches(6), Inches(0.35), "관리자", 14, True, BLUE)
    for i, (path, title, desc) in enumerate(emp):
        y = Inches(1.7) + Inches(i * 1.15)
        add_box(s, Inches(0.55), y, Inches(5.95), Inches(1.05), WHITE, LINE)
        add_tb(s, Inches(0.8), y + Inches(0.12), Inches(5.5), Inches(0.35), title, 16, True, INK)
        add_tb(s, Inches(0.8), y + Inches(0.5), Inches(5.5), Inches(0.4), f"{path}   ·   {desc}", 12, False, SLATE)
    for i, (path, title, desc) in enumerate(adm):
        y = Inches(1.7) + Inches(i * 1.15)
        add_box(s, Inches(6.8), y, Inches(5.95), Inches(1.05), WHITE, LINE)
        add_tb(s, Inches(7.05), y + Inches(0.12), Inches(5.5), Inches(0.35), title, 16, True, INK)
        add_tb(s, Inches(7.05), y + Inches(0.5), Inches(5.5), Inches(0.4), f"{path}   ·   {desc}", 12, False, SLATE)
    footer(s, 7, TOTAL)

    # ── 8 Stack ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "기술 스택 — Cursor가 다루기 좋은 구성", 26, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.4),
           "최신 메이저 버전이지만, 역할이 분명해서 AI가 파일을 찾기 쉽습니다.", 15, False, SLATE)
    stacks = [
        ("프론트", VIOLET, "React 19  ·  Vite  ·  Tailwind v4\nReact Query  ·  Zustand  ·  Router"),
        ("백엔드", BLUE, "Express 5\nAPI + 정적 파일 동시 서빙\n포트 3001 하나"),
        ("데이터", GREEN, "SQLite (better-sqlite3)\nExcel → DB 임포트\n74명 실데이터"),
        ("운영", AMBER, "npm run restart\nLAN IP 자동 감지\n카페24 AI Space MCP"),
    ]
    for i, (t, c, b) in enumerate(stacks):
        x = Inches(0.5) + Inches(i * 3.2)
        add_box(s, x, Inches(1.45), Inches(3.05), Inches(3.35), WHITE, LINE)
        add_rect(s, x, Inches(1.45), Inches(3.05), Inches(0.12), c)
        add_tb(s, x + Inches(0.2), Inches(1.75), Inches(2.65), Inches(0.45), t, 16, True, c)
        add_tb(s, x + Inches(0.2), Inches(2.35), Inches(2.65), Inches(2.1), b, 14, False, SLATE_DK)
    add_box(s, Inches(0.5), Inches(5.05), Inches(12.3), Inches(1.7), PURPLE_BG)
    add_tb(s, Inches(0.8), Inches(5.25), Inches(11.8), Inches(0.4), "교육 포인트", 14, True, VIOLET)
    add_tb(s, Inches(0.8), Inches(5.7), Inches(11.8), Inches(0.8),
           "AI에게 “프론트는 src/, API는 server/, 계산 로직은 src/utils/leaveCalculations.js”처럼 위치가 정해져 있으면 실수가 줄어듭니다. Cursor Rules로 이 구조를 고정할 수 있습니다.",
           15, False, SLATE_DK)
    footer(s, 8, TOTAL)

    # ── 9 Architecture ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "아키텍처를 한 장으로", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "브라우저 → Express(3001) → SQLite. 개발 모드만 Vite 5173이 따로 뜹니다.", 15, False, SLATE)

    boxes = [
        (0.6, 1.5, 3.6, 2.15, "브라우저", "직원 UI  /  관리자 UI\n모바일 하단 탭 · PC 사이드바"),
        (5.0, 1.5, 3.6, 2.15, "Express", "GET /health  ·  /api/*\ndist/ 정적 파일 서빙"),
        (9.35, 1.5, 3.45, 2.15, "SQLite", "employees · leave\nExcel 임포트 결과"),
    ]
    for x, y, w, h, title, body in boxes:
        add_box(s, Inches(x), Inches(y), Inches(w), Inches(h), WHITE, LINE)
        add_tb(s, Inches(x + 0.2), Inches(y + 0.25), Inches(w - 0.4), Inches(0.4), title, 18, True, VIOLET)
        add_tb(s, Inches(x + 0.2), Inches(y + 0.8), Inches(w - 0.4), Inches(1.1), body, 14, False, SLATE)
    # arrows as text
    add_tb(s, Inches(4.15), Inches(2.15), Inches(0.9), Inches(0.5), "→", 28, True, VIOLET, PP_ALIGN.CENTER)
    add_tb(s, Inches(8.5), Inches(2.15), Inches(0.9), Inches(0.5), "→", 28, True, VIOLET, PP_ALIGN.CENTER)

    add_box(s, Inches(0.6), Inches(4.0), Inches(5.9), Inches(2.55), WHITE, LINE)
    add_tb(s, Inches(0.85), Inches(4.2), Inches(5.4), Inches(0.4), "연차 규칙 (코드)", 16, True, INK)
    add_tb(s, Inches(0.85), Inches(4.7), Inches(5.4), Inches(1.6),
           "회계 기준일 매년 1/1\n첫해: 입사 후 월 1개 (최대 11)\n1년 도달 ~ 다음 1/1 전: 비례 연차\n이후: 정규 15일 + 근속 가산", 14, False, SLATE)

    add_box(s, Inches(6.8), Inches(4.0), Inches(5.95), Inches(2.55), WHITE, LINE)
    add_tb(s, Inches(7.05), Inches(4.2), Inches(5.5), Inches(0.4), "핵심 파일", 16, True, INK)
    add_tb(s, Inches(7.05), Inches(4.7), Inches(5.5), Inches(1.6),
           "src/utils/leaveCalculations.js  계산\nserver/routes/api.js  API\ndatabase/schema.sql  스키마\n.cursor/mcp.json  카페24 배포", 14, False, SLATE)
    footer(s, 9, TOTAL)

    # ── 10 Journey ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "Cursor로 만든 순서 (실제 흐름)", 26, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "한 번에 완성되지 않았습니다. 대화로 기능을 쌓아 올린 기록입니다.", 15, False, SLATE)
    steps = [
        ("1", "데이터", "엑셀 연차 대장을\nSQLite로 임포트"),
        ("2", "규칙", "첫해·비례·정규·가산\n계산 로직을 코드화"),
        ("3", "화면", "직원/관리자 UI\nStripe 스타일로 정리"),
        ("4", "운영", "한 포트 실행,\n모바일·LAN 접속"),
        ("5", "배포", "MCP로 카페24\nAI Space 연결"),
    ]
    for i, (n, t, b) in enumerate(steps):
        x = Inches(0.45) + Inches(i * 2.55)
        add_box(s, x, Inches(1.5), Inches(2.4), Inches(3.55), WHITE, LINE)
        add_box(s, x + Inches(0.85), Inches(1.75), Inches(0.7), Inches(0.7), VIOLET)
        add_tb(s, x + Inches(0.85), Inches(1.85), Inches(0.7), Inches(0.5), n, 20, True, WHITE, PP_ALIGN.CENTER)
        add_tb(s, x + Inches(0.12), Inches(2.65), Inches(2.16), Inches(0.45), t, 16, True, INK, PP_ALIGN.CENTER)
        add_tb(s, x + Inches(0.12), Inches(3.2), Inches(2.16), Inches(1.5), b, 13, False, SLATE, PP_ALIGN.CENTER)
        if i < 4:
            add_tb(s, x + Inches(2.15), Inches(2.9), Inches(0.45), Inches(0.4), "›", 22, True, VIOLET_LT, PP_ALIGN.CENTER)
    add_box(s, Inches(0.5), Inches(5.3), Inches(12.3), Inches(1.4), AMBER_BG)
    add_tb(s, Inches(0.8), Inches(5.5), Inches(11.8), Inches(0.35), "강의에서 강조할 한 문장", 13, True, AMBER)
    add_tb(s, Inches(0.8), Inches(5.9), Inches(11.8), Inches(0.55),
           "“처음부터 완벽한 스펙을 주지 않아도 됩니다. 목표 → 한 화면 → 규칙 → 배포처럼 단계를 나눠 시키면 Cursor가 훨씬 잘합니다.”",
           15, False, SLATE_DK)
    footer(s, 10, TOTAL)

    # ── 11 section prompting ──
    section_slide(prs, "03", "잘 시키는 법",
                  "같은 AI라도, 요청 문장과 컨텍스트에 따라 Holiday 결과가 완전히 달라집니다", 11, TOTAL)

    # ── 12 Modes ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "Cursor에서 자주 쓰는 모드", 28, True, INK)
    modes = [
        ("Ask", "질문·탐색", "코드를 바꾸지 않고 설명만.\n“연차 가산은 어디서 계산해?”"),
        ("Agent", "작업 수행", "파일 수정·명령 실행·검증까지.\n“사원 명부에 사번 칼럼 추가해줘”"),
        ("Plan", "설계 먼저", "여러 안이 있을 때 설계부터.\n“인증을 넣으려면 어떤 구조가 좋지?”"),
        ("Tab / Inline", "한 줄 보강", "타이핑 중 자동완성.\n함수 시그니처·반복 코드"),
    ]
    for i, (t, sub, b) in enumerate(modes):
        x = Inches(0.5) + Inches((i % 2) * 6.4)
        y = Inches(1.2) + Inches((i // 2) * 2.7)
        add_box(s, x, y, Inches(6.15), Inches(2.5), WHITE, LINE)
        pill(s, x + Inches(0.3), y + Inches(0.28), Inches(1.7), Inches(0.36), t, VIOLET if i == 1 else SLATE_DK)
        add_tb(s, x + Inches(2.15), y + Inches(0.3), Inches(3.7), Inches(0.35), sub, 16, True, INK)
        add_tb(s, x + Inches(0.3), y + Inches(0.9), Inches(5.55), Inches(1.3), b, 15, False, SLATE)
    footer(s, 12, TOTAL)
    notes(s, "Holiday 교육에서는 Agent를 중심으로 시연하고, 규칙 설명이 필요할 때만 Ask로 전환하라고 안내합니다.")

    # ── 13 Bad vs Good prompt ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "프롬프트가 갈리는 지점", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "Holiday에서 실제로 쓸 법한 문장입니다. 오른쪽처럼 말하면 수정 범위가 좁아집니다.", 14, False, SLATE)

    add_box(s, Inches(0.5), Inches(1.3), Inches(6.05), Inches(5.4), WHITE, LINE)
    add_tb(s, Inches(0.75), Inches(1.5), Inches(5.6), Inches(0.4), "약한 요청", 16, True, RED)
    bads = [
        "연차 앱 예쁘게 만들어줘",
        "버그 고쳐줘",
        "배포해줘",
        "모바일도 되게 해줘",
        "계산이 이상한 것 같아",
    ]
    for i, t in enumerate(bads):
        add_box(s, Inches(0.75), Inches(2.1) + Inches(i * 0.82), Inches(5.55), Inches(0.7), RED_BG)
        add_tb(s, Inches(0.95), Inches(2.25) + Inches(i * 0.82), Inches(5.2), Inches(0.45), t, 14, False, RGBColor(0x99, 0x1B, 0x1B))

    add_box(s, Inches(6.75), Inches(1.3), Inches(6.05), Inches(5.4), WHITE, LINE)
    add_tb(s, Inches(7.0), Inches(1.5), Inches(5.6), Inches(0.4), "잘 되는 요청", 16, True, GREEN)
    goods = [
        "관리자 명부 목록만 Stripe 카드로. 직원 화면은 건드리지 마.",
        "/admin/roster에서 퇴사일 저장 후 목록이 안 바뀌면 원인부터.",
        "space_02에 Holiday 배포. MCP 가이드 먼저 확인.",
        "768px 미만에서 명부를 카드로, 테이블은 PC만.",
        "입사 2025-03-01, 기준일 2026-08-31 비례연차 계산 검증해줘.",
    ]
    for i, t in enumerate(goods):
        add_box(s, Inches(7.0), Inches(2.1) + Inches(i * 0.82), Inches(5.55), Inches(0.7), GREEN_BG)
        add_tb(s, Inches(7.15), Inches(2.18) + Inches(i * 0.82), Inches(5.3), Inches(0.58), t, 12, False, RGBColor(0x06, 0x5F, 0x46))
    footer(s, 13, TOTAL)

    # ── 14 Prompt recipe ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "요청 문장 레시피 (5요소)", 28, True, INK)
    recipe = [
        ("목표", "무엇을 끝낼지 한 줄", "사원 명부에 사번을 보이게 한다"),
        ("범위", "어디를 건드릴지 / 어디는 금지", "roster·employees만. 연차 계산은 금지"),
        ("제약", "디자인·규칙·데이터", "기존 Stripe 톤, empNo 필드 사용"),
        ("검증", "어떻게 확인할지", "PC 테이블·모바일 카드 둘 다 확인"),
        ("맥락", "파일·에러·화면을 붙이기", "@AdminEmployeeRoster.jsx 와 스크린샷"),
    ]
    for i, (k, sub, ex) in enumerate(recipe):
        y = Inches(1.15) + Inches(i * 1.05)
        add_box(s, Inches(0.55), y, Inches(12.2), Inches(0.95), WHITE, LINE)
        add_box(s, Inches(0.75), y + Inches(0.22), Inches(1.5), Inches(0.5), VIOLET)
        add_tb(s, Inches(0.75), y + Inches(0.3), Inches(1.5), Inches(0.38), k, 14, True, WHITE, PP_ALIGN.CENTER)
        add_tb(s, Inches(2.5), y + Inches(0.12), Inches(4.5), Inches(0.35), sub, 13, True, SLATE)
        add_tb(s, Inches(2.5), y + Inches(0.48), Inches(9.9), Inches(0.38), f"예)  {ex}", 15, False, INK)
    footer(s, 14, TOTAL)

    # ── 15 Context ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "컨텍스트를 주는 방법", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "AI는 열려 있는 파일만 보는 것이 아닙니다. 의도적으로 재료를 넣어야 합니다.", 15, False, SLATE)
    ctx = [
        ("@파일 / @폴더", "수정할 화면·API를 지정.\n예: @leaveCalculations.js"),
        ("Rules", "프로젝트 습관을 고정.\n예: 커밋은 요청할 때만, .env 금지"),
        ("MCP", "외부 시스템 연결.\n이 프로젝트: 카페24 AI Space"),
        ("브라우저", "UI 변경 후 실제 클릭·입력으로 확인.\n스크린샷만으로 끝내지 않기"),
        ("에러 그대로", "터미널 출력·스택을 붙여넣기.\n‘안 돼요’보다 로그가 빠름"),
        ("README", "실행 방법·규칙을 문서로.\n다음 대화의 나침반이 됨"),
    ]
    for i, (t, b) in enumerate(ctx):
        x = Inches(0.5) + Inches((i % 3) * 4.2)
        y = Inches(1.35) + Inches((i // 3) * 2.55)
        add_box(s, x, y, Inches(4.0), Inches(2.35), WHITE, LINE)
        add_tb(s, x + Inches(0.25), y + Inches(0.25), Inches(3.5), Inches(0.45), t, 16, True, VIOLET)
        add_tb(s, x + Inches(0.25), y + Inches(0.85), Inches(3.5), Inches(1.2), b, 14, False, SLATE)
    footer(s, 15, TOTAL)

    # ── 16 MCP deploy ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "MCP 실전: 카페24에 배포", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "채팅에서 ‘배포해줘’가 동작하려면, Cursor가 호스팅 API를 부를 수 있어야 합니다.", 15, False, SLATE)

    steps_m = [
        ("1", "Settings → MCP", "cafe24-ai-space 연결\nOAuth 로그인"),
        ("2", "공간 확인", "list_my_spaces\n빈 공간(space_02) 확인"),
        ("3", "채팅으로 요청", "space_02에 Holiday\n배포해줘"),
        ("4", "환경 변수", "CURRENT_EMPLOYEE_ID\nAS_OF_DATE, DB_PATH"),
    ]
    for i, (n, t, b) in enumerate(steps_m):
        x = Inches(0.5) + Inches(i * 3.2)
        add_box(s, x, Inches(1.4), Inches(3.05), Inches(2.9), WHITE, LINE)
        add_tb(s, x + Inches(0.2), Inches(1.6), Inches(0.55), Inches(0.45), n, 22, True, VIOLET)
        add_tb(s, x + Inches(0.2), Inches(2.15), Inches(2.65), Inches(0.5), t, 15, True, INK)
        add_tb(s, x + Inches(0.2), Inches(2.7), Inches(2.65), Inches(1.3), b, 13, False, SLATE)

    add_box(s, Inches(0.5), Inches(4.55), Inches(12.3), Inches(2.15), NAVY)
    add_tb(s, Inches(0.8), Inches(4.75), Inches(11.8), Inches(0.35), "교육에서 보여줄 설정 파일  ·  .cursor/mcp.json", 13, True, VIOLET_LT)
    add_tb(s, Inches(0.8), Inches(5.2), Inches(11.8), Inches(1.2),
           '{  "mcpServers": {  "cafe24-ai-space": {  "url": "https://aih-proxy.cafe24.com/mcp"  }  }  }',
           16, False, WHITE, font=FONT_EN)
    footer(s, 16, TOTAL)

    # ── 17 Domain logic ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "도메인 로직은 AI에게 더 구체적으로", 26, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "UI보다 ‘연차 계산’처럼 업무 규칙이 있는 코드에서 프롬프트 품질이 드러납니다.", 15, False, SLATE)

    add_box(s, Inches(0.5), Inches(1.3), Inches(6.1), Inches(5.35), WHITE, LINE)
    add_tb(s, Inches(0.75), Inches(1.5), Inches(5.6), Inches(0.4), "Holiday 연차 3단계", 16, True, VIOLET)
    rules = [
        ("첫해 월차", "입사 후 매월 1개, 최대 11. 일사일에 정산."),
        ("비례 연차", "1년 도달 ~ 그다음 1/1 전. 15 × 남은일/365."),
        ("정규 연차", "매 1/1 발생. 기본 15 + 근속 가산."),
        ("근속 가산", "정규 연차 최초 발생일부터. 2년마다 1일."),
    ]
    for i, (t, b) in enumerate(rules):
        y = Inches(2.1) + Inches(i * 1.05)
        add_tb(s, Inches(0.85), y, Inches(5.5), Inches(0.35), t, 15, True, INK)
        add_tb(s, Inches(0.85), y + Inches(0.35), Inches(5.5), Inches(0.55), b, 13, False, SLATE)

    add_box(s, Inches(6.85), Inches(1.3), Inches(5.95), Inches(5.35), CODE_BG)
    add_tb(s, Inches(7.1), Inches(1.5), Inches(5.5), Inches(0.4), "이렇게 시키면 정확해집니다", 14, True, VIOLET_LT)
    add_tb(s, Inches(7.1), Inches(2.05), Inches(5.5), Inches(4.2),
           "leaveCalculations.js 기준으로\n입사일 2024-06-10,\n기준일 2026-08-31일 때\n\n· 지금 단계(월차/비례/정규)\n· 발생 일수\n· 가산이 붙는지\n\n숫자로 먼저 보여주고,\n코드는 그다음에 고쳐줘.",
           15, False, WHITE)
    footer(s, 17, TOTAL)

    # ── 18 Do / Don't ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "하면 좋은 것 / 하지 말 것", 28, True, INK)

    dos = [
        "한 대화 = 한 목표 (명부 사번, 배포, 버그 하나)",
        "UI를 바꿨으면 브라우저에서 클릭까지 확인",
        "README·변경 이력에 한 줄 남기기",
        "비밀값(.env, DB)은 채팅에 붙여넣지 않기",
        "커밋은 “커밋해줘”라고 명시했을 때만",
    ]
    donts = [
        "‘전체적으로 리팩터링’처럼 범위 없는 요청",
        "force 배포·DB 삭제 전 확인 없이 진행",
        "스크린샷 한 장만 보고 완료 선언",
        "엑셀/DB가 열린 채로 임포트 (파일 잠금)",
        "다른 사람 코드를 설명 없이 통째 덮어쓰기",
    ]
    add_box(s, Inches(0.5), Inches(1.2), Inches(6.05), Inches(5.5), WHITE, LINE)
    add_tb(s, Inches(0.75), Inches(1.4), Inches(5.6), Inches(0.4), "Do", 20, True, GREEN)
    for i, t in enumerate(dos):
        add_tb(s, Inches(0.8), Inches(2.05) + Inches(i * 0.85), Inches(5.5), Inches(0.75), f"✓   {t}", 14, False, SLATE_DK)

    add_box(s, Inches(6.8), Inches(1.2), Inches(6.05), Inches(5.5), WHITE, LINE)
    add_tb(s, Inches(7.05), Inches(1.4), Inches(5.6), Inches(0.4), "Don't", 20, True, RED)
    for i, t in enumerate(donts):
        add_tb(s, Inches(7.1), Inches(2.05) + Inches(i * 0.85), Inches(5.5), Inches(0.75), f"✗   {t}", 14, False, SLATE_DK)
    footer(s, 18, TOTAL)

    # ── 19 Hands-on ──
    section_slide(prs, "04", "따라하기 실습",
                  "이 Holiday 폴더를 열고, 아래 문장을 그대로 넣어 보세요", 19, TOTAL)

    # ── 20 Practice ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "실습 과제 3개 (난이도 순)", 28, True, INK)
    tasks = [
        ("초급  ·  Ask", "연차 가산은 입사일부터일까, 정규 연차 시작일부터일까?\nleaveCalculations.js 근거 라인과 함께 설명해줘.", "코드를 읽기만. 수정 없음."),
        ("중급  ·  Agent", "관리자 Overview 상단에 오늘 기준 재직 인원 수를 배지로 보여줘.\n다른 페이지 레이아웃은 바꾸지 마.", "한 화면, 명확한 금지 범위."),
        ("고급  ·  Agent+검증", "직원 캘린더에서 반차(0.5일)와 연차(1일) 색을 구분해줘.\n모바일 375px, 데스크톱 1280px에서 각각 확인해줘.", "UI + 반응형 검증까지."),
    ]
    for i, (lv, prompt, tip) in enumerate(tasks):
        y = Inches(1.15) + Inches(i * 1.8)
        add_box(s, Inches(0.5), y, Inches(12.3), Inches(1.65), WHITE, LINE)
        pill(s, Inches(0.75), y + Inches(0.22), Inches(2.4), Inches(0.36), lv, [GREEN, BLUE, VIOLET][i])
        add_tb(s, Inches(0.75), y + Inches(0.7), Inches(11.8), Inches(0.55), prompt, 14, False, INK)
        add_tb(s, Inches(0.75), y + Inches(1.22), Inches(11.8), Inches(0.3), tip, 12, False, SLATE)
    footer(s, 20, TOTAL)

    # ── 21 Run the app ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "실습 전에 앱 켜기", 28, True, INK)
    add_tb(s, Inches(0.6), Inches(0.82), Inches(12), Inches(0.35),
           "Windows에서는 아래 중 하나면 됩니다. 서버 창을 닫으면 앱도 종료됩니다.", 15, False, SLATE)

    add_box(s, Inches(0.5), Inches(1.35), Inches(12.3), Inches(2.35), CODE_BG)
    add_tb(s, Inches(0.8), Inches(1.55), Inches(11.8), Inches(0.35), "권장", 12, True, VIOLET_LT)
    add_tb(s, Inches(0.8), Inches(2.0), Inches(11.8), Inches(1.35),
           "npm run restart\n또는  start-holiday.bat  더블클릭", 22, True, WHITE)

    cards = [
        ("본인 PC", "http://localhost:3001"),
        ("같은 Wi-Fi 휴대폰", "관리자 사이드바 또는 /health 의 shareUrl"),
        ("포트 충돌 시", "그대로 npm run restart 다시"),
    ]
    for i, (t, b) in enumerate(cards):
        x = Inches(0.5) + Inches(i * 4.2)
        add_box(s, x, Inches(4.0), Inches(4.0), Inches(2.55), WHITE, LINE)
        add_tb(s, x + Inches(0.25), Inches(4.25), Inches(3.5), Inches(0.45), t, 16, True, VIOLET)
        add_tb(s, x + Inches(0.25), Inches(4.85), Inches(3.5), Inches(1.3), b, 15, False, SLATE)
    footer(s, 21, TOTAL)

    # ── 22 Checklist ──
    s = light_bg(prs)
    add_tb(s, Inches(0.6), Inches(0.28), Inches(12), Inches(0.5), "교육 후 체크리스트", 28, True, INK)
    checks = [
        ("Cursor를 연다", "Holiday 폴더를 워크스페이스로 연 뒤 Agent 채팅을 쓸 수 있다"),
        ("맥락을 준다", "@파일, README, 에러 로그를 붙여 요청한다"),
        ("범위를 적는다", "고칠 화면과 건드리지 말 파일을 한 줄로 적는다"),
        ("실행한다", "npm run restart 후 브라우저에서 직접 확인한다"),
        ("MCP를 안다", "배포는 채팅 한 줄이 아니라, 연결된 도구가 있어야 한다"),
        ("안전을 지킨다", ".env·DB 삭제·강제 배포는 확인 후에만 한다"),
    ]
    for i, (t, b) in enumerate(checks):
        x = Inches(0.5) + Inches((i % 2) * 6.4)
        y = Inches(1.15) + Inches((i // 2) * 1.8)
        add_box(s, x, y, Inches(6.15), Inches(1.6), WHITE, LINE)
        add_tb(s, x + Inches(0.3), y + Inches(0.25), Inches(5.55), Inches(0.4), f"{i+1}.  {t}", 16, True, INK)
        add_tb(s, x + Inches(0.3), y + Inches(0.75), Inches(5.55), Inches(0.6), b, 14, False, SLATE)
    footer(s, 22, TOTAL)

    # ── 23 One-liner ──
    s = dark_bg(prs)
    add_rect(s, 0, 0, Inches(0.18), H, VIOLET)
    add_tb(s, Inches(0.8), Inches(1.9), Inches(11.5), Inches(0.4), "한 장 요약", 14, True, VIOLET_LT)
    add_tb(s, Inches(0.8), Inches(2.4), Inches(11.7), Inches(2.4),
           "Cursor는 코드를 대신 짜 주는 마법이 아니라,\n프로젝트 맥락을 읽고 작업을 끝까지 수행하는 동료입니다.\n\nHoliday처럼 목표·규칙·검증을 나눠 시키면\n사내 앱도 대화로 만들 수 있습니다.",
           22, True, WHITE)
    footer(s, 23, TOTAL, light=True)

    # ── 24 Close ──
    s = dark_bg(prs)
    add_rect(s, 0, 0, Inches(0.18), H, VIOLET)
    add_tb(s, Inches(0.8), Inches(2.0), Inches(12), Inches(1.0), "질문 있으신가요?", 36, True, WHITE)
    add_tb(s, Inches(0.8), Inches(3.2), Inches(12), Inches(0.5),
           "다음 실습: 오늘 과제 중 하나를 Agent에게 실제로 시켜 보기", 16, False, RGBColor(0xCB, 0xD5, 0xE1))

    refs = [
        ("앱", "http://localhost:3001"),
        ("문서", "README.md  ·  docs/AISPACE_DEPLOY.md"),
        ("계산", "src/utils/leaveCalculations.js"),
    ]
    for i, (k, v) in enumerate(refs):
        x = Inches(0.8) + Inches(i * 4.0)
        add_tb(s, x, Inches(4.5), Inches(3.7), Inches(0.35), k, 12, True, VIOLET_LT)
        add_tb(s, x, Inches(4.9), Inches(3.7), Inches(0.7), v, 13, False, RGBColor(0xE2, 0xE8, 0xF0))
    footer(s, 24, TOTAL, light=True)

    out = Path(__file__).resolve().parent / "Cursor_AI_Holiday_\uad50\uc721\uc790\ub8cc.pptx"
    prs.save(out)
    print(f"saved: {out}")
    return out


if __name__ == "__main__":
    build()
