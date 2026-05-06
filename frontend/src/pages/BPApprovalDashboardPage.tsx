import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { getMyApprovalDashboard } from '../services/api';

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
      variant="outlined"
      onClick={onClick}
      sx={{
        borderRadius: '8px',
        border: '1px solid #d7dce4',
        boxShadow: '0 2px 8px rgba(23, 43, 77, 0.08)',
        background: '#fff',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        '&:hover': onClick
          ? {
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 14px rgba(23, 43, 77, 0.14)',
          }
          : undefined,
      }}
    >
      <CardContent sx={{ p: '8px 10px !important' }}>
        <Typography sx={{ fontSize: 22, color: '#667084', mb: 0.25, lineHeight: 1.2 }}>{title}</Typography>
        <Typography sx={{ color, fontWeight: 800, lineHeight: 1.06, fontSize: 54 }}>{value}</Typography>
        <Typography sx={{ color: '#6a7382', fontSize: 18, mt: 0.25 }}>{hint}</Typography>
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
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const nowLabel = useMemo(() => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()), [data]);

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, display: 'grid', gap: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Дашборд согласования договоров</Typography>
        <Typography variant="caption" color="text.secondary">Обновлено: {nowLabel}</Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={1.5}>
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
          <MetricCard title="Завершено за месяц" value={data.completedMonth} hint="Обработанные заявки" color="#455a64" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard title="Среднее время" value={`${data.avgProcessingHours} ч`} hint="От назначения до решения" color="#6a1b9a" />
        </Grid>
      </Grid>

      {loading && <Typography variant="body2" color="text.secondary">Обновляем данные...</Typography>}
    </Box>
  );
}
