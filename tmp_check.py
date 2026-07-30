import os 
import re 
path='supabase\\migrations' 
files=sorted([f for f in os.listdir(path) if f.endswith('.sql')]) 
pattern=re.compile(r'(\\d+)_(.+)\\.sql$') 
for f in files: 
   m=pattern.match(f) 
   print(repr(f), '-, 'MATCH' if m else 'NOMATCH', m.groups() if m else None) 
