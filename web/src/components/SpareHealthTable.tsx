import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Typography, Chip,
} from '@mui/material';
import type { GatewaySpareAlert } from '../types';
import { formatRunHours } from '../utils/unitConverters';

interface Props {
  alerts: GatewaySpareAlert[];
}

/**
 * Mirrors the client dashboard's spare-health table styling. The admin API
 * only exposes ACTIVE alerts (not the full grid), so each row is one alert.
 */
export default function SpareHealthTable({ alerts }: Props) {
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Spare Parts Health</Typography>

      {alerts.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No active spare alerts.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, minWidth: 150 }}>Spare Part</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, minWidth: 110 }}>Impeller</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, minWidth: 110 }}>Run Hours</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, minWidth: 110 }}>Threshold</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, minWidth: 110 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((a) => (
                <TableRow key={`${a.impeller}-${a.spareIndex}`}>
                  <TableCell sx={{ fontWeight: 600 }}>{a.spareName}</TableCell>
                  <TableCell align="center">Imp {a.impeller}</TableCell>
                  <TableCell align="center" sx={{ bgcolor: 'error.light', verticalAlign: 'middle' }}>
                    <Typography variant="caption" display="block" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                      {formatRunHours(a.runHours)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="caption" display="block" sx={{ fontSize: '0.72rem' }}>
                      {formatRunHours(a.thresholdHours)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label="!" color="error" size="small" sx={{ height: 14, fontSize: 9 }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
