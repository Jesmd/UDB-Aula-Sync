# Seguridad

## Modelo

- Todo texto del curso es **entrada no confiable**: nombres de curso, sección, actividad y archivo.
- La extensión actúa solo sobre `https://www.udbvirtual.edu.sv/auladigital/*`.
- Nada sale del navegador: sin analítica, sin servidores propios, sin código remoto.

## Controles (revisión M7, versión 1.0.0)

| Control                                                                         | Cómo se comprueba                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Permisos: solo los 7 del §6 y el host del Aula Digital                          | `check-manifest` en cada build y en CI; falla si no |
| CSP `script-src 'self'; object-src 'self'; base-uri 'none'`; sin código remoto  | `check-manifest`                                    |
| Mensajes validados con esquema y remitente por tipo (`ALLOWED` en el router)    | tests del router                                    |
| El offscreen solo atiende al worker (ni content scripts ni páginas)             | `fromWorker()` en `offscreen.ts`                    |
| UI inyectada con `textContent`; ESLint prohíbe `innerHTML`/`outerHTML`          | lint + tests de UI con nombres maliciosos           |
| Rutas saneadas: traversal, reservados de Windows, límites 120/180               | tests de `core/paths` y `core/text`                 |
| Descargas solo de `pluginfile.php` del Aula Digital                             | tests de `requests`                                 |
| Lista blanca de apertura; nunca ejecutables, scripts, macros ni comprimidos     | tests de `safe-open`                                |
| Sin contraseñas, cookies ni `sesskey` guardados; ni HTML de páginas             | E2E `backup.spec.ts` revisa el almacenamiento       |
| Registro con redacción (correos, `sesskey`, cookies, tokens), 300 entradas máx. | tests de `logger` y `log-store`                     |
| Importación de copias validada (formato, rutas relativas seguras, URL del Aula) | tests de `export-import`                            |
| Carpeta elegida solo en lectura; nunca se pide escritura                        | tests de `fs-access`                                |
| Máximo 2 peticiones a la vez, 300–800 ms, reintento con `Retry-After`           | tests del limitador; E2E mide `maxInFlight`         |
| Sesión caducada: se detiene, un aviso, cero peticiones hasta volver             | E2E `session-expired.spec.ts`                       |
| Dependencias de producción: 3 (`idb`, `preact`, `valibot`), versiones fijadas   | `pnpm audit --prod`: sin vulnerabilidades conocidas |

Detalles:

- Un archivo nuevo nunca sobrescribe uno que la extensión no descargó (`uniquify`).
- La extensión solo borra la página de login que se guardó por error como archivo (sesión caducada), nunca
  material del usuario.
- La página enmarcada "Abrir / Mostrar en carpeta" (ADR-016) solo es accesible desde el origen del Aula
  Digital y solo abre archivos del índice por su id.

## Fuera de alcance, por diseño

Iniciar sesión por el usuario, saltarse visores de solo lectura, capturas o impresión a PDF, peticiones
agresivas y cualquier acción fuera del host UDB.

## Reportar un problema

Es un proyecto personal: abre un issue privado o contacta al autor del repositorio.
