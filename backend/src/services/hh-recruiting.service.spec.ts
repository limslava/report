import { parseFarpostResume, serializeCandidate, serializeCandidateEvent } from './hh-recruiting.service';
import { HhCandidate } from '../models/hh-candidate.model';
import { HhCandidateEvent } from '../models/hh-candidate-event.model';
import { User } from '../models/user.model';

function user(role: string): User {
  return { id: 'user-1', role, fullName: 'Тест', email: 't@example.com' } as User;
}

function candidate(input: Partial<HhCandidate> = {}): HhCandidate {
  return {
    id: '0f8a1c2d-3e4f-5061-7283-94a5b6c7d8e9',
    hhResumeId: 'farpost:1234567',
    source: 'farpost',
    fullName: 'Иванов Иван Иванович',
    photoUrl: 'https://example.com/photo.jpg',
    age: 33,
    phone: '+79001234567',
    email: 'ivanov@example.com',
    messenger: 'tg: @ivanov',
    city: 'Владивосток',
    desiredSalary: 120000,
    position: 'Логист',
    experienceText: 'ООО Ромашка, логист, тел. +79001234567',
    skillsText: '1С, Excel',
    educationText: 'ДВФУ',
    currentStage: 'screening',
    status: 'active',
    vacancyId: null,
    assignedRecruiterId: null,
    lastContactAt: null,
    events: [],
    ...input,
  } as HhCandidate;
}

describe('serializeCandidate: доступ к персональным данным', () => {
  it('отдаёт ПДн ролям, допущенным к кандидатам', () => {
    // Подбор ведут только админ и рекрутер; head_hr/hr_specialist — кадровое
    // администрирование без доступа к кандидатам (см. HH_RECRUITING_ROLES).
    for (const role of ['admin', 'hr_recruiter']) {
      const dto = serializeCandidate(candidate(), user(role));
      expect(dto.fullName).toBe('Иванов Иван Иванович');
      expect(dto.phone).toBe('+79001234567');
      expect(dto.email).toBe('ivanov@example.com');
      expect(dto.piiHidden).toBe(false);
    }
  });

  it('обезличивает кандидата для ролей отчётности', () => {
    for (const role of ['director', 'general_director', 'financer']) {
      const dto = serializeCandidate(candidate(), user(role));
      expect(dto.fullName).toBe('Кандидат #0f8a1c2d');
      expect(dto.phone).toBeNull();
      expect(dto.email).toBeNull();
      expect(dto.messenger).toBeNull();
      expect(dto.photoUrl).toBeNull();
      expect(dto.age).toBeNull();
      expect(dto.hhResumeId).toBeNull();
      // свободные тексты резюме содержат контакты, поэтому тоже скрыты
      expect(dto.experienceText).toBeNull();
      expect(dto.skillsText).toBeNull();
      expect(dto.educationText).toBeNull();
      expect(dto.piiHidden).toBe(true);
      // аналитические поля остаются доступными
      expect(dto.currentStage).toBe('screening');
      expect(dto.city).toBe('Владивосток');
      expect(dto.desiredSalary).toBe(120000);
    }
  });

  it('без указания зрителя скрывает ПДн (безопасное поведение по умолчанию)', () => {
    const dto = serializeCandidate(candidate());
    expect(dto.piiHidden).toBe(true);
    expect(dto.phone).toBeNull();
  });

  it('скрывает комментарий события, но оставляет системный заголовок', () => {
    const event = {
      id: 'e1',
      candidateId: 'c1',
      vacancyId: null,
      type: 'comment',
      title: 'Комментарий HR',
      comment: 'Созвон, просит 150 000, тел. +79001234567',
      fromStage: null,
      toStage: null,
      dueAt: null,
      createdByUserId: null,
      createdAt: new Date(),
    } as unknown as HhCandidateEvent;

    expect(serializeCandidateEvent(event, user('hr_recruiter')).comment).toContain('150 000');
    expect(serializeCandidateEvent(event, user('financer')).comment).toBeNull();
    expect(serializeCandidateEvent(event, user('financer')).title).toBe('Комментарий HR');
  });
});

describe('parseFarpostResume: телефон', () => {
  it('берёт телефон рядом с меткой, а не первое число на странице', () => {
    const parsed = parseFarpostResume([
      'Фарпост',
      'Резюме Водитель категории E № 1234567',
      'Служба поддержки 8 (423) 200-11-22',
      'Телефон',
      '+7 914 700-11-22',
    ].join('\n'));
    expect(parsed.phone).toBe('+79147001122');
  });

  it('нормализует 8XXXXXXXXXX и 9XXXXXXXXX к +7', () => {
    expect(parseFarpostResume('Телефон\n8 914 700 11 22').phone).toBe('+79147001122');
    expect(parseFarpostResume('Телефон\n9147001122').phone).toBe('+79147001122');
  });

  it('не принимает номер резюме и год за телефон', () => {
    const parsed = parseFarpostResume('Резюме Логист № 1234567\nГод рождения\n1990');
    expect(parsed.phone).toBeNull();
  });
});

describe('parseFarpostResume: зарплата', () => {
  it('читает уровень дохода', () => {
    const parsed = parseFarpostResume('Уровень дохода\n120 000 ₽\nЗанятость\nполная');
    expect(parsed.desiredSalary).toBe(120000);
  });

  it('отбраковывает суммы вне разумного диапазона', () => {
    expect(parseFarpostResume('Цена 10 руб').desiredSalary).toBeNull();
    expect(parseFarpostResume('Оборот 99 000 000 руб').desiredSalary).toBeNull();
  });
});

describe('parseFarpostResume: идентификация', () => {
  it('строит ключ резюме и подставляет обезличенное имя, когда ФИО скрыто', () => {
    const parsed = parseFarpostResume([
      'Резюме Логист № 7654321',
      'Имя соискателя будет доступно после открытия контактов',
    ].join('\n'));
    expect(parsed.resumeKey).toBe('farpost:7654321');
    expect(parsed.fullName).toBe('Соискатель FarPost №7654321');
  });
});
