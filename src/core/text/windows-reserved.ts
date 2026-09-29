/** Device names Windows refuses as a file or folder name, with or without extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\..*)?$/i;

export function isWindowsReserved(name: string): boolean {
  return RESERVED.test(name.trim());
}

/** "CON" -> "CON_", "nul.txt" -> "nul_.txt". */
export function escapeWindowsReserved(name: string): string {
  if (!isWindowsReserved(name)) return name;
  const dot = name.indexOf('.');
  return dot === -1 ? `${name}_` : `${name.slice(0, dot)}_${name.slice(dot)}`;
}
