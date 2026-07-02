import { Box, Typography } from '@mui/material';
import type { SheetStep } from '../../types/contracts';

type ContractProcessTimelineProps = {
  mainSteps: SheetStep[];
  secretaryStep: SheetStep | null;
  contractId: string;
  completedMainSteps: number;
  renderProcessStep: (step: SheetStep, contractId: string, expanded?: boolean, allowUpload?: boolean) => JSX.Element;
};

export function ContractProcessTimeline({
  mainSteps,
  secretaryStep,
  contractId,
  completedMainSteps,
  renderProcessStep,
}: ContractProcessTimelineProps) {
  return (
    <Box className="contract-card-section contract-process">
      <Typography variant="body2" className="contract-card-section-title">Ход согласования</Typography>
      {!!mainSteps.length && (
        <Box className="contract-process-group">
          <Box className="contract-process-group-heading">
            <Box>
              <Typography variant="body2">Параллельное согласование</Typography>
              <Typography variant="caption" className="contract-process-note">
                {mainSteps.length > 1
                  ? 'Участники согласуют договор параллельно'
                  : 'Согласование перед передачей офис-менеджеру'}
              </Typography>
            </Box>
            <Typography variant="caption" className="contract-process-progress">
              {completedMainSteps} из {mainSteps.length} обработано
            </Typography>
          </Box>
          <Box className="contract-process-participants">
            {mainSteps.map((step) => renderProcessStep(step, contractId))}
          </Box>
        </Box>
      )}
      {secretaryStep && (
        <Box className="contract-process-group">
          <Box className="contract-process-group-heading">
            <Typography variant="body2">Передача на подпись</Typography>
            <Typography variant="caption" className="contract-process-progress">
              {secretaryStep.decision ? 'Подписание подтверждено' : 'На подписи'}
            </Typography>
          </Box>
          {renderProcessStep(secretaryStep, contractId, false, false)}
        </Box>
      )}
    </Box>
  );
}
