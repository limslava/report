import { User } from '../models/user.model';
import {
  canAccessHrModuleBackend,
  canCreateHiringRequestBackend,
  canViewHrCandidatePiiBackend,
  hasHhCapability,
} from './hh-access.service';

const user = (role: string) => ({ id: 'u1', role } as User);

describe('Модель доступа модуля подбора', () => {
  it('подбор ведут только рекрутер и админ', () => {
    expect(hasHhCapability(user('hr_recruiter'), 'hr.recruiting')).toBe(true);
    expect(hasHhCapability(user('admin'), 'hr.recruiting')).toBe(true);
    for (const role of ['head_hr', 'hr_specialist', 'director', 'general_director', 'financer', 'head_sales']) {
      expect(hasHhCapability(user(role), 'hr.recruiting')).toBe(false);
    }
  });

  it('кадровая служба не имеет доступа к кандидатам и их ПДн', () => {
    // head_hr и hr_specialist — кадровое администрирование, а не подбор.
    for (const role of ['head_hr', 'hr_specialist']) {
      expect(canViewHrCandidatePiiBackend(user(role))).toBe(false);
      expect(hasHhCapability(user(role), 'hr.vacancy.manage')).toBe(false);
    }
  });

  it('заявку на подбор подают руководители, но не рядовые менеджеры', () => {
    for (const role of ['head_sales', 'head_ktk_vvo', 'head_hr', 'director', 'general_director', 'security']) {
      expect(canCreateHiringRequestBackend(user(role))).toBe(true);
    }
    for (const role of ['manager_sales', 'manager_auto', 'manager_rail', 'warehouse_keeper', 'counterparty_user']) {
      expect(canCreateHiringRequestBackend(user(role))).toBe(false);
    }
  });

  it('руководитель-заявитель попадает в модуль, но без доступа к ПДн', () => {
    const rop = user('head_sales');
    expect(canAccessHrModuleBackend(rop)).toBe(true);
    expect(canViewHrCandidatePiiBackend(rop)).toBe(false);
    expect(hasHhCapability(rop, 'hr.request.review')).toBe(true);
  });

  it('рекрутер тоже внутри модуля', () => {
    expect(canAccessHrModuleBackend(user('hr_recruiter'))).toBe(true);
  });

  it('без пользователя прав нет', () => {
    expect(canAccessHrModuleBackend(undefined)).toBe(false);
    expect(canViewHrCandidatePiiBackend(undefined)).toBe(false);
    expect(canCreateHiringRequestBackend(undefined)).toBe(false);
  });

  it('настройки интеграции — только админ', () => {
    expect(hasHhCapability(user('admin'), 'hr.integration.manage')).toBe(true);
    expect(hasHhCapability(user('hr_recruiter'), 'hr.integration.manage')).toBe(false);
  });
});
