const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/** "Semana 2" < "Semana 10"; accents and case do not change the order. */
export function compareNatural(a: string, b: string): number {
  return collator.compare(a, b);
}

export function sortNatural<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((x, y) => compareNatural(key(x), key(y)));
}
