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
    '20260906.6': {
      version: '0.15.27', title: 'CORE SCANNER NAVEL LIFT ×2', date: '2026-09-06',
      en: {
        FIXED: ['The CORE navel circle moves up another notch — now between the upper and middle abdomen zones.']
      },
      es: {
        FIXED: ['El círculo del ombligo CORE sube otro nivel — ahora entre las zonas superior y media del abdomen.']
      }
    },
    '20260906.5': {
      version: '0.15.26', title: 'CORE SCANNER NAVEL LIFT', date: '2026-09-06',
      en: {
        FIXED: ['The CORE navel circle moves higher up the abdomen to its natural position, away from the lower zones.']
      },
      es: {
        FIXED: ['El círculo del ombligo CORE sube más arriba del abdomen a su posición natural, lejos de las zonas inferiores.']
      }
    },
    '20260906.4': {
      version: '0.15.25', title: 'CORE SCANNER NAVEL + LOWER ZONES', date: '2026-09-06',
      en: {
        FIXED: [
          'The CORE navel circle now sits at the natural belly-button position instead of below the lower zones.',
          'The two lower CORE abdomen zones are positioned where the lower abdomen actually is, with a clean gap between zones — no overlap with Middle or each other.'
        ]
      },
      es: {
        FIXED: [
          'El círculo del ombligo de CORE ahora se ubica en la posición natural del ombligo en lugar de debajo de las zonas inferiores.',
          'Las dos zonas inferiores del abdomen CORE están posicionadas donde realmente está el abdomen inferior, con un espacio limpio entre zonas, sin superposición con Middle ni entre ellas.'
        ]
      }
    },
    '20260906.3': {
      version: '0.15.24', title: 'LAB RESEARCH SAVE FIX + A11Y FEEDBACK', date: '2026-09-06',
      en: {
        FIXED: ['LAB Research Save/Log now persists the record through the date picker — pick a library entry, set a date, and tap Save to capture the entry.'],
        IMPROVED: ['Research Save now clears when a record is captured, so back-to-back entries work without manual reset.'],
        ACCESSIBILITY: ['Research form errors now flag the failing field, link a description, and announce the outcome through a polite live region in both English and Spanish.']
      },
      es: {
        FIXED: ['Guardar Registro en LAB Research ahora persiste el registro correctamente al usar el selector de fecha — elige una entrada, asigna fecha y pulsa Guardar.'],
        IMPROVED: ['Guardar Registro ahora se limpia después de capturar, permitiendo registrar entradas seguidas sin reinicio manual.'],
        ACCESSIBILITY: ['Los errores del formulario Research ahora marcan el campo problemático, enlazan una descripción y anuncian el resultado en una región en vivo en inglés y español.']
      }
    },
    '20260906.2': {
      version: '0.15.23', title: 'COMPACT SCANNER AUDIO TOGGLE', date: '2026-09-06',
      en: {
        IMPROVED: ['Scanner audio now uses a compact ON/OFF toggle instead of an oversized text button.'],
        MOBILE: ['The scanner title, audio toggle, and badge now stay inside the SHOT LOG panel at phone widths.']
      },
      es: {
        IMPROVED: ['El audio del escáner ahora usa un interruptor compacto de ON/OFF en lugar de un botón de texto demasiado grande.'],
        MOBILE: ['El título del escáner, el interruptor de audio y la insignia ahora permanecen dentro del panel de DOSIS en teléfonos.']
      }
    },
    '20260906.1': {
      version: '0.15.22', title: 'PREMIUM COMMAND SURFACE', date: '2026-09-06',
      en: {
        IMPROVED: [
          'The mobile entry now reveals the live GRID//NODE dashboard inside the first screen, with tighter hierarchy, stronger depth, and clearer action priority.',
          'The command shell, active navigation, page headers, and first-run dashboard now read as one cohesive biotech instrument.'
        ],
        FIXED: [
          'App startup no longer stalls while initializing scanner audio.',
          'Empty-dashboard styling no longer reduces text size across the entire interface.'
        ],
        ACCESSIBILITY: [
          'Functional links, filters, result actions, profile controls, and navigation now keep reliable touch targets and visible focus.',
          'Keyboard navigation now keeps its semantic current-page state synchronized with the visible tab.'
        ],
        MOBILE: ['The first viewport now fits both entry actions and the complete live product preview without horizontal overflow.']
      },
      es: {
        IMPROVED: [
          'La entrada móvil ahora muestra el panel activo de GRID//NODE dentro de la primera pantalla, con jerarquía más clara, mayor profundidad y mejor prioridad de acciones.',
          'La interfaz de mando, la navegación activa, los encabezados y el panel inicial ahora se perciben como un solo instrumento biotecnológico.'
        ],
        FIXED: [
          'El inicio de la app ya no se detiene al inicializar el audio del escáner.',
          'El estilo del panel vacío ya no reduce el tamaño del texto en toda la interfaz.'
        ],
        ACCESSIBILITY: [
          'Enlaces, filtros, acciones de resultados, controles de perfil y navegación ahora conservan áreas táctiles fiables y enfoque visible.',
          'La navegación con teclado ahora mantiene el estado semántico de página actual sincronizado con la pestaña visible.'
        ],
        MOBILE: ['La primera pantalla ahora incluye ambas acciones de entrada y la vista previa completa del producto sin desbordamiento horizontal.']
      }
    },
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
    '20260812.1': {
      version: '0.15.11', title: 'SCANNER ASSET WIRE-UP', date: '2026-08-12',
      en: {
        IMPROVED: [
          'SHOTS scanner now renders the new 9-state synthetic mannequin assets: CORE abdomen, LOWER front thighs, UPPER rear upper arms, each with ready / selected / last intensities.',
          'The body-part image tracks the live scanner state — selecting a zone lifts its body part to medium, the last logged zone lifts to deep, and an empty body part stays at light.'
        ]
      },
      es: {
        IMPROVED: [
          'El escáner de DOSIS ahora usa los nuevos 9 estados del maniquí sintético: CORE abdomen, LOWER muslos frontales, UPPER brazos posteriores, cada uno con intensidades listo / seleccionado / último.',
          'La imagen de la parte del cuerpo sigue el estado en vivo: al seleccionar una zona, su parte pasa a intensidad media; la última zona registrada, a intensidad profunda; y una parte vacía se queda en intensidad baja.'
        ]
      }
    },
    '20260812.5': {
      version: '0.15.15', title: 'SCANNER UX POLISH', date: '2026-08-12',
      en: {
        IMPROVED: [
          'SHOTS scanner now feels like a native premium bio-tech app: SKIN TONE picker sits above CORE / LOWER / UPPER tabs, the [SKIN TONE] label uses Cyberpunk 2077 yellow (#FCEE0A), and the active mode tab glows in subtle Mars Red.',
          'Injection zone taps now feel premium with a 15ms vibration pulse + a subtle Web Audio click — and the active zone gets a soft Mars Red glow flow.',
          'Toggle and switch taps in the SHOTS page now play a subtle tick via Web Audio API (no asset downloads, all synthesized).',
          '"AWAITING FIRST SHOT" / "ESPERANDO LA PRIMERA DOSIS" now blink like a terminal trying to get your attention (1.6s loop, respects prefers-reduced-motion).',
          'Bottom nav vibration toned down to a very subtle 4-10-4 pattern — still tactile, no longer buzz-y.'
        ]
      },
      es: {
        IMPROVED: [
          'El escáner de DOSIS ahora se siente como una aplicación nativa premium de bio-tech: el selector de TONO DE PIEL se ubica arriba de las pestañas CORE / LOWER / UPPER, la etiqueta [TONO DE PIEL] usa el amarillo Cyberpunk 2077 (#FCEE0A) y la pestaña de modo activa brilla con un rojo Marte sutil.',
          'Los toques a zonas de inyección ahora se sienten premium con un pulso de vibración de 15 ms + un clic sutil de Web Audio — y la zona activa recibe un flujo de brillo rojo Marte suave.',
          'Los toques a interruptores en la página de DOSIS ahora reproducen un tic sutil vía Web Audio API (sin descargas de recursos, todo sintetizado).',
          '"AWAITING FIRST SHOT" / "ESPERANDO LA PRIMERA DOSIS" ahora parpadean como una terminal tratando de captar tu atención (bucle de 1.6 s, respeta prefers-reduced-motion).',
          'Vibración de la navegación inferior atenuada a un patrón muy sutil 4-10-4 — sigue siendo táctil, ya no zumba.'
        ]
      }
    },
    '20260812.4': {
      version: '0.15.14', title: 'SCANNER HD WEBP ASSETS', date: '2026-08-12',
      en: {
        IMPROVED: [
          'SCANNER body images upgraded to HD (1024×1365) and shipped as WebP q=95 — ~200 KB per image instead of ~1.6 MB, no visible definition loss, faster on cellular.',
          'All 9 scanner images (CORE / LOWER / UPPER × LIGHT / MEDIUM / DEEP) are now consistent real-human photos with matching skin tones, organic gradient red zones baked in, and bodies that fill the entire scanner stage.',
          'iOS 14+ and Android 5+ render WebP natively, so no fallback is needed.'
        ]
      },
      es: {
        IMPROVED: [
          'Las imágenes del cuerpo del ESCÁNER se actualizaron a HD (1024×1365) y se envían como WebP q=95 — ~200 KB por imagen en lugar de ~1.6 MB, sin pérdida visible de definición, más rápido en redes celulares.',
          'Las 9 imágenes del escáner (CORE / LOWER / UPPER × CLARA / MEDIA / OSCURA) ahora son fotos reales consistentes con tonos de piel coincidentes, zonas rojas orgánicas con degradado integradas y cuerpos que llenan todo el escenario del escáner.',
          'iOS 14+ y Android 5+ renderizan WebP de forma nativa, por lo que no se necesita un respaldo.'
        ]
      }
    },
    '20260812.3': {
      version: '0.15.13', title: 'SCANNER SKIN TONE PICKER', date: '2026-08-12',
      en: {
        NEW: [
          'SCANNER body now uses a 3-option skin tone picker (LIGHT / MEDIUM / DEEP) so the rendered body matches the user. Choice persists locally.'
        ],
        FIXED: [
          'Removed the cyan SVG zone circles from the scanner stage. The red zones baked into the body image are the sole visual indicator; tap targets are the invisible .zone-overlay buttons over each red zone.',
          'Scanner stage aspect ratio changed to 16:9 so the 16:9 body assets fit without heavy cropping or zoom distortion.'
        ]
      },
      es: {
        NEW: [
          'El cuerpo del ESCÁNER ahora usa un selector de tono de piel de 3 opciones (CLARA / MEDIA / OSCURA) para que el cuerpo renderizado coincida con el usuario. La elección persiste localmente.'
        ],
        FIXED: [
          'Se eliminaron los círculos cian SVG del escenario del escáner. Las zonas rojas integradas en la imagen del cuerpo son el único indicador visual; los objetivos de toque son los botones invisibles .zone-overlay sobre cada zona roja.',
          'La relación de aspecto del escenario del escáner cambió a 16:9 para que los activos del cuerpo 16:9 quepan sin recortes pesados ni distorsión de zoom.'
        ]
      }
    },
    '20260812.2': {
      version: '0.15.12', title: 'SCANNER ASSET REPLACEMENT', date: '2026-08-12',
      en: {
        IMPROVED: [
          'LOWER scanner now shows a proper premium matte mannequin front-thighs view with quadriceps and knee detail, replacing the placeholder 3D render.',
          'UPPER scanner now shows a proper premium matte mannequin rear upper-back / triceps view, replacing the missing body asset.'
        ]
      },
      es: {
        IMPROVED: [
          'El escáner LOWER ahora muestra una vista frontal de muslos con maniquí mate premium y detalle de cuádriceps y rodillas, reemplazando el render 3D de marcador.',
          'El escáner UPPER ahora muestra una vista posterior de espalda alta y tríceps con maniquí mate premium, reemplazando el activo faltante.'
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

    '20260812.6': {
      version: '0.15.16', title: 'SCANNER HUD CHROME', date: '2026-08-12',
      en: {
        NEW: [
          'Premium bio-tech scanner HUD chrome now overlays every body scan: red title, approved-area bullets, AVOID list, scan-status indicators, and the GRID//NODE footer with the alcohol/needle/dry injection note.',
          'Mars Red C-brackets and dot-grid background give the SCANNER stage a high-end Cyberpunk 2077 x Blade Runner 2049 feel.'
        ],
        IMPROVED: [
          'Web Audio API click and chirp sounds removed from zone taps, mode switches, and skin-tone selection. The premium feedback is now pure haptic vibration plus a Mars Red glow flow.',
          'Scanner body assets are HD bodybuilder photography with both extremities always visible (back-of-upper-arm tricep zones, front/outer thigh zones, and the FDA-approved abdomen 4-quadrant layout with the 5cm navel keep-out dot).'
        ],
        FIXED: [
          'Cartoonish synthesized audio cues are gone. Vibration and the new red glow are the only feedback for zone taps, mode switches, and skin-tone selection.'
        ]
      },
      es: {
        NEW: [
          'Cromo HUD bio-tech premium del escaner ahora cubre cada escaneo: titulo rojo, areas aprobadas, lista EVITAR, indicadores de estado y pie GRID//NODE con la nota de alcohol/aguja/secado.',
          'Los corchetes Mars Red y el fondo de puntos rojos dan al escaner un acabado Cyberpunk 2077 x Blade Runner 2049.'
        ],
        IMPROVED: [
          'Se eliminaron los sonidos sintetizados del Web Audio API en toques de zona, cambio de modo y tono de piel. La retroalimentacion premium ahora es vibracion pura mas un flujo de brillo Mars Red.',
          'Los activos del cuerpo del escaner son fotografia HD de culturista con ambas extremidades siempre visibles (triceps posteriores del brazo, zonas frontales/externas del muslo y el diseño de 4 cuadrantes abdominales aprobados por la FDA con el punto de 5cm del ombligo).'
        ],
        FIXED: [
          'Se eliminaron las pistas de audio sintetizadas cartoonish. La vibracion y el nuevo brillo rojo son la unica retroalimentacion para toques de zona, cambio de modo y tono de piel.'
        ]
      }
    },


    '20260814.1': {
      version: '0.15.21', title: 'GRID//NODE PRECISION SCANNER EXPANSION', date: '2026-08-14',
      en: {
        NEW: [
          'The body scanner gains two new CORE zones: Middle Left and Middle Right. CORE is now a 3x2 grid of anatomically separated sectors, with a smooth body-shaped curve for every visible contour and a larger invisible hit region around each one.',
          'LEGS gains two new sectors: Left Thigh Outer and Right Thigh Outer, bringing the thigh map to six zones — upper, lower, and outer per thigh. The outer sectors follow the curved side taper of each thigh, not a straight rectangle.',
          'ARMS keeps four zones, but every visible contour and invisible hit region now follows a body-shaped curve instead of a rectangle. The triceps and shoulder tap targets land where the thumb actually lands.',
          'The three cinematic body substrates are regenerated in the same surgical v3 style as the original CORE rework: the engraved rectangular hot-spots are removed from the LEGS and ARMS images, the long horizontal and vertical crosshair is removed from the CORE image, and the central navel reads as a single recessed contour integrated into the shell.',
          'Zone identifiers move to a stable three-row naming model: core-upper-left through core-lower-right, leg-upper-left through leg-outer-right, arm-upper-left through arm-lower-right. Each zone has a code (CORE-01, LEG-05, ARM-02, etc.) and a display label, both shown in the live read-out.'
        ],
        IMPROVED: [
          'Visible contours and hit regions now follow organic, body-shaped curves (Bezier paths traced from the approved surgical v3 markup), not rectangular boxes. The 44-48 pixel effective touch target per zone is preserved by the larger invisible hit area, but the visible outline is anatomically clean.',
          'The CORE image is replaced with the surgical v3 substrate: no central crosshair, no abdominal seam lines, only the recessed navel contour and continuous dark shell. LEGS and ARMS substrates are rebuilt in the same surgical style with no rectangular zone engravings.',
          'selectScannerLocation still resolves the same data model, but the zone identifiers stored in SHOTS records use the new stable codes (CORE-01 .. CORE-06, LEG-01 .. LEG-06, ARM-01 .. ARM-04) for forward compatibility.',
          'Scanner audio is now part of the locked experience. A SCANNER AUDIO // OFF|ON switch sits in the scanner header (44px minimum height, role=switch, Cyber Cyan border, Signal Yellow focus ring, Mars Red ON glow). Off by default, opt-in via direct user gesture, remembered locally under gn_scanner_audio_v1. When enabled, a 24ms 920Hz contact cue and a 110ms 320->96Hz two-stage lock cue are generated procedurally by the Web Audio API (no downloads, no base64, no autoplay) and a 4-12-6 ms haptic fires once per lock. The switch label and state are now i18n-driven via shots.scannerAudio / shots.soundOn / shots.soundOff in both English and Spanish.'
        ],
        FIXED: [
          'The rectangular zone engravings baked into the original cinematic body images no longer leak through the SVG overlays — the LEGS substrate no longer shows the four old rectangle marks, and the CORE substrate no longer shows the central crosshair.'
        ]
      },
      es: {
        NEW: [
          'El escaner corporal gana dos zonas CORE nuevas: Medio izquierdo y Medio derecho. CORE ahora es una cuadricula 3x2 de sectores separados anatomicamente, con una curva suave con forma de cuerpo para cada contorno visible y una region de hit invisible mas grande alrededor de cada uno.',
          'PIERNAS gana dos sectores nuevos: Muslo izquierdo exterior y Muslo derecho exterior, llevando el mapa del muslo a seis zonas — superior, inferior y exterior por muslo. Los sectores exteriores siguen la curva lateral de cada muslo, no un rectangulo recto.',
          'BRAZOS mantiene cuatro zonas, pero cada contorno visible y region de hit invisible ahora sigue una curva con forma de cuerpo en lugar de un rectangulo. Los objetivos de toque del triceps y el hombro aterrizan donde realmente aterriza el pulgar.',
          'Los tres sustratos corporales cinematicos se regeneran en el mismo estilo v3 quirurgico que el retrabajo original de CORE: los puntos calientes rectangulares grabados se eliminan de las imagenes de PIERNAS y BRAZOS, la cruz horizontal y vertical larga se elimina de la imagen de CORE, y el ombligo central se lee como un unico contorno rebajado integrado en el casco.',
          'Los identificadores de zona pasan a un modelo de nombres estable de tres filas: core-upper-left a core-lower-right, leg-upper-left a leg-outer-right, arm-upper-left a arm-lower-right. Cada zona tiene un codigo (CORE-01, LEG-05, ARM-02, etc.) y una etiqueta visible, ambos en la lectura en vivo.'
        ],
        IMPROVED: [
          'Los contornos visibles y las regiones de hit ahora siguen curvas organicas con forma de cuerpo (caminos Bezier trazados desde el marcado v3 quirurgico aprobado), no cajas rectangulares. El objetivo tactil efectivo de 44-48 pixeles por zona se preserva mediante el area de hit invisible mas grande, pero el contorno visible es anatomicamente limpio.',
          'La imagen de CORE se reemplaza con el sustrato v3 quirurgico: sin cruz central, sin lineas de costura abdominal, solo el contorno del ombligo rebajado y el casco oscuro continuo. Los sustratos de PIERNAS y BRAZOS se reconstruyen en el mismo estilo quirurgico sin grabados rectangulares de zona.',
          'selectScannerLocation sigue resolviendo el mismo modelo de datos, pero los identificadores de zona almacenados en los registros SHOTS usan los nuevos codigos estables (CORE-01 .. CORE-06, LEG-01 .. LEG-06, ARM-01 .. ARM-04) para compatibilidad futura.',
          'El audio del escaner ahora es parte de la experiencia bloqueada. Un interruptor SCANNER AUDIO // OFF|ON se asienta en el encabezado del escaner (44px de altura minima, role=switch, borde Cyber Cyan, anillo de foco Signal Yellow, brillo ON Mars Red). Apagado por defecto, opcional mediante gesto directo del usuario, recordado localmente bajo gn_scanner_audio_v1. Cuando esta activo, una pista de contacto de 24ms a 920Hz y una pista de bloqueo de 110ms de 320->96Hz en dos etapas se generan proceduralmente por la Web Audio API (sin descargas, sin base64, sin autoplay) y un haptic 4-12-6 ms se dispara una vez por bloqueo. La etiqueta y el estado del interruptor ahora estan dirigidos por i18n mediante shots.scannerAudio / shots.soundOn / shots.soundOff tanto en ingles como en espanol.'
        ],
        FIXED: [
          'Las grabaciones de zona rectangulares integradas en las imagenes corporales cinematicas originales ya no se filtran a traves de las superposiciones SVG — el sustrato de PIERNAS ya no muestra las cuatro marcas rectangulares antiguas, y el sustrato de CORE ya no muestra la cruz central.'
        ]
      }
    },

    '20260813.2': {
      version: '0.15.20.1', title: 'GRID//NODE V2.0 LOCKED EXPANDED SOURCE TRUTH', date: '2026-08-13',
      en: {
        NEW: [
          'The source-of-truth lock now covers the full v0.15.20.1 verification surface: 121 files / 4.48 MB pinned under 01_SOURCE_TRUTH_LOCKED/rc-20260813.2 with exact bytes and SHA-256 for every locked file.',
          'The three cinematic scanner assets (core-cinematic.webp, legs-cinematic.webp, arms-cinematic.webp) and the production runtime file js/gridnode-core.js are now part of the locked truth, not just the on-disk tree.',
          'All eight test scripts, five run scripts, and the build/stage/deploy/verify pipeline scripts are locked, so the lock now proves the runtime can be rebuilt, retested, and redeployed from a clean checkout.',
          'The brand reference contract (scripts/brand-reference-contract.json), the complete set of 17 brand proof files, and the GRIDNODE-BRAND-SYSTEM-v2-APPROVED source board are locked as the brand source of truth.',
          'The MAX_PRECISION_BODY_SCANNER_DESIGN specification, the BODY_SCANNER_IMPLEMENTATION_PLAN, the GRIDNODE BRAND ROLLOUT plan, and the rest of docs/ are locked alongside the code that implements them.'
        ],
        IMPROVED: [
          'verify.sh now resolves to rc-20260813.2 and runs node --check on gridnode-core.js so a clean checkout can prove the runtime modules parse and the locked bundle matches.',
          'All 16 in-HTML script cache-bust strings are refreshed from 20260812.9 to 20260813.2, so first-visit and post-SW clients see the same version identifier.',
          'The service worker CACHE_NAME is bumped to gridnode-shell-20260813.2 so a fresh visit installs the new shell and the previous shell is evicted on activation.'
        ],
        FIXED: [
          'The 9 obsolete multi-skin-tone scanner webp files (light / medium / deep per mode) and the 8 obsolete v6 brand files (gridnode-favicon-v6, gridnode-icon-*, gridnode-insignia-v6) are removed from disk; they were unused since the single-body cinematic scanner shipped in v0.15.19 and the v2.0 brand rolled out in v0.15.20.'
        ]
      },
      es: {
        NEW: [
          'El lock de fuente de verdad ahora cubre la superficie completa de verificacion de v0.15.20.1: 121 archivos / 4.48 MB anclados bajo 01_SOURCE_TRUTH_LOCKED/rc-20260813.2 con bytes exactos y SHA-256 por cada archivo bloqueado.',
          'Los tres activos cinematicos del escaner (core-cinematic.webp, legs-cinematic.webp, arms-cinematic.webp) y el archivo de runtime de produccion js/gridnode-core.js ahora son parte de la verdad bloqueada, no solo del arbol en disco.',
          'Los ocho scripts de prueba, los cinco scripts de corrida y el pipeline de build/stage/deploy/verify estan bloqueados, para que el lock pruebe que el runtime puede reconstruirse, retestarse y re-desplegarse desde un checkout limpio.',
          'El contrato de referencia de marca (scripts/brand-reference-contract.json), el set completo de 17 archivos de prueba de marca y el tablero fuente GRIDNODE-BRAND-SYSTEM-v2-APPROVED estan bloqueados como la fuente de verdad de la marca.',
          'La especificacion MAX_PRECISION_BODY_SCANNER_DESIGN, el BODY_SCANNER_IMPLEMENTATION_PLAN, el plan GRIDNODE BRAND ROLLOUT y el resto de docs/ estan bloqueados junto al codigo que los implementa.'
        ],
        IMPROVED: [
          'verify.sh ahora resuelve a rc-20260813.2 y corre node --check sobre gridnode-core.js para que un checkout limpio pueda probar que los modulos del runtime parsean y el bundle bloqueado coincide.',
          'Los 16 strings de cache-bust de scripts en HTML se actualizan de 20260812.9 a 20260813.2, para que clientes de primera visita y post-SW vean el mismo identificador de version.',
          'El CACHE_NAME del service worker sube a gridnode-shell-20260813.2 para que una visita nueva instale el nuevo shell y el shell anterior se desinstale en activacion.'
        ],
        FIXED: [
          'Los 9 archivos webp multi-tono de piel obsoletos del escaner (light / medium / deep por modo) y los 8 archivos v6 de marca obsoletos (gridnode-favicon-v6, gridnode-icon-*, gridnode-insignia-v6) se eliminan del disco; quedaron sin uso desde que el escaner cinematico de cuerpo unico se envio en v0.15.19 y la marca v2.0 se implemento en v0.15.20.'
        ]
      }
    },

    '20260813.1': {
      version: '0.15.20', title: 'GRID//NODE V2.0 LOCKED BRAND ROLLOUT', date: '2026-08-13',
      en: {
        NEW: [
          'GRID//NODE v2.0 brand system is live. The angular GN mark is the only mark in the product: Cyber Cyan N sliding through a Mars Red G, anchored on a Signal Yellow accent that reads as a single locked identity rather than a stack of parts.',
          'A brand token system binds the surface to the mark. --gn-brand-mars-red, --gn-brand-cyber-cyan, --gn-brand-signal-yellow, --gn-brand-black-mars, --gn-brand-deep-navy, and --gn-brand-steel-gray are the only paints the runtime may use, and every surface reads back to one of them.',
          'The locked identity ships in five master SVGs (core mark, wordmark, horizontal lockup, stacked lockup, mono black, mono white) and the full PWA / favicon / apple-touch icon set, all generated from the same v2.0 geometry so every surface carries the same mark.',
          'A booted brand manifest and proof pipeline (assets/brand/brand-manifest.json, scripts/build-brand-assets.py, scripts/render-brand-proofs.cjs) pin the geometry hashes, so the brand cannot drift between releases without the test suite failing.'
        ],
        IMPROVED: [
          'The body scanner now sits inside the v2.0 brand system: the Mars Red C-bracket frame, the Cyber Cyan dot grid, the Signal Yellow acquisition flash, and the locked-region pulse all draw from the same brand tokens instead of ad-hoc colors.',
          'Header, boot mark, scanner badge, update badge, and watermark are the only place the lockup appears in product, so the GN mark lands once and reads loud.'
        ],
        FIXED: [
          'Legacy v6 identity assets (gridnode-icon, gridnode-favicon-v6, gridnode-insignia-v6, the unbranded apple-touch-icon, and the splash image) are removed from runtime, manifest, service worker, and the WHAT IS NEW preview; the v2.0 set is the only thing the app loads.'
        ]
      },
      es: {
        NEW: [
          'El sistema de marca GRID//NODE v2.0 esta activo. La marca angular GN es la unica marca del producto: la N en Cyber Cyan atraviesa una G en Mars Red, anclada en un acento Signal Yellow que se lee como una identidad unica bloqueada, no como un apilado de piezas.',
          'Un sistema de tokens de marca ata la superficie a la marca. --gn-brand-mars-red, --gn-brand-cyber-cyan, --gn-brand-signal-yellow, --gn-brand-black-mars, --gn-brand-deep-navy y --gn-brand-steel-gray son las unicas pinturas que el runtime puede usar, y cada superficie se lee desde una de ellas.',
          'La identidad bloqueada se entrega en cinco SVG maestros (core mark, wordmark, lockup horizontal, lockup apilado, mono negro, mono blanco) y el set completo PWA / favicon / apple-touch icon, todos generados desde la misma geometria v2.0 para que cada superficie lleve la misma marca.',
          'Un manifiesto de marca y un pipeline de pruebas (assets/brand/brand-manifest.json, scripts/build-brand-assets.py, scripts/render-brand-proofs.cjs) anclan los hashes de geometria, para que la marca no pueda derivar entre releases sin que la suite de pruebas falle.'
        ],
        IMPROVED: [
          'El escaner corporal ahora se asienta dentro del sistema de marca v2.0: el marco Mars Red, la cuadricula Cyber Cyan, el flash de adquisicion Signal Yellow y el pulso de la region bloqueada se dibujan desde los mismos tokens de marca en lugar de colores ad-hoc.',
          'Header, boot mark, scanner badge, update badge y watermark son los unicos lugares donde el lockup aparece en producto, para que la marca GN aterrice una vez y se lea fuerte.'
        ],
        FIXED: [
          'Los activos de identidad v6 heredados (gridnode-icon, gridnode-favicon-v6, gridnode-insignia-v6, el apple-touch-icon sin marca y la imagen splash) se eliminan del runtime, manifest, service worker y del preview de NOVEDADES; el set v2.0 es lo unico que carga la app.'
        ]
      }
    },

    '20260812.9': {
      version: '0.15.19', title: 'GRID//NODE BIOTECH SCANNER (CORE/LEGS/ARMS)', date: '2026-08-13',
      en: {
        NEW: [
          'GRID//NODE Body Scanner is rebuilt as a synthetic biotech diagnostic mannequin. The scanner now uses a single body per mode (CORE, LEGS, ARMS) rendered in matte graphite polymer with subtle cyan and dark amber internal illumination and mechanical seam details at the joints.',
          'CORE shows the abdomen with a 2x2 quadrant of trackable zones around the navel; the navel itself is excluded from selection.',
          'LEGS shows the front of the thighs with an upper and lower zone on each thigh. The pelvis is context only; the knees and lower legs are not in the image.',
          'ARMS shows the rear of the upper body with both posterior upper arms visible. Each arm has an upper and lower zone on the triceps; the lower bound stays above the elbow.',
          'Touch interaction now uses pointer events and the actual SVG transformation matrix. Each zone has a visible contour plus a larger invisible hit area. Taps resolve to the correct region on the first try, even when slightly off-center.',
          'A 5-phase interaction flow is now live: IDLE, TOUCH DOWN (<50ms), ACQUIRING (80-180ms), PULSE (180-250ms Mars Red), LOCKED.',
          'Optional subtle haptic feedback fires when a region locks on supporting devices.',
          'A developer debug mode is available at ?scannerDebug=1 showing visible and hit outlines, screen coordinates, SVG coordinates, resolved zone ID, and overlap warnings.'
        ],
        IMPROVED: [
          'Scanner mode labels are now CORE, LEGS, and ARMS. The data model stays stable: stored SHOTS records continue to load and save with their existing region IDs.',
          'Scanner state and feedback use the GRID//NODE identity: Cyber Cyan for the framework, Mars Red for the selected region, Signal Yellow for the acquisition flash and the most recent logged location.',
          'Reduced motion: the scan sweep is hidden under prefers-reduced-motion while the selected-state feedback remains clear and unmistakable.'
        ],
        FIXED: [
          'CORE scanner locations are now selectable from the DOM. The interaction layer was rebuilt on SVG geometry so the quadrant zones are addressable, not hidden behind stale overlay opacity logic.',
          'Skin tone selector is removed from the active scanner. The light/medium/deep controls and the gn_scanner_skin_tone localStorage key are no longer driving the scanner. Old SHOTS data continues to load.',
          'LOWER / UPPER terminology is removed from the visible UI. CORE / LEGS / ARMS is the only mode labelling users see, while internal state stays mapped to the existing stable region keys.'
        ],
        ACCESSIBILITY: [
          'Pointer events are used uniformly for mouse, touch, and pen. The SVG path regions are keyboard-focusable with focus-visible outlines in Signal Yellow.',
          'Screen-reader labels on each region match the visible zone label exactly: Right Abdomen - Upper, Right Thigh - Lower, Right Back Upper Arm - Lower, etc.'
        ],
        MOBILE: [
          'Each zone is sized so the effective touch target is at least 44-48 CSS pixels on common phone widths (320px through 430px).',
          'A tap-vs-scroll guard cancels accidental selection if the pointer moves more than 10 CSS pixels between pointerdown and pointerup. Scrolling stays natural, normal taps still resolve on the first try.'
        ]
      },
      es: {
        NEW: [
          'El escaner corporal GRID//NODE se reconstruye como un maniqui de diagnostico biotecnologico sintetico. Ahora usa un solo cuerpo por modo (CORE, PIERNAS, BRAZOS) en polimero de grafito mate con iluminacion interna sutil en cian y ambar oscuro y detalles de costuras mecanicas en las articulaciones.',
          'CORE muestra el abdomen con 2x2 zonas rastreables alrededor del ombligo; el ombligo en si queda excluido de la seleccion.',
          'PIERNAS muestra el frente de los muslos con una zona superior e inferior en cada muslo. La pelvis es solo contexto; las rodillas y la parte inferior de la pierna no aparecen en la imagen.',
          'BRAZOS muestra la parte trasera del torso superior con ambos brazos posteriores visibles. Cada brazo tiene una zona superior e inferior en el triceps; el limite inferior queda por encima del codo.',
          'La interaccion tactil ahora usa pointer events y la matriz real de transformacion SVG. Cada zona tiene un contorno visible mas un area de hit invisible mas grande. Los toques resuelven a la region correcta en el primer intento, incluso ligeramente descentrados.',
          'Ahora hay un flujo de interaccion de 5 fases: IDLE, TOUCH DOWN (<50ms), ACQUIRING (80-180ms), PULSE (180-250ms Mars Red), LOCKED.',
          'Vibracion sutil opcional cuando una region se bloquea en dispositivos compatibles.',
          'Modo debug de desarrollo en ?scannerDebug=1 mostrando contornos visibles y de hit, coordenadas de pantalla, coordenadas SVG, ID de zona resuelta y advertencias de superposicion.'
        ],
        IMPROVED: [
          'Las etiquetas de modo del escaner ahora son CORE, PIERNAS y BRAZOS. El modelo de datos permanece estable: los registros SHOTS almacenados siguen cargando y guardando con sus IDs de region existentes.',
          'El estado del escaner usa la identidad GRID//NODE: Cyber Cyan para el marco, Mars Red para la region seleccionada, Signal Yellow para el flash de adquisicion y la ubicacion registrada mas reciente.',
          'Movimiento reducido: el barrido se oculta con prefers-reduced-motion mientras la retroalimentacion del estado seleccionado permanece clara e inequivoca.'
        ],
        FIXED: [
          'Las ubicaciones del escaner CORE ahora son seleccionables desde el DOM. La capa de interaccion se reconstruyo sobre geometria SVG para que las zonas en cuadrante sean direccionables, no ocultas por logica opaca de overlay.',
          'El selector de tono de piel se elimino del escaner activo. Los controles claro/medio/oscuro y la clave localStorage gn_scanner_skin_tone ya no controlan el escaner. Los datos SHOTS antiguos siguen cargando.',
          'La terminologia LOWER / UPPER se elimino de la UI visible. CORE / LEGS / ARMS es la unica etiquetade modo que ven los usuarios, mientras el estado interno se mantiene mapeado a las claves de region estables existentes.'
        ],
        ACCESSIBILITY: [
          'Pointer events se usan de forma uniforme para mouse, touch y lapiz. Las regiones de path SVG son enfocables por teclado con contornos focus-visible en Signal Yellow.',
          'Las etiquetas de screen reader de cada region coinciden exactamente con la etiqueta visible: Abdomen Derecho - Superior, Muslo Derecho - Inferior, Brazo Posterior Derecho - Inferior, etc.'
        ],
        MOBILE: [
          'Cada zona esta dimensionada para que el objetivo tactil efectivo sea de al menos 44-48 pixeles CSS en los tamanos de telefono comunes (320px a 430px).',
          'Una proteccion tap-vs-scroll cancela la seleccion accidental si el puntero se mueve mas de 10 pixeles CSS entre pointerdown y pointerup. El desplazamiento sigue siendo natural, los toques normales resuelven al primer intento.'
        ]
      }
    },
    '20260812.8': {
      version: '0.15.18', title: 'SCANNER GROIN-FREE + KNEE-FREE + UNIFORM BODY', date: '2026-08-12',
      en: {
        IMPROVED: [
          'Core (abdomen) images are tightly cropped at the upper pubic line: the groin, genital area, and any underwear are not visible anywhere in the image.',
          'Legs images are tightly cropped at the upper 2/3 of the thighs: the knee area is not visible, so no zone can be mistaken for a knee injection site.',
          'All 9 scanner assets (core/legs/arms × light/medium/deep) now use the same underlying body model. Only the skin tone changes between the three variants.',
          'Zone overlay hitboxes in the scanner now align with the actual red zone positions in the regenerated images, so taps land on the visible injection zone, not on bare skin or the gap between zones.'
        ],
        FIXED: [
          'Removed the small orange dot that was previously rendered at the navel; the 4 quadrant zones are now the only injection site indicators, with the navel clearly visible as unmarked skin between them.',
          'The leg zone CSS no longer places any tappable hitbox near the knee area; the lower 1/3 of each thigh is reserved as a visible safe-distance buffer.'
        ]
      },
      es: {
        IMPROVED: [
          'Las imagenes del nucleo (abdomen) estan recortadas exactamente en la linea pubica superior: la ingle, el area genital y cualquier ropa interior no son visibles en ningun punto de la imagen.',
          'Las imagenes de piernas estan recortadas en los 2/3 superiores de los muslos: el area de la rodilla no es visible, por lo que ninguna zona puede confundirse con un sitio de inyeccion en la rodilla.',
          'Los 9 activos del escaner (core/legs/arms × light/medium/deep) ahora usan el mismo modelo de cuerpo subyacente. Solo el tono de piel cambia entre las tres variantes.',
          'Los hitboxes de las zonas del escaner ahora se alinean con las posiciones reales de las zonas rojas en las imagenes regeneradas, por lo que los toques caen sobre la zona de inyeccion visible, no sobre piel desnuda o el espacio entre zonas.'
        ],
        FIXED: [
          'Se elimino el pequeno punto naranja que antes se renderizaba en el ombligo; las 4 zonas en cuadrante son ahora los unicos indicadores de sitio de inyeccion, con el ombligo claramente visible como piel sin marcar entre ellas.',
          'El CSS de la zona de piernas ya no coloca ningun hitbox tocable cerca del area de la rodilla; el tercio inferior de cada muslo esta reservado como un buffer visible de distancia segura.'
        ]
      }
    },

    '20260812.8': {
      version: '0.15.18', title: 'SCANNER GROIN-FREE + KNEE-FREE + UNIFORM BODY', date: '2026-08-12',
      en: {
        IMPROVED: [
          'Core (abdomen) images are tightly cropped at the upper pubic line: the groin, genital area, and any underwear are not visible anywhere in the image.',
          'Legs images are tightly cropped at the upper 2/3 of the thighs: the knee area is not visible, so no zone can be mistaken for a knee injection site.',
          'All 9 scanner assets (core/legs/arms × light/medium/deep) now use the same underlying body model. Only the skin tone changes between the three variants.',
          'Zone overlay hitboxes in the scanner now align with the actual red zone positions in the regenerated images, so taps land on the visible injection zone, not on bare skin or the gap between zones.'
        ],
        FIXED: [
          'Removed the small orange dot that was previously rendered at the navel; the 4 quadrant zones are now the only injection site indicators, with the navel clearly visible as unmarked skin between them.',
          'The leg zone CSS no longer places any tappable hitbox near the knee area; the lower 1/3 of each thigh is reserved as a visible safe-distance buffer.'
        ]
      },
      es: {
        IMPROVED: [
          'Las imagenes del nucleo (abdomen) estan recortadas exactamente en la linea pubica superior: la ingle, el area genital y cualquier ropa interior no son visibles en ningun punto de la imagen.',
          'Las imagenes de piernas estan recortadas en los 2/3 superiores de los muslos: el area de la rodilla no es visible, por lo que ninguna zona puede confundirse con un sitio de inyeccion en la rodilla.',
          'Los 9 activos del escaner (core/legs/arms × light/medium/deep) ahora usan el mismo modelo de cuerpo subyacente. Solo el tono de piel cambia entre las tres variantes.',
          'Los hitboxes de las zonas del escaner ahora se alinean con las posiciones reales de las zonas rojas en las imagenes regeneradas, por lo que los toques caen sobre la zona de inyeccion visible, no sobre piel desnuda o el espacio entre zonas.'
        ],
        FIXED: [
          'Se elimino el pequeno punto naranja que antes se renderizaba en el ombligo; las 4 zonas en cuadrante son ahora los unicos indicadores de sitio de inyeccion, con el ombligo claramente visible como piel sin marcar entre ellas.',
          'El CSS de la zona de piernas ya no coloca ningun hitbox tocable cerca del area de la rodilla; el tercio inferior de cada muslo esta reservado como un buffer visible de distancia segura.'
        ]
      }
    },
    '20260812.7': {
      version: '0.15.17', title: 'SCANNER UNIFORM BODY + ABDOMEN SAFETY', date: '2026-08-12',
      en: {
        IMPROVED: [
          'Scanner body assets are now uniform: the medium skin tone is the template, and the light and deep variants use the same body model with only the skin tone changed.',
          'Legs images now show injection zones ONLY on the upper 2/3 of the thighs; the knees are visible anatomy with no injection zone over them.'
        ],
        FIXED: [
          'Removed the heavy HUD text overlay that was overlapping the body image; the body is now the clear focus, with the Mars Red frame, C-brackets, dot grid, and scan lines still providing the bio-tech scanner identity.',
          'Core images now show the 4 quadrant zones in a flower pattern around the navel with a clear gap, and a small orange dot at the navel that reads as a "keep 5cm away" indicator rather than a tappable injection zone.'
        ]
      },
      es: {
        IMPROVED: [
          'Los activos del cuerpo del escaner ahora son uniformes: el tono de piel medio es la plantilla, y las variantes clara y oscura usan el mismo modelo de cuerpo con solo el tono de piel cambiado.',
          'Las imagenes de piernas ahora muestran zonas de inyeccion SOLO en los 2/3 superiores de los muslos; las rodillas son anatomia visible sin zona de inyeccion sobre ellas.'
        ],
        FIXED: [
          'Se elimino el texto pesado del HUD que se superponia a la imagen del cuerpo; el cuerpo ahora es el enfoque claro, con el marco Mars Red, los corchetes C, la cuadrilla de puntos y las lineas de escaneo manteniendo la identidad bio-tec del escaner.',
          'Las imagenes del nucleo ahora muestran las 4 zonas en cuadrante en un patron de flor alrededor del ombligo con un espacio claro, y un pequeno punto naranja en el ombligo que se lee como un indicador de "mantener 5cm de distancia" en lugar de una zona de inyeccion tocable.'
        ]
      }
    },

    '20260812.7': {
      version: '0.15.17', title: 'SCANNER UNIFORM BODY + ABDOMEN SAFETY', date: '2026-08-12',
      en: {
        IMPROVED: [
          'Scanner body assets are now uniform: the medium skin tone is the template, and the light and deep variants use the same body model with only the skin tone changed.',
          'Legs images now show injection zones ONLY on the upper 2/3 of the thighs; the knees are visible anatomy with no injection zone over them.'
        ],
        FIXED: [
          'Removed the heavy HUD text overlay that was overlapping the body image; the body is now the clear focus, with the Mars Red frame, C-brackets, dot grid, and scan lines still providing the bio-tech scanner identity.',
          'Core images now show the 4 quadrant zones in a flower pattern around the navel with a clear gap, and a small orange dot at the navel that reads as a "keep 5cm away" indicator rather than a tappable injection zone.'
        ]
      },
      es: {
        IMPROVED: [
          'Los activos del cuerpo del escaner ahora son uniformes: el tono de piel medio es la plantilla, y las variantes clara y oscura usan el mismo modelo de cuerpo con solo el tono de piel cambiado.',
          'Las imagenes de piernas ahora muestran zonas de inyeccion SOLO en los 2/3 superiores de los muslos; las rodillas son anatomia visible sin zona de inyeccion sobre ellas.'
        ],
        FIXED: [
          'Se elimino el texto pesado del HUD que se superponia a la imagen del cuerpo; el cuerpo ahora es el enfoque claro, con el marco Mars Red, los corchetes C, la cuadrilla de puntos y las lineas de escaneo manteniendo la identidad bio-tec del escaner.',
          'Las imagenes del nucleo ahora muestran las 4 zonas en cuadrante en un patron de flor alrededor del ombligo con un espacio claro, y un pequeno punto naranja en el ombligo que se lee como un indicador de "mantener 5cm de distancia" en lugar de una zona de inyeccion tocable.'
        ]
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
