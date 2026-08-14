import { canDeleteDirectoryEntry, canEditDirectories } from './directories';

describe('Права справочников (решение 2026-08-14)', () => {
  test('ведение: руководители КТК, кадры, админ — да; менеджеры КТК — нет', () => {
    for (const role of ['admin', 'head_ktk_vvo', 'head_ktk_mow', 'head_hr', 'hr_specialist']) {
      expect(canEditDirectories(role)).toBe(true);
    }
    for (const role of ['manager_ktk_vvo', 'manager_ktk_mow', 'bdd_specialist_vvo', 'director', undefined]) {
      expect(canEditDirectories(role)).toBe(false);
    }
  });

  test('удаление: админ — везде, руководитель КТК — только свой регион', () => {
    expect(canDeleteDirectoryEntry('admin', 'vvo')).toBe(true);
    expect(canDeleteDirectoryEntry('admin', 'mow')).toBe(true);
    expect(canDeleteDirectoryEntry('head_ktk_vvo', 'vvo')).toBe(true);
    expect(canDeleteDirectoryEntry('head_ktk_vvo', 'mow')).toBe(false);
    expect(canDeleteDirectoryEntry('head_ktk_mow', 'mow')).toBe(true);
    expect(canDeleteDirectoryEntry('head_ktk_mow', 'vvo')).toBe(false);
  });

  test('удаление: отдел кадров и менеджеры КТК — нет', () => {
    for (const role of ['head_hr', 'hr_specialist', 'manager_ktk_vvo', 'manager_ktk_mow', undefined]) {
      expect(canDeleteDirectoryEntry(role, 'vvo')).toBe(false);
      expect(canDeleteDirectoryEntry(role, 'mow')).toBe(false);
    }
  });
});
