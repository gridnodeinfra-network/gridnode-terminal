"""Fix missing dashboard.shots key and em-dash."""
import json

e = json.load(open('i18n/en.json'))
s = json.load(open('i18n/es.json'))

# Add dashboard.shots
e['dashboard.shots'] = 'SHOTS'
s['dashboard.shots'] = 'DOSIS'

# Fix em-dash in initiateProtocol
e['phase.initiateProtocol'] = '> INITIATE PROTOCOL — log first shot'
s['phase.initiateProtocol'] = '> INICIAR PROTOCOLO — registra la primera dosis'

with open('i18n/en.json', 'w') as f:
    json.dump(e, f, indent=2, ensure_ascii=False)
with open('i18n/es.json', 'w') as f:
    json.dump(s, f, indent=2, ensure_ascii=False)

print('fixed')
print(f'en: {len(e)-1}, es: {len(s)-1}')
ek = set(e.keys()) - {'_meta'}
sk = set(s.keys()) - {'_meta'}
print(f'asym: {len((ek-sk)|(sk-ek))}')
