import { FormEvent, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { lookupSinokorBl } from '../services/api';

type SinokorData = {
  blNo: string;
  bookingStatus: string | null;
  issueStatus: string | null;
  receiptStatus: string | null;
  service: string | null;
  vessel: string | null;
  voyage: string | null;
  polCode: string | null;
  pol: string | null;
  loadingTerminal: string | null;
  podCode: string | null;
  pod: string | null;
  dischargeTerminal: string | null;
  etd: string | null;
  eta: string | null;
  containers: string[];
};

type SinokorResponse = {
  found: boolean;
  blNo: string;
  sourceUrl: string;
  fetchedAt: string;
  upstream: {
    status: number;
    ok: boolean;
    contentType: string | null;
  };
  data: SinokorData | null;
  diagnostics?: {
    code: string;
    message: string;
    preview?: string;
  };
};

const fieldLabels: Array<[keyof SinokorData, string]> = [
  ['blNo', 'B/L No.'],
  ['bookingStatus', 'B/K Status'],
  ['issueStatus', 'Issue status'],
  ['receiptStatus', 'Receipt Status'],
  ['service', 'Service'],
  ['vessel', 'Vessel'],
  ['voyage', 'Voyage'],
  ['pol', 'POL'],
  ['polCode', 'POL code'],
  ['loadingTerminal', 'Loading terminal'],
  ['pod', 'POD'],
  ['podCode', 'POD code'],
  ['dischargeTerminal', 'Discharge terminal'],
  ['etd', 'ETD'],
  ['eta', 'ETA'],
];

export default function SinokorTestPage() {
  const [blNo, setBlNo] = useState('SNKO010250607766');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SinokorResponse | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = blNo.trim().toUpperCase();
    if (!value) return;

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const response = await lookupSinokorBl(value, true);
      setResult(response.data as SinokorResponse);
    } catch (err: any) {
      const message =
        err?.response?.data?.diagnostics?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Не удалось получить данные Sinokor';
      setError(message);
      if (err?.response?.data) {
        setResult(err.response.data as SinokorResponse);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 1, fontWeight: 700 }}>
        Sinokor BL Test
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Тестовая страница для проверки чтения данных с eBiz Sinokor по номеру B/L.
      </Typography>

      <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2.5, mb: 2, display: 'flex', gap: 2 }}>
        <TextField
          label="B/L No."
          value={blNo}
          onChange={(event) => setBlNo(event.target.value.toUpperCase())}
          fullWidth
          inputProps={{ maxLength: 40 }}
        />
        <Button type="submit" variant="contained" disabled={loading} sx={{ minWidth: 160 }}>
          {loading ? 'Проверяем...' : 'Проверить'}
        </Button>
      </Paper>

      {loading && (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {result && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Результат
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upstream: HTTP {result.upstream.status || 'n/a'} · {result.sourceUrl}
          </Typography>

          {result.data ? (
            <>
              <Table size="small" sx={{ mb: 2 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Поле</TableCell>
                    <TableCell>Значение</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fieldLabels.map(([key, label]) => (
                    <TableRow key={key}>
                      <TableCell sx={{ width: 240, fontWeight: 600 }}>{label}</TableCell>
                      <TableCell>{String(result.data?.[key] || '—')}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Containers</TableCell>
                    <TableCell>{result.data.containers.length ? result.data.containers.join(', ') : '—'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          ) : (
            <Alert severity="info">Данные по этому B/L не распознаны.</Alert>
          )}

          {result.diagnostics?.preview && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Debug preview
              </Typography>
              <Box
                component="pre"
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: '#f6f7f9',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 260,
                  overflow: 'auto',
                  fontSize: 12,
                }}
              >
                {result.diagnostics.preview}
              </Box>
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
}
