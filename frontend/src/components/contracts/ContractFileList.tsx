import { Box, Button, Stack, Typography } from '@mui/material';
import type { ContractAttachmentRef } from '../../types/contracts';

type ContractFileListProps = {
  files: ContractAttachmentRef[];
  emptyText?: string;
  emptyVariant?: 'caption' | 'body2';
  canDeleteFile?: (file: ContractAttachmentRef) => boolean;
  onDeleteFile?: (file: ContractAttachmentRef) => void;
  onOpenFile: (file: ContractAttachmentRef) => void;
  upload?: {
    canUpload: boolean;
    disabled?: boolean;
    label: string;
    loadingLabel: string;
    onUpload: (files: FileList | null) => void;
  };
};

export function ContractFileList({
  files,
  emptyText,
  emptyVariant = 'body2',
  canDeleteFile,
  onDeleteFile,
  onOpenFile,
  upload,
}: ContractFileListProps) {
  const showUpload = Boolean(upload?.canUpload);
  const showEmptyText = !files.length && emptyText && !showUpload;

  return (
    <Stack spacing={0.25} alignItems="flex-start">
      {files.length > 0 && (
        <Box className="contract-file-list contract-file-list--compact">
          {files.map((file) => (
            <Box key={file.id} className="contract-file-item">
              <Button
                size="small"
                variant="text"
                className="contract-file-button"
                onClick={() => onOpenFile(file)}
              >
                {file.originalName}
              </Button>
              {canDeleteFile?.(file) && onDeleteFile && (
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  className="contract-file-remove"
                  onClick={() => onDeleteFile(file)}
                >
                  Удалить
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}
      {showEmptyText && (
        <Typography variant={emptyVariant} color="text.secondary">{emptyText}</Typography>
      )}
      {showUpload && upload && (
        <Button
          size="small"
          variant="text"
          component="label"
          disabled={upload.disabled}
          className="contract-file-button"
        >
          {upload.disabled ? upload.loadingLabel : upload.label}
          <input
            hidden
            multiple
            type="file"
            onChange={(event) => {
              upload.onUpload(event.target.files);
              event.target.value = '';
            }}
          />
        </Button>
      )}
    </Stack>
  );
}
