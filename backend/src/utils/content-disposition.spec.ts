import { buildContentDisposition } from './content-disposition';

describe('buildContentDisposition', () => {
  it('builds an attachment header with ascii fallback and utf-8 filename', () => {
    const header = buildContentDisposition('Операционный отчет — 2026.xlsx', 'attachment', 'report.xlsx');

    expect(header).toContain('attachment;');
    expect(header).toContain('filename="_ _ _ 2026.xlsx"');
    expect(header).toContain("filename*=UTF-8''%D0%9E%D0%BF%D0%B5%D1%80%D0%B0%D1%86%D0%B8%D0%BE%D0%BD%D0%BD%D1%8B%D0%B9%20%D0%BE%D1%82%D1%87%D0%B5%D1%82");
  });

  it('removes unsafe header characters and supports inline disposition', () => {
    const header = buildContentDisposition('contract"\r\n.pdf', 'inline', 'attachment');

    expect(header).toBe('inline; filename="contract.pdf"; filename*=UTF-8\'\'contract%22.pdf');
  });
});
