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

- **Service worker.** Sin estado en memoria que deba sobrevivir. Cola, índice y pausa viven en IndexedDB.
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

## Descarga masiva y UI de la página (M4)

```text
content script                                         service worker
 panel ─▶ scanCourse (pestañas disponibles, 1 vez c/u)
       ─▶ resolveItems (recursos + carpetas; sesión caída = alto)
       ─▶ download/preview por archivo ──────────────▶ reconcile + filtros del curso (sin descargar)
       ─▶ buildPlan ─▶ plan (confirmar si > 100 archivos o 200 MB)
       ─▶ download/request por archivo elegido ──────▶ DownloadQueue
 progreso ◀── content/download-update ◀──────────── (el panel resume; sin avisos por archivo)
 etiquetas ◀── files/status al cargar + previews + descargas
```

- Dos hosts Shadow DOM: `#udbsync-root` (fijo: avisos, panel) y `#udbsync-overlay` (absoluto, coordenadas del
  documento: etiquetas de estado, tarjeta). Ninguno desplaza el contenido de Moodle.
- Un solo limitador para todo `fetch` del content script (ADR-021).
- Ajustes v2 y ajustes por curso: `courseSettings()` (ADR-017). Nombres de curso en `meta` para el popup.
- Popup: `queue/list` cada 1,5 s; pausar/reanudar/cancelar con `queue/control`. "Abrir" llama a
  `chrome.downloads` dentro del clic (ADR-016).

## Descargas (M3)

```text
content script                                   service worker
 hover/foco 400 ms ─▶ ResolveCache (12 h, limitador)
 clic ─▶ preventDefault (solo si ya está resuelto)
      ─▶ download/request ───────────────────────▶ reconcile(índice, huella, archivo local, política)
                                                    ├─ al día ─▶ abrir ya (gesto del clic)
                                                    └─ descargar ─▶ buildPath ─▶ DownloadQueue (IndexedDB)
 toasts ◀── content/download-update ◀──────────── chrome.downloads.onChanged ─▶ verificar ─▶ índice ─▶ abrir
```

- Índice `files` (IndexedDB): clave `curso:cmid:fileKey`, huella, ruta relativa, ruta local, `downloadId`,
  versiones. Tareas en `tasks`. Esquema versionado (`storage/migrations.ts`).
- Ajustes en `chrome.storage.local`, validados con valibot campo por campo (`storage/settings-schema.ts`).
- `DownloadBackend` (`background/download-manager.ts`) envuelve `chrome.downloads`; las pruebas usan uno falso.

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
