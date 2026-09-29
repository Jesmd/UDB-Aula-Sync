# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [Sin publicar]

### Añadido

- Etiqueta animada sobre el cursor en los archivos descargables ("Preparando…" y luego "Clic para guardar";
  "Solo lectura" si no hay archivo). Respeta `prefers-reduced-motion`.

### Corregido

- El botón "Abrir" del aviso no abría el archivo en Brave: ahora es una página de la extensión enmarcada en
  el aviso, cuyo clic sí cuenta como gesto del usuario (ADR-016).

### Añadido (M4)

- M4: panel "Descargas del curso" (botón flotante) con "Descargar esta sección", "Descargar todo el curso",
  "Solo nuevos" y "Reintentar fallidos". Escanea las pestañas disponibles, muestra el plan y pide
  confirmación por encima de 100 archivos o 200 MB. Carpetas del curso con sus subcarpetas.
- M4: etiquetas de estado junto a cada archivo (Nuevo, Descargado, Actualizado, Solo lectura, Falta en disco,
  Omitido, Error), sin mover la página.
- M4: tarjeta de detalles (modo "tarjeta" o foco del teclado): tipo, nombre real, tamaño, destino, estado,
  "Descargar", "Copiar ruta", "Abrir" y "Mostrar en carpeta".
- M4: popup con la cola (pausar, reanudar, cancelar, reintentar), los cursos descargados y búsqueda en lo
  descargado con "Abrir" y "Mostrar en carpeta".
- M4: Opciones completas: General, Rutas (con ejemplo en vivo), Nombres, Sincronización (política, filtros,
  intervalo), Cursos (ajustes por curso) y Seguridad. Ajustes v2 con migración desde v1.
- M4: pruebas de accesibilidad (axe, WCAG 2.1 AA) en popup, opciones y la UI del curso.

### Corregido (M4)

- Elementos ocultos de la UI inyectada (botón "Descargar" de la tarjeta, "Cancelar") se veían por el reset
  `all: unset`.

### Añadido (M3)

- M3: clic para descargar. Al pasar el cursor (400 ms) se resuelve el archivo; el clic lo guarda en su
  carpeta y lo abre (lista blanca). Alt+clic solo descarga; Ctrl/Shift/clic central, comportamiento normal.
- M3: índice local (IndexedDB) con huellas. Un archivo al día no se vuelve a bajar. Uno cambiado queda
  "actualizado" y, por defecto, se guarda junto al anterior como "(rev N)".
- M3: cola persistente con 2 descargas a la vez, espaciado, reintentos con backoff, verificación de tamaño y
  tipo, pausa única si la sesión caduca, y reanudación tras reiniciar el service worker.
- M3: avisos con "Abrir" y "Mostrar en carpeta"; aviso si la descarga no arranca (diálogo "Preguntar dónde
  guardar").
- M2: resolución de archivos. Cadena `redirect=1` → recurso embebido/enlace → solo lectura, sonda de
  cabeceras HEAD/GET, `mod_folder` con subcarpetas, Content-Disposition (`filename*`, UTF-8 sin codificar).
- M2: rutas. Saneado de nombres (Windows, Unicode, límites 120/180), plantillas con tokens, código de
  curso, relleno numérico, sufijo por colisión.
- M2: botón "Probar hipótesis (H1, H2, H4-H6)" en el popup, con consentimiento y como máximo 4 peticiones.
- M2: el Moodle simulado sirve recursos, `pluginfile` con revisiones, carpetas, 429 y sesión caducada.
- M1 (checkpoint): fixtures reales saneadas de onetopic (49946) y temas (50454); el adaptador onetopic
  sigue el marcado real.
- M1: lectura del curso. Detección de estructura (onetopic, topics, weeks, genérica), adaptadores con
  suite de contrato común, `parseCourse`, `parseSection` y clasificación de actividades por `modtype_*`.
- M1: Diagnóstico de la página desde el popup (informe JSON solo con estructura) y
  `scripts/sanitize-fixture.ts` para convertir páginas o informes en fixtures anonimizadas.
- M1: fixtures sintéticas de las estructuras A, A con pestañas atenuadas, B, semanas y genérica,
  servidas también por el Moodle simulado.
- M0: andamiaje del proyecto (TypeScript estricto, Vite + CRXJS, ESLint, Prettier, Vitest, Playwright).
- Manifest generado con permisos mínimos y auditoría `check-manifest`.
- Tipos, mensajes validados, errores, logger con redacción e i18n (es, en) compartidos.
- Content script con toast en Shadow DOM en el Aula Digital.
- Popup y opciones mínimos; pestaña Diagnóstico con pruebas de compatibilidad (offscreen,
  descarga y apertura, sesión en segundo plano).
- Servidor Moodle simulado (HTTPS) y E2E con la extensión cargada en Chromium.
