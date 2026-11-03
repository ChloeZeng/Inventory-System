// "1 item", "2 items", "1,200 lots". Pass the plural form when adding "s" is wrong.
export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n.toLocaleString()} ${Math.abs(n) === 1 ? word : pluralWord}`;
}
