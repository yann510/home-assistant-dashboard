const entities: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', bull: '•',
};

// Spotify descriptions contain HTML, but only their text belongs in the UI.
// Strip markup before a single entity pass, without creating DOM nodes or
// parsing resources. The returned string must continue to be rendered as text.
export function spotifyDescriptionText(description: string): string {
  return description
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, '')
    .replace(/<\/?[a-z][a-z0-9:-]*(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gi, tag => /^<br\b/i.test(tag) || /^<\/(?:p|div|li)\b/i.test(tag) ? '\n' : '')
    .replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/gi, (entity: string, name: string) => {
      if (!name.startsWith('#')) return Object.prototype.hasOwnProperty.call(entities, name) ? entities[name] : entity;
      const hexadecimal = name[1].toLowerCase() === 'x';
      const point = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
    });
}
