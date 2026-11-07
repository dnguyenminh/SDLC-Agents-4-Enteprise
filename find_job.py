import json
with open('jobs.json') as f:
    data = json.load(f)
for j in data['jobs']:
    if j['name'] == 'Extension — Compile & Test':
        print(j['databaseId'])
        break
