# Arquitectura

## Contextos

```text
Página del Aula Digital                 Extensión
┌────────────────────────┐   mensajes   ┌───────────────────────────┐
│ content script         │ ───────────▶ │ service worker (efímero)  │
│  · UI en Shadow DOM    │ ◀─────────── │  · router validado        │
│  · escaneo interactivo │              │  · cola, descargas (M3)   │
└────────────────────────┘              │  · alarms, novedades (M5) │
                                        └────────────┬──────────────┘
Popup / Opciones (Preact) ── mensajes ──▶            │ mensajes
                                        ┌────────────▼──────────────┐
                                        │ documento offscreen       │
                                        │  · DOMParser para HTML    │
                                        │    obtenido en 2.º plano  │
                                        └───────────────────────────┘
```

- **Service worker.** Sin estado en memoria que deba sobrevivir. Cola y progreso irán a IndexedDB o
  `chrome.storage.session` (M3).
- **Offscreen.** Uno por extensión, creado con candado (`offscreen-client.ts`, `getContexts` + promesa).
- **Content script.** Mismo origen que Moodle; parsea la página visible. Comparte `moodle/` con el offscreen
  mediante un puerto `HtmlParser` (M1).

## Capas de código

| Carpeta       | Regla                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| `core/`       | Funciones puras. Prohibido `chrome.*` (regla ESLint). Cobertura ≥ 90 %  |
| `moodle/`     | Conocimiento de Moodle. Selectores solo en `selectors.ts`               |
| `shared/`     | Tipos, mensajes (valibot), errores, `Result`, logger, i18n, browser-api |
| `background/` | Orquestación en el worker                                               |
| `content/`    | Integración con la página y UI inyectada                                |
| `storage/`    | IndexedDB versionada con migraciones                                    |
| `fs-access/`  | Verificador de carpeta opcional (M6), solo lectura                      |

## Mensajes

Todo mensaje tiene `target` (`background` | `offscreen` | `content`) y `type`. El receptor valida con
`parseMessage()` y el router comprueba el remitente:

- `extension-page`: páginas de la propia extensión (popup, opciones).
- `udb-content`: content script en una pestaña bajo `https://www.udbvirtual.edu.sv/auladigital/`.
- Cualquier otro remitente se rechaza.

Cada tipo declara qué remitentes admite (`ALLOWED` en `router.ts`). Las respuestas son `Result`.
Los mensajes `content/*` van del popup al content script con `chrome.tabs.sendMessage`. El content script
solo acepta los que envía una página de la extensión.

## Resolución y rutas (M2)

```text
Activity (resource) ─▶ resolveResource ─▶ GET view.php?id=&redirect=1
                         ├─ termina en pluginfile ─▶ cabeceras = sonda (cuerpo cancelado)
                         ├─ HTML ─▶ findResourceFileUrl ─▶ probeHeaders (HEAD | GET cortado)
                         └─ nada ─▶ readonly (solo_lectura)
ResolvedFile + curso/sección/actividad ─▶ buildPath (plantilla + saneado + límites) ─▶ ruta relativa
```

- `src/core/` (puro): `text/` (saneado, Unicode, reservados, orden natural, relleno), `paths/` (plantilla,
  código de curso, límites, `buildPath`), `http/` (Content-Disposition, Content-Type, URL `pluginfile`).
- `src/moodle/resolver/`: todo `fetch` llega inyectado (`FetchLike`); el content script pasa el suyo
  (mismo origen, con cookies) y las pruebas, el del servidor simulado.

## Lectura del curso (M1)

```text
Document ──▶ detectLayout ──▶ adaptador (onetopic | topics | weeks | generic)
                                 ├─ listSections  → SectionRef[] (número, nombre, padre, URL, disponible, destacada, renderizada)
                                 └─ sectionActivities → Activity[] (cmid, tipo, nombre, URL, disponible, restringida)
```

- `parseCourse` / `parseSection` / `parseCoursePage` (`src/moodle/course.ts`) devuelven `Result`.
  La página de login da `session_expired`; una página sin curso da `not_course_page`.
- El módulo solo usa APIs de DOM estándar: funciona igual con el `document` vivo, con `DOMParser` en el
  offscreen (puerto `HtmlParser`) y con jsdom en las pruebas.
