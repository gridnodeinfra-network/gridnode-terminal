"""Apply data-i18n attributes to remaining English strings in index.html."""
import re

src = open('index.html').read()
orig_len = len(src)

replacements = [
    ('>HEALTH CONTROL</h2>',           ' data-i18n="dashboard.title">HEALTH CONTROL</h2>'),
    ('<span class="stat-lbl">SHOTS</span>',           '<span class="stat-lbl" data-i18n="dashboard.shots">SHOTS</span>'),
    ('<span class="stat-lbl">LAST_DOSE</span>',        '<span class="stat-lbl" data-i18n="dashboard.lastDose">LAST_DOSE</span>'),
    ('<span class="stat-lbl">NEXT_SHOT</span>',        '<span class="stat-lbl" data-i18n="dashboard.nextShot">NEXT_SHOT</span>'),
    ('<span class="stat-lbl">TOTAL</span>',            '<span class="stat-lbl" data-i18n="dashboard.label.total">TOTAL</span>'),
    ('>// TODAY<',     ' data-i18n="dashboard.sectionToday">// TODAY<'),
    ('>// RESULTS<',   ' data-i18n="dashboard.sectionResults">// RESULTS<'),
    ('>// SHOT_PHASE<',' data-i18n="dashboard.sectionPhase">// SHOT_PHASE<'),
    ('">SEE CHART →</div>',         ' data-i18n="dashboard.seeChart">SEE CHART →</div>'),
    ('">ALL PHASES →</div>',        ' data-i18n="phase.allPhases">ALL PHASES →</div>'),
    ('<span class="s6-label">TOTAL CHANGE</span>',  '<span class="s6-label" data-i18n="dashboard.resultsTotal">TOTAL CHANGE</span>'),
    ('<span class="s6-label">CURRENT BMI</span>',   '<span class="s6-label" data-i18n="dashboard.resultsBmi">CURRENT BMI</span>'),
    ('<span class="s6-label">PERCENT LOST</span>',  '<span class="s6-label" data-i18n="dashboard.resultsPct">PERCENT LOST</span>'),
    ('<span class="s6-label">WEEKLY AVG</span>',    '<span class="s6-label" data-i18n="dashboard.resultsAvg">WEEKLY AVG</span>'),
    ('<span class="s6-label">TO GOAL</span>',       '<span class="s6-label" data-i18n="dashboard.resultsGoal">TO GOAL</span>'),
    ('id="phaseSupportTxt">Estimated from your logged protocol history.</div>',
     'id="phaseSupportTxt" data-i18n="phase.estimatedFromHistory">Estimated from your logged protocol history.</div>'),
    ('id="phaseNext">> INITIATE PROTOCOL — log first shot</div>',
     'id="phaseNext" data-i18n="phase.initiateProtocol">> INITIATE PROTOCOL — log first shot</div>'),
    ('<h4>WHY THIS PHASE</h4>',  '<h4 data-i18n="phase.whyThisPhase">WHY THIS PHASE</h4>'),
    ('<h4>DATA SOURCES</h4>',    '<h4 data-i18n="phase.dataSources">DATA SOURCES</h4>'),
    ('">// MEDICATION</div>',     ' data-i18n="profile.sectionMedication">// MEDICATION</div>'),
    ('">// BODY METRICS</div>',   ' data-i18n="profile.sectionBody">// BODY METRICS</div>'),
    ('">// DATA</div>',           ' data-i18n="profile.sectionData">// DATA</div>'),
    ('">Export CSV</span>',       ' data-i18n="profile.exportCsv">Export CSV</span>'),
    ('">Export Backup</span>',    ' data-i18n="profile.exportBackup">Export Backup</span>'),
    ('">VERSION</span>',          ' data-i18n="profile.version">VERSION</span>'),
    ('">Reload App</span>',       ' data-i18n="profile.reloadApp">Reload App</span>'),
    ('">Sign Out</span>',         ' data-i18n="common.signOut">Sign Out</span>'),
    ('<div class="modal-title">ALL PHASES</div>',
     '<div class="modal-title" data-i18n="phase.allPhases">ALL PHASES</div>'),
]

applied = 0
for old, new in replacements:
    if old in src:
        src = src.replace(old, new, 1)
        applied += 1
    else:
        print(f'  not found: {old[:60]!r}')

with open('index.html', 'w') as f:
    f.write(src)

print(f'Applied {applied}/{len(replacements)} replacements')
print(f'Size: {orig_len} -> {len(src)} bytes')
