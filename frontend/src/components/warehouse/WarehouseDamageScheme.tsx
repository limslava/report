import { Undo } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { MouseEvent, TouchEvent, useEffect, useMemo, useRef, useState } from 'react';
import damageSchemeFullUrl from '../../assets/warehouse-damage-scheme-full.png';
import damageSchemePassengerUrl from '../../assets/warehouse-damage-scheme-passenger.png';
import damageSchemeSpecialUrl from '../../assets/warehouse-damage-scheme-special.png';
import damageSchemeTrailerUrl from '../../assets/warehouse-damage-scheme-trailer.png';
import damageSchemeTruckUrl from '../../assets/warehouse-damage-scheme-truck.png';
import {
  WarehouseVehicleInspectionPayload,
  WarehouseVehicleType,
} from '../../services/warehouse.api';

type DamageCode = 'Ц' | 'В' | 'П' | 'О' | 'Т' | 'К' | 'С';
type DamageSchemeType = 'passenger' | 'truck' | 'trailer' | 'special' | 'full';

interface DamageMark {
  id: string;
  code: DamageCode;
  x: number;
  y: number;
  comment?: string;
  schemeType?: DamageSchemeType;
}

interface Props {
  value: WarehouseVehicleInspectionPayload;
  vehicleType: WarehouseVehicleType;
  onChange: (value: WarehouseVehicleInspectionPayload) => void;
}

const DAMAGE_CODES: Array<{ code: DamageCode; label: string }> = [
  { code: 'Ц', label: 'царапина' },
  { code: 'В', label: 'вмятина' },
  { code: 'П', label: 'перекос' },
  { code: 'О', label: 'отсутствие' },
  { code: 'Т', label: 'трещина' },
  { code: 'К', label: 'коррозия' },
  { code: 'С', label: 'скол' },
];

const SCHEME_BY_TYPE: Record<WarehouseVehicleType, DamageSchemeType> = {
  passenger: 'passenger',
  light_commercial: 'truck',
  truck: 'truck',
  trailer: 'trailer',
  special: 'special',
  motorcycle: 'full',
};

const SCHEME_ASSETS: Record<DamageSchemeType, { src: string; title: string; minWidth: number }> = {
  passenger: { src: damageSchemePassengerUrl, title: 'Легковая схема', minWidth: 760 },
  truck: { src: damageSchemeTruckUrl, title: 'Грузовая / коммерческая схема', minWidth: 780 },
  trailer: { src: damageSchemeTrailerUrl, title: 'Прицеп / полуприцеп', minWidth: 820 },
  special: { src: damageSchemeSpecialUrl, title: 'Спецтехника', minWidth: 720 },
  full: { src: damageSchemeFullUrl, title: 'Общая договорная схема', minWidth: 920 },
};

const isDamageMark = (value: unknown): value is DamageMark => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && 'code' in value
  && 'x' in value
  && 'y' in value
);

const createMarkId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getMarks = (value: WarehouseVehicleInspectionPayload): DamageMark[] => {
  const raw = value.technicalCondition?.damageMarks;
  return Array.isArray(raw) ? raw.filter(isDamageMark) : [];
};

const damageCodeLabel = (code: DamageCode) =>
  DAMAGE_CODES.find((item) => item.code === code)?.label ?? code;

export default function WarehouseDamageScheme({ value, vehicleType, onChange }: Props) {
  const schemeType = SCHEME_BY_TYPE[vehicleType] ?? 'full';
  const scheme = SCHEME_ASSETS[schemeType];
  const [selectedCode, setSelectedCode] = useState<DamageCode>('Ц');
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [deleteMarkId, setDeleteMarkId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const allMarks = useMemo(() => getMarks(value), [value]);
  const marks = useMemo(
    () => allMarks.filter((mark) => (mark.schemeType ?? schemeType) === schemeType),
    [allMarks, schemeType],
  );
  const selectedMark = marks.find((mark) => mark.id === selectedMarkId) ?? null;
  const deleteMark = marks.find((mark) => mark.id === deleteMarkId) ?? null;

  useEffect(() => {
    if (selectedMarkId && !marks.some((mark) => mark.id === selectedMarkId)) {
      setSelectedMarkId(null);
    }
  }, [marks, selectedMarkId]);

  const updateMarks = (nextMarksForScheme: DamageMark[]) => {
    onChange({
      ...value,
      technicalCondition: {
        ...(value.technicalCondition ?? {}),
        damageMarks: [
          ...allMarks.filter((mark) => (mark.schemeType ?? schemeType) !== schemeType),
          ...nextMarksForScheme,
        ],
      },
    });
  };

  const addMark = (clientX: number, clientY: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100));
    const mark = { id: createMarkId(), code: selectedCode, x, y, schemeType };
    updateMarks([...marks, mark]);
    setSelectedMarkId(mark.id);
  };

  const handlePointer = (
    event: MouseEvent<HTMLElement> | TouchEvent<HTMLElement>,
  ) => {
    if ((event.target as HTMLElement).closest('[data-damage-marker="true"]')) return;
    const target = event.currentTarget;
    if ('touches' in event) {
      const touch = event.changedTouches[0];
      if (touch) addMark(touch.clientX, touch.clientY, target);
      return;
    }
    addMark(event.clientX, event.clientY, target);
  };

  const updateSelectedComment = (comment: string) => {
    if (!selectedMark) return;
    updateMarks(marks.map((mark) => (
      mark.id === selectedMark.id ? { ...mark, comment } : mark
    )));
  };

  const removeMark = (id: string) => {
    updateMarks(marks.filter((mark) => mark.id !== id));
    if (selectedMarkId === id) setSelectedMarkId(null);
  };

  const removeLastMark = () => {
    const last = marks[marks.length - 1];
    if (last) removeMark(last.id);
  };

  const startLongPress = (id: string) => {
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setSelectedMarkId(id);
      setDeleteMarkId(id);
    }, 650);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => () => cancelLongPress(), []);

  return (
    <Stack spacing={1.25}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700}>Схема повреждений</Typography>
        <Typography variant="body2" color="text.secondary">
          {scheme.title}. Выберите тип повреждения и нажмите на место на схеме.
        </Typography>
      </Box>

      {vehicleType === 'motorcycle' && (
        <Alert severity="warning">
          В договорной схеме нет отдельного шаблона для мото-техники, поэтому открыта общая схема.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75 }}>
        {DAMAGE_CODES.map((item) => (
          <Button
            key={item.code}
            variant={selectedCode === item.code ? 'contained' : 'outlined'}
            onClick={() => setSelectedCode(item.code)}
            sx={{ justifyContent: 'flex-start', minHeight: 40 }}
          >
            {item.code} - {item.label}
          </Button>
        ))}
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">
          Отметок: {marks.length}
        </Typography>
        <Button
          size="small"
          startIcon={<Undo />}
          disabled={marks.length === 0}
          onClick={removeLastMark}
        >
          Отменить последнюю
        </Button>
      </Stack>

      <Box sx={{ overflowX: 'auto', pb: 0.5, WebkitOverflowScrolling: 'touch' }}>
        <Box
          onClick={handlePointer}
          onTouchEnd={handlePointer}
          sx={{
            position: 'relative',
            width: { xs: scheme.minWidth, sm: '100%' },
            maxWidth: { sm: '100%' },
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            touchAction: 'manipulation',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            component="img"
            src={scheme.src}
            alt={scheme.title}
            draggable={false}
            sx={{
              display: 'block',
              width: '100%',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          {marks.map((mark, index) => (
            <Button
              key={mark.id}
              data-damage-marker="true"
              size="small"
              variant={mark.id === selectedMarkId ? 'contained' : 'outlined'}
              onClick={(event) => {
                event.stopPropagation();
                if (longPressTriggeredRef.current) {
                  longPressTriggeredRef.current = false;
                  return;
                }
                setSelectedMarkId(mark.id);
              }}
              onTouchStart={(event) => {
                event.stopPropagation();
                startLongPress(mark.id);
              }}
              onTouchEnd={(event) => {
                event.stopPropagation();
                cancelLongPress();
              }}
              onTouchCancel={(event) => {
                event.stopPropagation();
                cancelLongPress();
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
                startLongPress(mark.id);
              }}
              onMouseUp={(event) => {
                event.stopPropagation();
                cancelLongPress();
              }}
              onMouseLeave={(event) => {
                event.stopPropagation();
                cancelLongPress();
              }}
              sx={{
                position: 'absolute',
                left: `${mark.x}%`,
                top: `${mark.y}%`,
                minWidth: 38,
                width: 38,
                height: 38,
                p: 0,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                fontWeight: 800,
                bgcolor: mark.id === selectedMarkId ? 'primary.main' : 'background.paper',
                boxShadow: 2,
              }}
            >
              {mark.code}{index + 1}
            </Button>
          ))}
        </Box>
      </Box>

      {selectedMark && (
        <Stack spacing={1}>
          <TextField
            fullWidth
            size="small"
            label={`${selectedMark.code} - ${damageCodeLabel(selectedMark.code)}: комментарий`}
            value={selectedMark.comment ?? ''}
            onChange={(event) => updateSelectedComment(event.target.value)}
          />
          <Typography variant="caption" color="text.secondary">
            Для удаления удерживайте отметку на схеме.
          </Typography>
        </Stack>
      )}
      <Dialog open={Boolean(deleteMark)} onClose={() => setDeleteMarkId(null)}>
        <DialogTitle>Удалить отметку?</DialogTitle>
        <DialogContent>
          {deleteMark
            ? `${deleteMark.code} - ${damageCodeLabel(deleteMark.code)}${deleteMark.comment ? `: ${deleteMark.comment}` : ''}`
            : ''}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteMarkId(null)}>Отмена</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (deleteMark) removeMark(deleteMark.id);
              setDeleteMarkId(null);
            }}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
