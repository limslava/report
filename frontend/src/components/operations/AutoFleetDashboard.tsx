import { useMemo } from 'react';
import {
  FLEET_LONG_REPAIR_DAYS,
  FLEET_REST_LABEL,
  FLEET_STALE_BADGE_DAYS,
  FLEET_STALE_DIM_DAYS,
  computeFleetSummary,
  type FleetPerson,
  type FleetVehicleStatus,
} from './autoFleetStatus';
import '../../styles/auto-fleet-dashboard.css';

type Props = {
  peopleByMonth: Record<string, FleetPerson[]>;
  allOverrides: Record<string, Record<string, string>>;
};

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const formatDayMonth = (date: Date): string =>
  `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;

export default function AutoFleetDashboard({ peopleByMonth, allOverrides }: Props) {
  const data = useMemo(() => computeFleetSummary(peopleByMonth, allOverrides), [peopleByMonth, allOverrides]);

  if (!data) return null;

  const { today, total, transit, base, repairCount, noDriverCount, freeVehicles, freeReasons } = data;
  const percent = total > 0 ? Math.round((transit.length / total) * 100) : 0;
  const ringCircumference = 2 * Math.PI * 18;
  const ringFilled = (percent / 100) * ringCircumference;

  const renderMeta = (status: FleetVehicleStatus) =>
    status.markDate ? `${status.codeLabel} · ${formatDayMonth(status.markDate)}` : '—';

  const renderRow = (status: FleetVehicleStatus, kind: 'transit' | 'base') => {
    const stale = status.staleDays != null && status.staleDays >= FLEET_STALE_DIM_DAYS;
    const pills: JSX.Element[] = [];
    if (kind === 'transit') {
      if (status.planBadge) {
        pills.push(
          <span key="plan" className="afd-pill afd-pill--warn">
            по графику {status.planBadge.label} с {formatDayMonth(status.planBadge.date)}
          </span>
        );
      }
      if (status.staleDays != null && status.staleDays >= FLEET_STALE_BADGE_DAYS) {
        pills.push(
          <span key="stale" className="afd-pill afd-pill--gray">
            {status.staleDays} дн. без отметок
          </span>
        );
      }
    } else {
      if (status.substate === 'loading') pills.push(<span key="s" className="afd-pill afd-pill--gray">погрузка</span>);
      if (status.substate === 'knevichi') pills.push(<span key="s" className="afd-pill afd-pill--gray">Кневичи</span>);
      if (status.substate === 'rest') {
        pills.push(
          <span key="s" className="afd-pill afd-pill--gray">
            {FLEET_REST_LABEL[status.codeLabel] ?? 'отдых водителя'}
          </span>
        );
      }
      if (status.substate === 'repair') {
        const long = (status.repairDays ?? 0) >= FLEET_LONG_REPAIR_DAYS;
        pills.push(
          <span key="s" className={`afd-pill ${long ? 'afd-pill--crit' : 'afd-pill--warn'}`}>
            {status.repairDays && status.repairDays > 1 ? `в ремонте ${status.repairDays} дн.` : 'ремонт'}
          </span>
        );
      }
      if (status.substate === 'noDriver') pills.push(<span key="s" className="afd-pill afd-pill--warn">нет водителя</span>);
      if (status.substate === 'unknown') pills.push(<span key="s" className="afd-pill afd-pill--gray">нет отметок</span>);
    }

    const dotClass =
      status.substate === 'repair'
        ? ' afd-row__dot--crit'
        : status.substate === 'noDriver'
          ? ' afd-row__dot--warn'
          : kind === 'base'
            ? ' afd-row__dot--base'
            : '';

    return (
      <div key={status.plate} className={`afd-row${stale ? ' afd-row--stale' : ''}`}>
        <span className={`afd-row__dot${dotClass}`} />
        <span className="afd-row__plate">{status.plate}</span>
        <span className={`afd-row__driver${status.driver ? '' : ' afd-row__driver--none'}`}>
          {status.driver || 'нет водителя'}
        </span>
        <span className="afd-row__pills">{pills}</span>
        <span className="afd-row__meta">{renderMeta(status)}</span>
      </div>
    );
  };

  return (
    <section className="afd" aria-label="Парк автовозов">
      <div className="afd-stats">
        <div className="afd-tile afd-tile--hero">
          <span className="afd-tile__num">{transit.length}</span>
          <span className="afd-tile__txt">
            <span className="afd-tile__lbl">В пути</span>
            <span className="afd-tile__sub">
              из {total} машин · график на {formatDayMonth(today)}, {WEEKDAYS[today.getDay()]}
            </span>
          </span>
        </div>
        <div className="afd-tile">
          <span className="afd-tile__num">{base.length}</span>
          <span className="afd-tile__txt">
            <span className="afd-tile__lbl">На базе</span>
            <span className="afd-tile__pills">
              {repairCount > 0 && <span className="afd-pill afd-pill--warn">ремонт · {repairCount}</span>}
              {noDriverCount > 0 && <span className="afd-pill afd-pill--gray">без водителя · {noDriverCount}</span>}
              {repairCount === 0 && noDriverCount === 0 && <span className="afd-tile__sub">все исправны</span>}
            </span>
          </span>
        </div>
        <div className="afd-tile">
          <span className="afd-tile__num">{freeVehicles.length}</span>
          <span className="afd-tile__txt">
            <span className="afd-tile__lbl">Свободны к рейсу</span>
            <span className="afd-tile__sub">{freeReasons.length ? freeReasons.join(' · ') : '—'}</span>
          </span>
        </div>
        <div className="afd-tile">
          <span className="afd-ring">
            <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
              <circle cx="22" cy="22" r="18" fill="none" stroke="#eaf2fc" strokeWidth="6" />
              <circle
                cx="22"
                cy="22"
                r="18"
                fill="none"
                stroke="#2a78d6"
                strokeWidth="6"
                strokeDasharray={`${ringFilled} ${ringCircumference}`}
                strokeLinecap="round"
                transform="rotate(-90 22 22)"
              />
            </svg>
            <span className="afd-ring__pct">{percent}%</span>
          </span>
          <span className="afd-tile__txt">
            <span className="afd-tile__lbl">Парк в работе</span>
            <span className="afd-tile__sub">
              <b>{transit.length} из {total}</b>
            </span>
          </span>
        </div>
      </div>

      <div className="afd-cols">
        <div className="afd-card">
          <h3 className="afd-card__title">
            В пути <span className="afd-card__cnt afd-card__cnt--transit">{transit.length}</span>
          </h3>
          {transit.length ? transit.map((status) => renderRow(status, 'transit')) : (
            <div className="afd-card__empty">нет машин в пути</div>
          )}
        </div>
        <div className="afd-card">
          <h3 className="afd-card__title">
            На базе <span className="afd-card__cnt">{base.length}</span>
          </h3>
          {base.length ? base.map((status) => renderRow(status, 'base')) : (
            <div className="afd-card__empty">нет машин на базе</div>
          )}
        </div>
      </div>
    </section>
  );
}
