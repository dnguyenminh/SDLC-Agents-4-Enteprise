import csv, glob
expected = [f'PBT-{i:02d}' for i in range(1,7)] + [f'UT-{i:02d}' for i in range(1,29)] + [f'IT-{i:02d}' for i in range(1,21)] + [f'E2E-API-{i:02d}' for i in range(1,13)] + [f'E2E-UI-{i:02d}' for i in range(1,9)] + [f'SIT-{i:02d}' for i in range(1,7)]
found = set()
total = 0
files = sorted(glob.glob('documents/SA4E-324/testdata/*.csv'))
for fp in files:
    with open(fp, encoding='utf-8') as f:
        r = csv.DictReader(f)
        assert 'test_case_id' in r.fieldnames, fp
        n = 0
        for row in r:
            total += 1
            n += 1
            v = row['test_case_id']
            for e in expected:
                if e in v:
                    found.add(e)
        print(fp, n)
print('total rows:', total)
missing = [e for e in expected if e not in found]
print('covered:', len(found), '/', len(expected))
print('missing:', missing)
