import { Box, Paper, Typography } from '@mui/material';

export default function ContractApprovalPage() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Согласование договоров
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Раздел в разработке. Здесь будет бизнес-процесс согласования договоров.
        </Typography>
      </Paper>
    </Box>
  );
}
