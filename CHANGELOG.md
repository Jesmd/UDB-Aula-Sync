# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [Sin publicar]

### Añadido

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
