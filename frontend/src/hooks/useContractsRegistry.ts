import { useCallback, useState } from 'react';
import { getContracts } from '../services/api';
import type { ContractRecord } from '../types/contracts';

type UseContractsRegistryOptions = {
  onClearError: () => void;
  onError: (message: string) => void;
};

function contractErrorMessage(error: any): string {
  return error?.response?.data?.message || error?.message || 'Не удалось загрузить договоры';
}

export function useContractsRegistry({ onClearError, onError }: UseContractsRegistryOptions) {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [registrySearch, setRegistrySearch] = useState('');
  const [selectedContractId, setSelectedContractId] = useState('');

  const loadRegistryData = useCallback(async (): Promise<ContractRecord[]> => {
    const contractsRes = await getContracts();
    const data = Array.isArray(contractsRes.data) ? contractsRes.data : [];
    setContracts(data);
    setSelectedContractId((current) => current || data[0]?.id || '');
    return data;
  }, []);

  const loadRegistry = useCallback(async () => {
    onClearError();
    try {
      await loadRegistryData();
    } catch (error: any) {
      onError(contractErrorMessage(error));
    }
  }, [loadRegistryData, onClearError, onError]);

  const refreshRegistryUntilContains = useCallback(async (contractId: string, attempts = 4) => {
    for (let i = 0; i < attempts; i += 1) {
      const data = await loadRegistryData();
      if (data.some((contract) => contract.id === contractId)) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    return false;
  }, [loadRegistryData]);

  return {
    contracts,
    setContracts,
    registrySearch,
    setRegistrySearch,
    selectedContractId,
    setSelectedContractId,
    loadRegistryData,
    loadRegistry,
    refreshRegistryUntilContains,
  };
}
