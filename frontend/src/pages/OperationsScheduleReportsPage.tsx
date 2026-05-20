import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import { downloadOperationsPreviewReport } from '../services/api';
import type { OperationsPreviewLocation, OperationsPreviewSection } from '../services/api';
import { downloadBlob } from '../utils/download';

type ReportSection = Exclude<OperationsPreviewSection, 'efficiency'>;
type ReportCity = 'vvo' | 'mow';
type ReportDepartment = 'dispatch' | 'garage';

type SelectOption<T extends string> = {
  value: T;
  label: string;
};

const departmentOptionsByCity: Record<ReportCity, Array<SelectOption<ReportDepartment>>> = {
  vvo: [
    { value: 'dispatch', label: 'Диспетчерский отдел' },
    { value: 'garage', label: 'Гараж' },
  ],
  mow: [
    { value: 'dispatch', label: 'Диспетчерский отдел' },
  ],
};

const sectionOptionsByDepartment: Record<ReportDepartment, Array<SelectOption<ReportSection>>> = {
  dispatch: [
    { value: 'containers', label: 'Контейнеровозы' },
    { value: 'auto', label: 'Автовозы' },
    { value: 'dispatchers', label: 'Диспетчера' },
    { value: 'couriers', label: 'Оперативники' },
  ],
  garage: [
    { value: 'mechanics', label: 'Автослесарь' },
  ],
};


const monthOptions = [
  { value: 1, label: 'Январь' },
  { value: 2, label: 'Февраль' },
  { value: 3, label: 'Март' },
  { value: 4, label: 'Апрель' },
  { value: 5, label: 'Май' },
  { value: 6, label: 'Июнь' },
  { value: 7, label: 'Июль' },
  { value: 8, label: 'Август' },
  { value: 9, label: 'Сентябрь' },
  { value: 10, label: 'Октябрь' },
  { value: 11, label: 'Ноябрь' },
  { value: 12, label: 'Декабрь' },
];

const modeOptions: Array<SelectOption<'plan' | 'fact'>> = [
  { value: 'fact', label: 'Факт' },
  { value: 'plan', label: 'План' },
];

const extractFilename = (disposition?: string): string | null => {
  if (!disposition) return null;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded).normalize('NFC');
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return plain?.normalize('NFC') ?? null;
};

export default function OperationsScheduleReportsPage() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [city, setCity] = useState<ReportCity>('vvo');
  const [departments, setDepartments] = useState<ReportDepartment[]>(['dispatch', 'garage']);
  const [sections, setSections] = useState<ReportSection[]>(['containers', 'auto', 'dispatchers', 'couriers', 'mechanics']);
  const [modes, setModes] = useState<Array<'plan' | 'fact'>>(['fact', 'plan']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableDepartments = departmentOptionsByCity[city];
  const availableDepartmentValues = availableDepartments.map((item) => item.value);
  const availableSections = availableDepartments
    .filter((department) => departments.includes(department.value))
    .flatMap((department) => sectionOptionsByDepartment[department.value])
    .filter((option, index, options) => options.findIndex((item) => item.value === option.value) === index)
    .filter((option) => !(city === 'mow' && option.value === 'auto'));
  const availableSectionValues = availableSections.map((item) => item.value);

  const effectiveDepartments = departments.filter((department) => availableDepartmentValues.includes(department));
  const effectiveSections = sections.filter((section) => availableSectionValues.includes(section));
  const effectiveModes = modes;

  const locations: OperationsPreviewLocation[] = effectiveDepartments.map((department) => {
    if (city === 'mow') return 'ktk_mow';
    return department === 'garage' ? 'garage_vvo' : 'ktk_vvo';
  });

  const selectedSheetsCount = locations.reduce((count, locationValue) => {
    return count + effectiveSections.reduce((sectionCount, sectionValue) => {
      if (locationValue === 'ktk_mow' && (sectionValue === 'auto' || sectionValue === 'mechanics')) return sectionCount;
      if (locationValue === 'garage_vvo' && sectionValue !== 'mechanics') return sectionCount;
      if (locationValue === 'ktk_vvo' && sectionValue === 'mechanics') return sectionCount;
      return sectionCount + (sectionValue === 'containers' || sectionValue === 'mechanics' ? effectiveModes.length : 1);
    }, 0);
  }, 0);

  const toggleValue = <T extends string>(value: T, selected: T[], setter: (next: T[]) => void) => {
    setter(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  const handleCityChange = (nextCity: ReportCity) => {
    setCity(nextCity);
    if (nextCity === 'mow') {
      setDepartments(['dispatch']);
      setSections(['containers', 'dispatchers', 'couriers']);
    } else {
      setDepartments(['dispatch', 'garage']);
      setSections(['containers', 'auto', 'dispatchers', 'couriers', 'mechanics']);
    }
  };

  const handleDepartmentsChange = (department: ReportDepartment) => {
    const isSelected = departments.includes(department);
    const nextDepartments = isSelected
      ? departments.filter((item) => item !== department)
      : [...departments, department];
    const nextAvailableSections = nextDepartments
      .filter((item) => availableDepartmentValues.includes(item))
      .flatMap((item) => sectionOptionsByDepartment[item])
      .map((item) => item.value)
      .filter((section) => !(city === 'mow' && section === 'auto'));
    setDepartments(nextDepartments);
    setSections((prev) => {
      const filtered = prev.filter((section) => nextAvailableSections.includes(section));
      if (department === 'garage' && !isSelected && !filtered.includes('mechanics')) {
        return [...filtered, 'mechanics'];
      }
      return filtered;
    });
  };

  const handleDownload = async () => {
    if (locations.length === 0 || effectiveSections.length === 0 || effectiveModes.length === 0) {
      setError('Выберите подразделение, направление и режим.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await downloadOperationsPreviewReport({ year, month, city, locations, sections: effectiveSections, modes: effectiveModes });
      const filename = extractFilename(response.headers['content-disposition']) ?? `Графики работы - ${String(month).padStart(2, '0')}.${year}.xlsx`;
      await downloadBlob(response.data as Blob, filename);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось сформировать отчет. Проверьте фильтры и попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  };

  const renderCheckboxGroup = <T extends string>(
    options: Array<SelectOption<T>>,
    selected: T[],
    onToggle: (value: T) => void,
  ) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4, rowGap: 0.5 }}>
      {options.map((item) => (
        <FormControlLabel
          key={item.value}
          control={<Checkbox checked={selected.includes(item.value)} onChange={() => onToggle(item.value)} />}
          label={item.label}
        />
      ))}
    </Box>
  );

  return (
    <Box sx={{ p: 2 }}>
      <Paper sx={{ p: 3, width: '100%', maxWidth: 'none' }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
          Отчеты по графикам работы
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Сначала выберите локацию. После этого доступны только подходящие подразделения и направления.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            label="Год"
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            sx={{ width: 160 }}
          />
          <TextField
            select
            label="Месяц"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            sx={{ width: 180 }}
          >
            {monthOptions.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>1. Локация</Typography>
        <FormControl>
          <RadioGroup row value={city} onChange={(event) => handleCityChange(event.target.value as ReportCity)}>
            <FormControlLabel value="vvo" control={<Radio />} label="Владивосток" />
            <FormControlLabel value="mow" control={<Radio />} label="Москва" />
          </RadioGroup>
        </FormControl>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>2. Подразделение</Typography>
        {renderCheckboxGroup(availableDepartments, effectiveDepartments, handleDepartmentsChange)}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>3. Направления</Typography>
        {availableSections.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {departments.includes('dispatch') && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 4, rowGap: 0.5 }}>
                {availableSections
                  .filter((item) => item.value !== 'mechanics')
                  .map((item) => (
                    <FormControlLabel
                      key={item.value}
                      control={(
                        <Checkbox
                          checked={effectiveSections.includes(item.value)}
                          onChange={() => toggleValue(item.value, sections, setSections)}
                        />
                      )}
                      label={item.label}
                      sx={{ minWidth: 190 }}
                    />
                  ))}
              </Box>
            )}
            {city === 'vvo' && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 4, rowGap: 0.5 }}>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={departments.includes('garage')}
                      disabled
                    />
                  )}
                  label="Автослесарь"
                  sx={{ minWidth: 190, opacity: departments.includes('garage') ? 1 : 0.55 }}
                />
              </Box>
            )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">Сначала выберите подразделение.</Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>4. Режим</Typography>
        {renderCheckboxGroup(modeOptions, effectiveModes, (value) => toggleValue(value, modes, setModes))}

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            Будет создано листов: <Typography component="span" color="text.primary" fontWeight={600}>{selectedSheetsCount}</Typography>
          </Typography>
          <Button variant="contained" onClick={handleDownload} disabled={loading || selectedSheetsCount === 0}>
            {loading ? 'Формирую...' : 'Скачать Excel'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
