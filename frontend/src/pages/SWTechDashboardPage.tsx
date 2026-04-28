import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import * as echarts from 'echarts';
import { planningV2Api } from '../services/planning-v2.api';
import { PlanningTechDashboardResponse } from '../types/planning-v2.types';
import './sw-tech-dashboard.css';

type StatusTone = 'ok' | 'warn' | 'bad';

type DashboardCardProps = {
  title: string;
  value: string;
  hint?: string;
  tone?: StatusTone;
};

function formatInt(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₽`;
}

function getTone(pct: number): StatusTone {
  if (pct >= 80) return 'ok';
  if (pct >= 60) return 'warn';
  return 'bad';
}

function DashboardCard({ title, value, hint, tone }: DashboardCardProps) {
  return (
    <Paper className="sw-tech-card" variant="outlined">
      <Typography className="sw-tech-card-title">{title}</Typography>
      <Typography className={`sw-tech-card-value sw-tech-${tone ?? 'ok'}`}>{value}</Typography>
      <Typography className="sw-tech-card-hint">{hint ?? ' '}</Typography>
    </Paper>
  );
}

export default function SWTechDashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const asOfDate = now.toISOString().slice(0, 10);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlanningTechDashboardResponse | null>(null);

  const monthlyChartRef = useRef<HTMLDivElement | null>(null);
  const aprilChartRef = useRef<HTMLDivElement | null>(null);
  const waitChartRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [pageZoom, setPageZoom] = useState<number>(1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await planningV2Api.getTechDashboard({ year, month, asOfDate });
      setData(response);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить SW Tech Dashboard');
    } finally {
      setLoading(false);
    }
  }, [year, month, asOfDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!data) return;

    const instances: echarts.ECharts[] = [];
    const observers: ResizeObserver[] = [];

    const monthlyLabels = data.monthly.map((item) => item.month);
    const monthlyPlan = data.monthly.map((item) => item.plan);
    const monthlyFact = data.monthly.map((item) => item.fact);
    const monthlyPct = data.monthly.map((item) => item.pct);

    const buildMonthly = (): echarts.EChartsOption => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { bottom: 4, textStyle: { color: '#5f6f87' } },
      grid: { left: 52, right: 28, top: 18, bottom: 44, containLabel: true },
      xAxis: {
        type: 'category',
        data: monthlyLabels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#bfc9d8' } },
        axisLabel: { color: '#5d6d86' },
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max: 3000,
          interval: 500,
          axisLine: { show: false },
          axisLabel: { color: '#6a7a93', formatter: (value: number) => (value === 0 ? '' : formatInt(value)) },
          splitLine: { lineStyle: { color: '#dbe3ee', type: 'dashed' } },
        },
        {
          type: 'value',
          min: 0,
          max: 120,
          position: 'right',
          axisLine: { show: false },
          axisLabel: { color: '#6a7a93', formatter: (value: number) => `${value}%` },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'План',
          type: 'bar',
          data: monthlyPlan,
          barMaxWidth: 22,
          itemStyle: { color: '#2bc36d', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: '#43607a', fontSize: 9 },
        },
        {
          name: 'Факт',
          type: 'bar',
          data: monthlyFact,
          barMaxWidth: 22,
          itemStyle: { color: '#8ea0b9', borderRadius: [6, 6, 0, 0] },
          label: { show: true, position: 'top', color: '#506382', fontSize: 9 },
        },
        {
          name: 'Выполнение %',
          type: 'line',
          yAxisIndex: 1,
          data: monthlyPct,
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2, color: '#ff9f6a' },
          itemStyle: { color: '#ff9f6a' },
        },
      ],
    });

    const buildApril = (): echarts.EChartsOption => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { bottom: 4, textStyle: { color: '#5f6f87' } },
      grid: { left: 96, right: 18, top: 18, bottom: 44, containLabel: true },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#6a7a93' },
        splitLine: { lineStyle: { color: '#dbe3ee', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: data.april_segments.map((x) => x.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#bfc9d8' } },
        axisLabel: { color: '#5d6d86' },
      },
      series: [
        {
          name: 'План',
          type: 'bar',
          data: data.april_segments.map((x) => x.plan),
          barMaxWidth: 18,
          itemStyle: { color: '#27b8ff', borderRadius: [0, 7, 7, 0] },
          label: { show: true, position: 'right', color: '#3f5877', fontSize: 9 },
        },
        {
          name: 'Факт',
          type: 'bar',
          data: data.april_segments.map((x) => x.fact),
          barMaxWidth: 18,
          itemStyle: { color: '#9eaac0', borderRadius: [0, 7, 7, 0] },
          label: { show: true, position: 'right', color: '#506382', fontSize: 9 },
        },
      ],
    });

    const buildWait = (): echarts.EChartsOption => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: (params: any) => `${params.name}: ${formatInt(Number(params.value || 0))}` },
      legend: { bottom: 0, textStyle: { color: '#5f6f87' } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '45%'],
          label: { color: '#4f617b' },
          data: [
            { value: data.kpi.auto.waiting_truck, name: 'Автовозы', itemStyle: { color: '#33d7ff' } },
            { value: data.kpi.auto.waiting_ktk, name: 'Авто в КТК', itemStyle: { color: '#8d7dff' } },
            { value: data.kpi.auto.waiting_curtain, name: 'Шторы', itemStyle: { color: '#26d3a1' } },
            { value: data.kpi.rail.waiting_total, name: 'ЖД', itemStyle: { color: '#ffbd57' } },
          ],
        },
      ],
    });

    if (monthlyChartRef.current) {
      const chart = echarts.init(monthlyChartRef.current);
      chart.setOption(buildMonthly());
      instances.push(chart);
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(monthlyChartRef.current);
      observers.push(observer);
    }

    if (aprilChartRef.current) {
      const chart = echarts.init(aprilChartRef.current);
      chart.setOption(buildApril());
      instances.push(chart);
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(aprilChartRef.current);
      observers.push(observer);
    }

    if (waitChartRef.current) {
      const chart = echarts.init(waitChartRef.current);
      chart.setOption(buildWait());
      instances.push(chart);
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(waitChartRef.current);
      observers.push(observer);
    }

    const onResize = () => {
      instances.forEach((chart) => chart.resize());
    };

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      observers.forEach((observer) => observer.disconnect());
      instances.forEach((chart) => chart.dispose());
    };
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const page = pageRef.current;
    if (!page) return;

    let rafId = 0;
    let resizeTimer: number | null = null;

    const applyPageZoom = () => {
      const pageRect = page.getBoundingClientRect();
      const availableHeight = Math.max(0, window.innerHeight - pageRect.top - 8);
      const availableWidth = Math.max(0, page.parentElement?.clientWidth ?? page.clientWidth);

      page.style.zoom = '1';
      const naturalHeight = Math.max(1, page.scrollHeight);
      const naturalWidth = Math.max(1, page.scrollWidth);
      const byHeight = availableHeight / naturalHeight;
      const byWidth = availableWidth / naturalWidth;
      const next = Math.max(0.5, Math.min(1, byHeight, byWidth));
      setPageZoom(next);
    };

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(applyPageZoom);
      });
    };

    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(schedule, 60);
    };

    window.addEventListener('resize', onResize);
    schedule();
    window.setTimeout(schedule, 120);
    window.setTimeout(schedule, 360);

    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      cancelAnimationFrame(rafId);
    };
  }, [data]);

  const classicKpi = useMemo(() => {
    if (!data) return [];

    return [
      {
        title: 'Автовозы и шторы, % план/факт',
        value: `${data.computed.auto_pct.toFixed(1)}%`,
        hint: `Факт ${formatInt(data.april_segments.find((row) => row.name === 'Автовозы')?.fact ?? 0)} / План ${formatInt(data.april_segments.find((row) => row.name === 'Автовозы')?.plan ?? 0)}`,
        tone: getTone(data.computed.auto_pct),
      },
      {
        title: 'Авто в КТК, % план/факт',
        value: `${data.computed.auto_ktk_pct.toFixed(1)}%`,
        hint: `Факт ${formatInt(data.april_segments.find((row) => row.name === 'Авто в ктк')?.fact ?? 0)} / План ${formatInt(data.april_segments.find((row) => row.name === 'Авто в ктк')?.plan ?? 0)}`,
        tone: getTone(data.computed.auto_ktk_pct),
      },
      {
        title: 'ТО авто, % план/факт',
        value: `${data.april_segments.find((row) => row.name === 'ТО авто')?.pct.toFixed(1) ?? '0.0'}%`,
        hint: `Факт ${formatInt(data.kpi.to.fact_month)} / План ${formatInt(data.kpi.to.plan_month)}`,
        tone: getTone(data.april_segments.find((row) => row.name === 'ТО авто')?.pct ?? 0),
      },
      {
        title: 'Общий план, % план/факт',
        value: `${data.computed.total_pct.toFixed(1)}%`,
        hint: `План ${formatInt(data.computed.total_plan)} / Факт ${formatInt(data.computed.total_fact)}`,
        tone: getTone(data.computed.total_pct),
      },
    ] as const;
  }, [data]);

  const riskRows = useMemo(() => {
    if (!data) return [];
    return [...data.april_segments].sort((a, b) => a.pct - b.pct);
  }, [data]);

  return (
    <Box className="sw-tech-root">
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {loading || !data ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : (
        <Box
          className="sw-tech-page"
          ref={pageRef}
          style={{ zoom: pageZoom, '--sw-tech-fallback-scale': String(pageZoom) } as CSSProperties}
        >
          <section className="sw-tech-section">
            <Typography className="sw-tech-section-title">Executive Snapshot • {asOfDate}</Typography>
            <div className="sw-tech-grid-4">
              <DashboardCard
                title="КТК Владивосток, % план/факт"
                value={`${data.kpi.vvo.completion_month.toFixed(1)}%`}
                hint={`Факт ${formatInt(data.kpi.vvo.fact_month)} / План ${formatInt(data.kpi.vvo.plan_month)}`}
                tone={getTone(data.kpi.vvo.completion_month)}
              />
              <DashboardCard
                title="КТК Москва, % план/факт"
                value={`${data.kpi.msk.completion_month.toFixed(1)}%`}
                hint={`Факт ${formatInt(data.kpi.msk.fact_month)} / План ${formatInt(data.kpi.msk.plan_month)}`}
                tone={getTone(data.kpi.msk.completion_month)}
              />
              <DashboardCard
                title="ЖД, % план/факт"
                value={`${data.kpi.rail.completion_month.toFixed(1)}%`}
                hint={`Факт ${formatInt(data.kpi.rail.fact_month)} / План ${formatInt(data.kpi.rail.plan_month)}`}
                tone={getTone(data.kpi.rail.completion_month)}
              />
              <DashboardCard
                title="Доп.услуги, Итого"
                value={formatInt(data.kpi.extra.total)}
                hint={`Сборный ${formatInt(data.kpi.extra.groupage)} · Шторы ${formatInt(data.kpi.extra.curtains)} · Экспедирование ${formatInt(data.kpi.extra.forwarding)} · Перетарка ${formatInt(data.kpi.extra.repack)}`}
              />
            </div>
          </section>

          <section className="sw-tech-section">
            <div className="sw-tech-grid-4">
              {classicKpi.map((item) => (
                <DashboardCard
                  key={item.title}
                  title={item.title}
                  value={item.value}
                  hint={item.hint}
                  tone={item.tone}
                />
              ))}
            </div>
          </section>

          <section className="sw-tech-section sw-tech-grid-2">
            <Paper className="sw-tech-card sw-tech-chart-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Динамика года: План / Факт / Выполнение %</Typography>
              <div ref={monthlyChartRef} className="sw-tech-chart" />
            </Paper>

            <Paper className="sw-tech-card sw-tech-chart-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Апрель: направления (План vs Факт)</Typography>
              <div ref={aprilChartRef} className="sw-tech-chart" />
            </Paper>
          </section>

          <section className="sw-tech-section sw-tech-grid-2">
            <Paper className="sw-tech-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Поток отгрузки (узкие места)</Typography>
              <div className="sw-tech-pills-row">
                <div className="sw-tech-pill">
                  <Typography className="sw-tech-pill-label">Отправка авто / в ожидании</Typography>
                  <Typography className="sw-tech-pill-value sw-tech-warn">{formatInt(data.kpi.auto.waiting_total)}</Typography>
                  <Typography className="sw-tech-card-hint">Автовозы {formatInt(data.kpi.auto.waiting_truck)} · Авто в КТК {formatInt(data.kpi.auto.waiting_ktk)} · Шторы {formatInt(data.kpi.auto.waiting_curtain)}</Typography>
                </div>
                <div className="sw-tech-pill">
                  <Typography className="sw-tech-pill-label">ЖД / в ожидании</Typography>
                  <Typography className="sw-tech-pill-value sw-tech-warn">{formatInt(data.kpi.rail.waiting_total)}</Typography>
                </div>
              </div>
              <div ref={waitChartRef} className="sw-tech-chart-sm" />
            </Paper>

            <Paper className="sw-tech-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Экономика (матрица показателей)</Typography>
              <Table className="sw-tech-table" size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Показатель</TableCell>
                    <TableCell>Владивосток</TableCell>
                    <TableCell>Москва</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>Вал общий</TableCell>
                    <TableCell>{formatMoney(data.kpi.vvo.gross)}</TableCell>
                    <TableCell>{formatMoney(data.kpi.msk.gross)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Вал средний</TableCell>
                    <TableCell>{formatMoney(data.kpi.vvo.gross_avg)}</TableCell>
                    <TableCell>{formatMoney(data.kpi.msk.gross_avg)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Средняя стоимость заявки</TableCell>
                    <TableCell>{formatMoney(data.kpi.vvo.avg_ticket)}</TableCell>
                    <TableCell>{formatMoney(data.kpi.msk.avg_ticket)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Отправка авто / Δ ДЗ/КЗ</TableCell>
                    <TableCell colSpan={2}>{formatMoney(data.kpi.auto.debt_delta)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Paper>
          </section>

          <section className="sw-tech-section sw-tech-grid-2">
            <Paper className="sw-tech-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Контроль качества данных</Typography>
              <Table className="sw-tech-table" size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Проверка</TableCell>
                    <TableCell>Статус</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(data.checks).map(([name, ok]) => (
                    <TableRow key={name}>
                      <TableCell>{name}</TableCell>
                      <TableCell>
                        <span className={`sw-tech-badge ${ok ? 'sw-tech-badge-ok' : 'sw-tech-badge-bad'}`}>
                          {ok ? 'OK' : 'Ошибка'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Paper className="sw-tech-card" variant="outlined">
              <Typography className="sw-tech-chart-title">Ключевые риски</Typography>
              <Table className="sw-tech-table" size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Зона</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Комментарий</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {riskRows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>
                        <span className={`sw-tech-badge ${row.pct >= 80 ? 'sw-tech-badge-ok' : 'sw-tech-badge-bad'}`}>
                          {row.pct >= 80 ? 'Норма' : 'Риск'}
                        </span>
                      </TableCell>
                      <TableCell>{`${row.pct.toFixed(1)}% выполнения месяца`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </section>
        </Box>
      )}
    </Box>
  );
}
