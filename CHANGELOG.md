# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado semántico.

## [Sin publicar]

### Añadido

- M0: andamiaje del proyecto (TypeScript estricto, Vite + CRXJS, ESLint, Prettier, Vitest, Playwright).
- Manifest generado con permisos mínimos y auditoría `check-manifest`.
- Tipos, mensajes validados, errores, logger con redacción e i18n (es, en) compartidos.
- Content script con toast en Shadow DOM en el Aula Digital.
- Popup y opciones mínimos; pestaña Diagnóstico con pruebas de compatibilidad (offscreen,
  descarga y apertura, sesión en segundo plano).
- Servidor Moodle simulado (HTTPS) y E2E con la extensión cargada en Chromium.
