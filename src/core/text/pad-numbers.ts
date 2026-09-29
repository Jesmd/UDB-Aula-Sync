/** Pads every standalone number to `width` digits: "Semana 2" -> "Semana 02". */
export function padNumbers(text: string, width: number): string {
  if (width <= 1) return text;
  return text.replace(/(?<![\d.,])\d+(?![\d.,]\d)/g, (digits) => digits.padStart(width, '0'));
}

/** Width needed for the largest number found in a list of names (min 1). */
export function numberWidth(names: readonly string[]): number {
  let width = 1;
  for (const name of names) {
    for (const match of name.matchAll(/\d+/g)) width = Math.max(width, match[0].length);
  }
  return width;
}
