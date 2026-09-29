# Seguridad

## Modelo

- Todo texto del curso es **entrada no confiable**: nombres de curso, sección, actividad y archivo.
- La extensión actúa solo sobre `https://www.udbvirtual.edu.sv/auladigital/*`.
- Nada sale del navegador: sin analítica, sin servidores propios, sin código remoto.

## Controles (estado M0)

| Control                                                          | Estado                     |
| ---------------------------------------------------------------- | -------------------------- |
| Permisos mínimos auditados por `check-manifest` en build y CI    | hecho                      |
| CSP `script-src 'self'; object-src 'self'; base-uri 'none'`      | hecho                      |
| Mensajes validados con esquema + control de remitente            | hecho                      |
| UI con `textContent`; ESLint prohíbe `innerHTML`/`outerHTML`     | hecho                      |
| Logger con redacción (correos, sesskey, cookies, tokens)         | hecho                      |
| Saneado de rutas (traversal, reservados de Windows, límites)     | hecho (M2)                 |
| Lista blanca de apertura; nunca ejecutables, macros, comprimidos | hecho (M3)                 |
| Sin credenciales, cookies ni sesskey guardados                   | por diseño; revisión en M7 |

Además, desde M3:

- Las descargas solo aceptan URL `pluginfile.php` del Aula Digital, validadas en el worker.
- Un archivo nuevo nunca sobrescribe uno que la extensión no descargó (`uniquify`).
- La extensión solo borra la página de login que se guardó por error como archivo (sesión caducada), nunca
  material del usuario.

## Fuera de alcance, por diseño

Iniciar sesión por el usuario, saltarse visores de solo lectura, capturas o impresión a PDF, peticiones
agresivas y cualquier acción fuera del host UDB.

## Reportar un problema

Es un proyecto personal: abre un issue privado o contacta al autor del repositorio.
