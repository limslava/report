import { useCallback, useState } from 'react';
import { getContractApprovalSheet } from '../services/api';
import type { ApprovalSheet } from '../types/contracts';

type UseContractSheetOptions = {
  onClearError: () => void;
  onError: (message: string) => void;
};

function sheetErrorMessage(error: any): string {
  return error?.response?.data?.message || error?.message || 'Не удалось загрузить лист согласования';
}

export function useContractSheet({ onClearError, onError }: UseContractSheetOptions) {
  const [sheet, setSheet] = useState<ApprovalSheet | null>(null);

  const loadSheet = useCallback(async (contractId: string) => {
    if (!contractId) {
      setSheet(null);
      return;
    }
    onClearError();
    try {
      const response = await getContractApprovalSheet(contractId);
      setSheet(response.data);
    } catch (error: any) {
      onError(sheetErrorMessage(error));
    }
  }, [onClearError, onError]);

  return {
    sheet,
    setSheet,
    loadSheet,
  };
}
