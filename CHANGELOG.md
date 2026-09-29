# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [Sin publicar]

### Añadido

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
