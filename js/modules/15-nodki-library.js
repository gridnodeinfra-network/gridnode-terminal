/* GRID//NODE — NODKI lines library (Spec B, 1.3.0).
 * The finite, auditable line library for ambient tips (TIP) and facts
 * (FIELD NOTE). Every line declares its expression pairing (Pipe,
 * 2026-10-17): a primary expression + approved alternates, chosen by
 * meaning from the pairing map below. A line may never render with an
 * expression outside its approved pair. Facts obey Spec B.5: general
 * domain only, never about the user or their protocol, no effect verbs
 * on compounds, mandatory named source + two-question risk review,
 * enforced by scripts/lint-nodki-library.cjs.
 *
 * PAIRING MAP (content class -> expressions):
 *   state: dose due      -> focused  [default]
 *   state: logged today  -> approve  [happy]
 *   state: returning     -> default  [neutral]
 *   state: first run     -> welcome  []
 *   celebration          -> celebrate [happy]
 *   support / errors     -> concerned [concerned]  (always; no grin)
 *   tip: scanner/how-to  -> focused  [default]
 *   tip: planning        -> thinking [focused|default]
 *   tip: light feature   -> default  [thinking]
 *   tip: playful         -> cheeky   [default]   (sparing, by kind)
 *   fact (FIELD NOTE)    -> thinking [default]
 *   wait                 -> thinking [focused]
 *   onboarding beats     -> per Spec A (welcome/focused/tablet/thinking)
 */
(function () {
  'use strict';

  var EXPR_ASSETS = {
    welcome: 'assets/mascot/nodki-pose-welcome.webp',
    neutral: 'assets/mascot/nodki-pose-neutral.webp',
    approve: 'assets/mascot/nodki-pose-approve.webp',
    celebrate: 'assets/mascot/nodki-pose-celebrate.webp',
    tablet: 'assets/mascot/nodki-pose-tablet.webp',
    analyze: 'assets/mascot/nodki-pose-analyze.webp',
    default: 'assets/mascot/nodki-expr-default.webp',
    happy: 'assets/mascot/nodki-expr-happy.webp',
    focused: 'assets/mascot/nodki-expr-focused.webp',
    cheeky: 'assets/mascot/nodki-expr-cheeky.webp',
    thinking: 'assets/mascot/nodki-expr-thinking.webp',
    concerned: 'assets/mascot/nodki-expr-concerned.webp'
  };

  /* State lines for the companion card (Spec A continuity + state
   * narration). i18n keys live in the catalogs (nodki.*); these are the
   * expression pairings for each state, shared by 14-nodki. */
  var STATE_EXPR = {
    firstRun: { expr: 'welcome', alts: [] },
    loggedToday: { expr: 'approve', alts: ['happy'] },
    returning: { expr: 'default', alts: ['neutral'] },
    dueToday: { expr: 'focused', alts: ['default'] },
    afterLog: { expr: 'celebrate', alts: ['happy'] },
    milestone: { expr: 'celebrate', alts: ['happy'] },
    continuity: { expr: 'welcome', alts: ['default'] },
    guideExit: { expr: 'default', alts: ['thinking'] },
    resumeOffer: { expr: 'thinking', alts: ['default'] },
    wait: { expr: 'thinking', alts: ['focused'] },
    support: { expr: 'concerned', alts: ['concerned'] },
    tablet: { expr: 'tablet', alts: ['thinking'] }
  };

  var EXP = '2027-04-15'; // 180-day default expiry from 2026-10-17
  var RV = { by: 'PIP-01 research desk', date: '2026-10-17', status: 'pass', q1: true, q2: true };

  var LINES = [
    /* ---------------- TIPS: scanner / how-to (focused) ---------------- */
    { id: 't-scan-rotate', cat: 'tip', kind: 'scanner', expr: 'focused', alts: ['default'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'scanner', priority: 60, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Rotate your sites. The scanner keeps your map, and HISTORY shows which sites you use most.',
      es: 'Rota tus sitios. El escáner guarda tu mapa, y el HISTORIAL muestra qué sitios usas más.' },
    { id: 't-scan-tap', cat: 'tip', kind: 'scanner', expr: 'focused', alts: ['default'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'scanner', priority: 55, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Tap a site on the scanner to select it. The panel confirms your pick before you log.',
      es: 'Toca un sitio en el escáner para elegirlo. El panel confirma tu elección antes de registrar.' },
    { id: 't-scan-views', cat: 'tip', kind: 'scanner', expr: 'focused', alts: ['thinking'], trigger: { type: 'state' }, requires: ['fewShots'], surfaces: ['card', 'pull'], cta: 'scanner', priority: 40, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'The scanner has three views: Core, Upper, and Lower. Together they cover the full map.',
      es: 'El escáner tiene tres vistas: Central, Superior e Inferior. Juntas cubren todo el mapa.' },
    { id: 't-scan-before', cat: 'tip', kind: 'scanner', expr: 'focused', alts: ['default'], trigger: { type: 'idle' }, requires: ['due'], surfaces: ['card'], cta: 'scanner', priority: 65, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Dose due? Check the scanner first and pick a site you have not used in a while.',
      es: '¿Dosis pendiente? Revisa primero el escáner y elige un sitio que no uses hace tiempo.' },
    /* ---------------- TIPS: planning (thinking) ---------------- */
    { id: 't-sched-day', cat: 'tip', kind: 'planning', expr: 'thinking', alts: ['focused'], trigger: { type: 'state' }, requires: ['firstrun'], surfaces: ['card', 'pull'], cta: 'profile', priority: 45, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Your shot day lives in your profile, under SHOT DAY. Set it once and the grid plans around it.',
      es: 'Tu día de inyección está en tu perfil, en DÍA DE INYECCIÓN. Ajústalo una vez y la red planifica.' },
    { id: 't-sched-phase', cat: 'tip', kind: 'planning', expr: 'thinking', alts: ['default'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'results', priority: 55, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Your phase is read from your logged shots. Regular logs keep your curve honest.',
      es: 'Tu fase se calcula de tus registros. Registrar seguido mantiene tu curva fiel.' },
    { id: 't-sched-week', cat: 'tip', kind: 'planning', expr: 'thinking', alts: ['focused'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'results', priority: 50, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Plan the week from PROGRESS: your phase, your trends, and your next steps in one place.',
      es: 'Planifica la semana desde PROGRESO: tu fase, tus tendencias y tus próximos pasos en un lugar.' },
    { id: 't-sched-rhythm', cat: 'tip', kind: 'planning', expr: 'thinking', alts: ['default'], trigger: { type: 'state' }, requires: ['manyShots'], surfaces: ['card', 'pull'], cta: 'history', priority: 45, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'A steady rhythm reads better than a perfect one. Consistency is the signal.',
      es: 'Un ritmo constante se lee mejor que uno perfecto. La constancia es la señal.' },
    /* ---------------- TIPS: logging ---------------- */
    { id: 't-log-fast', cat: 'tip', kind: 'log', expr: 'default', alts: ['focused'], trigger: { type: 'state' }, requires: ['fewShots'], surfaces: ['card', 'pull'], cta: 'log', priority: 60, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Logging takes about 20 seconds: med, dose, site, save. That is the whole form.',
      es: 'Registrar toma unos 20 segundos: fármaco, dosis, sitio, guardar. Eso es todo el formulario.' },
    { id: 't-log-backdate', cat: 'tip', kind: 'log', expr: 'focused', alts: ['default'], trigger: { type: 'state' }, requires: ['any'], surfaces: ['card', 'pull'], cta: 'log', priority: 50, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Forgot to log? Set the date and time on the form to when the shot actually happened.',
      es: '¿Olvidaste registrar? Ajusta la fecha y la hora del formulario al momento real de la inyección.' },
    { id: 't-log-timeline', cat: 'tip', kind: 'log', expr: 'default', alts: ['thinking'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'history', priority: 40, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'A saved shot lands on your timeline right away. Open HISTORY to see it in order.',
      es: 'Una inyección guardada aparece en tu línea de tiempo al instante. Abre HISTORIAL para verla.' },
    { id: 't-log-return', cat: 'tip', kind: 'log', expr: 'focused', alts: ['default'], trigger: { type: 'state' }, requires: ['returning'], surfaces: ['card', 'pull'], cta: 'log', priority: 55, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Missed a day? Log it when you remember and set the time back. Your curve uses the time you enter.',
      es: '¿Perdiste un día? Regístralo cuando recuerdes y ajusta la hora. Tu curva usa la hora que ingresas.' },
    /* ---------------- TIPS: data / VAULT ---------------- */
    { id: 't-vault-csv', cat: 'tip', kind: 'data', expr: 'default', alts: ['thinking'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'vault', priority: 45, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'Export a CSV of your shots from VAULT any time. Your records, in a file you own.',
      es: 'Exporta un CSV de tus inyecciones desde VAULT cuando quieras. Tus registros, en un archivo tuyo.' },
    { id: 't-vault-backup', cat: 'tip', kind: 'data', expr: 'thinking', alts: ['default'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'vault', priority: 45, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'A full backup lives in VAULT. Save one somewhere safe, off this device too.',
      es: 'Una copia completa vive en VAULT. Guarda una en un lugar seguro, también fuera de este equipo.' },
    { id: 't-vault-import', cat: 'tip', kind: 'data', expr: 'default', alts: ['focused'], trigger: { type: 'state' }, requires: ['any'], surfaces: ['card', 'pull'], cta: 'vault', priority: 35, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'Bringing history from a file? VAULT imports CSV and rebuilds your timeline.',
      es: '¿Traes historial en un archivo? VAULT importa CSV y reconstruye tu línea de tiempo.' },
    { id: 't-vault-ownership', cat: 'tip', kind: 'data', expr: 'default', alts: ['thinking'], trigger: { type: 'pull' }, requires: ['any'], surfaces: ['pull'], cta: 'vault', priority: 30, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'Your data stays yours: export it, back it up, or delete it, whenever you want.',
      es: 'Tus datos siguen siendo tuyos: expórtalos, respáldalos o bórralos cuando quieras.' },
    { id: 't-vault-sync', cat: 'tip', kind: 'data', expr: 'thinking', alts: ['default'], trigger: { type: 'state' }, requires: ['localOnly'], surfaces: ['card', 'pull'], cta: 'vault', priority: 55, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'On this device only? Connect Google in VAULT and your grid syncs across your devices.',
      es: '¿Solo en este equipo? Conecta Google en VAULT y tu red se sincroniza entre tus dispositivos.' },
    /* ---------------- TIPS: phase ---------------- */
    { id: 't-phase-today', cat: 'tip', kind: 'phase', expr: 'thinking', alts: ['default'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'dash', priority: 40, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Your current phase sits on TODAY, right under my card. One glance tells you where you are.',
      es: 'Tu fase actual está en HOY, justo bajo mi tarjeta. Un vistazo te dice dónde estás.' },
    { id: 't-phase-grows', cat: 'tip', kind: 'phase', expr: 'default', alts: ['thinking'], trigger: { type: 'state' }, requires: ['fewShots'], surfaces: ['card', 'pull'], cta: 'results', priority: 50, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Every log grows your curve. A few more shots and the phase picture gets much sharper.',
      es: 'Cada registro hace crecer tu curva. Con unas inyecciones más, la fase se verá mucho más clara.' },
    { id: 't-phase-sphere', cat: 'tip', kind: 'phase', expr: 'thinking', alts: ['focused'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'results', priority: 40, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'The phase sphere in PROGRESS turns your logs into a position you can read at a glance.',
      es: 'La esfera de fase en PROGRESO convierte tus registros en una posición que se lee de un vistazo.' },
    /* ---------------- TIPS: history ---------------- */
    { id: 't-history-order', cat: 'tip', kind: 'history', expr: 'default', alts: ['thinking'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'history', priority: 35, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'HISTORY keeps every shot in order: med, dose, site, and time, all in one ledger.',
      es: 'HISTORIAL guarda cada inyección en orden: fármaco, dosis, sitio y hora, en un solo registro.' },
    { id: 't-history-review', cat: 'tip', kind: 'history', expr: 'default', alts: ['focused'], trigger: { type: 'pull' }, requires: ['hasShots'], surfaces: ['pull'], cta: 'history', priority: 30, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'Your full record for each shot lives in HISTORY. Nothing is hidden behind menus.',
      es: 'El registro completo de cada inyección vive en HISTORIAL. Nada queda escondido en menús.' },
    /* ---------------- TIPS: LAB ---------------- */
    { id: 't-lab-draw', cat: 'tip', kind: 'lab', expr: 'focused', alts: ['default'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'lab', priority: 40, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'Dose math lives in LAB: how much to draw, worked out from your vial and your dose.',
      es: 'El cálculo de dosis vive en LAB: cuánto extraer, calculado de tu vial y tu dosis.' },
    { id: 't-lab-mix', cat: 'tip', kind: 'lab', expr: 'focused', alts: ['thinking'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'lab', priority: 35, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'Mixing math is in LAB too. Volumes and ratios, without the napkin calculations.',
      es: 'El cálculo de mezclas también está en LAB. Volúmenes y proporciones, sin cuentas en servilletas.' },
    { id: 't-lab-stock', cat: 'tip', kind: 'lab', expr: 'thinking', alts: ['focused'], trigger: { type: 'state' }, requires: ['any'], surfaces: ['card', 'pull'], cta: 'lab', priority: 35, cooldown: 45, once: false, expires: EXP, tenure: 0,
      en: 'Track your stock in LAB so a low vial never surprises you mid-week.',
      es: 'Controla tu inventario en LAB para que un vial bajo no te sorprenda a mitad de semana.' },
    /* ---------------- TIPS: comfort / settings ---------------- */
    { id: 't-set-theme', cat: 'tip', kind: 'comfort', expr: 'default', alts: ['thinking'], trigger: { type: 'state' }, requires: ['any'], surfaces: ['card', 'pull'], cta: 'vault', priority: 30, cooldown: 60, once: false, expires: EXP, tenure: 0,
      en: 'Two lights, one grid: Night and Dusk themes live in VAULT, under Preferences.',
      es: 'Dos luces, una red: los temas Noche y Atardecer viven en VAULT, en Preferencias.' },
    { id: 't-set-lang', cat: 'tip', kind: 'comfort', expr: 'default', alts: ['thinking'], trigger: { type: 'state' }, requires: ['any'], surfaces: ['card', 'pull'], cta: 'vault', priority: 30, cooldown: 60, once: false, expires: EXP, tenure: 0,
      en: 'GRID//NODE speaks English and Spanish. Switch any time in VAULT or on the intro.',
      es: 'GRID//NODE habla inglés y español. Cambia cuando quieras en VAULT o en la intro.' },
    { id: 't-set-haptics', cat: 'tip', kind: 'comfort', expr: 'default', alts: ['focused'], trigger: { type: 'state' }, requires: ['any'], surfaces: ['card', 'pull'], cta: 'vault', priority: 30, cooldown: 60, once: false, expires: EXP, tenure: 0,
      en: 'Subtle taps confirm your actions. Tune haptics in VAULT if you want them quieter.',
      es: 'Toques sutiles confirman tus acciones. Ajusta la vibración en VAULT si la quieres más suave.' },
    { id: 't-set-off', cat: 'tip', kind: 'comfort', expr: 'default', alts: ['thinking'], trigger: { type: 'pull' }, requires: ['any'], surfaces: ['pull'], cta: 'vault', priority: 25, cooldown: 60, once: false, expires: EXP, tenure: 0,
      en: 'I work for you. If I ever get in the way, VAULT turns me, or just my tips, off.',
      es: 'Trabajo para ti. Si algún día estorbo, VAULT me apaga a mí, o solo mis consejos.' },
    { id: 't-set-manual', cat: 'tip', kind: 'comfort', expr: 'thinking', alts: ['default'], trigger: { type: 'state' }, requires: ['hasShots'], surfaces: ['card', 'pull'], cta: 'vault', priority: 35, cooldown: 60, once: false, expires: EXP, tenure: 0,
      en: "The Operator's manual in VAULT replays any part of the intro, whenever you want.",
      es: 'El manual del Operador en VAULT repite cualquier parte de la intro, cuando quieras.' },
    /* ---------------- TIPS: pull / playful (cheeky, sparing) ---------------- */
    { id: 't-pull-cheeky1', cat: 'tip', kind: 'playful', expr: 'cheeky', alts: ['default'], trigger: { type: 'pull' }, requires: ['any'], surfaces: ['pull'], cta: null, priority: 20, cooldown: 90, once: false, expires: EXP, tenure: 0,
      en: 'I run the grid. You run the protocol. Good split, if you ask me.',
      es: 'Yo opero la red. Tú llevas el protocolo. Buen reparto, si me preguntas.' },
    { id: 't-pull-cheeky2', cat: 'tip', kind: 'playful', expr: 'cheeky', alts: ['default'], trigger: { type: 'pull' }, requires: ['returning'], surfaces: ['pull'], cta: null, priority: 20, cooldown: 90, once: false, expires: EXP, tenure: 0,
      en: 'Somewhere, a spreadsheet is jealous of this grid. Let it be.',
      es: 'En algún lugar, una hoja de cálculo envidia esta red. Que envidie.' },
    { id: 't-pull-open', cat: 'tip', kind: 'pull', expr: 'default', alts: ['thinking'], trigger: { type: 'pull' }, requires: ['any'], surfaces: ['pull'], cta: null, priority: 20, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Tap my face any time. I keep the notes so your head stays clear.',
      es: 'Toca mi cara cuando quieras. Yo guardo las notas para que tu cabeza quede libre.' },
    { id: 't-pull-vault', cat: 'tip', kind: 'pull', expr: 'thinking', alts: ['default'], trigger: { type: 'pull' }, requires: ['any'], surfaces: ['pull'], cta: 'vault', priority: 20, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'VAULT is mission control: exports, settings, backups, and my manual in one room.',
      es: 'VAULT es el control de misión: exportaciones, ajustes, copias y mi manual en un solo lugar.' },
    /* ---------------- TIPS: completed-event ---------------- */
    { id: 't-event-export', cat: 'tip', kind: 'data', expr: 'default', alts: ['thinking'], trigger: { type: 'event', key: 'firstExport' }, requires: [], surfaces: ['card'], cta: 'vault', priority: 70, cooldown: 90, once: true, expires: EXP, tenure: 0,
      en: 'Backup saved. Keep a copy somewhere safe, off this device too.',
      es: 'Copia guardada. Guarda otra en un lugar seguro, también fuera de este equipo.' },
    { id: 't-event-scanner', cat: 'tip', kind: 'scanner', expr: 'focused', alts: ['default'], trigger: { type: 'event', key: 'firstScanner' }, requires: [], surfaces: ['card'], cta: 'scanner', priority: 70, cooldown: 90, once: true, expires: EXP, tenure: 0,
      en: 'First site pinned on the scanner. Your rotation map has officially started.',
      es: 'Primer sitio fijado en el escáner. Tu mapa de rotación empezó oficialmente.' },
    { id: 't-event-import', cat: 'tip', kind: 'data', expr: 'default', alts: ['thinking'], trigger: { type: 'event', key: 'importDone' }, requires: [], surfaces: ['card'], cta: 'history', priority: 70, cooldown: 90, once: true, expires: EXP, tenure: 0,
      en: 'Import complete. Your history is on the grid and your curve can read it.',
      es: 'Importación completa. Tu historial está en la red y tu curva ya puede leerlo.' },
    /* ---------------- TIPS: state moments ---------------- */
    { id: 't-state-due', cat: 'tip', kind: 'log', expr: 'focused', alts: ['default'], trigger: { type: 'state' }, requires: ['due'], surfaces: ['card'], cta: 'log', priority: 65, cooldown: 14, once: false, expires: EXP, tenure: 0,
      en: "A dose is on today's board. The log button lives on TODAY, one tap away.",
      es: 'Hay una dosis en el tablero de hoy. El botón de registro está en HOY, a un toque.' },
    { id: 't-state-return', cat: 'tip', kind: 'support', expr: 'concerned', alts: ['concerned'], trigger: { type: 'state' }, requires: ['stale7'], surfaces: ['card', 'pull'], cta: 'log', priority: 60, cooldown: 30, once: false, expires: EXP, tenure: 0,
      en: 'Back on the grid. One fresh log brings your curve up to date.',
      es: 'De vuelta en la red. Un registro nuevo pone tu curva al día.' },
    { id: 't-state-first', cat: 'tip', kind: 'log', expr: 'focused', alts: ['default'], trigger: { type: 'state' }, requires: ['firstrun'], surfaces: ['card'], cta: 'log', priority: 65, cooldown: 14, once: false, expires: EXP, tenure: 0,
      en: 'Your first log starts the whole grid: timeline, curve, phase. Twenty seconds.',
      es: 'Tu primer registro enciende toda la red: línea de tiempo, curva, fase. Veinte segundos.' }
  ];

  /* ---------------- FACTS (FIELD NOTE): general domain only, Spec B.5.
   * Each passed the two-question test at review: (1) about people /
   * the world in general, zero reference to this user, their data, or
   * their protocol; (2) textbook-true with the named source below. */
  var FACTS = [
    { id: 'f-nobel-circadian', kind: 'science', en: 'In 2017, the Nobel Prize in Medicine went to researchers who found the genes behind the body clock.', es: 'En 2017, el Nobel de Medicina premió a quienes hallaron los genes detrás del reloj biológico.', source: { label: 'The Nobel Prize in Physiology or Medicine 2017', ref: 'nobelprize.org — Hall, Rosbash and Young, circadian rhythm mechanisms' } },
    { id: 'f-barcode', kind: 'history', en: 'The first barcode ever scanned was on a pack of gum, in Ohio, in 1974.', es: 'El primer código de barras se escaneó en un paquete de chicles, en Ohio, en 1974.', source: { label: 'Smithsonian Magazine', ref: 'Smithsonian Magazine — history of the first UPC barcode scan, 1974' } },
    { id: 'f-cells', kind: 'science', en: 'Scientists estimate the human body holds about 37 trillion cells.', es: 'Los científicos estiman que el cuerpo humano tiene unos 37 billones de células.', source: { label: 'Annals of Human Biology (2013)', ref: 'Bianconi et al., "Estimation of the number of cells in the human body", Annals of Human Biology, 2013' } },
    { id: 'f-honey', kind: 'history', en: 'Archaeologists have tasted 3,000-year-old honey from Egyptian tombs and found it still edible.', es: 'Arqueólogos probaron miel de 3.000 años de tumbas egipcias y seguía comestible.', source: { label: 'Smithsonian Magazine', ref: 'Smithsonian Magazine — ancient Egyptian tomb honey' } },
    { id: 'f-moth', kind: 'history', en: "The first computer 'bug' was a real moth, found in a Harvard machine in 1947.", es: 'El primer «bug» informático fue una polilla real, hallada en una máquina de Harvard en 1947.', source: { label: 'Smithsonian National Museum of American History', ref: 'NMAH — Harvard Mark II logbook, 1947' } },
    { id: 'f-octopus', kind: 'world', en: 'An octopus has three hearts, and two of them stop when it swims.', es: 'Un pulpo tiene tres corazones, y dos de ellos se detienen cuando nada.', source: { label: 'Smithsonian Ocean', ref: 'Smithsonian Ocean Portal — octopus anatomy' } },
    { id: 'f-berries', kind: 'science', en: 'Botanically, bananas are berries, but strawberries are not.', es: 'Botánicamente, las bananas son bayas, pero las fresas no.', source: { label: 'Encyclopaedia Britannica', ref: 'Encyclopaedia Britannica — berry, botanical definition' } },
    { id: 'f-eiffel', kind: 'world', en: 'The Eiffel Tower grows about 15 centimeters taller in summer as the iron expands.', es: 'La Torre Eiffel crece unos 15 centímetros en verano cuando el hierro se expande.', source: { label: 'La Tour Eiffel (official site)', ref: 'toureiffel.paris — the tower in summer, thermal expansion' } },
    { id: 'f-otters', kind: 'world', en: 'Sea otters hold hands while they sleep, so they do not drift apart.', es: 'Las nutrias marinas se toman de las manos al dormir, para no separarse.', source: { label: 'Monterey Bay Aquarium', ref: 'Monterey Bay Aquarium — sea otter natural history' } },
    { id: 'f-tittle', kind: 'world', en: 'The dot over the letter i has a name: it is called a tittle.', es: 'El punto sobre la i tiene nombre propio: en inglés se le dice «tittle».', source: { label: 'Oxford English Dictionary', ref: 'Oxford English Dictionary — "tittle", the dot over i and j' } },
    { id: 'f-wombat', kind: 'science', en: 'Wombats produce cube-shaped droppings, a puzzle physicists solved in 2018.', es: 'Los wombats producen excrementos cúbicos, un misterio que la física resolvió en 2018.', source: { label: 'Bulletin of the American Physical Society (2018)', ref: 'Georgia Tech / APS 2018 — mechanics of wombat cube droppings' } },
    { id: 'f-sound-water', kind: 'science', en: 'Sound travels about 4.3 times faster in water than in air.', es: 'El sonido viaja unas 4,3 veces más rápido en el agua que en el aire.', source: { label: 'Encyclopaedia Britannica', ref: 'Encyclopaedia Britannica — speed of sound in water vs air' } },
    { id: 'f-oranges', kind: 'history', en: 'The first oranges grown in warm climates stayed green. The orange color came with cooler nights.', es: 'Las primeras naranjas de climas cálidos quedaban verdes. El color naranja llegó con las noches frescas.', source: { label: 'Smithsonian Magazine', ref: 'Smithsonian Magazine — why oranges are orange' } },
    { id: 'f-sharks', kind: 'science', en: 'Sharks are older than trees: they appear in the fossil record about 50 million years earlier.', es: 'Los tiburones son más viejos que los árboles: aparecen en el registro fósil unos 50 millones de años antes.', source: { label: 'Smithsonian Ocean', ref: 'Smithsonian Ocean Portal — shark evolution' } },
    { id: 'f-venus', kind: 'science', en: 'A single day on Venus lasts longer than its whole year.', es: 'Un solo día en Venus dura más que todo su año.', source: { label: 'NASA', ref: 'NASA — Venus facts: rotation period vs orbital period' } },
    { id: 'f-smells', kind: 'science', en: 'A 2014 study in Science estimated the human nose can tell apart over a trillion smells.', es: 'Un estudio de 2014 en Science estimó que la nariz humana distingue más de un billón de olores.', source: { label: 'Science (2014)', ref: 'Bushdid et al., "Humans Can Discriminate More than 1 Trillion Olfactory Stimuli", Science, 2014' } },
    { id: 'f-mm', kind: 'history', en: "M&M's are named after their inventors: Forrest Mars and Bruce Murrie.", es: 'Los M&M\'s llevan el nombre de sus inventores: Forrest Mars y Bruce Murrie.', source: { label: 'Smithsonian Magazine', ref: 'Smithsonian Magazine — the story behind M&M\'s' } },
    { id: 'f-unicorn', kind: 'world', en: 'The unicorn is the national animal of Scotland.', es: 'El unicornio es el animal nacional de Escocia.', source: { label: 'National Records of Scotland', ref: 'National Records of Scotland — Scotland\'s national animal' } },
    { id: 'f-niagara', kind: 'history', en: 'The first person to survive Niagara Falls in a barrel was a 63-year-old schoolteacher, in 1901.', es: 'La primera persona que sobrevivió las cataratas del Niágara en un barril fue una maestra de 63 años, en 1901.', source: { label: 'Encyclopaedia Britannica', ref: 'Encyclopaedia Britannica — Annie Edson Taylor, 1901' } },
    { id: 'f-rbc', kind: 'science', en: 'A red blood cell lives about 120 days before the body recycles it.', es: 'Un glóbulo rojo vive unos 120 días antes de que el cuerpo lo recicle.', source: { label: 'American Society of Hematology', ref: 'American Society of Hematology — blood basics' } },
    { id: 'f-apollo', kind: 'history', en: "The Apollo 11 guidance computer ran at 0.043 MHz, slower than a modern toaster's chip.", es: 'La computadora de guía del Apolo 11 corría a 0,043 MHz, más lenta que el chip de una tostadora moderna.', source: { label: 'NASA History Office', ref: 'NASA History — Apollo Guidance Computer specifications' } },
    { id: 'f-bees', kind: 'science', en: 'Honeybees can learn to recognize human faces, a 2010 study showed.', es: 'Las abejas pueden aprender a reconocer rostros humanos, según un estudio de 2010.', source: { label: 'Journal of Experimental Biology (2010)', ref: 'Dyer et al. — honeybee face recognition, Journal of Experimental Biology, 2010' } },
    { id: 'f-seacuke', kind: 'world', en: 'Sea cucumbers breathe through their rear end.', es: 'Los pepinos de mar respiran por el extremo trasero.', source: { label: 'Smithsonian Ocean', ref: 'Smithsonian Ocean Portal — sea cucumber anatomy' } },
    { id: 'f-whale', kind: 'world', en: "A blue whale's heart can weigh as much as a small car.", es: 'El corazón de una ballena azul puede pesar como un auto pequeño.', source: { label: 'Encyclopaedia Britannica', ref: 'Encyclopaedia Britannica — blue whale' } }
  ];
  FACTS.forEach(function (f) {
    f.cat = 'fact'; f.expr = 'thinking'; f.alts = ['default'];
    f.trigger = { type: 'pull' }; f.requires = ['any']; f.surfaces = ['card', 'pull'];
    f.cta = null; f.priority = 30; f.cooldown = 90; f.once = false;
    f.expires = EXP; f.tenure = 0; f.review = RV; f.kind = f.kind || 'science';
    LINES.push(f);
  });

  /* Wait lines (genuine waits > 3s): same library, pull-surface only in
   * practice; the ambient engine borrows them for the wait slot. */
  var WAITS = [
    { id: 'w-sync', en: 'Sync on the grid takes a moment. Your records are worth the wait.', es: 'La sincronización toma un momento. Tus registros valen la espera.' },
    { id: 'w-import', en: 'Reading your file line by line. Careful beats fast here.', es: 'Leyendo tu archivo línea por línea. Aquí, cuidado vale más que rápido.' },
    { id: 'w-export', en: 'Packing your records into one file. Almost there.', es: 'Empacando tus registros en un archivo. Ya casi.' },
    { id: 'w-generic', en: 'Working on it. The grid does not rush good records.', es: 'En eso estoy. La red no apura los buenos registros.' }
  ];

  window.GN_NODKI_LIBRARY = {
    lines: LINES,
    waits: WAITS,
    exprAssets: EXPR_ASSETS,
    stateExpr: STATE_EXPR,
    byId: function (id) {
      for (var i = 0; i < LINES.length; i++) if (LINES[i].id === id) return LINES[i];
      return null;
    }
  };
})();
