/** Status shown for a single file in the page, hover card and popup. */
export type FileStatus =
  | 'nuevo'
  | 'sin_cambios'
  | 'actualizado'
  | 'perdido_local'
  | 'ya_existe'
  | 'solo_lectura'
  | 'omitido'
  | 'retirado_en_linea'
  | 'error';

export type TaskState =
  'en_cola' | 'resolviendo' | 'descargando' | 'verificando' | 'hecha' | 'fallida' | 'omitida';

export type UpdatePolicy = 'omitir' | 'sobrescribir' | 'conservar_ambas';

export type LayoutKind = 'onetopic' | 'topics' | 'weeks' | 'generic';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly ts: number;
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
}
