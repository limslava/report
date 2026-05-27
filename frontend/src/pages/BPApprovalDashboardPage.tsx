import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { getMyApprovalDashboard } from '../services/api';
import { subscribePlansRealtime } from '../services/plans-realtime';

type DashboardData = {
  inWork: number;
  dueToday: number;
  overdue: number;
  newRequests: number;
  completedMonth: number;
  avgProcessingHours: number;
};

const EMPTY: DashboardData = {
  inWork: 0,
  dueToday: 0,
  overdue: 0,
  newRequests: 0,
  completedMonth: 0,
  avgProcessingHours: 0,
};

function MetricCard({
  title,
  value,
  hint,
  color = '#2f3b52',
  onClick,
}: {
  title: string;
  value: string | number;
  hint: string;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      component={onClick ? 'button' : 'div'}
      variant="outlined"
      onClick={onClick}
      sx={{
        width: '100%',
        minHeight: 116,
        textAlign: 'left',
        font: 'inherit',
        borderRadius: '10px',
        border: '1px solid #d8e1ee',
        boxShadow: '0 1px 3px rgba(23, 43, 77, 0.06)',
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
      <CardContent sx={{ p: '14px 16px !important', display: 'grid', gap: 0.25 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#586980', lineHeight: 1.25 }}>{title}</Typography>
        <Typography sx={{ color, fontWeight: 700, lineHeight: 1.08, fontSize: 36 }}>{value}</Typography>
        <Typography sx={{ color: '#6b7788', fontSize: 12.5, lineHeight: 1.3 }}>{hint}</Typography>
      </CardContent>
    </Card>
  );
}

export default function BPApprovalDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getMyApprovalDashboard();
      setData({ ...EMPTY, ...(response.data || {}) });
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
  }, []);

  const nowLabel = useMemo(() => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()), [data]);

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, display: 'grid', gap: 2, width: '100%' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ gap: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: 21, sm: 24 }, color: '#24344d' }}>Согласование договоров</Typography>
        <Typography variant="caption" color="text.secondary">Обновлено: {nowLabel}</Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={1.25}>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Новые"
            value={data.newRequests}
            hint="Назначены сегодня"
            color="#1d70b8"
            onClick={() => navigate('/business-processes/contract-approval?kpi=new')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="В работе"
            value={data.inWork}
            hint="Активные без просрочки"
            color="#2e7d32"
            onClick={() => navigate('/business-processes/contract-approval?kpi=in_work')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Дедлайн сегодня"
            value={data.dueToday}
            hint="Нужно закрыть сегодня"
            color="#c77700"
            onClick={() => navigate('/business-processes/contract-approval?kpi=due_today')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Просрочено"
            value={data.overdue}
            hint="Срок уже истек"
            color="#c62828"
            onClick={() => navigate('/business-processes/contract-approval?kpi=overdue')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Завершено за месяц"
            value={data.completedMonth}
            hint="Ваши решения в этом месяце"
            color="#455a64"
            onClick={() => navigate('/business-processes/contract-approval?kpi=completed_month')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard title="Среднее время" value={`${data.avgProcessingHours} ч`} hint="От назначения до решения" color="#6a1b9a" />
        </Grid>
      </Grid>

      {loading && <Typography variant="body2" color="text.secondary">Обновляем данные...</Typography>}
    </Box>
  );
}
