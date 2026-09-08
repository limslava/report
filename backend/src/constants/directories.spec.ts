import { canDeleteDirectoryEntry, canEditDirectories, canEditDirectoryEntry } from './directories';

describe('Права справочников (решение 2026-09-08)', () => {
  test('ведение: руководители и менеджеры КТК, кадры, админ — да', () => {
    for (const role of ['admin', 'head_ktk_vvo', 'head_ktk_mow', 'manager_ktk_vvo', 'manager_ktk_mow', 'head_hr', 'hr_specialist']) {
      expect(canEditDirectories(role)).toBe(true);
    }
    for (const role of ['bdd_specialist_vvo', 'director', undefined]) {
      expect(canEditDirectories(role)).toBe(false);
    }
  });

  test('ведение по регионам: менеджер КТК — только свой регион', () => {
    expect(canEditDirectoryEntry('manager_ktk_vvo', 'vvo')).toBe(true);
    expect(canEditDirectoryEntry('manager_ktk_vvo', 'mow')).toBe(false);
    expect(canEditDirectoryEntry('manager_ktk_mow', 'mow')).toBe(true);
    expect(canEditDirectoryEntry('manager_ktk_mow', 'vvo')).toBe(false);
    expect(canEditDirectoryEntry('head_hr', 'vvo')).toBe(true);
    expect(canEditDirectoryEntry('head_hr', 'mow')).toBe(true);
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
