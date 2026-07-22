"""Update dashboard.title and section markers to use HTML wrapping for the
cyan-accent span."""
import json

en = json.load(open('i18n/en.json'))
en['dashboard.title'] = 'HEALTH <span class="a">CONTROL</span>'
en['dashboard.sectionToday'] = '// <span class="a">TODAY</span>'
en['dashboard.sectionResults'] = '// <span class="a">RESULTS</span>'
en['dashboard.sectionPhase'] = '// <span class="a">SHOT_PHASE</span>'

es = json.load(open('i18n/es.json'))
es['dashboard.title'] = 'CONTROL DE <span class="a">SALUD</span>'
es['dashboard.sectionToday'] = '// <span class="a">HOY</span>'
es['dashboard.sectionResults'] = '// <span class="a">RESULTADOS</span>'
es['dashboard.sectionPhase'] = '// <span class="a">FASE_DOSIS</span>'

with open('i18n/en.json', 'w') as f:
    json.dump(en, f, indent=2, ensure_ascii=False)
with open('i18n/es.json', 'w') as f:
    json.dump(es, f, indent=2, ensure_ascii=False)
print('updated catalogs')
print(f'en: {len(en)-1}, es: {len(es)-1}')
ek = set(en.keys()) - {'_meta'}
sk = set(es.keys()) - {'_meta'}
asym = (ek - sk) | (sk - ek)
print(f'asym: {len(asym)}')
