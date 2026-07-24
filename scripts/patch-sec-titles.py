"""Patch sec-title elements to be translatable."""
src = open('index.html').read()

replacements = [
    # TODAY section
    ('<div class="sec-title">// <span class="a">TODAY</span></div>',
     '<div class="sec-title" data-i18n-html="dashboard.sectionToday">// <span class="a">TODAY</span></div>'),
    # RESULTS section
    ('<div class="sec-title">// <span class="a">RESULTS</span></div>',
     '<div class="sec-title" data-i18n-html="dashboard.sectionResults">// <span class="a">RESULTS</span></div>'),
    # SHOT_PHASE section
    ('<div class="sec-title">// <span class="a">SHOT_PHASE</span></div>',
     '<div class="sec-title" data-i18n-html="dashboard.sectionPhase">// <span class="a">SHOT_PHASE</span></div>'),
    # HEATH CONTROL title - we need to make HEALTH and CONTROL separate translatable parts
    ('<div class="page-title">HEALTH <span class="a">CONTROL</span></div>',
     '<div class="page-title" data-i18n-html="dashboard.title">HEALTH <span class="a">CONTROL</span></div>'),
]

applied = 0
for old, new in replacements:
    if old in src:
        src = src.replace(old, new, 1)
        applied += 1
    else:
        print(f'  not found: {old[:60]!r}')

# Add the i18n-html handler to gridnode-i18n.js
i18n_src = open('js/gridnode-i18n.js').read()
if "data-i18n-html" not in i18n_src:
    i18n_src = i18n_src.replace(
        "    doc.querySelectorAll('[data-i18n-html]').forEach(el => {\n      const key = el.getAttribute('data-i18n-html');\n      if (key) el.innerHTML = t(key);\n    });",
        "    doc.querySelectorAll('[data-i18n-html]').forEach(el => {\n      const key = el.getAttribute('data-i18n-html');\n      if (key) el.innerHTML = t(key);\n    });"
    )
    open('js/gridnode-i18n.js', 'w').write(i18n_src)

open('index.html', 'w').write(src)
print(f'Applied {applied}/{len(replacements)} sec-title patches')
