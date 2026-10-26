import re
import json

with open(r'C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-380\STC.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract all sections that start with "### " (test case sections)
sections = re.split(r'(?=^###\s+)', content, flags=re.MULTILINE)

# Find all test case sections with their IDs and statuses
test_cases = {}
for section in sections:
    if not section.strip():
        continue
    id_match = re.search(r'\*\*ID\*\*\s*\|\s*([A-Z]+-\d+)', section)
    if not id_match:
        continue
    tid = id_match.group(1)
    status_match = re.search(r'\*\*Status\*\*\s*\|\s*([^|\n]+)', section)
    status = status_match.group(1).strip() if status_match else 'Unknown'
    test_cases[tid] = {'section': section.strip(), 'status': status}

# Deferred case IDs
deferred_ids = [
    'PBT-01', 'PBT-02', 'PBT-03', 'PBT-04', 'PBT-05', 'PBT-06',
    'UT-05', 'UT-06', 'UT-07', 'UT-08', 'UT-09', 'UT-10', 'UT-11', 'UT-13', 'UT-14', 'UT-15', 'UT-16', 'UT-18',
    'UT-22', 'UT-23', 'UT-24', 'UT-25', 'UT-27', 'UT-29', 'UT-30', 'UT-34', 'UT-38', 'UT-39', 'UT-40', 'UT-42',
    'UT-44', 'UT-45', 'UT-46', 'UT-47', 'UT-48',
    'IT-06', 'IT-07', 'IT-08',
    'SIT-07', 'SIT-08', 'SIT-09', 'SIT-10', 'SIT-11', 'SIT-12', 'SIT-13'
]

# Check which deferred IDs exist in extracted sections
found = []
missing = []
for did in deferred_ids:
    if did in test_cases:
        found.append(did)
    else:
        missing.append(did)

print(f'Found in sections: {len(found)}')
print(f'Missing from sections: {len(missing)}')
for m in missing:
    print(f'  Missing: {m}')

# Save extracted sections for found cases
extracted = {tid: test_cases[tid] for tid in found}
with open(r'C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-384\extracted_cases.json', 'w', encoding='utf-8') as f:
    json.dump(extracted, f, ensure_ascii=False, indent=2)

print(f'\nSaved {len(extracted)} extracted cases to JSON')