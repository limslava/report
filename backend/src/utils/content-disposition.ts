export type ContentDispositionType = 'attachment' | 'inline';

export function buildContentDisposition(
  filename: string,
  disposition: ContentDispositionType = 'attachment',
  fallbackFilename = 'download',
): string {
  const normalized = filename.normalize('NFC').replace(/[\r\n]/g, '');
  const asciiFallback = normalized
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/[\\"]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || fallbackFilename;
  const encoded = encodeURIComponent(normalized)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
