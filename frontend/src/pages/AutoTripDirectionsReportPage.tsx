import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { Download, Search } from '@mui/icons-material';
import {
  downloadAutoTripDirectionsReport,
  getAutoTripDirectionsReportData,
  type AutoTripDirectionsReportData,
} from '../services/api';
import { downloadBlob } from '../utils/download';

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

const extractFilename = (disposition?: string): string | null => {
  if (!disposition) return null;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded).normalize('NFC');
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return plain?.normalize('NFC') ?? null;
};

export default function AutoTripDirectionsReportPage() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<AutoTripDirectionsReportData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadReportData = async () => {
      try {
        setDataLoading(true);
        setError(null);
        const response = await getAutoTripDirectionsReportData({ year, month });
        if (!cancelled) {
          setReportData(response.data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setReportData(null);
          setError(err?.response?.data?.message || 'Не удалось загрузить данные отчета по направлениям.');
        }
      } finally {
        if (!cancelled) {
          setDataLoading(false);
        }
      }
    };

    void loadReportData();
    return () => {
      cancelled = true;
    };
  }, [month, year]);

  const directions = reportData?.directions ?? [];
  const rows = reportData?.rows ?? [];

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !normalizedQuery
        || row.fio.toLowerCase().includes(normalizedQuery)
        || row.plate.toLowerCase().includes(normalizedQuery)
        || row.note.toLowerCase().includes(normalizedQuery);
      return matchesQuery;
    });
  }, [query, rows]);

  const totalsByDirection = directions.map((item) =>
    filteredRows.reduce((sum, row) => sum + (row.counts[item] ?? 0), 0)
  );
  const grandTotal = totalsByDirection.reduce((sum, value) => sum + value, 0);

  const handleDownload = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await downloadAutoTripDirectionsReport({ year, month });
      const filename = extractFilename(response.headers['content-disposition']) ?? `Автовозы направления ${String(month).padStart(2, '0')}.${year}.xlsx`;
      await downloadBlob(response.data as Blob, filename);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не удалось сформировать отчет по направлениям.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ bgcolor: '#f5f5f5', minHeight: '100%', p: 1.5, pb: 2 }}>
      <Paper sx={{ p: 1.5, width: '100%' }}>
        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '320px 110px 150px minmax(0, 1fr) 210px' },
            gap: 1,
            alignItems: 'center',
          }}
        >
          <TextField
            label="Поиск"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ФИО, Г/Н ТС, примечание"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Год"
            type="number"
            size="small"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          />
          <TextField
            select
            label="Месяц"
            size="small"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
          >
            {monthOptions.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            startIcon={<Download />}
            onClick={handleDownload}
            disabled={loading || dataLoading}
            sx={{
              height: 40,
              px: 2,
              whiteSpace: 'nowrap',
              bgcolor: '#1976d2',
              justifySelf: { xs: 'stretch', md: 'end' },
              gridColumn: { md: 5 },
            }}
          >
            {loading ? 'Формирую...' : 'Скачать Excel'}
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ mt: 1.5, width: '100%', overflow: 'hidden', border: '1px solid #d7dde7' }}>
        <TableContainer>
          <Table
            size="small"
            stickyHeader
            sx={{
              minWidth: 920,
              tableLayout: 'fixed',
              borderCollapse: 'separate',
              borderSpacing: 0,
              '& th, & td': {
                borderRight: '1px solid #d7dde7',
                borderBottom: '1px solid #d7dde7',
                height: 30,
                py: 0.5,
                px: 1,
                fontSize: 13,
                lineHeight: 1.2,
              },
              '& th:last-of-type, & td:last-of-type': {
                borderRight: 0,
              },
              '& tbody tr:last-of-type td': {
                borderBottom: 0,
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#f3f6fb', width: 260 }}>ФИО</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#f3f6fb', width: 130 }}>Г/Н ТС</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#f3f6fb', width: 220 }}>Примечание</TableCell>
                {directions.map((item) => (
                  <TableCell key={item} align="center" sx={{ fontWeight: 700, bgcolor: '#f3f6fb', minWidth: 130 }}>
                    {item}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 700, bgcolor: '#f3f6fb', width: 90 }}>Итого</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((row) => {
                const rowTotal = directions.reduce((sum, item) => sum + (row.counts[item] ?? 0), 0);
                return (
                  <TableRow key={`${row.plate}-${row.fio}`} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{row.fio}</TableCell>
                    <TableCell>{row.plate}</TableCell>
                    <TableCell>{row.note}</TableCell>
                    {directions.map((item) => (
                      <TableCell key={item} align="center">{row.counts[item] ?? 0}</TableCell>
                    ))}
                    <TableCell align="center" sx={{ fontWeight: 700 }}>{rowTotal}</TableCell>
                  </TableRow>
                );
              })}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4 + directions.length} sx={{ height: 56, color: 'text.secondary', bgcolor: '#fff', px: 2 }}>
                    {dataLoading ? 'Загрузка данных...' : 'Данных пока нет.'}
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#f7f8fb' }}>Итого</TableCell>
                <TableCell sx={{ bgcolor: '#f7f8fb' }} />
                <TableCell sx={{ bgcolor: '#f7f8fb' }} />
                {totalsByDirection.map((value, index) => (
                  <TableCell key={directions[index]} align="center" sx={{ fontWeight: 700, bgcolor: '#f7f8fb' }}>
                    {value}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ fontWeight: 800, bgcolor: '#f7f8fb' }}>{grandTotal}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
