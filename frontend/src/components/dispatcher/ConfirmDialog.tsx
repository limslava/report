import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

export type ConfirmRequest = {
  title: string;
  text?: string;
  confirmLabel: string;
  /** удаление и другие необратимые действия — красная кнопка */
  danger?: boolean;
  onConfirm: () => void;
};

/**
 * Подтверждение внутри страницы вместо window.confirm: браузерное окно пользователь может
 * отключить («больше не показывать»), и тогда оно молча отвечает «Отмена» — строки не удалялись.
 */
export default function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <Dialog
      open={Boolean(request)}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, width: 420, maxWidth: 'calc(100% - 32px)' } }}
    >
      <DialogTitle sx={{ pb: request?.text ? 1 : 2, px: 3, fontWeight: 600 }}>{request?.title}</DialogTitle>
      {request?.text && (
        <DialogContent sx={{ fontSize: 14, color: '#3d4757', px: 3 }}>{request.text}</DialogContent>
      )}
      <DialogActions
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 1,
          px: 3,
          pb: 2.5,
          '& > :not(style) ~ :not(style)': { ml: 0 },
          '& .MuiButton-root': { textTransform: 'none', fontSize: 14, fontWeight: 600, py: 0.9, whiteSpace: 'nowrap' },
        }}
      >
        <Button variant="outlined" color="inherit" sx={{ color: '#4b5563', borderColor: '#d1d5db' }} onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="contained"
          color={request?.danger ? 'error' : 'primary'}
          disableElevation
          autoFocus
          onClick={() => {
            request?.onConfirm();
            onClose();
          }}
        >
          {request?.confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
