import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { getHhConnectionStatus, saveHhSettings } from '../controllers/hh-settings.controller';
import {
  addCandidateEvent,
  createCandidate,
  createVacancy,
  getCandidate,
  anonymizeCandidate,
  getBadges,
  getDashboard,
  issueImportToken,
  listInterviews,
  importFarpostResume,
  listCandidates,
  listVacancies,
  updateCandidate,
  updateVacancy,
} from '../controllers/hh-recruiting.controller';
import {
  convertRequestToVacancy,
  createRequest,
  decideOnSubmission,
  getRequest,
  listRequests,
  submitCandidates,
  updateRequest,
} from '../controllers/hh-hiring-request.controller';
import { authenticate } from '../middleware/authenticate';
import { authenticateHrImport } from '../middleware/authenticate-hr-import';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import {
  HH_CANDIDATE_EVENT_TYPES,
  HH_CANDIDATE_STAGES,
  HH_CANDIDATE_STATUSES,
  HH_HIRING_REQUEST_STATUSES,
  HH_HR_ROLES,
  HH_INTEGRATION_MANAGEMENT_ROLES,
  HH_RECRUITING_ROLES,
  HH_REJECTION_REASON_CODES,
  HH_REQUESTER_ROLES,
  HH_SUBMISSION_DECISIONS,
  HH_SOURCES,
  HH_VACANCY_MANAGEMENT_ROLES,
  HH_VACANCY_STATUSES,
} from '../constants/hh';

/**
 * Заявки на подбор: доступны и рекрутеру, и автору-руководителю, поэтому
 * ограничение по роли задаётся объединением прав, а фильтрация «своё/всё»
 * делается в сервисе.
 */
const HIRING_REQUEST_ROLES = [
  ...new Set<string>([...HH_RECRUITING_ROLES, ...HH_REQUESTER_ROLES]),
];

const PAGING_VALIDATORS = [
  query('page').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0, max: 100000 }),
  query('perPage').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 200 }),
];

const router = Router();

// Импорт FarPost регистрируется ДО общего authenticate: он принимает и обычный
// JWT, и import-token расширения (scope=farpost_import). Все остальные
// маршруты для import-токена закрыты — см. middleware/authenticate.ts.
router.post(
  '/import/farpost/resume',
  authenticateHrImport,
  authorizeRole(...HH_VACANCY_MANAGEMENT_ROLES),
  [
    body('rawText').isString().trim().notEmpty().isLength({ max: 60000 }),
    body('sourceUrl').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
    body('vacancyId').optional({ nullable: true }).isUUID(),
  ],
  handleValidationErrors,
  importFarpostResume,
);

router.use(authenticate);

// Выпуск import-токена для расширения: только под обычным JWT рекрутера.
router.post('/import-token', authorizeRole(...HH_VACANCY_MANAGEMENT_ROLES), issueImportToken);

router.get('/connection/status', authorizeRole(...HH_HR_ROLES), getHhConnectionStatus);
router.get('/dashboard', authorizeRole(...HH_HR_ROLES), getDashboard);
// Счётчики для меню: доступны всем, кто вообще видит модуль.
router.get('/badges', authorizeRole(...HIRING_REQUEST_ROLES), getBadges);

// --- Заявки на подбор ---
router.get(
  '/hiring-requests',
  authorizeRole(...HIRING_REQUEST_ROLES),
  [query('status').optional({ nullable: true, checkFalsy: true }).isIn(HH_HIRING_REQUEST_STATUSES)],
  handleValidationErrors,
  listRequests,
);
router.post(
  '/hiring-requests',
  authorizeRole(...HH_REQUESTER_ROLES),
  [
    body('position').isString().trim().notEmpty().isLength({ max: 255 }),
    body('department').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('city').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('headcount').optional({ nullable: true }).isInt({ min: 1, max: 999 }),
    body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
    body('requirements').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('responsibilities').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('salaryFrom').optional({ nullable: true }).isInt({ min: 0 }),
    body('salaryTo').optional({ nullable: true }).isInt({ min: 0 }),
    body('neededBy').optional({ nullable: true }).isISO8601({ strict: true }),
  ],
  handleValidationErrors,
  createRequest,
);
router.get(
  '/hiring-requests/:id',
  authorizeRole(...HIRING_REQUEST_ROLES),
  [param('id').isUUID()],
  handleValidationErrors,
  getRequest,
);
router.put(
  '/hiring-requests/:id',
  authorizeRole(...HIRING_REQUEST_ROLES),
  [
    param('id').isUUID(),
    body('position').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('status').optional({ nullable: true }).isIn(HH_HIRING_REQUEST_STATUSES),
    body('headcount').optional({ nullable: true }).isInt({ min: 1, max: 999 }),
    body('salaryFrom').optional({ nullable: true }).isInt({ min: 0 }),
    body('salaryTo').optional({ nullable: true }).isInt({ min: 0 }),
    body('neededBy').optional({ nullable: true }).isISO8601({ strict: true }),
    body('assignedRecruiterId').optional({ nullable: true }).isUUID(),
    body('vacancyId').optional({ nullable: true }).isUUID(),
  ],
  handleValidationErrors,
  updateRequest,
);
router.post(
  '/hiring-requests/:id/vacancy',
  authorizeRole(...HH_RECRUITING_ROLES),
  [param('id').isUUID()],
  handleValidationErrors,
  convertRequestToVacancy,
);
router.post(
  '/hiring-requests/:id/submissions',
  authorizeRole(...HH_RECRUITING_ROLES),
  [
    param('id').isUUID(),
    body('candidateIds').isArray({ min: 1, max: 50 }),
    body('candidateIds.*').isUUID(),
    body('recruiterNote').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  ],
  handleValidationErrors,
  submitCandidates,
);
router.post(
  '/submissions/:submissionId/decision',
  authorizeRole(...HIRING_REQUEST_ROLES),
  [
    param('submissionId').isUUID(),
    body('decision').isIn(HH_SUBMISSION_DECISIONS),
    body('reasonCode').optional({ nullable: true, checkFalsy: true }).isIn(HH_REJECTION_REASON_CODES),
    body('comment').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  ],
  handleValidationErrors,
  decideOnSubmission,
);
router.get(
  '/interviews',
  authorizeRole(...HH_HR_ROLES),
  [
    query('from').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    query('to').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    ...PAGING_VALIDATORS,
  ],
  handleValidationErrors,
  listInterviews,
);

router.get(
  '/vacancies',
  authorizeRole(...HH_HR_ROLES),
  [
    query('q').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 255 }),
    query('status').optional({ nullable: true, checkFalsy: true }).isIn(HH_VACANCY_STATUSES),
    ...PAGING_VALIDATORS,
  ],
  handleValidationErrors,
  listVacancies,
);
router.post(
  '/vacancies',
  authorizeRole(...HH_VACANCY_MANAGEMENT_ROLES),
  [
    body('title').isString().trim().notEmpty().isLength({ max: 255 }),
    body('department').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('managerUserId').optional({ nullable: true }).isUUID(),
    body('city').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('salaryFrom').optional({ nullable: true }).isInt({ min: 0 }),
    body('salaryTo').optional({ nullable: true }).isInt({ min: 0 }),
    body('currency').optional({ nullable: true }).isString().trim().isLength({ max: 16 }),
    body('requirements').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('responsibilities').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('benefits').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('openedAt').optional({ nullable: true }).isISO8601({ strict: true }),
    body('targetCloseAt').optional({ nullable: true }).isISO8601({ strict: true }),
    body('status').optional({ nullable: true }).isIn(HH_VACANCY_STATUSES),
    body('source').optional({ nullable: true }).isIn(HH_SOURCES),
  ],
  handleValidationErrors,
  createVacancy,
);
router.put(
  '/vacancies/:id',
  authorizeRole(...HH_VACANCY_MANAGEMENT_ROLES),
  [
    param('id').isUUID(),
    body('title').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('department').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('managerUserId').optional({ nullable: true }).isUUID(),
    body('city').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('salaryFrom').optional({ nullable: true }).isInt({ min: 0 }),
    body('salaryTo').optional({ nullable: true }).isInt({ min: 0 }),
    body('currency').optional({ nullable: true }).isString().trim().isLength({ max: 16 }),
    body('requirements').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('responsibilities').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('benefits').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('openedAt').optional({ nullable: true }).isISO8601({ strict: true }),
    body('targetCloseAt').optional({ nullable: true }).isISO8601({ strict: true }),
    body('status').optional({ nullable: true }).isIn(HH_VACANCY_STATUSES),
    body('source').optional({ nullable: true }).isIn(HH_SOURCES),
  ],
  handleValidationErrors,
  updateVacancy,
);

router.get(
  '/candidates',
  authorizeRole(...HH_HR_ROLES),
  [
    query('q').optional({ nullable: true, checkFalsy: true }).isString().trim().isLength({ max: 255 }),
    query('stage').optional({ nullable: true, checkFalsy: true }).isIn(HH_CANDIDATE_STAGES),
    query('status').optional({ nullable: true, checkFalsy: true }).isIn(HH_CANDIDATE_STATUSES),
    query('vacancyId').optional({ nullable: true, checkFalsy: true }).isUUID(),
    ...PAGING_VALIDATORS,
  ],
  handleValidationErrors,
  listCandidates,
);
router.post(
  '/candidates',
  authorizeRole(...HH_VACANCY_MANAGEMENT_ROLES),
  [
    body('fullName').isString().trim().notEmpty().isLength({ max: 255 }),
    body('age').optional({ nullable: true }).isInt({ min: 0, max: 120 }),
    body('phone').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail().isLength({ max: 255 }),
    body('messenger').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('city').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('desiredSalary').optional({ nullable: true }).isInt({ min: 0 }),
    body('position').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('experienceText').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('skillsText').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('educationText').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('currentStage').optional({ nullable: true }).isIn(HH_CANDIDATE_STAGES),
    body('status').optional({ nullable: true }).isIn(HH_CANDIDATE_STATUSES),
    body('vacancyId').optional({ nullable: true }).isUUID(),
    body('assignedRecruiterId').optional({ nullable: true }).isUUID(),
    body('source').optional({ nullable: true }).isIn(HH_SOURCES),
  ],
  handleValidationErrors,
  createCandidate,
);
router.get('/candidates/:id', authorizeRole(...HH_HR_ROLES), [param('id').isUUID()], handleValidationErrors, getCandidate);
// Обезличивание вручную: запрос субъекта ПДн (7 рабочих дней) или решение оператора.
router.post(
  '/candidates/:id/anonymize',
  authorizeRole(...HH_RECRUITING_ROLES),
  [param('id').isUUID()],
  handleValidationErrors,
  anonymizeCandidate,
);
router.put(
  '/candidates/:id',
  authorizeRole(...HH_VACANCY_MANAGEMENT_ROLES),
  [
    param('id').isUUID(),
    body('fullName').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('age').optional({ nullable: true }).isInt({ min: 0, max: 120 }),
    body('phone').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail().isLength({ max: 255 }),
    body('messenger').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('city').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('desiredSalary').optional({ nullable: true }).isInt({ min: 0 }),
    body('position').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('experienceText').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('skillsText').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('educationText').optional({ nullable: true }).isString().trim().isLength({ max: 12000 }),
    body('currentStage').optional({ nullable: true }).isIn(HH_CANDIDATE_STAGES),
    body('status').optional({ nullable: true }).isIn(HH_CANDIDATE_STATUSES),
    body('vacancyId').optional({ nullable: true }).isUUID(),
    body('assignedRecruiterId').optional({ nullable: true }).isUUID(),
    body('source').optional({ nullable: true }).isIn(HH_SOURCES),
    body('reserveConsentUntil').optional({ nullable: true }).isISO8601({ strict: true }),
    body('rejectionReasonCode').optional({ nullable: true, checkFalsy: true }).isIn(HH_REJECTION_REASON_CODES),
    body('rejectionComment').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  ],
  handleValidationErrors,
  updateCandidate,
);
router.post(
  '/candidates/:id/events',
  authorizeRole(...HH_VACANCY_MANAGEMENT_ROLES),
  [
    param('id').isUUID(),
    body('type').optional({ nullable: true }).isIn(HH_CANDIDATE_EVENT_TYPES),
    body('title').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('comment').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
    body('toStage').optional({ nullable: true }).isIn(HH_CANDIDATE_STAGES),
    body('dueAt').optional({ nullable: true }).isISO8601(),
  ],
  handleValidationErrors,
  addCandidateEvent,
);

router.get('/settings', authorizeRole(...HH_INTEGRATION_MANAGEMENT_ROLES), getHhConnectionStatus);
router.put(
  '/settings',
  authorizeRole(...HH_INTEGRATION_MANAGEMENT_ROLES),
  [
    body('clientId').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('clientSecret').optional({ nullable: true }).isString().isLength({ max: 5000 }),
    body('redirectUri').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
    body('userAgent').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
  ],
  handleValidationErrors,
  saveHhSettings,
);

export const hhRouter = router;
