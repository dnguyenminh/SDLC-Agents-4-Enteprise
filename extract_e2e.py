import re
import json

with open(r'C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-380\STC.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract E2E-API-01 section
e2e_01_match = re.search(r'(### E2E-API-01:.*?)(?=^### |\n---|\Z)', content, flags=re.MULTILINE | re.DOTALL)
# Extract E2E-API-14 section
e2e_14_match = re.search(r'(### E2E-API-14:.*?)(?=^### |\n---|\Z)', content, flags=re.MULTILINE | re.DOTALL)
# Extract E2E-API-15 section
e2e_15_match = re.search(r'(### E2E-API-15:.*?)(?=^### |\n---|\Z)', content, flags=re.MULTILINE | re.DOTALL)
# Extract E2E-API-16 section
e2e_16_match = re.search(r'(### E2E-API-16:.*?)(?=^### |\n---|\Z)', content, flags=re.MULTILINE | re.DOTALL)

# Extract the two tables
e2e_02_07_match = re.search(r'(### E2E-API-02\.\.07:.*?)(?=^### |\n---|\Z)', content, flags=re.MULTILINE | re.DOTALL)
e2e_08_13_match = re.search(r'(### E2E-API-08\.\.13:.*?)(?=^### |\n---|\Z)', content, flags=re.MULTILINE | re.DOTALL)

e2e_cases = {}

if e2e_01_match:
    e2e_cases['E2E-API-01'] = {'section': e2e_01_match.group(1).strip(), 'status': 'Planned'}
if e2e_14_match:
    e2e_cases['E2E-API-14'] = {'section': e2e_14_match.group(1).strip(), 'status': 'Planned'}
if e2e_15_match:
    e2e_cases['E2E-API-15'] = {'section': e2e_15_match.group(1).strip(), 'status': 'Planned'}
if e2e_16_match:
    e2e_cases['E2E-API-16'] = {'section': e2e_16_match.group(1).strip(), 'status': 'Planned'}

# For the table cases, we'll create individual entries from the table data
# E2E-API-02..07
if e2e_02_07_match:
    table_text = e2e_02_07_match.group(1)
    tools = ['export_docx', 'export_xlsx', 'export_pptx', 'export_pdf', 'export_html', 'export_json']
    priorities = ['High', 'High', 'High', 'High', 'Medium', 'Medium']
    for i, tool in enumerate(tools):
        tid = f'E2E-API-{i+2}'
        e2e_cases[tid] = {
            'section': table_text.strip(),
            'status': 'Planned',
            'tool': tool,
            'priority': priorities[i],
            'is_table_case': True,
            'table_type': 'schema'
        }

# E2E-API-08..13
if e2e_08_13_match:
    table_text = e2e_08_13_match.group(1)
    tools = ['export_docx', 'export_xlsx', 'export_pptx', 'export_pdf', 'export_html', 'export_json']
    priorities = ['High', 'High', 'High', 'High', 'Medium', 'Medium']
    signatures = [
        'OOXML package (`PK` + `word/` parts)',
        '`PK` + `xl/workbook.xml` + `xl/worksheets/sheet1.xml`',
        'OOXML package (`PK` + `ppt/` parts)',
        'starts with `%PDF`',
        'HTML document (`<` / doctype)',
        'parses as JSON'
    ]
    for i, tool in enumerate(tools):
        tid = f'E2E-API-{i+8}'
        e2e_cases[tid] = {
            'section': table_text.strip(),
            'status': 'Planned',
            'tool': tool,
            'priority': priorities[i],
            'signature': signatures[i],
            'is_table_case': True,
            'table_type': 'export'
        }

print(f'Extracted {len(e2e_cases)} E2E-API cases:')
for tid, data in sorted(e2e_cases.items(), key=lambda x: int(x[0].split('-')[-1])):
    print(f'  {tid}: {data.get("tool", "N/A")} - {data.get("table_type", "individual")}')

with open(r'C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-384\extracted_e2e.json', 'w', encoding='utf-8') as f:
    json.dump(e2e_cases, f, ensure_ascii=False, indent=2)

print(f'\nSaved to extracted_e2e.json')