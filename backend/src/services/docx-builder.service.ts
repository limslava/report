import PizZip from 'pizzip';

/**
 * Минимальный сборщик DOCX без внешних шаблонов: документ описывается
 * блоками (абзацы и таблицы), сервис собирает валидный word/document.xml
 * и упаковывает пакет через pizzip. Используется печатными формами
 * (доверенности, заявки) — см. print-forms.service.ts.
 */

export type DocxRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** размер в пунктах (по умолчанию 11) */
  size?: number;
};

export type DocxParagraph = {
  kind: 'p';
  runs: DocxRun[];
  align?: 'left' | 'center' | 'right' | 'both';
  /** отступ после абзаца в пунктах */
  spacingAfter?: number;
  /** отступ первой строки в см (красная строка) */
  firstLineIndentCm?: number;
  /** линия под абзацем (отбивка шапки-бланка) */
  bottomBorder?: boolean;
};

/** Встраиваемая картинка (PNG). Размер в сантиметрах. */
export type DocxImage = {
  data: Buffer;
  widthCm: number;
  heightCm: number;
};

export type DocxTableCell = {
  runs?: DocxRun[];
  /** несколько абзацев в ячейке (взаимоисключимо с runs) */
  paragraphs?: DocxParagraph[];
  /** картинка в ячейке (взаимоисключимо с runs/paragraphs) */
  image?: DocxImage;
  align?: 'left' | 'center' | 'right';
  /** ширина колонки в процентах (задаётся в первой строке) */
  widthPct?: number;
  bold?: boolean;
};

export type DocxTable = {
  kind: 'table';
  rows: DocxTableCell[][];
  /** рамки таблицы (по умолчанию есть; шапка-бланк — без рамок) */
  borders?: boolean;
  /** только нижняя линия (отбивка шапки-бланка) */
  bottomBorder?: boolean;
};

export type DocxBlock = DocxParagraph | DocxTable;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const ALIGN_MAP = { left: 'left', center: 'center', right: 'right', both: 'both' } as const;

function renderRun(run: DocxRun): string {
  const size = Math.round((run.size ?? 11) * 2); // half-points
  const props = [
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>`,
    run.bold ? '<w:b/>' : '',
    run.italic ? '<w:i/>' : '',
    run.underline ? '<w:u w:val="single"/>' : '',
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
  ].join('');
  // xml:space="preserve" сохраняет ведущие/хвостовые пробелы (линии подписей и т.п.)
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

function renderParagraph(p: DocxParagraph): string {
  const spacing = `<w:spacing w:after="${Math.round((p.spacingAfter ?? 6) * 20)}" w:line="276" w:lineRule="auto"/>`;
  const align = p.align ? `<w:jc w:val="${ALIGN_MAP[p.align]}"/>` : '';
  const indent = p.firstLineIndentCm ? `<w:ind w:firstLine="${Math.round(p.firstLineIndentCm * 567)}"/>` : '';
  const border = p.bottomBorder
    ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="000000"/></w:pBdr>'
    : '';
  const runs = p.runs.length ? p.runs.map(renderRun).join('') : renderRun({ text: '' });
  // порядок по схеме pPr: pBdr -> spacing -> ind -> jc
  return `<w:p><w:pPr>${border}${spacing}${indent}${align}</w:pPr>${runs}</w:p>`;
}

/** Реестр картинок пакета: renderImage регистрирует, buildDocx кладёт в zip. */
type ImageRegistry = { entries: Array<{ relId: string; fileName: string; data: Buffer }> };

const EMU_PER_CM = 360000;

function renderImage(image: DocxImage, registry: ImageRegistry): string {
  const index = registry.entries.length + 1;
  const relId = `rIdImg${index}`;
  registry.entries.push({ relId, fileName: `image${index}.png`, data: image.data });
  const cx = Math.round(image.widthCm * EMU_PER_CM);
  const cy = Math.round(image.heightCm * EMU_PER_CM);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${index}" name="image${index}.png"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${index}" name="image${index}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

function renderTable(table: DocxTable, registry: ImageRegistry): string {
  const totalWidth = 9600; // твипы, ~A4 с полями
  const firstRow = table.rows[0] ?? [];
  const widths = firstRow.map((cell) => Math.round(((cell.widthPct ?? 100 / Math.max(firstRow.length, 1)) / 100) * totalWidth));
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const rowsXml = table.rows
    .map((row) => {
      const cells = row
        .map((cell, index) => {
          const width = widths[index] ?? 1200;
          const align = cell.align ? `<w:jc w:val="${cell.align}"/>` : '';
          let content: string;
          if (cell.image) {
            content = `<w:p><w:pPr><w:spacing w:after="0"/>${align}</w:pPr>${renderImage(cell.image, registry)}</w:p>`;
          } else if (cell.paragraphs) {
            content = cell.paragraphs.map(renderParagraph).join('');
          } else {
            const runs =
              (cell.runs ?? []).map((run) => renderRun({ ...run, bold: run.bold ?? cell.bold })).join('') || renderRun({ text: '' });
            content = `<w:p><w:pPr><w:spacing w:after="0"/>${align}</w:pPr>${runs}</w:p>`;
          }
          return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${content}</w:tc>`;
        })
        .join('');
      return `<w:tr>${cells}</w:tr>`;
    })
    .join('');
  const borders =
    table.borders === false
      ? table.bottomBorder
        ? '<w:tblBorders><w:bottom w:val="single" w:sz="16" w:color="000000"/></w:tblBorders>'
        : ''
      : '<w:tblBorders>' +
        ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
          .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="000000"/>`)
          .join('') +
        '</w:tblBorders>';
  return `<w:tbl><w:tblPr><w:tblW w:w="${totalWidth}" w:type="dxa"/>${borders}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowsXml}</w:tbl>`;
}

export function buildDocx(blocks: DocxBlock[]): Buffer {
  const registry: ImageRegistry = { entries: [] };
  const body = blocks.map((block) => (block.kind === 'p' ? renderParagraph(block) : renderTable(block, registry))).join('');
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` +
    ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="1134"/></w:sectPr>` +
    `</w:body></w:document>`;

  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
  );
  if (registry.entries.length) {
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        registry.entries
          .map(
            (entry) =>
              `<Relationship Id="${entry.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${entry.fileName}"/>`
          )
          .join('') +
        `</Relationships>`
    );
    for (const entry of registry.entries) {
      zip.file(`word/media/${entry.fileName}`, entry.data);
    }
  }
  zip.file('word/document.xml', documentXml);
  return zip.generate({ type: 'nodebuffer' });
}

/** Абзац из одной строки — сокращение для читаемости шаблонов. */
export const p = (text: string, opts: Partial<Omit<DocxParagraph, 'kind' | 'runs'>> & Partial<DocxRun> = {}): DocxParagraph => ({
  kind: 'p',
  runs: [{ text, bold: opts.bold, italic: opts.italic, underline: opts.underline, size: opts.size }],
  align: opts.align,
  spacingAfter: opts.spacingAfter,
  firstLineIndentCm: opts.firstLineIndentCm,
});

export const pRuns = (runs: DocxRun[], opts: Partial<Omit<DocxParagraph, 'kind' | 'runs'>> = {}): DocxParagraph => ({
  kind: 'p',
  runs,
  ...opts,
});
