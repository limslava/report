import assert from 'assert';
import { parseFarpostResume, serializeCandidate, serializeCandidateEvent } from './src/services/hh-recruiting.service';

const u = (role: string) => ({ id: 'user-1', role } as any);
const cand = () => ({
  id: '0f8a1c2d-3e4f-5061-7283-94a5b6c7d8e9',
  hhResumeId: 'farpost:1234567', source: 'farpost',
  fullName: 'Иванов Иван Иванович', photoUrl: 'https://e/p.jpg', age: 33,
  phone: '+79001234567', email: 'ivanov@example.com', messenger: 'tg',
  city: 'Владивосток', desiredSalary: 120000, position: 'Логист',
  experienceText: 'ООО Ромашка +79001234567', skillsText: '1С', educationText: 'ДВФУ',
  currentStage: 'screening', status: 'active', vacancyId: null,
  assignedRecruiterId: null, lastContactAt: null, events: [],
} as any);

for (const role of ['admin', 'head_hr', 'hr_recruiter', 'hr_specialist']) {
  const d = serializeCandidate(cand(), u(role));
  assert.strictEqual(d.fullName, 'Иванов Иван Иванович', role);
  assert.strictEqual(d.phone, '+79001234567', role);
  assert.strictEqual(d.piiHidden, false, role);
}
for (const role of ['director', 'general_director', 'financer']) {
  const d = serializeCandidate(cand(), u(role));
  assert.strictEqual(d.fullName, 'Кандидат #0f8a1c2d', role);
  assert.strictEqual(d.phone, null, role);
  assert.strictEqual(d.email, null, role);
  assert.strictEqual(d.hhResumeId, null, role);
  assert.strictEqual(d.experienceText, null, role);
  assert.strictEqual(d.age, null, role);
  assert.strictEqual(d.piiHidden, true, role);
  assert.strictEqual(d.currentStage, 'screening', role);
  assert.strictEqual(d.desiredSalary, 120000, role);
}
assert.strictEqual(serializeCandidate(cand()).piiHidden, true, 'default deny');

const ev = { id: 'e', candidateId: 'c', vacancyId: null, type: 'comment',
  title: 'Комментарий HR', comment: 'просит 150 000, +79001234567',
  fromStage: null, toStage: null, dueAt: null, createdByUserId: null, createdAt: new Date() } as any;
assert.ok(serializeCandidateEvent(ev, u('hr_recruiter')).comment!.includes('150 000'));
assert.strictEqual(serializeCandidateEvent(ev, u('financer')).comment, null);
assert.strictEqual(serializeCandidateEvent(ev, u('financer')).title, 'Комментарий HR');

assert.strictEqual(parseFarpostResume(
  'Фарпост\nРезюме Водитель № 1234567\nСлужба поддержки 8 (423) 200-11-22\nТелефон\n+7 914 700-11-22').phone,
  '+79147001122', 'labelled phone wins');
assert.strictEqual(parseFarpostResume('Телефон\n8 914 700 11 22').phone, '+79147001122');
assert.strictEqual(parseFarpostResume('Телефон\n9147001122').phone, '+79147001122');
assert.strictEqual(parseFarpostResume('Резюме Логист № 1234567\nГод рождения\n1990').phone, null, 'no false phone');
assert.strictEqual(parseFarpostResume('Уровень дохода\n120 000 ₽\nЗанятость\nполная').desiredSalary, 120000);
assert.strictEqual(parseFarpostResume('Цена 10 руб').desiredSalary, null);
assert.strictEqual(parseFarpostResume('Оборот 99 000 000 руб').desiredSalary, null);
const hidden = parseFarpostResume('Резюме Логист № 7654321\nИмя соискателя будет доступно после открытия контактов');
assert.strictEqual(hidden.resumeKey, 'farpost:7654321');
assert.strictEqual(hidden.fullName, 'Соискатель FarPost №7654321');

console.log('ALL ASSERTIONS PASSED');
