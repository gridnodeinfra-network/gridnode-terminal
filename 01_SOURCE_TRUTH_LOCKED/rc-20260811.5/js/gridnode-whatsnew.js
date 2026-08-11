/* GRID//NODE release history — authoritative user-facing update system.
 * Notes are bundled with the offline shell, localized, acknowledged once per
 * release, and reopenable from NODE / Profile.
 */
(function () {
  'use strict';

  const VERSION = window.GN_VERSION || { semver: '0.12.0', release: '20260804.1', title: 'PRODUCTION READINESS + MEDICATION INTEGRITY', date: '2026-08-04' };
  const ACK_KEY = 'gridnode.lastWhatsNewDismissedBuild';
  const LEGACY_ACK_KEY = 'gn_whatsnew_acknowledged_release_v2';
  const ORDER = ['NEW', 'IMPROVED', 'FIXED', 'ACCESSIBILITY', 'MOBILE', 'COMPATIBILITY', 'SECURITY'];
  const NOTES = Object.freeze({
    '20260804.1': {
      version: '0.12.0', title: 'PRODUCTION READINESS + MEDICATION INTEGRITY', date: '2026-08-04',
      en: {
        IMPROVED: [
          'Functional phone text now uses readable semantic roles across DAY OPS screens, forms, menus, focused tools, and update history.',
          'Human-facing SHOT and weight dates follow the selected language while stored timestamps remain canonical.'
        ],
        FIXED: [
          'Zepbound, Ozempic, and Semaglutide Compound now keep distinct stable identities through save, location selection, History, Edit, Phase Engine, and RESULTS; invalid new values fail closed.',
          'The first-SHOT draft keeps medication, dose, date, time, location, and side effects while moving through the scanner.',
          'Side effects, event sources, record states, device types, inventory types, and body zones display in the active language without storing translated labels.',
          'LAB Back behavior now closes nested menus first, then focused tools, before returning to the previous app destination.'
        ],
        ACCESSIBILITY: [
          'Functional copy uses practical 14–15px phone floors, form controls and menu options use 16px text, and touch targets remain at least 44px.',
          'DAY OPS status, helper, selected, inactive, disabled, warning, error, and placeholder text use explicit high-contrast semantic tokens.'
        ],
        MOBILE: [
          'Android and iPhone-sized navigation retains drafts, safe-area spacing, keyboard continuity, and predictable browser or system Back order.',
          'The offline shell and deliberate update flow now use one synchronized release marker and cache asset set.'
        ],
        COMPATIBILITY: [
          'No records are deleted. Recognized legacy medication and side-effect labels normalize at app boundaries; unknown legacy medication text remains available for review, and new invalid selections are rejected.'
        ]
      },

      es: {
        IMPROVED: [
          'El texto funcional en teléfonos ahora usa roles semánticos legibles en pantallas, formularios, menús, herramientas enfocadas e historial de actualizaciones de DAY OPS.',
          'Las fechas visibles de DOSIS y peso siguen el idioma seleccionado mientras las marcas de tiempo guardadas permanecen canónicas.'
        ],
        FIXED: [
          'Zepbound, Ozempic y Semaglutide Compound ahora conservan identidades estables y distintas al guardar, elegir ubicación, abrir Historial, Editar, Motor de Fases y RESULTADOS; los valores nuevos no válidos se rechazan.',
          'El borrador de la primera DOSIS conserva medicamento, cantidad, fecha, hora, ubicación y efectos secundarios al pasar por el escáner.',
          'Efectos secundarios, orígenes de eventos, estados de registros, tipos de dispositivos, tipos de inventario y zonas corporales se muestran en el idioma activo sin guardar etiquetas traducidas.',
          'Atrás en LAB ahora cierra primero los menús anidados, luego las herramientas enfocadas y después vuelve al destino anterior de la app.'
        ],
        ACCESSIBILITY: [
          'El texto funcional usa mínimos prácticos de 14–15 px en teléfono, los controles y opciones de menú usan 16 px y los objetivos táctiles siguen midiendo al menos 44 px.',
          'Estados, ayudas, selecciones, opciones inactivas o desactivadas, advertencias, errores y marcadores de posición usan tokens semánticos explícitos de alto contraste en DAY OPS.'
        ],
        MOBILE: [
          'La navegación en tamaños Android y iPhone conserva borradores, zonas seguras, continuidad con el teclado y un orden predecible para Atrás del navegador o del sistema.',
          'La estructura sin conexión y el flujo deliberado de actualización ahora usan un solo marcador de versión y un solo conjunto de recursos en caché.'
        ],
        COMPATIBILITY: [
          'No se elimina ningún registro. Las etiquetas heredadas reconocidas de medicamentos y efectos secundarios se normalizan en los límites de la app; el texto heredado desconocido del medicamento queda disponible para revisión y las selecciones nuevas no válidas se rechazan.'
        ]
      }
    },
    '20260805.1': {
      version: '0.12.0', title: 'V0.14 POLISH — CORAL CTA · CORNER TOGGLES · HUB CORNER', date: '2026-08-05',
      en: {
        NEW: [
          'HUB moved to a floating corner button (bottom-right) with the canonical insignia — no more settings-cog confusion.',
          'Landing theme and language switches are now compact corner circles.'
        ],
        IMPROVED: [
          'Primary actions glow warm coral — crisper contrast on phone screens.',
          'Release marker bumped to 20260805.1 for seamless cache refresh.'
        ],
        FIXED: [
          'Coral CTA now applies consistently across landing and dashboard in both themes.'
        ],
        MOBILE: [
          'Bottom-right HUB never overlaps the quick-log dose button.'
        ]
      },
      es: {
        NEW: [
          'HUB movido a un botón flotante en la esquina inferior derecha con la insignia canónica — adiós a la confusión con el engranaje.',
          'Los interruptores de tema e idioma de la portada ahora son círculos compactos en las esquinas.'
        ],
        IMPROVED: [
          'Las acciones principales brillan en coral cálido — mejor contraste en pantallas de teléfono.',
          'Marcador de versión actualizado a 20260805.1 para refresco de caché sin fricción.'
        ],
        FIXED: [
          'El CTA coral ahora se aplica de forma consistente en portada y tablero en ambos temas.'
        ],
        MOBILE: [
          'El HUB de la esquina inferior derecha nunca se superpone al botón de dosis rápida.'
        ]
      }
    },
    '20260803.23': {
      version: '0.11.0', title: 'MOBILE APP SHELL + DAY OPS READABILITY', date: '2026-08-03',
      en: {
        IMPROVED: [
          'DAY OPS now uses one semantic text system across screens, forms, menus, charts, dialogs, and focused tools.',
          'The mobile shell now tracks the live browser viewport, safe areas, keyboard state, and installed-app mode.'
        ],
        FIXED: [
          'Browser and system Back now dismiss temporary layers before moving between app destinations.',
          'Partially completed SHOT entries survive navigation, backgrounding, reload, and a user-applied update.',
          'Dropdown options, placeholders, helper text, warnings, and disabled states remain distinct in DAY OPS.'
        ],
        ACCESSIBILITY: [
          'Functional microcopy has a readable size, weight, spacing, and opacity floor.',
          'Touch controls retain 44px targets and visible keyboard focus without relying on hover.'
        ],
        MOBILE: [
          'Update activation waits for the user instead of replacing an active session.',
          'The offline shell now includes the current interface, localization, and release history.'
        ],
        COMPATIBILITY: ['No stored record schema changed. Existing SHOTS, settings, language, and theme data remain compatible.']
      },
      es: {
        IMPROVED: [
          'DAY OPS ahora usa un solo sistema semántico de texto en pantallas, formularios, menús, gráficas, diálogos y herramientas enfocadas.',
          'La estructura móvil ahora sigue el área visible del navegador, las zonas seguras, el teclado y el modo de app instalada.'
        ],
        FIXED: [
          'Atrás del navegador y del sistema ahora cierra las capas temporales antes de cambiar de destino.',
          'Un registro de SHOT sin terminar sobrevive la navegación, el segundo plano, la recarga y una actualización aplicada por el usuario.',
          'Opciones, marcadores, ayudas, advertencias y estados desactivados se distinguen claramente en DAY OPS.'
        ],
        ACCESSIBILITY: [
          'El microtexto funcional tiene mínimos legibles de tamaño, peso, espaciado y opacidad.',
          'Los controles táctiles conservan objetivos de 44 px y enfoque visible sin depender del hover.'
        ],
        MOBILE: [
          'La actualización espera la acción del usuario en vez de reemplazar una sesión activa.',
          'La estructura sin conexión ahora incluye la interfaz, la localización y el historial de versiones.'
        ],
        COMPATIBILITY: ['No cambió el esquema de datos. Los SHOTS, ajustes, idioma y tema existentes siguen siendo compatibles.']
      }
    },
    '20260803.22': {
      version: '0.10.0', title: 'PREMIUM PRODUCT POLISH', date: '2026-08-03',
      en: {
        IMPROVED: [
          'Onboarding is four concise stages with real-target advancement for action steps.',
          'The first SHOT mission leads the inactive dashboard; RESULTS and Phase Engine strengthen after activation.',
          'LAB tools open as focused destinations with a reliable Back to LAB control.',
          'The landing page shows the real GRID//NODE dashboard instead of a decorative hologram.'
        ],
        FIXED: [
          'The loading terminal is a themed system-status deck instead of a white block.',
          'Zepbound retains its canonical identity through location selection, history, Edit, Phase Engine, and RESULTS.'
        ],
        COMPATIBILITY: ['Side effects, height, language, and theme continue to persist with existing local records.']
      },
      es: {
        IMPROVED: [
          'La introducción tiene cuatro etapas breves y los pasos de acción avanzan solo con el objetivo real.',
          'La misión del primer SHOT domina el panel inactivo; RESULTS y Phase Engine ganan fuerza después de activarse.',
          'Las herramientas de LAB se abren como destinos enfocados con un control Atrás a LAB confiable.',
          'La página inicial muestra el panel real de GRID//NODE en vez de un holograma decorativo.'
        ],
        FIXED: [
          'La terminal de carga es un panel temático de estado del sistema en vez de un bloque blanco.',
          'Zepbound conserva su identidad canónica en ubicación, historial, Editar, Phase Engine y RESULTS.'
        ],
        COMPATIBILITY: ['Efectos secundarios, altura, idioma y tema siguen persistiendo con los registros locales existentes.']
      }
    },
    '20260802.9': {
      version: '0.9.0', title: 'PREMIUM MOBILE REFINEMENT', date: '2026-08-02',
      en: {
        NEW: ['Formal GRID//NODE version history and a reopenable system-update experience.'],
        IMPROVED: ['Red-lava primary actions and broader DAY OPS coverage.', 'Phase Curve charts reserve space for labels.'],
        FIXED: ['Passkey prompts no longer repeat after registration.', 'Mobile header controls no longer overlap the GRID//NODE brand.'],
        ACCESSIBILITY: ['Larger text roles and clearer focus in both themes.']
      },
      es: {
        NEW: ['Historial formal de versiones de GRID//NODE y una experiencia de actualización que puede reabrirse.'],
        IMPROVED: ['Acciones principales lava roja y mayor cobertura de DAY OPS.', 'Las gráficas Phase Curve reservan espacio para etiquetas.'],
        FIXED: ['Las invitaciones de passkey ya no se repiten después del registro.', 'Los controles del encabezado móvil ya no cubren la marca GRID//NODE.'],
        ACCESSIBILITY: ['Roles de texto más grandes y enfoque más claro en ambos temas.']
      }
    },
    '20260805.2': {
      version: '0.15.0', title: 'CLOUD-FIRST · MARS RED · JACK IN REBUILD', date: '2026-08-05',
      en: {
        NEW: ['Cloud-first sign-in: Continue with Google and Continue with Passkey are now the primary entry points.', 'The JACK IN screen was rebuilt — wordmark, one-line value, full-width buttons, no jargon.'],
        IMPROVED: ['Mars Red (#FF3B3B) is the single brand red across every action surface.', 'The entry screen now uses the full viewport on mobile — nothing cut off, scrollable if needed.'],
        FIXED: ['Passkey sign-in now guides you to enter your email first and shows clear error states.', 'The What\'s New popup no longer repeats — it shows once per build.', 'The theme toggle works again, and the What\'s New panel is sized to the screen.']
      },
      es: {
        NEW: ['Inicio de sesión cloud-primero: Continuar con Google y Continuar con Passkey son ahora las entradas principales.', 'La pantalla JACK IN fue reconstruida — marca, propuesta de una línea, botones de ancho completo, sin jerga.'],
        IMPROVED: ['Mars Red (#FF3B3B) es el único rojo de marca en todas las superficies de acción.', 'La pantalla de entrada usa el viewport completo en móvil — nada se corta, con scroll si es necesario.'],
        FIXED: ['El inicio de sesión con Passkey ahora te guía a ingresar primero tu correo y muestra estados de error claros.', 'La ventana de novedades ya no se repite — se muestra una vez por build.', 'El interruptor de tema vuelve a funcionar y el panel de novedades se ajusta a la pantalla.']
      }
    },
    '20260805.3': {
      version: '0.15.1', title: 'QUICK SHOT · TUTORIAL · COMPACT TOPBAR', date: '2026-08-05',
      en: {
        NEW: ['Quick shot is now safe: tap the red button, review the dose, confirm — nothing logs by itself.', 'The tutorial now teaches the basics: first shot, weight, theme, language.'],
        IMPROVED: ['Compact topbar: icon-only toggles with custom city icons, smaller HUB, more room for the brand.', 'One version number everywhere — no more confusing duplicates.'],
        FIXED: ['Errors now appear next to the action that caused them, not in the topbar.', 'Passkey errors show a clear inline message instead of a truncated banner.']
      },
      es: {
        NEW: ['El registro rápido ahora es seguro: toca el botón rojo, revisa la dosis, confirma — nada se guarda solo.', 'El tutorial ahora enseña lo básico: primera dosis, peso, tema, idioma.'],
        IMPROVED: ['Barra superior compacta: interruptores solo con íconos de ciudad, HUB más pequeño, más espacio para la marca.', 'Un solo número de versión en todas partes — sin duplicados confusos.'],
        FIXED: ['Los errores ahora aparecen junto a la acción que los causó, no en la barra superior.', 'Los errores de Passkey muestran un mensaje claro en línea en lugar de un banner truncado.']
      }
    },
    '20260805.4': {
      version: '0.15.2', title: 'POLISH SWEEP · BOTTOM TOASTS · LEANER SHELL', date: '2026-08-05',
      en: {
        NEW: ['Faster start: the scanner reference image now loads lazily, trimming the first paint.'],
        IMPROVED: ['Confirmation toasts now appear at the bottom of the screen — out of the way, with UNDO on every save.', 'The quick-start tour points returning users straight at LOG SHOT instead of the first-run button.'],
        FIXED: ['CSV mapping errors show inline in the import panel instead of a browser pop-up.']
      },
      es: {
        NEW: ['Inicio más rápido: la imagen de referencia del escáner ahora carga de forma diferida, reduciendo la primera pintura.'],
        IMPROVED: ['Los avisos de confirmación ahora aparecen en la parte inferior de la pantalla — fuera del camino, con DESHACER en cada guardado.', 'El tour de inicio rápido apunta a los usuarios recurrentes directo a REGISTRAR DOSIS en lugar del botón de primer uso.'],
        FIXED: ['Los errores del mapeo CSV se muestran en línea en el panel de importación en lugar de una ventana emergente.']
      }
    },
    '20260805.4': {
      version: '0.15.2', title: 'POLISH SWEEP · BOTTOM TOASTS · LEANER SHELL', date: '2026-08-05',
      en: {
        NEW: ['Faster start: the scanner reference image now loads lazily, trimming the first paint.'],
        IMPROVED: ['Confirmation toasts now appear at the bottom of the screen — out of the way, with UNDO on every save.', 'The quick-start tour points returning users straight at LOG SHOT instead of the first-run button.'],
        FIXED: ['CSV mapping errors show inline in the import panel instead of a browser pop-up.']
      },
      es: {
        NEW: ['Inicio más rápido: la imagen de referencia del escáner ahora carga de forma diferida, reduciendo la primera pintura.'],
        IMPROVED: ['Los avisos de confirmación ahora aparecen en la parte inferior de la pantalla — fuera del camino, con DESHACER en cada guardado.', 'El tour de inicio rápido apunta a los usuarios recurrentes directo a REGISTRAR DOSIS en lugar del botón de primer uso.'],
        FIXED: ['Los errores del mapeo CSV se muestran en línea en el panel de importación en lugar de una ventana emergente.']
      }
    },
    '20260805.5': {
      version: '0.15.3', title: 'ONBOARDING REDESIGN · SPOTLIGHT TOUR', date: '2026-08-05',
      en: {
        NEW: ['The quick-start tour now highlights the real buttons as you go — a spotlight ring points at what to tap, with a card that follows it.'],
        IMPROVED: ['Tour steps now scroll the control into view first, so the highlight is always visible on any screen size.', 'Clearer step copy that teaches the flow instead of jargon.'],
        FIXED: ['The tour no longer shows an empty popup when the dashboard renders in mission-card mode.']
      },
      es: {
        NEW: ['El tour de inicio rápido ahora resalta los botones reales mientras avanzas — un anillo de foco apunta a lo que debes tocar, con una tarjeta que lo sigue.'],
        IMPROVED: ['Los pasos del tour desplazan el control a la vista primero, para que el resaltado siempre sea visible en cualquier tamaño de pantalla.', 'Copias de pasos más claras que enseñan el flujo en lugar de jerga.'],
        FIXED: ['El tour ya no muestra una ventana vacía cuando el panel se renderiza en modo tarjeta de misión.']
      }
    },
    '20260805.6': {
      version: '0.15.4', title: 'SEQUENCING FIX · BALANCED CRT', date: '2026-08-05',
      en: {
        FIXED: ['The quick-start tour no longer stacks on top of the What\'s New update card — they play one after the other.', 'The CRT scanline effect is subtler so colors stay vivid while keeping the terminal look.']
      },
      es: {
        FIXED: ['El tour de inicio rápido ya no se apila sobre la tarjeta de novedades — se reproducen uno después del otro.', 'El efecto CRT de líneas de escaneo es más sutil para que los colores sigan vivos manteniendo la estética de terminal.']
      }
    },
    '20260810.1': {
      version: '0.15.5', title: '2026 PREMIUM REFINEMENT PASS', date: '2026-08-10',
      en: {
        IMPROVED: [
          'Day Ops topbar buttons (theme toggle and language globe) now have visible borders so the controls are discoverable on light surfaces',
          'The SHOTS page now reads as SHOT LOG with a SCANNER + ENTRIES subtitle, so the page header matches the scanner body and the entries below'
        ]
      },
      es: {
        IMPROVED: [
          'Los botones de la barra superior en Day Ops (selector de tema e idioma) ahora tienen bordes visibles para que se descubran en superficies claras',
          'La página de DOSIS ahora se muestra como REGISTRO DE DOSIS con subtítulo ESCÁNER + ENTRADAS, para que el encabezado coincida con el cuerpo del escáner y las entradas debajo'
        ]
      }
    },
    '20260811.5': {
      version: '0.15.10', title: 'PREMIUM SCANNER SYSTEM', date: '2026-08-11',
      en: {
        NEW: [
          'SHOTS scanner rebuilt on a purpose-built synthetic mannequin with three focused views: CORE abdomen, LOWER front thighs, UPPER rear upper arms',
          'Anatomical region contours follow the body — ready, selected, last, and recent states with LOCATION LOCKED confirmation'
        ]
      },
      es: {
        NEW: [
          'Escáner de DOSIS reconstruido con maniquí sintético y tres vistas enfocadas: CORE abdomen, LOWER muslos frontales, UPPER brazos posteriores',
          'Contornos anatómicos con estados listo, seleccionado, último y reciente, y confirmación UBICACIÓN BLOQUEADA'
        ]
      }
    },
    '20260811.4': {
      version: '0.15.9', title: 'SCANNER REDESIGN', date: '2026-08-11',
      en: {
        NEW: [
          'SHOTS scanner rebuilt on a new synthetic diagnostic mannequin — no baked purple zones',
          'Three purpose-built views: CORE abdomen, LOWER front thighs, UPPER rear upper-arms',
          'Vector region contours own READY / SELECTED / LAST / RECENT with LOCATION LOCKED confirmation'
        ]
      },
      es: {
        NEW: [
          'Escáner de DOSIS reconstruido con maniquí diagnóstico sintético — sin zonas moradas horneadas',
          'Tres vistas: CORE abdomen, LOWER muslos frontales, UPPER brazos posteriores',
          'Contornos vectoriales con estados READY / SELECTED / LAST / RECENT y confirmación UBICACIÓN BLOQUEADA'
        ]
      }
    },
    '20260811.3': {
      version: '0.15.8', title: 'SCANNER REGION GEOMETRY', date: '2026-08-11',
      en: {
        IMPROVED: [
          'CORE abdomen regions are tighter, outline-led, and stay above the groin line',
          'LOWER is a front thigh scan with outer-thigh targets between pelvis and knee',
          'UPPER rear-arm regions stay on the triceps — both subdivisions above the elbow'
        ]
      },
      es: {
        IMPROVED: [
          'Las regiones CORE del abdomen son más precisas, con contorno y por encima de la ingle',
          'LOWER es un escaneo frontal de muslos con zonas externas entre pelvis y rodilla',
          'UPPER mantiene los brazos posteriores en el tríceps — ambas subdivisiones sobre el codo'
        ]
      }
    },
    '20260811.2': {
      version: '0.15.7', title: 'PREMIUM SCANNER + SURFACE POLISH', date: '2026-08-11',
      en: {
        IMPROVED: [
          'SHOTS scanner is a focused diagnostic system: CORE abdomen, LOWER thighs, and UPPER rear upper-arms each frame the anatomy that matters',
          'Zone pads are clearer, touch-friendly, and state-aware — selected, last-used, and recent locations read without guessing',
          'Language control is a crisp vector 電 instrument (cyan in English, Mars Red in Spanish) across landing and app shell',
          'CRT scan energy is quieter so it stays atmospheric instead of competing with content'
        ],
        FIXED: [
          'Location staging confirms immediately, stays synced with the SHOT sheet, and persists through save'
        ]
      },
      es: {
        IMPROVED: [
          'El escáner de DOSIS es un sistema diagnóstico enfocado: CORE abdomen, LOWER muslos y UPPER brazos posteriores enmarcan la anatomía que importa',
          'Las zonas son más claras, táctiles y con estado legible — seleccionada, última y reciente sin adivinar',
          'El control de idioma es un instrumento vectorial 電 nítido (cian en inglés, rojo Marte en español) en landing y app',
          'La energía CRT es más sutil para ambientar sin competir con el contenido'
        ],
        FIXED: [
          'La ubicación se confirma al instante, se sincroniza con la hoja de DOSIS y persiste al guardar'
        ]
      }
    },
    '20260811.1': {
      version: '0.15.6', title: 'LAUNCH INTEGRITY + 2026 SURFACE', date: '2026-08-11',
      en: {
        FIXED: [
          'Health-data writes now use a durable storage journal — if a multi-key save fails mid-flight, SHOTS, WEIGHTS, inventory, and imports stay consistent instead of splitting',
          'Deleting a SHOT-linked weight now commits the cloud tombstone in the same transaction, so cleared RESULTS cannot silently return from cloud sync',
          'UNDO and RESTORE on SHOTS reapply inventory and linked RESULTS atomically — no half-restored medication stock',
          'Ozempic never deducts a compounded semaglutide inventory item; medication identity stays exact across brand and research compounds',
          'Phase Sphere and Phase Engine no longer wrap stale SHOTS back to activation, and future-dated SHOTS stay out of current phase state',
          'Sign-out dialog now participates correctly in focus, Escape, and browser/Android Back without signing you out by accident'
        ],
        IMPROVED: [
          'Evidence View accessibility: localized animal-model labels, touch-sized source links, keyboard chart inspection with live text feedback, and a clearer research-boundary footer',
          '2026 surface polish across topbar, bottom nav, cards, FAB, and sheets — glass depth and hierarchy without redesigning GRID//NODE identity',
          'LOG SHOT is the clear primary action on the dashboard; LOG WEIGHT stays the cyan secondary'
        ],
        ACCESSIBILITY: [
          'Collapsed SHOT advanced fields stay out of the keyboard sequence until expanded',
          'Modal dialogs expose a single dialog surface with proper focus return'
        ]
      },
      es: {
        FIXED: [
          'Las escrituras de datos de salud usan un diario de almacenamiento durable: si un guardado multi-clave falla a mitad, DOSIS, PESOS, inventario e importaciones se mantienen consistentes en lugar de dividirse',
          'Borrar un peso vinculado a una DOSIS ahora confirma la tumba en la nube en la misma transacción, para que los RESULTADOS borrados no regresen en silencio desde la sincronización',
          'DESHACER y RESTAURAR en DOSIS reaplican inventario y RESULTADOS vinculados de forma atómica — sin stock de medicación a medias',
          'Ozempic nunca descuenta un ítem de inventario de semaglutida compuesta; la identidad del medicamento se mantiene exacta entre marca y compuestos de investigación',
          'La Esfera de Fase y el Motor de Fase ya no devuelven DOSIS antiguas a activación, y las DOSIS con fecha futura no entran al estado de fase actual',
          'El diálogo de cierre de sesión ahora participa correctamente en foco, Escape y Atrás del navegador/Android sin cerrar sesión por accidente'
        ],
        IMPROVED: [
          'Accesibilidad de Evidence View: etiquetas de modelo animal localizadas, enlaces de fuente con tamaño táctil, inspección del gráfico por teclado con texto en vivo y un pie más claro sobre el límite de investigación',
          'Pulido visual 2026 en barra superior, navegación inferior, tarjetas, FAB y paneles — profundidad de vidrio y jerarquía sin rediseñar la identidad GRID//NODE',
          'LOG SHOT es la acción primaria clara en el panel; LOG WEIGHT permanece como secundaria cian'
        ],
        ACCESSIBILITY: [
          'Los campos avanzados de DOSIS colapsados quedan fuera de la secuencia de teclado hasta expandirse',
          'Los diálogos modales exponen una sola superficie de diálogo con retorno de foco correcto'
        ]
      }
    },
    '20260810.2': {
      version: '0.15.5', title: 'PEPTIDE EVIDENCE ENGINE', date: '2026-08-10',
      en: {
        NEW: [
          '17 research peptides join the catalog in grouped pickers — RECOVERY (BPC-157, TB-500, Thymosin β-4, Thymosin α-1), GH AXIS (CJC-1295 DAC, Mod GRF 1-29, Ipamorelin, Sermorelin, Tesamorelin), NEURO (Semax, Selank), SKIN (GHK-Cu topical/injectable), METABOLIC (Elamipretide/SS-31, Epitalon, MOTS-c, KPV)',
          'The Phase Engine curve is now compound-specific and evidence-aware: compounds with regulator-reviewed human PK draw a labeled exposure model; compounds with human response data draw a clearly-labeled response window; everything else shows an honest timeline-only state — no invented curves',
          'EXPAND the protocol curve into a full-screen EVIDENCE VIEW: cycle ring, relative model curve with phase bands and animated trace, an evidence dossier with cited sources, an ANIMAL MODEL research panel (clearly marked NOT HUMAN EXPOSURE) where relevant, and STACK LANES with a modeled-overlap readout across compounds — interactions are never modeled as combined scores',
          'Every compound carries an evidence chip: LABELED HUMAN PK · HUMAN RESPONSE WINDOW · TIMELINE ONLY',
          'Fabricated 2026 trial registrations (Hudson Biotech cluster) are excluded from evidence and flagged inside compound notes'
        ],
        IMPROVED: [
          'Each compound lane includes a plain-text summary (medication · time since · phase · evidence) so the chart stays readable without color or patterns'
        ]
      },
      es: {
        NEW: [
          '17 péptidos de investigación se suman al catálogo en selectores agrupados — RECUPERACIÓN (BPC-157, TB-500, Timosina β-4, Timosina α-1), EJE GH (CJC-1295 DAC, Mod GRF 1-29, Ipamorelina, Sermorelina, Tesamorelina), NEURO (Semax, Selank), PIEL (GHK-Cu tópico/inyectable), METABÓLICO (Elamipretida/SS-31, Epitalón, MOTS-c, KPV)',
          'La curva del Motor de Fase ahora es específica por compuesto y basada en evidencia: los compuestos con PK humana revisada dibujan un modelo de exposición etiquetado; los que tienen datos de respuesta humana dibujan una ventana de respuesta claramente etiquetada; todo lo demás muestra un estado honesto de solo línea de tiempo — sin curvas inventadas',
          'EXPANDE la curva de protocolo a una VISTA DE EVIDENCIA a pantalla completa: anillo de ciclo, curva de modelo relativo con bandas de fase y trazo animado, dossier de evidencia con fuentes citadas, panel de MODELO ANIMAL (marcado claramente como NO ES EXPOSICIÓN HUMANA) cuando aplica, y CARRILES DE STACK con lectura de solape modelado — las interacciones nunca se modelan como puntuaciones combinadas',
          'Cada compuesto lleva una etiqueta de evidencia: PK HUMANA DOCUMENTADA · VENTANA DE RESPUESTA HUMANA · SOLO LÍNEA DE TIEMPO',
          'Los registros de ensayos fabricados de 2026 (grupo Hudson Biotech) quedan excluidos de la evidencia y se señalan dentro de las notas del compuesto'
        ],
        IMPROVED: [
          'Cada carril de compuesto incluye un resumen de texto plano (medicamento · tiempo desde · fase · evidencia) para que el gráfico sea legible sin color ni patrones'
        ]
      }
    },
    '20260808.23': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-09',
      en: {
        FIXED: [
          'The UPDATE banner now shows which release is waiting (e.g. "· 20260808.23") so a fresh update never looks like the same one looping',
          'After you apply an update, newly-arrived releases wait quietly for 2 minutes instead of immediately re-bannering — one tap, one update, then done',
          'Spanish quick-action buttons no longer clip or overlap on narrow phones',
          'Empty charts now show a clear "no records yet" state instead of a blank box',
          'Light theme: secondary buttons are readable again instead of nearly invisible'
        ],
        IMPROVED: [
          'Content no longer hides behind the bottom navigation on mobile',
          'The landing page rhythm is tighter — the language control floats top-right and no longer leaves a dead gap',
          'Release headers in WHAT\'S NEW no longer break mid-date'
        ]
      },
      es: {
        FIXED: [
          'El banner de ACTUALIZACIÓN ahora muestra qué versión está esperando (ej. "· 20260808.23") para que una actualización nueva nunca parezca la misma repitiéndose',
          'Después de aplicar una actualización, las versiones recién llegadas esperan en silencio 2 minutos en lugar de volver a mostrar el banner de inmediato — un toque, una actualización, y listo',
          'Los botones de acción rápida en español ya no se cortan ni se superponen en teléfonos angostos',
          'Los gráficos vacíos ahora muestran un estado claro de "sin registros" en lugar de una caja en blanco',
          'Tema claro: los botones secundarios vuelven a ser legibles'
        ],
        IMPROVED: [
          'El contenido ya no queda oculto detrás de la navegación inferior en móvil',
          'El ritmo de la página de inicio está más ajustado — el control de idioma flota arriba a la derecha y ya no deja un espacio muerto',
          'Los encabezados de versión en NOVEDADES ya no se cortan a mitad de fecha'
        ]
      }
    },
    '20260808.19': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-09',
      en: {
        IMPROVED: ['The boot sequence is now a live terminal — lines type out with a blinking cursor, status tags flip from ▶ ACTIVE to [ OK ], the header cycles INITIALIZING → CALIBRATING → SYNCING → ONLINE, and the emblem flashes Mars Red at completion.']
      },
      es: {
        IMPROVED: ['La secuencia de arranque ahora es una terminal viva — las líneas se escriben con cursor parpadeante, las etiquetas pasan de ▶ ACTIVO a [ OK ], el encabezado cicla INICIALIZANDO → CALIBRANDO → SINCRONIZANDO → EN LÍNEA, y el emblema destella en rojo Marte al completarse.']
      }
    },
    '20260808.18': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        FIXED: ['Updates now apply on the first tap — the new version takes control instantly instead of asking you to tap UPDATE twice.']
      },
      es: {
        FIXED: ['Las actualizaciones ahora se aplican al primer toque — la nueva versión toma el control al instante en lugar de pedirte que toques ACTUALIZAR dos veces.']
      }
    },
    '20260808.17': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['The CRT scan line is quieter — fainter glow and a slower, calmer sweep.']
      },
      es: {
        IMPROVED: ['La línea de escaneo CRT es más sutil — brillo más tenue y un barrido más lento y tranquilo.']
      }
    },
    '20260808.16': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        FIXED: ['The sign-in screen and nav accents are back to the pre-change cyan treatment (Pipe direction). Mars Red stays on the CTAs only.']
      },
      es: {
        FIXED: ['La pantalla de inicio y los acentos de navegación vuelven al tratamiento cian previo (dirección de Pipe). El rojo Marte queda solo en los CTA.']
      }
    },
    '20260808.15': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        FIXED: ['Applying an update can no longer hang on "APPLYING UPDATE…" — if the handshake stalls, the app recovers and reloads on its own within seconds.']
      },
      es: {
        FIXED: ['Aplicar una actualización ya no puede quedarse colgado en "APLICANDO ACTUALIZACIÓN…" — si el proceso se detiene, la app se recupera y recarga sola en segundos.']
      }
    },
    '20260808.14': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        FIXED: ['The language kanji now glows Mars Red in both English and Spanish (was cyan in English). On the sign-in card it sits cleanly above the header — no more overlap.']
      },
      es: {
        FIXED: ['El kanji de idioma ahora brilla en rojo Marte tanto en inglés como en español (antes cian en inglés). En la tarjeta de inicio se ubica limpiamente sobre el encabezado — sin superposición.']
      }
    },
    '20260808.13': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['The WHAT\'S NEW header now carries the same subtle CRT glitch as the sign-in title — a faint RGB drift with a brief blip every few seconds.']
      },
      es: {
        IMPROVED: ['El encabezado de NOVEDADES ahora lleva el mismo glitch CRT sutil que el título de inicio — una leve deriva RGB con un breve parpadeo cada pocos segundos.']
      }
    },
    '20260808.12': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['The dedication heart glows violet. For Oskar.', 'The sign-in card is now Mars Black with Mars Red type — the whole auth surface runs on the red family.']
      },
      es: {
        IMPROVED: ['El corazón de la dedicatoria brilla en violeta. Para Oskar.', 'La tarjeta de inicio ahora es Negro Marte con texto Rojo Marte — toda la superficie de autenticación corre en la familia roja.']
      }
    },
    '20260808.11': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        FIXED: ['The CRT scan line returns to its original reach — main screens plus the WHAT\'S NEW modal. LAB tool surfaces are unchanged from before.']
      },
      es: {
        FIXED: ['La línea de escaneo CRT vuelve a su alcance original — pantallas principales y la ventana de NOVEDADES. Las superficies de LAB no cambian respecto a antes.']
      }
    },
    '20260808.10': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['The active tab now glows Mars Red instead of cyan — indicator, icon, and label. Touch feedback is premium: a two-stage mechanical click haptic on the tabs, a heavier thump on the FAB, and a springy punch with a red flash on press.']
      },
      es: {
        IMPROVED: ['La pestaña activa ahora brilla en rojo Marte en lugar de cian — indicador, icono y etiqueta. La respuesta táctil es premium: un clic mecánico de dos fases en las pestañas, un golpe más fuerte en el FAB y un rebote con destello rojo al presionar.']
      }
    },
    '20260808.9': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['The CRT scan line now also sweeps over the WHAT\'S NEW modal.']
      },
      es: {
        IMPROVED: ['La línea de escaneo CRT ahora también recorre la ventana de NOVEDADES.']
      }
    },
    '20260808.8': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['The GRID//NODE title on the sign-in card now carries a subtle terminal glitch — a faint RGB drift at rest with a brief low-key displacement burst every few seconds.']
      },
      es: {
        IMPROVED: ['El título GRID//NODE en la tarjeta de inicio ahora tiene un glitch de terminal sutil — una leve deriva RGB en reposo y una breve ráfaga de desplazamiento cada pocos segundos.']
      }
    },
    '20260808.7': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['The landing kicker now glitches like a real CRT terminal — a faint RGB split at rest, then a brief channel-displacement burst every few seconds. Both themes, disabled with reduced motion.']
      },
      es: {
        IMPROVED: ['El eslogan de la portada ahora tiene glitch como un terminal CRT real — una leve separación RGB en reposo y una breve ráfaga de desplazamiento cada pocos segundos. Ambos temas, desactivado con movimiento reducido.']
      }
    },
    '20260808.6': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['Language switch is now a single glowing kanji (電) — bigger, no dropdown, no grey tabs. Tap it to flip between English and Español; it glows cyan in English and Mars Red in Spanish.']
      },
      es: {
        IMPROVED: ['El cambio de idioma ahora es un solo kanji brillante (電) — más grande, sin menú, sin pestañas grises. Tócalo para alternar entre inglés y español; brilla en cian en inglés y rojo Marte en español.']
      }
    },
    '20260808.5': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        IMPROVED: ['Revision pass: kanji stroke sharpened (2px), theme icons dim to 40% when inactive, ghost buttons more visible, peptide form auto-scrolls into view after picking a compound, and FUENTE + OBSERVACIONES collapse behind an ADVANCED toggle.'],
        FIXED: ['DUSK theme home screen no longer washes out — the light-theme dim rule now spares the empty-state hero.']
      },
      es: {
        IMPROVED: ['Pase de revisión: trazo del kanji afinado (2px), iconos de tema al 40% cuando están inactivos, botones fantasma más visibles, el formulario de péptidos se desplaza automáticamente al elegir un compuesto, y FUENTE + OBSERVACIONES se pliegan tras un conmutador AVANZADO.'],
        FIXED: ['La pantalla de inicio del tema DUSK ya no se ve deslavada — la regla de atenuación del tema claro ahora respeta el estado vacío.']
      }
    },
    '20260808.4': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        NEW: ['The language toggle is now a 2077 kanji (電) that glows cyan for English and Mars Red for Español.', 'A rolling CRT scanline sweeps the screen every few seconds — subtle, terminal-authentic, disabled with reduced motion.', 'Dashboard stats now tick up and down when they change, with a Mars Red flash.'],
        IMPROVED: ['The research peptide notice is collapsed to a "?" — tap for the full disclaimer.', 'Bottom-nav tabs punch and vibrate (15ms) on press.', 'Dose form opens centered, not as a half-height sheet.', 'LAB tiles wrap cleanly on narrow screens.'],
        FIXED: ['Local-mode home screen no longer washes out — the pending-dashboard dim is removed.']
      },
      es: {
        NEW: ['El selector de idioma ahora es un kanji 2077 (電) que brilla en cian para inglés y rojo Marte para español.', 'Una línea CRT recorre la pantalla cada pocos segundos — sutil, auténtica, desactivada con movimiento reducido.', 'Las estadísticas del tablero ahora cuentan hacia arriba o abajo al cambiar, con un destello rojo Marte.'],
        IMPROVED: ['El aviso de péptidos de investigación se colapsa en un "?" — toca para ver el aviso completo.', 'Las pestañas inferiores vibran (15 ms) y tienen un efecto de pulsación al presionar.', 'El formulario de dosis se abre centrado, no como una hoja a media altura.', 'Las tarjetas de LAB se ajustan correctamente en pantallas estrechas.'],
        FIXED: ['La pantalla de inicio en modo local ya no se ve deslavada — se eliminó la atenuación del tablero pendiente.']
      }
    },
    '20260808.3': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        FIXED: ['Home screen washed-out look fixed — the "REGISTER MY FIRST DOSE" CTA and empty-state hero are back at full Mars Red strength in local mode.']
      },
      es: {
        FIXED: ['Se corrigió la apariencia deslavada de la pantalla de inicio — el CTA "REGISTRAR MI PRIMERA DOSIS" y el estado vacío vuelven al rojo Marte completo en modo local.']
      }
    },
    '20260808.2': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        FIXED: ['The "UPDATE AVAILABLE" notice no longer appears twice when a new version is waiting to be applied.']
      },
      es: {
        FIXED: ['El aviso "ACTUALIZACIÓN DISPONIBLE" ya no aparece dos veces cuando hay una nueva versión lista para aplicar.']
      }
    },
    '20260808.1': {
      version: '0.15.5', title: 'A11Y · I18N · WCAG SWEEP', date: '2026-08-08',
      en: {
        ACCESSIBILITY: ['Screen-reader exposure fixed for the tour dialog and its controls.', 'Keyboard focus stays clearly visible on every interactive control.', 'WCAG AA contrast verified across both themes — NIGHT and DAY OPS.']
      },
      es: {
        ACCESSIBILITY: ['Se corrigió la exposición del diálogo del tour para lectores de pantalla y sus controles.', 'El foco de teclado permanece claramente visible en todos los controles interactivos.', 'Contraste WCAG AA verificado en ambos temas — NIGHT y DAY OPS.']
      }
    },
  });

  function lang() { return document.documentElement.lang === 'es' ? 'es' : 'en'; }
  function tx(key, fallback) { return window.GN_I18N?.text ? window.GN_I18N.text(key, fallback) : fallback; }
  function labels() {
    return {
      NEW: tx('whatsnew.catNew', 'NEW'), IMPROVED: tx('whatsnew.catImproved', 'IMPROVED'),
      FIXED: tx('whatsnew.catFixed', 'FIXED'), ACCESSIBILITY: tx('whatsnew.catA11y', 'ACCESSIBILITY'),
      MOBILE: tx('whatsnew.catMobile', 'MOBILE'), SECURITY: tx('whatsnew.catSecurity', 'SECURITY'),
      COMPATIBILITY: lang() === 'es' ? 'COMPATIBILIDAD' : 'COMPATIBILITY'
    };
  }
  function acknowledged() {
    try {
      const v = localStorage.getItem(ACK_KEY);
      if (v) return v;
      return localStorage.getItem(LEGACY_ACK_KEY); // migrate old dismissal
    } catch (_) { return null; }
  }
  function acknowledge(release) {
    try {
      localStorage.setItem(ACK_KEY, release);
      localStorage.setItem(LEGACY_ACK_KEY, release);
      localStorage.setItem('gn_whatsnew_seen_premium_' + release, '1');
      localStorage.setItem('gn_whatsnew_seen', VERSION.semver);
    } catch (_) {}
  }
  function hasCurrentNotes() { return Boolean(NOTES[VERSION.release]?.[lang()]); }

  function categories(entry) {
    const data = entry[lang()] || entry.en || {};
    const names = labels();
    return ORDER.map(category => {
      const items = data[category];
      if (!items?.length) return '';
      return '<section class="gn-wn-cat" data-cat="' + category.toLowerCase() + '"><ul>' + items.map(item => '<li>' + item + '</li>').join('') + '</ul></section>';
    }).join('');
  }

  function releasePanel(release, entry, current) {
    // B4 (v0.15.1): ONE version reference — "GRID//NODE v0.15" +
    // "// release 20260805.3" below. The release-title subtitle is removed.
    // Overnight polish (2026-08-09): date moves to its own dim line so the
    // version never wraps mid-token ("2026-\n08-09") on narrow cards.
    return '<article class="gn-wn-release' + (current ? ' current' : '') + '">' +
      '<div class="gn-wn-release-head"><div class="gn-whatsnew-version">GRID//NODE v' + entry.version + '</div><div class="gn-whatsnew-date">' + entry.date + '</div></div>' +
      '<div class="gn-whatsnew-release">// release ' + release + '</div>' +
      '<div class="gn-whatsnew-body">' + categories(entry) + '</div></article>';
  }

  function show(options) {
    const opts = options || {};
    if (!opts.force && acknowledged() === VERSION.release) { document.dispatchEvent(new CustomEvent('gn:whatsnew-resolved', { detail: { shown: false } })); return false; }
    if (!hasCurrentNotes()) { document.dispatchEvent(new CustomEvent('gn:whatsnew-resolved', { detail: { shown: false } })); return false; }
    if (!opts.force && document.getElementById('gnWhatsNewOverlay')) return false; // already open — no multi-fire
    document.getElementById('gnWhatsNewOverlay')?.remove();
    const historyMode = Boolean(opts.history);
    const releases = historyMode ? Object.keys(NOTES).sort().reverse() : [VERSION.release];
    const overlay = document.createElement('div');
    overlay.id = 'gnWhatsNewOverlay';
    overlay.className = 'gn-whatsnew-overlay active';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gnWhatsNewHeading');
    overlay.innerHTML = '<div class="gn-whatsnew-card">' +
      '<div class="gn-whatsnew-kicker">// ' + tx('whatsnew.systemUpdate', 'SYSTEM UPDATE') + '</div>' +
      '<h2 id="gnWhatsNewHeading">' + (historyMode ? (lang() === 'es' ? 'HISTORIAL DE ACTUALIZACIONES' : 'UPDATE HISTORY') : tx('whatsnew.title', 'WHAT\'S NEW')) + '</h2>' +
      '<div class="gn-wn-history">' + releases.map(release => releasePanel(release, NOTES[release], release === VERSION.release)).join('') + '</div>' +
      '<div class="gn-whatsnew-actions">' + (!historyMode ? '<button type="button" class="gn-whatsnew-history">' + (lang() === 'es' ? 'VER HISTORIAL' : 'VIEW UPDATE HISTORY') + '</button>' : '') +
      '<button type="button" class="gn-whatsnew-close">' + tx('whatsnew.gotIt', 'GOT IT') + '</button></div></div>';
    document.body.appendChild(overlay);
    const close = () => { acknowledge(VERSION.release); overlay.classList.remove('active'); overlay.remove(); document.dispatchEvent(new CustomEvent('gn:whatsnew-dismissed', { detail: { release: VERSION.release } })); };
    overlay.querySelector('.gn-whatsnew-close').addEventListener('click', close);
    overlay.querySelector('.gn-whatsnew-history')?.addEventListener('click', () => show({ force: true, history: true }));
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    overlay.querySelector('.gn-whatsnew-close').focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('gn:whatsnew-shown', { detail: { release: VERSION.release } }));
    return true;
  }

  function boot() {
    const attempt = () => {
      const app = document.getElementById('app');
      if (!app || getComputedStyle(app).display === 'none') { window.setTimeout(attempt, 900); return; }
      show();
    };
    window.setTimeout(attempt, 900);
  }

  window.GN_WHATS_NEW = Object.freeze({
    show, history: () => show({ force: true, history: true }), acknowledged,
    currentRelease: VERSION.release, currentVersion: VERSION.semver,
    releases: Object.freeze(Object.keys(NOTES).sort().reverse()), notes: NOTES,
    shouldAutoShow: () => acknowledged() !== VERSION.release && hasCurrentNotes()
  });
  try { localStorage.setItem('gn_whatsnew_seen', VERSION.semver); } catch (_) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
