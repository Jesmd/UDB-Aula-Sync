<p align="center">
  <img src="public/icons/icon-128.png" width="96" height="96" alt="">
</p>

<h1 align="center">UDB Aula Sync</h1>

<p align="center">
  Extensión de navegador (Manifest V3) para descargar y organizar el material de los cursos del
  Aula Digital de la UDB (Moodle). Guarda cada archivo en la carpeta de su curso y sección y baja solo lo nuevo.
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-0b5cad">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
  <img alt="Navegadores" src="https://img.shields.io/badge/Brave%20%7C%20Chrome%20%7C%20Edge-116%2B-555">
  <img alt="Licencia MIT" src="https://img.shields.io/badge/licencia-MIT-green">
</p>

> **Estado:** en desarrollo (hito M5: descarga masiva, novedades automáticas, popup y opciones). Uso personal. No se publica en la Chrome Web Store.

## Qué hará

- Tarjeta al pasar el cursor sobre un material: archivo real, tipo, tamaño, carpeta destino y estado.
- Clic en un archivo: se descarga en su carpeta y se abre desde el disco.
- Carpetas que reflejan el curso, por ejemplo:

  ```text
  Descargas/
  └─ UDB/
     └─ Estadística Aplicada ESA501 G01T/
        └─ Desarrollo/
           └─ Semana 12/
              └─ Presentación Semana 12.pdf
  ```

- Botones "Descargar todo" y "Solo nuevos", con un plan previo de lo que se va a bajar.
- Aviso de material nuevo (contador en el icono y notificación), con descarga automática opcional por curso.

Usa tu sesión ya iniciada en el navegador. No guarda contraseñas ni cookies y no envía datos a
ningún servidor. Detalles en [docs/PRIVACY.md](docs/PRIVACY.md) y [docs/SECURITY.md](docs/SECURITY.md).

## Instalación (cargar descomprimida)

1. Requisitos: Node 22 y pnpm 10.
2. Compila:

   ```sh
   pnpm install
   pnpm build
   ```

3. Abre `brave://extensions` (o `chrome://extensions`, `edge://extensions`).
4. Activa el **Modo desarrollador**.
5. Pulsa **Cargar descomprimida** y elige la carpeta `dist/`.

Primer uso: usa un perfil con "Preguntar dónde guardar cada archivo" **desactivado** y confirma
cuál es tu carpeta de descargas.

## Desarrollo

| Comando         | Qué hace                                                 |
| --------------- | -------------------------------------------------------- |
| `pnpm dev`      | Compila en modo observación a `dist/`                    |
| `pnpm build`    | Compila y audita el manifest                             |
| `pnpm check`    | Typecheck, lint, formato y tests unitarios con cobertura |
| `pnpm test:e2e` | Compila y ejecuta Playwright contra el Moodle simulado   |
| `pnpm mock`     | Arranca el Moodle simulado en `https://127.0.0.1:8443`   |
| `pnpm zip`      | Empaqueta `dist/` en `release/`                          |

Documentación técnica: [arquitectura](docs/ARCHITECTURE.md), [decisiones](docs/DECISIONS.md),
[notas de Moodle](docs/MOODLE-NOTES.md), [estructuras de curso](docs/LAYOUTS.md) y [pruebas](docs/TESTING.md).

## Licencia

MIT.
