import {
  Alert, Box, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { formatPlantDateTime } from '../utils/formatters';
import { formatNumber } from '../utils/unitConverters';
import type { GatewaySpareRow } from '../types';

const MAX_COLUMN_PX = 190;
const MIN_COLUMN_PX = 72;   // below this (phones) the table scrolls inside its box instead

const hours = (n: number | null | undefined) => `${formatNumber(n, 1, true)} hrs`;

interface Props {
  spareGrid: GatewaySpareRow[];
  plcConnected: boolean;
  lastScanAt: string | null;
}

/**
 * Spare Part Life — impeller × spare grid from the live snapshot's spareGrid[],
 * one column per impeller present in it. Columns are capped in width and
 * shrink to fit, so every impeller shows without sideways scrolling on a
 * desktop screen.
 */
export default function SpareHealthTable({ spareGrid, plcConnected, lastScanAt }: Props) {
  const impellers = [...new Set(spareGrid.map(r => r.impellerNum))].sort((a, b) => a - b);
  const spares = [...new Map(
    [...spareGrid].sort((a, b) => a.spareIndex - b.spareIndex).map(r => [r.spareIndex, r.spareName] as const)
  )];
  const cells = new Map(spareGrid.map(r => [`${r.impellerNum}:${r.spareIndex}`, r]));
  const columns = impellers.length + 1;

  return (
    <Box>
      <Typography variant="h6" fontWeight={700}>Spare Part Life</Typography>
      <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
        Run hours / replacement limit
      </Typography>
      {!plcConnected && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
          PLC disconnected. Run hours below are the last values read at {formatPlantDateTime(lastScanAt)} and are not advancing.
        </Alert>
      )}

      {spareGrid.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No spare-part data reported.</Typography>
      ) : (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ maxWidth: columns * MAX_COLUMN_PX, mx: 'auto', overflowX: 'auto', borderRadius: 2 }}
        >
          <Table
            size="small"
            sx={{
              tableLayout: 'fixed',
              minWidth: columns * MIN_COLUMN_PX,
              '& td, & th': { px: 0.75 },
              // Column names exactly as the gateway writes them (the app theme uppercases table heads).
              '& th': { textTransform: 'none', letterSpacing: 'normal', fontSize: '0.78rem' },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Spare Part</TableCell>
                {impellers.map(i => (
                  <TableCell key={i} align="center" sx={{ fontWeight: 700 }}>Impeller {i}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {spares.map(([index, name]) => (
                <TableRow key={index}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>{name}</TableCell>
                  {impellers.map(i => {
                    const c = cells.get(`${i}:${index}`);
                    if (!c) return <TableCell key={i} align="center">—</TableCell>;
                    const triggered = c.triggerActive;
                    return (
                      <TableCell
                        key={i}
                        align="center"
                        sx={{ bgcolor: triggered ? 'rgba(239, 68, 68, 0.16)' : undefined, color: triggered ? 'error.main' : undefined }}
                      >
                        <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: triggered ? 700 : 400, display: 'block' }}>
                          {/* A narrow column breaks at the slash, never inside "2,000.0 hrs". */}
                          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{hours(c.currentRunHours)}</Box>
                          {c.thresholdHours !== 0 && (
                            <>{' / '}<Box component="span" sx={{ whiteSpace: 'nowrap' }}>{hours(c.thresholdHours)}</Box></>
                          )}
                        </Typography>
                        {triggered && <Chip label="!" color="error" size="small" sx={{ height: 16, fontSize: 10, mt: 0.25 }} />}
                        {c.lastReplacedAt && !triggered && (
                          <Chip label="✓" color="success" size="small" sx={{ height: 16, fontSize: 10, mt: 0.25 }} />
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
