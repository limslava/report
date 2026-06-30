import {
  AddPhotoAlternate,
  CameraAlt,
  CheckCircle,
  Delete,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { ChangeEvent } from 'react';
import {
  WAREHOUSE_PHOTO_CHECKLIST_ITEMS,
  WarehousePhotoChecklistItem,
} from '../../constants/warehouse';

export interface WarehousePhotoChecklistPreview {
  id?: string | number;
  checklistItem?: string | null;
  previewUrl?: string;
}

interface Props {
  photos: WarehousePhotoChecklistPreview[];
  disabled?: boolean;
  onFiles: (files: File[], checklistItem: WarehousePhotoChecklistItem) => void;
  onRemove?: (photo: WarehousePhotoChecklistPreview) => void;
}

export const buildPhotoChecklistState = (
  photos: Array<{ checklistItem?: string | null }>,
): Record<string, boolean> => Object.fromEntries(
  WAREHOUSE_PHOTO_CHECKLIST_ITEMS.map(([key]) => [
    key,
    photos.some((photo) => photo.checklistItem === key),
  ]),
);

export default function WarehousePhotoChecklist({
  photos,
  disabled = false,
  onFiles,
  onRemove,
}: Props) {
  const state = buildPhotoChecklistState(photos);
  const done = Object.values(state).filter(Boolean).length;

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>,
    checklistItem: WarehousePhotoChecklistItem,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) onFiles(files, checklistItem);
  };

  return (
    <Stack spacing={1.5}>
      <Alert severity={done === WAREHOUSE_PHOTO_CHECKLIST_ITEMS.length ? 'success' : 'info'}>
        Фото-чеклист: закрыто {done} из {WAREHOUSE_PHOTO_CHECKLIST_ITEMS.length}. Галочки ставятся автоматически после добавления фото в нужный ракурс.
      </Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
        {WAREHOUSE_PHOTO_CHECKLIST_ITEMS.map(([key, label]) => {
          const slotPhotos = photos.filter((photo) => photo.checklistItem === key);
          const completed = slotPhotos.length > 0;
          return (
            <Box
              key={key}
              sx={{
                border: 1,
                borderColor: completed ? 'success.main' : 'divider',
                borderRadius: 1,
                p: 1.25,
                minWidth: 0,
                overflow: 'hidden',
                bgcolor: completed ? 'success.50' : 'background.paper',
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CheckCircle color={completed ? 'success' : 'disabled'} fontSize="small" />
                    <Typography fontWeight={600}>{label}</Typography>
                  </Stack>
                  <Chip size="small" label={completed ? `Фото: ${slotPhotos.length}` : 'Нужно фото'} />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button component="label" size="small" variant="contained" startIcon={<CameraAlt />} disabled={disabled}>
                    Камера
                    <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => handleChange(event, key)} />
                  </Button>
                  <Button component="label" size="small" variant="outlined" startIcon={<AddPhotoAlternate />} disabled={disabled}>
                    Галерея
                    <input hidden type="file" accept="image/*" multiple onChange={(event) => handleChange(event, key)} />
                  </Button>
                </Stack>
                {slotPhotos.some((photo) => photo.previewUrl) && (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: 'repeat(2, minmax(0, 1fr))',
                        sm: 'repeat(3, minmax(0, 1fr))',
                      },
                      gap: 0.75,
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {slotPhotos.filter((photo) => photo.previewUrl).slice(0, 6).map((photo, index) => (
                      <Box
                        key={photo.id ?? `${key}-${index}`}
                        sx={{
                          position: 'relative',
                          aspectRatio: '4 / 3',
                          minWidth: 0,
                          overflow: 'hidden',
                          borderRadius: 1,
                        }}
                      >
                        <Box
                          component="img"
                          src={photo.previewUrl}
                          alt={`${label} ${index + 1}`}
                          sx={{
                            display: 'block',
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                        {onRemove && (
                          <IconButton
                            size="small"
                            color="error"
                            disabled={disabled}
                            onClick={() => onRemove(photo)}
                            sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'background.paper' }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}
