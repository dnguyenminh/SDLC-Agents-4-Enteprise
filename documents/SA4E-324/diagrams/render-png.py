from PIL import Image, ImageDraw, ImageFont
import os

def font(size, bold=False):
    for p in ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def box(d, xy, w, h, fill, outline, text, fnt, tfill=(0,0,0)):
    x, y = xy
    d.rectangle([x, y, x+w, y+h], fill=fill, outline=outline, width=2)
    # wrap simple: split by lines passed with \n
    lines = text.split("\n")
    th = sum(d.textbbox((0,0), l, font=fnt)[3] for l in lines)
    cy = y + (h - th)//2
    for l in lines:
        bb = d.textbbox((0,0), l, font=fnt)
        d.text((x + (w-(bb[2]-bb[0]))//2, cy), l, fill=tfill, font=fnt)
        cy += bb[3] + 2

# ---- test-coverage.png ----
W, H = 1500, 700
img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)
fT = font(20); fH = font(13); fC = font(11)
d.text((20, 8), "SA4E-324 Test Coverage — Requirements x Test Levels (100% RTM)", fill=(0,0,0), font=fT)
cols = ["Requirement", "PBT (6)", "UT (28)", "IT (20)", "E2E-API (12)", "E2E-UI (8)", "SIT (6)"]
cw = [320, 190, 190, 190, 190, 190, 190]
ch = 62
x0, y0 = 20, 45
x = x0
for i, c in enumerate(cols):
    box(d, (x, y0), cw[i], 44, (218,232,252), (108,142,191), c, fH)
    x += cw[i]
rows = [
    ("Story 1 Registry\n(UC-01, BR-01..04)", ["PBT-04 OK", "UT-01..06,24 OK", "IT-16 OK", "N/A", "N/A", "N/A"]),
    ("Story 2 Gate + % bar\n(UC-02, BR-05..08)", ["PBT-03/05/06 OK", "UT-07..14 OK", "IT-12..15 OK", "E2E-API-01..03 OK", "E2E-UI-01..07 OK", "SIT-01/02 OK"]),
    ("Story 3 thinkingLevel\n(UC-03, BR-09..11)", ["N/A", "UT-15..18 OK", "via gate OK", "E2E-API-09 OK", "N/A", "N/A"]),
    ("Story 4 countTokens\n(UC-04, BR-12..16)", ["PBT-01/02 OK", "UT-19..22,25 OK", "IT-01..11 OK", "E2E-API-04..08 OK", "N/A", "SIT-03/04 OK"]),
    ("Story 5 migration\n(UC-05, BR-17/18)", ["N/A", "UT-27/28 OK", "IT-06/19 OK", "mocked OK", "N/A", "N/A"]),
    ("Security HIGH\n01/02/03 blocking", ["N/A", "UT-26 OK", "IT-16/17/18 OK", "E2E-10/11/12 OK", "E2E-UI-08 OK", "SIT-05/06 OK"]),
    ("NFR perf\nbatch/gate/cache", ["N/A", "UT-21/22 OK", "IT-20 OK", "timing OK", "N/A", "SIT-01/03/04 OK"]),
]
y = y0 + 44
for r, cells in rows:
    x = x0
    fill0 = (248,206,204) if "Security" in r else (255,242,204)
    box(d, (x, y), cw[0], ch, fill0, (150,150,150), r, fC)
    x += cw[0]
    for j, c in enumerate(cells):
        f = (213,232,212) if "OK" in c else (245,245,245)
        o = (130,179,102) if "OK" in c else (120,120,120)
        box(d, (x, y), cw[j+1], ch, f, o, c, fC)
        x += cw[j+1]
    y += ch
d.text((20, y+8), "Legend: green = covered by listed TCs | grey = N/A by design (no gap) | pink = blocking | 80 TCs, 93/93 reqs = 100%", fill=(0,0,0), font=fC)
img.save("documents/SA4E-324/diagrams/test-coverage.png")
print("saved test-coverage.png", img.size)

# ---- test-execution-flow.png ----
W2, H2 = 1500, 760
img2 = Image.new("RGB", (W2, H2), "white")
d2 = ImageDraw.Draw(img2)
d2.text((20, 8), "SA4E-324 Test Execution Flow — PBT > UT > IT > E2E-API > E2E-UI > SIT", fill=(0,0,0), font=fT)
def arrow(x1,y1,x2,y2,color=(108,142,191)):
    d2.line([x1,y1,x2,y2], fill=color, width=3)
    d2.polygon([(x2,y2),(x2-10,y2-5),(x2-10,y2+5)], fill=color)
stages = [
    ("PBT\nfast-check\n6 props", (60,120,200,110), (255,242,204)),
    ("UT\nvitest\n28 units", (300,120,200,110), (255,242,204)),
    ("IT\nfetch mock\n20 integ", (540,120,200,110), (255,230,204)),
    ("E2E-API\nmock server\n12 e2e", (780,120,200,110), (255,230,204)),
    ("E2E-UI\nPlaywright\n8 ui", (300,300,200,110), (213,232,212)),
    ("SIT\nmanual\n6 explor", (540,300,200,110), (248,206,204)),
]
for txt,(x,y,w,h),fill in stages:
    box(d2,(x,y),w,h,fill,(100,100,100),txt,fH)
# arrows main chain
arrow(260,175,300,175); arrow(500,175,540,175); arrow(740,175,780,175)
arrow(880,230,880,270); arrow(880,270,500,270); arrow(500,270,500,300)
d2.line([400,230,400,300], fill=(108,142,191), width=3)
d2.polygon([(400,300),(390,290),(410,290)], fill=(108,142,191))
arrow(500,355,540,355)
# gate diamond as box
box(d2,(780,300),220,110,(225,213,231),(150,115,166),"MERGE GATE\n0 Crit + 0 SEC-High\n+ grep 0 + NFR p95\n+ RTM 100%?",fC)
arrow(740,355,780,355)
box(d2,(300,470),440,90,(213,232,212),(130,179,102),"DONE: 80/80 + evidence/ + TEST-REPORT.csv + KB ingest",fH)
arrow(890,410,890,500); arrow(890,500,740,500); arrow(740,500,740,470)
d2.line([520,440,520,470], fill=(130,179,102), width=3)
d2.polygon([(520,470),(510,460),(530,460)], fill=(130,179,102))
# fail loop
box(d2,(60,300),200,110,(248,206,204),(180,80,80),"FIX + RETEST\n(DEV fixes code\nQA re-runs level)",fC)
for _,(x,y,w,h),_ in stages:
    d2.line([x+w//2,y+h,x+w//2,330 if y<250 else 340], fill=(180,80,80), width=2)
d2.line([60,340,260,340], fill=(180,80,80), width=2)
d2.text((20,600), "Entry/exit per STP S2.5/2.6. Red dashed = FAIL > fix prod code > re-run level. Exit: 0 Critical, <=2 Major.", fill=(0,0,0), font=fC)
d2.text((20,625), "NFR at IT-20 (p95 batch/gate/cache) + SIT-01/03/04. SEC E2E blocks merge on SEC-01/02/03.", fill=(0,0,0), font=fC)
d2.text((20,650), "Source: draw.io XML (test-execution-flow.drawio). No mermaid.", fill=(100,100,100), font=fC)
img2.save("documents/SA4E-324/diagrams/test-execution-flow.png")
print("saved test-execution-flow.png", img2.size)
