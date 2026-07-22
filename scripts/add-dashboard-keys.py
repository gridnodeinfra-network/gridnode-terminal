"""Add dashboard/phase/profile Spanish translations to both catalogs."""
import json

new_keys = {
    "dashboard.title": "HEALTH CONTROL",
    "dashboard.label.total": "TOTAL",
    "dashboard.lastDose": "LAST_DOSE",
    "dashboard.nextShot": "NEXT_SHOT",
    "dashboard.lastDoseLabel": "LAST DOSE",
    "dashboard.nextShotLabel": "NEXT SHOT",
    "dashboard.sectionToday": "// TODAY",
    "dashboard.sectionResults": "// RESULTS",
    "dashboard.sectionPhase": "// SHOT_PHASE",
    "dashboard.tapToLog": "TAP TO LOG",
    "dashboard.seeChart": "SEE CHART ->",
    "dashboard.resultsTotal": "TOTAL CHANGE",
    "dashboard.resultsBmi": "CURRENT BMI",
    "dashboard.resultsWeight": "WEIGHT",
    "dashboard.resultsPct": "PERCENT LOST",
    "dashboard.resultsAvg": "WEEKLY AVG",
    "dashboard.resultsGoal": "TO GOAL",
    "phase.allPhases": "ALL PHASES",
    "phase.estimatedFromHistory": "Estimated from your logged protocol history.",
    "phase.initiateProtocol": "> INITIATE PROTOCOL - log first shot",
    "phase.whyThisPhase": "WHY THIS PHASE",
    "phase.dataSources": "DATA SOURCES",
    "phase.curveCopy": "Educational estimate based on logged shot timing. Not a lab measurement.",
    "phase.curveSubline": "Curve shows a relative activity model: logged SHOT event -> estimated rise -> peak -> decay.",
    "phase.disclaimer": "Educational estimate from user-entered SHOTS/VAULT context. GRID//NODE does not recommend dose, timing, protocol, or treatment changes. Talk to a licensed clinician for medical decisions.",
    "profile.sectionMedication": "// MEDICATION",
    "profile.sectionBody": "// BODY METRICS",
    "profile.sectionData": "// DATA",
    "profile.exportCsv": "Export CSV",
    "profile.exportBackup": "Export Backup",
    "profile.version": "VERSION",
    "profile.reloadApp": "Reload App",
    "results.range2w": "2W",
    "results.range1m": "1M",
    "results.range3m": "3M",
    "results.rangeAll": "ALL",
}

es_translations = {
    "dashboard.title": "CONTROL DE SALUD",
    "dashboard.label.total": "TOTAL",
    "dashboard.lastDose": "ULTIMA_DOSIS",
    "dashboard.nextShot": "PROXIMA_DOSIS",
    "dashboard.lastDoseLabel": "ULTIMA DOSIS",
    "dashboard.nextShotLabel": "PROXIMA DOSIS",
    "dashboard.sectionToday": "// HOY",
    "dashboard.sectionResults": "// RESULTADOS",
    "dashboard.sectionPhase": "// FASE_DOSIS",
    "dashboard.tapToLog": "TOCA PARA REGISTRAR",
    "dashboard.seeChart": "VER GRAFICA ->",
    "dashboard.resultsTotal": "CAMBIO TOTAL",
    "dashboard.resultsBmi": "IMC ACTUAL",
    "dashboard.resultsWeight": "PESO",
    "dashboard.resultsPct": "PORCENTAJE PERDIDO",
    "dashboard.resultsAvg": "PROMEDIO SEMANAL",
    "dashboard.resultsGoal": "HACIA LA META",
    "phase.allPhases": "TODAS LAS FASES",
    "phase.estimatedFromHistory": "Estimado a partir del historial de protocolo registrado.",
    "phase.initiateProtocol": "> INICIAR PROTOCOLO - registra la primera dosis",
    "phase.whyThisPhase": "POR QUE ESTA FASE",
    "phase.dataSources": "FUENTES DE DATOS",
    "phase.curveCopy": "Estimacion educativa segun el momento de la dosis registrada. No es una medicion de laboratorio.",
    "phase.curveSubline": "La curva muestra un modelo relativo de actividad: dosis registrada -> subida estimada -> pico -> descenso.",
    "phase.disclaimer": "Estimacion educativa a partir del contexto de DOSIS/BOVEDA ingresado por el usuario. GRID//NODE no recomienda cambios de dosis, horario, protocolo ni tratamiento. Consulta a un profesional clinico autorizado para tomar decisiones medicas.",
    "profile.sectionMedication": "// MEDICAMENTO",
    "profile.sectionBody": "// MEDIDAS CORPORALES",
    "profile.sectionData": "// DATOS",
    "profile.exportCsv": "Exportar CSV",
    "profile.exportBackup": "Exportar respaldo",
    "profile.version": "VERSION",
    "profile.reloadApp": "Recargar app",
    "results.range2w": "2S",
    "results.range1m": "1M",
    "results.range3m": "3M",
    "results.rangeAll": "TODO",
}

for lang, trans in [('en', new_keys), ('es', es_translations)]:
    p = f'i18n/{lang}.json'
    d = json.load(open(p))
    for k, v in trans.items():
        d[k] = v
    with open(p, 'w') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
    print(f'updated {p}: +{len(trans)} keys')

e = json.load(open('i18n/en.json'))
s = json.load(open('i18n/es.json'))
ek = set(e.keys()) - {'_meta'}
sk = set(s.keys()) - {'_meta'}
print(f'en: {len(ek)}, es: {len(sk)}, asym: {len((ek-sk)|(sk-ek))}')
for k in sorted((ek-sk)|(sk-ek)):
    print(f'  {k}')
