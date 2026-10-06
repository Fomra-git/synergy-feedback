/** Quotes a worksheet title for A1 notation: 'My Sheet'!A1 */
export function a1Sheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Column index (0-based) → letters (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
