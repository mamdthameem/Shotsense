import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Typography, Chip, Alert,
} from '@mui/material';
import type { GatewaySpareRow } from '../types';
import { withUnit } from '../utils/unitConverters';
import { SelectedImpellersNote } from './AmpsPanel';

interface Props {
  spareGrid: GatewaySpareRow[];
  spareAlerts: GatewaySpareRow[];
  selected?: number[];   // live.impellers.selected, when the gateway sends it
}

/**
 * Spare-health grid — mirrors the client dashboard's impeller × spare table,
 * fed by the live snapshot's `spareGrid[]`. Only the impellers the gateway is
 * set to show are included, so there may be fewer than 10 columns. Triggered
 * cells are highlighted exactly as on the local dashboard. `spareAlerts[]` is
 * surfaced as a summary banner above the grid. Hours are shown exactly as sent.
 */
export default function SpareHealthTable({ spareGrid, spareAlerts, selected }: Props) {
  // Preserve gateway ordering (by impellerNum, spareIndex) to derive the row set.
  const spareNames = Array.from(
    new Map(
      [...spareGrid]
        .sort((a, b) => a.spareIndex - b.spareIndex)
        .map(r => [r.spareName, r.spareIndex] as const)
    ).keys()
  );
  // Columns: the gateway's selected list when sent, otherwise whatever impellers the rows cover.
  const impellers = [...new Set(selected ?? spareGrid.map(r => r.impellerNum))].sort((a, b) => a - b);
  const cell = (imp: number, spare: string) =>
    spareGrid.find(r => r.impellerNum === imp && r.spareName === spare);

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: selected ? 0.5 : 2 }}>Spare Parts Health</Typography>
      <SelectedImpellersNote selected={selected} />

      {spareAlerts.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
          {spareAlerts.length} active maintenance alert{spareAlerts.length === 1 ? '' : 's'}:{' '}
          {spareAlerts
            .map(a => `Imp ${a.impellerNum} ${a.spareName} (${withUnit(a.currentRunHours, 'h')} / ${withUnit(a.thresholdHours, 'h')})`)
            .join(', ')}
        </Alert>
      )}

      {spareGrid.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No spare-health data reported.</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, minWidth: 150 }}>Spare Part</TableCell>
                {impellers.map(i => (
                  <TableCell key={i} align="center" sx={{ fontWeight: 700, minWidth: 110 }}>
                    Imp {i}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {spareNames.map(spare => (
                <TableRow key={spare}>
                  <TableCell sx={{ fontWeight: 600 }}>{spare}</TableCell>
                  {impellers.map(i => {
                    const c = cell(i, spare);
                    if (!c) return <TableCell key={i} align="center">—</TableCell>;

                    const noThreshold = c.thresholdHours === 0;
                    const triggered = c.triggerActive;
                    const replaced = c.lastReplacedAt !== null;

                    const runStr = withUnit(c.currentRunHours, 'h');
                    const display = noThreshold
                      ? runStr
                      : `${runStr} / ${withUnit(c.thresholdHours, 'h')}`;

                    return (
                      <TableCell
                        key={i}
                        align="center"
                        sx={{ bgcolor: triggered ? 'error.light' : 'inherit', verticalAlign: 'middle' }}
                      >
                        <Typography
                          variant="caption"
                          display="block"
                          sx={{ fontWeight: triggered ? 700 : 400, fontSize: '0.72rem' }}
                        >
                          {display}
                        </Typography>
                        {triggered && (
                          <Chip label="!" color="error" size="small"
                            sx={{ height: 14, fontSize: 9, mt: 0.25 }} />
                        )}
                        {replaced && !triggered && (
                          <Chip label="✓" color="success" size="small"
                            sx={{ height: 14, fontSize: 9, mt: 0.25 }} />
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
