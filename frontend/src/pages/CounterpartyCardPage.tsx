import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import api from '../services/api';
import DirectoriesPage from './DirectoriesPage';

/** Карточка контрагента: реквизиты + его водители/техника/прицепы. */

type CounterpartyInfo = {
  id: string;
  inn: string;
  nameFull: string;
  nameShort: string;
};

export default function CounterpartyCardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [counterparty, setCounterparty] = useState<CounterpartyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<CounterpartyInfo>(`/directories/counterparties/${id}`)
      .then((response) => setCounterparty(response.data))
      .catch((loadError) => {
        const anyError = loadError as any;
        setError(anyError?.response?.data?.message || 'Контрагент не найден');
      });
  }, [id]);

  if (!id) return null;
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">{error}</Typography>
        <button type="button" className="ops-btn ghost" style={{ marginTop: 12 }} onClick={() => navigate('/directories/counterparties')}>
          ← К списку контрагентов
        </button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ px: 2, pt: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <button type="button" className="ops-btn ghost" onClick={() => navigate('/directories/counterparties')}>
          ← Контрагенты
        </button>
        <Typography variant="caption" color="text.secondary">
          {counterparty ? `ИНН ${counterparty.inn}` : ''}
        </Typography>
      </Box>
      <DirectoriesPage
        counterpartyId={id}
        counterpartyName={counterparty ? counterparty.nameShort || counterparty.nameFull : undefined}
      />
    </Box>
  );
}
