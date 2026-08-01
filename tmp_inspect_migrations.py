import os
import re
path = os.path.join(os.getcwd(), 'supabase', 'migrations')
print('directory:', path)
files = sorted(os.listdir(path))
print('all files:')
for f in files:
    print(repr(f))
print('\nparsed versions:')
pattern = re.compile(r'^(\d+)_([^\.]+)\.sql$')
for f in files:
    if f.endswith('.sql'):
        m = pattern.match(f)
        print(repr(f), 'MATCH' if m else 'NOMATCH', m.groups() if m else None, [ord(c) for c in f])
print('\nfiles containing 20260725:')
for f in files:
    if '20260725' in f:
        print(repr(f))
