import { Box, Typography } from '@mui/material';

/**
 * Заголовок складских страниц: на телефоне компактный (заголовки-гиганты
 * съедали пол-экрана — замечание тестирования 09.09), подзаголовок на
 * телефоне скрывается.
 */
export default function WarehousePageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box>
      <Typography
        component="h1"
        sx={{ fontSize: { xs: 20, sm: 26, md: 32 }, fontWeight: 700, lineHeight: 1.2 }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography
          color="text.secondary"
          sx={{ display: { xs: 'none', sm: 'block' }, mt: 0.25 }}
        >
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}
