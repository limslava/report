import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Tab,
  Tabs,
} from '@mui/material';
import ExcelLikePlanTable from './ExcelLikePlanTable';
import { planningV2Api } from '../../services/planning-v2.api';
import { PlanningSegment } from '../../types/planning-v2.types';
import { useAuthStore } from '../../store/auth-store';
import { canBootstrapPlanning, canEditSegment } from '../../utils/rolePermissions';

interface PlanDashboardProps {
  year?: number;
}

const PlanDashboard: React.FC<PlanDashboardProps> = ({ year = new Date().getFullYear() }) => {
  const { user } = useAuthStore();
  const today = new Date();
  const [yearValue, setYearValue] = useState<number>(year);
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const asOfDate = today.toISOString().slice(0, 10);
  const [segments, setSegments] = useState<PlanningSegment[]>([]);
  const [activeSegment, setActiveSegment] = useState<PlanningSegment['code'] | ''>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isEditableForSegment = useMemo(() => {
    if (!activeSegment) {
      return false;
    }
    return canEditSegment(user?.role, activeSegment);
  }, [activeSegment, user?.role]);

  const showSegmentTabs = segments.length > 1;

  const loadSegments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await planningV2Api.getSegments();
      setSegments(data);
      if (!activeSegment && data.length > 0) {
        setActiveSegment(data[0].code);
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки сегментов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSegments();
  }, []);

  const handleBootstrap = async () => {
    try {
      setLoading(true);
      await planningV2Api.bootstrap();
      await loadSegments();
    } catch (err: any) {
      setError(err?.message || 'Ошибка инициализации каталога');
      setLoading(false);
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {(showSegmentTabs || canBootstrapPlanning(user?.role)) && (
        <Paper sx={{ mb: 2 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
            {showSegmentTabs ? (
              <Tabs
                value={activeSegment}
                onChange={(_, next) => setActiveSegment(next)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ flex: 1 }}
              >
                {segments.map((segment) => (
                  <Tab key={segment.code} value={segment.code} label={segment.name} sx={{ textTransform: 'none' }} />
                ))}
              </Tabs>
            ) : (
              <Box />
            )}
            {canBootstrapPlanning(user?.role) && (
              <>
                {showSegmentTabs && <Divider orientation="vertical" flexItem />}
                <Box sx={{ p: 1.5 }}>
                  <Button variant="outlined" onClick={handleBootstrap}>
                    Инициализировать справочники
                  </Button>
                </Box>
              </>
            )}
          </Box>
        </Paper>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      )}

      {!loading && activeSegment && (
        <ExcelLikePlanTable
          segmentCode={activeSegment}
          year={yearValue}
          month={month}
          asOfDate={asOfDate}
          isEditable={isEditableForSegment}
          onYearChange={setYearValue}
          onMonthChange={setMonth}
        />
      )}
    </Box>
  );
};

export default PlanDashboard;
