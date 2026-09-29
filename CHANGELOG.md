# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [Sin publicar]

### Cambiado

- README reescrito para estudiantes: qué hace, instalación paso a paso, actualización y preguntas
  frecuentes. Logo nuevo en pixel art (`docs/logo.svg`).
- Workflow "Release": publica el zip en la página de versiones al subir un tag `v*` o a mano.

## [1.0.0] - 2026-09-29

### Añadido (M7)

- M7: copia de seguridad. Opciones > General > "Exportar" e "Importar" (ajustes, índice, cursos en
  seguimiento), con validación completa del archivo.
- M7: el registro del worker sobrevive a sus reinicios (300 entradas, redactadas) y se incluye en
  "Exportar registro".
- M7: presupuesto de tamaño del content script en el build (60 KB gzip) y control de tareas largas en E2E.
- M7: guía de instalación desde zip, actualización y primer uso en el README.

### Cambiado (M7)

- Todos los mensajes de error pasan por un único traductor: un código desconocido muestra el error
  genérico, nunca la clave.
- El documento offscreen solo acepta mensajes del worker. Las copias importadas solo aceptan URL del Aula
  Digital.
- Versión 1.0.0.

### Añadido

- Etiqueta animada sobre el cursor en los archivos descargables ("Preparando…" y luego "Clic para guardar";
  "Solo lectura" si no hay archivo). Respeta `prefers-reduced-motion`.

### Corregido

- El botón "Abrir" del aviso no abría el archivo en Brave: ahora es una página de la extensión enmarcada en
  el aviso, cuyo clic sí cuenta como gesto del usuario (ADR-016).

### Añadido (M6)

- M6: verificación de carpeta (opcional). En Opciones > Carpeta eliges Descargas/UDB, solo lectura. La
  extensión nota los archivos que borraste ("Falta en disco") y no vuelve a bajar los que ya tienes con el
  mismo nombre y tamaño ("Ya estaban en la carpeta").
- M6: "Comprobar ahora" lista los archivos descargados que ya no están; "Autorizar de nuevo" si el navegador
  vuelve a pedir permiso; "Dejar de usar".

### Añadido (M5)

- M5: novedades. Tras el primer "Descargar todo" o "Solo nuevos" de un curso, la extensión lo revisa cada
  6 h (configurable) en segundo plano, con red y sin pantalla bloqueada. Cuenta archivos nuevos y secciones
  que se abren.
- M5: contador en el icono, una notificación agrupada por búsqueda y marca "Nuevo" junto al archivo.
- M5: popup con "Sincronizar ahora", cursos en seguimiento, novedades por curso y "Marcar como visto".
- M5: opción por curso "Descargar novedades automáticamente" (apagada por defecto).
- M5: sesión caducada en segundo plano: una sola notificación y ninguna petición más hasta volver a iniciar
  sesión.
- M5: reintento con espera ante 429 y errores 5xx, respetando `Retry-After`, en la página y en segundo plano.

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

- Un clic hecho antes de que terminara la preparación del archivo abría la página de Moodle (o el PDF en
  el visor del navegador). Ahora el clic espera la preparación y descarga; si no hay archivo real, sigue el
  enlace.
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
