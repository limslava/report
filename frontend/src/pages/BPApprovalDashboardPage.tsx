import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { CandidateCheck, getCandidateChecks, getMyApprovalDashboard } from '../services/api';
import { subscribePlansRealtime } from '../services/plans-realtime';
import { useAuthStore } from '../store/auth-store';
import { CandidateCheckDialog } from '../components/candidate-checks/CandidateCheckDialog';
import { candidateStatusChip } from '../utils/candidate-checks';

type ContractDeadlineRow = {
  contractId: string;
  contractNumber: string;
  contractType: string;
  counterpartyName: string;
  initiatorName: string;
  deadlineAt: string | null;
  status: 'overdue' | 'due_today' | 'on_track';
  overdueDays: number;
  daysLeft: number | null;
};

type DashboardData = {
  inWork: number;
  dueToday: number;
  overdue: number;
  newRequests: number;
  completedMonth: number;
  avgProcessingHours: number;
  overdueTrend: number[];
  overdueDeltaWeek: number;
  upcomingDeadlines: ContractDeadlineRow[];
};

const EMPTY: DashboardData = {
  inWork: 0,
  dueToday: 0,
  overdue: 0,
  newRequests: 0,
  completedMonth: 0,
  avgProcessingHours: 0,
  overdueTrend: [],
  overdueDeltaWeek: 0,
  upcomingDeadlines: [],
};

type CandidateDashboardData = {
  pending: number;
  approved: number;
  approvedWithRemarks: number;
  rejected: number;
  completedMonth: number;
};

const EMPTY_CANDIDATES: CandidateDashboardData = {
  pending: 0,
  approved: 0,
  approvedWithRemarks: 0,
  rejected: 0,
  completedMonth: 0,
};

const canViewCandidateTasks = (role?: string | null): boolean =>
  role === 'security' || role === 'admin' || role === 'hr_recruiter';

const canViewContractTasks = (role?: string | null): boolean =>
  role === 'security'
  || role === 'lawyer'
  || role === 'chief_accountant'
  || role === 'financer'
  || role === 'secretary';

const pluralRu = (count: number, one: string, few: string, many: string): string => {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const contractsWord = (count: number) => pluralRu(count, 'договор', 'договора', 'договоров');
const candidatesWord = (count: number) => pluralRu(count, 'кандидат', 'кандидата', 'кандидатов');

const candidateStatusLabels: Record<CandidateCheck['status'], string> = {
  pending_security: 'Ожидает СБ',
  approved: 'Согласован',
  approved_with_remarks: 'С замечаниями',
  rejected: 'Не согласован',
};

function buildCandidateDashboard(items: CandidateCheck[]): CandidateDashboardData {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return items.reduce((acc, item) => {
    if (item.status === 'pending_security') acc.pending += 1;
    if (item.status === 'approved') acc.approved += 1;
    if (item.status === 'approved_with_remarks') acc.approvedWithRemarks += 1;
    if (item.status === 'rejected') acc.rejected += 1;
    if (item.status !== 'pending_security' && item.decidedAt && new Date(item.decidedAt) >= startOfMonth) {
      acc.completedMonth += 1;
    }
    return acc;
  }, { ...EMPTY_CANDIDATES });
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const width = 84;
  const height = 26;
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }} aria-hidden>
      <path d={path} fill="none" stroke="#c3ccd9" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}

function DeltaLabel({ delta, goodIsDown, unit = '' }: { delta: number; goodIsDown: boolean; unit?: string }) {
  if (!delta) return <Typography sx={{ color: '#98a2b3', fontSize: 11, lineHeight: 1.2 }}>без изменений за неделю</Typography>;
  const isGood = goodIsDown ? delta < 0 : delta > 0;
  const arrow = delta > 0 ? '↑' : '↓';
  const sign = delta > 0 ? '+' : '−';
  return (
    <Typography sx={{ color: isGood ? '#1f8f2a' : '#c62828', fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>
      {arrow} {sign}{Math.abs(delta)}{unit} за неделю
    </Typography>
  );
}

function MetricCard({
  title,
  value,
  hint,
  color = '#2f3b52',
  tone = 'neutral',
  compact = false,
  onClick,
  trend,
  delta,
}: {
  title: string;
  value: string | number;
  hint: string;
  color?: string;
  tone?: 'critical' | 'warning' | 'good' | 'neutral';
  compact?: boolean;
  onClick?: () => void;
  trend?: number[];
  delta?: { value: number; goodIsDown: boolean };
}) {
  const dotColor = {
    critical: '#c62828',
    warning: '#c77700',
    good: '#2e7d32',
    neutral: '#8a96a8',
  }[tone];
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  const isZero = Number.isFinite(numericValue) && numericValue === 0;
  const hasSpark = Boolean(trend && trend.length >= 2);

  return (
    <Card
      component={onClick ? 'button' : 'div'}
      variant="outlined"
      onClick={onClick}
      sx={{
        width: '100%',
        height: '100%',
        minHeight: compact ? 62 : 72,
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        font: 'inherit',
        borderRadius: '8px',
        border: '1px solid #e3e9f2',
        boxShadow: 'none',
        background: '#fff',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        '&:hover': onClick
          ? {
            borderColor: '#9eb6d5',
            boxShadow: '0 3px 9px rgba(23, 43, 77, 0.10)',
          }
          : undefined,
      }}
    >
      <CardContent sx={{ p: compact ? '9px 12px !important' : '11px 14px !important', display: 'grid', gap: 0.15 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dotColor }} />
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#6b7788', lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{title}</Typography>
        </Stack>
        <Stack direction="row" alignItems="flex-end" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: isZero ? '#8a96a8' : color, fontWeight: isZero ? 600 : 750, lineHeight: 1.08, fontSize: compact ? 20 : 24 }}>{value}</Typography>
            {delta ? <DeltaLabel delta={delta.value} goodIsDown={delta.goodIsDown} /> : <Typography sx={{ color: '#98a2b3', fontSize: 11, lineHeight: 1.2 }}>{hint}</Typography>}
          </Box>
          {hasSpark && <Box sx={{ flex: 'none', mb: 0.25 }}><Sparkline data={trend as number[]} color={color} /></Box>}
        </Stack>
        {delta && <Typography sx={{ color: '#98a2b3', fontSize: 11, lineHeight: 1.2 }}>{hint}</Typography>}
      </CardContent>
    </Card>
  );
}

function AttentionBanner({
  title,
  hint,
  severity,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  hint: string;
  severity: 'critical' | 'warning' | 'good';
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  const palette = {
    critical: { border: '#c62828', bg: '#fff4f4', color: '#9f1d1d' },
    warning: { border: '#d18b00', bg: '#fff8e6', color: '#7a5200' },
    good: { border: '#2e7d32', bg: '#f1f8f2', color: '#1f6b25' },
  }[severity];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: '8px',
        borderColor: `${palette.border}55`,
        borderLeft: `4px solid ${palette.border}`,
        bgcolor: palette.bg,
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, color: palette.color, fontSize: 14 }}>{title}</Typography>
          <Typography sx={{ color: '#5f6c7b', fontSize: 12, mt: 0.25 }}>{hint}</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          {primaryAction && (
            <Button variant="contained" size="small" onClick={primaryAction.onClick} sx={{ bgcolor: palette.border, '&:hover': { bgcolor: palette.color } }}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outlined" size="small" onClick={secondaryAction.onClick} sx={{ bgcolor: '#fff' }}>
              {secondaryAction.label}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

function SectionHeader({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ gap: 1 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#24344d', fontSize: 15 }}>{title}</Typography>
      {action && (
        <Button size="small" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Stack>
  );
}

const contractTypeLabels: Record<string, string> = {
  income: 'Доходный',
  expense: 'Расходный',
};

const formatDeadline = (value: string | null): string => {
  if (!value) return 'без срока';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(value));
};

const deadlineChipStyle = (row: ContractDeadlineRow) => {
  if (row.status === 'overdue') return { bg: '#ffe1e1', color: '#9f1d1d', label: `просрочен ${row.overdueDays} дн.` };
  if (row.status === 'due_today') return { bg: '#fff3d6', color: '#7a5200', label: 'дедлайн сегодня' };
  return { bg: '#e9f6ea', color: '#1f6b25', label: row.daysLeft ? `в срок · ${row.daysLeft} дн.` : 'в срок' };
};

const DEADLINE_COLUMNS = { xs: '1fr', md: 'minmax(150px, 1.4fr) minmax(150px, 1.6fr) minmax(100px, 0.9fr) 76px 148px' };
const deadlineCellSx = { px: 1.25, py: 0.75, fontSize: 12.5, borderRight: { md: '1px solid #eef1f6' } };
const ellipsisSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function ContractDeadlinesList({ rows, onOpen }: { rows: ContractDeadlineRow[]; onOpen: (row: ContractDeadlineRow) => void }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '8px', overflow: 'hidden' }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: DEADLINE_COLUMNS,
        bgcolor: '#f6f8fc',
        borderBottom: '1px solid #e3e9f2',
        color: '#6b7788',
        fontWeight: 600,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
      }}>
        {['Договор', 'Контрагент', 'Инициатор', 'Срок', 'Статус'].map((label) => (
          <Box key={label} sx={{ px: 1.25, py: 0.75, borderRight: { md: '1px solid #eef1f6' }, display: { xs: label === 'Контрагент' || label === 'Инициатор' ? 'none' : 'block', md: 'block' } }}>{label}</Box>
        ))}
      </Box>
      {rows.length ? rows.map((row, index) => {
        const chip = deadlineChipStyle(row);
        return (
          <Box
            key={row.contractId}
            onClick={() => onOpen(row)}
            sx={{
              display: 'grid',
              gridTemplateColumns: DEADLINE_COLUMNS,
              bgcolor: index % 2 === 0 ? '#fafbfe' : '#fff',
              borderBottom: index === rows.length - 1 ? 0 : '1px solid #eef1f6',
              cursor: 'pointer',
              alignItems: 'center',
              '&:hover': { bgcolor: '#eef4fd' },
            }}
          >
            <Box sx={{ ...deadlineCellSx, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 12.5, ...ellipsisSx }}>{row.contractNumber}</Typography>
              <Typography sx={{ color: '#98a2b3', fontSize: 11 }}>{contractTypeLabels[row.contractType] ?? row.contractType}</Typography>
            </Box>
            <Box sx={{ ...deadlineCellSx, minWidth: 0, display: { xs: 'none', md: 'block' }, ...ellipsisSx }} title={row.counterpartyName}>{row.counterpartyName}</Box>
            <Box sx={{ ...deadlineCellSx, minWidth: 0, display: { xs: 'none', md: 'block' }, color: '#455a64', ...ellipsisSx }} title={row.initiatorName}>{row.initiatorName}</Box>
            <Box sx={{ ...deadlineCellSx, fontVariantNumeric: 'tabular-nums', color: '#455a64', whiteSpace: 'nowrap' }}>{formatDeadline(row.deadlineAt)}</Box>
            <Box sx={{ ...deadlineCellSx, borderRight: 0 }}>
              <Chip label={chip.label} size="small" sx={{ height: 22, borderRadius: '6px', bgcolor: chip.bg, color: chip.color, fontWeight: 650, fontSize: 11, '& .MuiChip-label': { px: 0.9 } }} />
            </Box>
          </Box>
        );
      }) : (
        <Box sx={{ px: 1.5, py: 2, color: '#6b7788', textAlign: 'center', fontSize: 12.5 }}>Активных договоров на согласовании нет.</Box>
      )}
    </Paper>
  );
}

const CANDIDATE_COLUMNS = { xs: '1fr', md: 'minmax(180px, 1.5fr) minmax(150px, 1.2fr) 150px 110px' };

function CandidateRecentList({ items, onOpen }: { items: CandidateCheck[]; onOpen: (item: CandidateCheck) => void }) {
  const recent = items.slice(0, 7);
  return (
    <Paper variant="outlined" sx={{ borderRadius: '8px', overflow: 'hidden' }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: CANDIDATE_COLUMNS,
        bgcolor: '#f6f8fc',
        borderBottom: '1px solid #e3e9f2',
        color: '#6b7788',
        fontWeight: 600,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
      }}>
        {['Кандидат', 'Должность', 'Статус', 'Создано'].map((label) => (
          <Box key={label} sx={{ px: 1.25, py: 0.75, borderRight: { md: '1px solid #eef1f6' }, display: { xs: label === 'Должность' ? 'none' : 'block', md: 'block' } }}>{label}</Box>
        ))}
      </Box>
      {recent.length ? recent.map((item, index) => {
        const chip = candidateStatusChip(item.status);
        return (
          <Box
            key={item.id}
            onClick={() => onOpen(item)}
            sx={{
              display: 'grid',
              gridTemplateColumns: CANDIDATE_COLUMNS,
              bgcolor: index % 2 === 0 ? '#fafbfe' : '#fff',
              borderBottom: index === recent.length - 1 ? 0 : '1px solid #eef1f6',
              cursor: 'pointer',
              alignItems: 'center',
              '&:hover': { bgcolor: '#eef4fd' },
            }}
          >
            <Box sx={{ ...deadlineCellSx, minWidth: 0, fontWeight: 700, ...ellipsisSx }} title={item.candidateFullName}>{item.candidateFullName}</Box>
            <Box sx={{ ...deadlineCellSx, minWidth: 0, display: { xs: 'none', md: 'block' }, ...ellipsisSx }} title={item.position || ''}>{item.position || '—'}</Box>
            <Box sx={{ ...deadlineCellSx }}>
              <Chip label={candidateStatusLabels[item.status]} size="small" sx={{ height: 22, borderRadius: '6px', bgcolor: chip.bgcolor, color: chip.color, fontWeight: 650, fontSize: 11, '& .MuiChip-label': { px: 0.9 } }} />
            </Box>
            <Box sx={{ ...deadlineCellSx, borderRight: 0, fontVariantNumeric: 'tabular-nums', color: '#455a64', whiteSpace: 'nowrap' }}>{new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(item.createdAt))}</Box>
          </Box>
        );
      }) : (
        <Box sx={{ px: 1.5, py: 2, color: '#6b7788', textAlign: 'center', fontSize: 12.5 }}>Проверок кандидатов пока нет.</Box>
      )}
    </Paper>
  );
}

export default function BPApprovalDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [candidateData, setCandidateData] = useState<CandidateDashboardData>(EMPTY_CANDIDATES);
  const [candidateItems, setCandidateItems] = useState<CandidateCheck[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (canViewContractTasks(user?.role)) {
        const response = await getMyApprovalDashboard();
        setData({ ...EMPTY, ...(response.data || {}) });
      } else {
        setData(EMPTY);
      }
      if (canViewCandidateTasks(user?.role)) {
        try {
          const candidateResponse = await getCandidateChecks();
          setCandidateItems(candidateResponse.data);
          setCandidateData(buildCandidateDashboard(candidateResponse.data));
        } catch {
          setCandidateItems([]);
          setCandidateData(EMPTY_CANDIDATES);
          setError((prev) => prev ?? 'Не удалось загрузить проверки кандидатов');
        }
      } else {
        setCandidateItems([]);
        setCandidateData(EMPTY_CANDIDATES);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить дашборд БП');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const unsubscribe = subscribePlansRealtime((payload) => {
      const event = payload as { type?: string };
      if (event.type === 'contract-approval:updated') {
        void load();
      }
    });
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [user?.role]);

  const hasContractAttention = data.overdue > 0 || data.dueToday > 0;
  const hasCandidateAttention = candidateData.pending > 0;
  const isHrRecruiter = user?.role === 'hr_recruiter';
  const candidateCompletedTotal = candidateData.approved + candidateData.approvedWithRemarks + candidateData.rejected;
  const navigateCandidate = (status?: CandidateCheck['status']) => {
    navigate(status ? `/business-processes/candidate-checks?status=${status}` : '/business-processes/candidate-checks');
  };
  const openNewCandidateCheck = () => navigate('/business-processes/candidate-checks?new=1');
  const isSecurity = user?.role === 'security' || user?.role === 'admin';

  const handleCandidateDecided = (updated: CandidateCheck) => {
    setSelectedCandidate(updated);
    void load();
  };

  return (
    <Box sx={{ p: { xs: 1.25, sm: 2 }, display: 'grid', gap: 1.25, width: '100%', maxWidth: 1180, mx: 'auto' }}>
      {error && <Alert severity="error">{error}</Alert>}

      {canViewContractTasks(user?.role) && hasContractAttention && (
        <AttentionBanner
          severity={data.overdue > 0 ? 'critical' : 'warning'}
          title={data.overdue > 0
            ? (data.dueToday > 0
              ? `${data.overdue} ${contractsWord(data.overdue)} просрочено, ещё ${data.dueToday} нужно закрыть сегодня`
              : `${data.overdue} ${contractsWord(data.overdue)} просрочено`)
            : `${data.dueToday} ${contractsWord(data.dueToday)} нужно закрыть сегодня`}
          hint={`В работе ${data.inWork}. Среднее время решения: ${data.avgProcessingHours} ч.`}
          primaryAction={{ label: data.overdue > 0 ? `К просроченным (${data.overdue})` : `Дедлайн сегодня (${data.dueToday})`, onClick: () => navigate(`/business-processes/contract-approval?kpi=${data.overdue > 0 ? 'overdue' : 'due_today'}`) }}
          secondaryAction={data.overdue > 0 && data.dueToday > 0 ? { label: `Дедлайн сегодня (${data.dueToday})`, onClick: () => navigate('/business-processes/contract-approval?kpi=due_today') } : undefined}
        />
      )}

      {isHrRecruiter && (
        <AttentionBanner
          severity={hasCandidateAttention ? 'warning' : 'good'}
          title={hasCandidateAttention
            ? `${candidateData.pending} ${candidatesWord(candidateData.pending)} на проверке СБ`
            : 'Нет кандидатов на проверке СБ'}
          hint={hasCandidateAttention
            ? `Всего завершено: ${candidateCompletedTotal}. За текущий месяц закрыто: ${candidateData.completedMonth}.`
            : `За текущий месяц закрыто: ${candidateData.completedMonth}. Можно создать новую проверку из раздела кандидатов.`}
          primaryAction={{ label: hasCandidateAttention ? `Открыть на проверке (${candidateData.pending})` : 'Открыть проверки', onClick: () => navigateCandidate(hasCandidateAttention ? 'pending_security' : undefined) }}
          secondaryAction={{ label: 'Новая проверка', onClick: openNewCandidateCheck }}
        />
      )}

      {!isHrRecruiter && canViewCandidateTasks(user?.role) && hasCandidateAttention && (
        <AttentionBanner
          severity="warning"
          title={`${candidateData.pending} ${candidatesWord(candidateData.pending)} ${candidateData.pending === 1 ? 'ожидает' : 'ожидают'} решения СБ`}
          hint={`За текущий месяц закрыто: ${candidateData.completedMonth}.`}
          primaryAction={{ label: `К проверкам (${candidateData.pending})`, onClick: () => navigateCandidate('pending_security') }}
        />
      )}

      {canViewContractTasks(user?.role) && (
        <>
          <SectionHeader title="Договоры" action={{ label: 'Все договоры', onClick: () => navigate('/business-processes/contract-approval') }} />
          <Grid container spacing={1}>
            <Grid item xs={12} md={6}>
              <MetricCard
                title="Просрочено"
                value={data.overdue}
                hint="Срок уже истек"
                color="#c62828"
                tone="critical"
                trend={data.overdueTrend}
                delta={data.overdueTrend.length >= 8 ? { value: data.overdueDeltaWeek, goodIsDown: true } : undefined}
                onClick={() => navigate('/business-processes/contract-approval?kpi=overdue')}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <MetricCard
                title="Дедлайн сегодня"
                value={data.dueToday}
                hint="Нужно закрыть сегодня"
                color="#c77700"
                tone="warning"
                onClick={() => navigate('/business-processes/contract-approval?kpi=due_today')}
              />
            </Grid>
          </Grid>
          <Grid container spacing={1}>
            <Grid item xs={6} sm={3} md={3}>
              <MetricCard
                title="Новые"
                value={data.newRequests}
                hint="Назначены сегодня"
                color="#1d70b8"
                tone="neutral"
                compact
                onClick={() => navigate('/business-processes/contract-approval?kpi=new')}
              />
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <MetricCard
                title="В работе"
                value={data.inWork}
                hint="Активные без просрочки"
                color="#2e7d32"
                tone="good"
                compact
                onClick={() => navigate('/business-processes/contract-approval?kpi=in_work')}
              />
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <MetricCard
                title="Завершено за месяц"
                value={data.completedMonth}
                hint="Ваши решения в этом месяце"
                color="#455a64"
                tone="neutral"
                compact
                onClick={() => navigate('/business-processes/contract-approval?kpi=completed_month')}
              />
            </Grid>
            <Grid item xs={6} sm={3} md={3}>
              <MetricCard title="Среднее время" value={`${data.avgProcessingHours} ч`} hint="От назначения до решения" color="#455a64" tone="neutral" compact />
            </Grid>
          </Grid>

          <SectionHeader
            title="Ближайшие дедлайны"
            action={{ label: 'Весь список', onClick: () => navigate('/business-processes/contract-approval') }}
          />
          <ContractDeadlinesList
            rows={data.upcomingDeadlines}
            onOpen={(row) => navigate(`/business-processes/contract-approval?contractId=${row.contractId}`)}
          />
        </>
      )}

      {canViewCandidateTasks(user?.role) && (
        <>
          <SectionHeader title="Проверка кандидатов" action={{ label: 'Все проверки', onClick: () => navigateCandidate() }} />
          {candidateData.pending === 0 && !isHrRecruiter ? (
            <Paper variant="outlined" sx={{ p: 1.75, borderRadius: '8px', bgcolor: '#f4fbf5', borderColor: '#cde8d0' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                <Box>
                  <Typography sx={{ fontWeight: 700, color: '#1f6b25' }}>Нет кандидатов в работе</Typography>
                  <Typography sx={{ color: '#5f6c7b', fontSize: 13 }}>
                    Все проверки завершены. За месяц закрыто: {candidateData.completedMonth}.
                  </Typography>
                </Box>
                <Button size="small" onClick={() => navigateCandidate()}>Открыть список</Button>
              </Stack>
            </Paper>
          ) : (
            <Grid container spacing={1}>
              <Grid item xs={12} md={6}>
                <MetricCard
                  title={isHrRecruiter ? 'На проверке СБ' : 'Ожидают СБ'}
                  value={candidateData.pending}
                  hint={isHrRecruiter ? 'Отправлены и ждут решения' : 'Кандидаты без решения'}
                  color="#c77700"
                  tone="warning"
                  onClick={() => navigateCandidate('pending_security')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <MetricCard
                  title="Завершено за месяц"
                  value={candidateData.completedMonth}
                  hint="Решения СБ в этом месяце"
                  color="#455a64"
                  tone="neutral"
                  onClick={() => navigateCandidate()}
                />
              </Grid>
            </Grid>
          )}
          <Grid container spacing={1}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Согласованы"
                value={candidateData.approved}
                hint="Положительные решения"
                color="#2e7d32"
                tone="good"
                compact
                onClick={() => navigateCandidate('approved')}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="С замечаниями"
                value={candidateData.approvedWithRemarks}
                hint="Согласованы с комментарием"
                color="#c77700"
                tone="warning"
                compact
                onClick={() => navigateCandidate('approved_with_remarks')}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Не согласованы"
                value={candidateData.rejected}
                hint="Отрицательные решения"
                color="#c62828"
                tone="critical"
                compact
                onClick={() => navigateCandidate('rejected')}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Всего завершено"
                value={candidateCompletedTotal}
                hint="Все принятые решения"
                color="#455a64"
                tone="neutral"
                compact
                onClick={() => navigateCandidate()}
              />
            </Grid>
          </Grid>
          <SectionHeader title="Последние проверки кандидатов" />
          <CandidateRecentList items={candidateItems} onOpen={(item) => setSelectedCandidate(item)} />
        </>
      )}

      <CandidateCheckDialog
        check={selectedCandidate}
        canDecide={isSecurity}
        onClose={() => setSelectedCandidate(null)}
        onDecided={handleCandidateDecided}
        onError={setError}
      />

      {loading && <Typography variant="body2" color="text.secondary">Обновляем данные...</Typography>}
    </Box>
  );
}
