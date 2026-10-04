import {
  Box, Button, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ExpandableMetricCard, { type TileChart } from './ExpandableMetricCard';
import { LifetimeTile, TileGrid, orderedParams } from './LifetimeSection';
import UtilityGraph from './UtilityGraph';
import TrendMetricGraph from './TrendMetricGraph';
import CycleDataGraph from './CycleDataGraph';
import ItemProductionGraph from './ItemProductionGraph';
import { FilteredAmpsPanel } from './AmpsPanel';
import { formatPlantDateTime } from '../utils/formatters';
import {
  FILTERED_ORDER, formatNumber, formatParameterValue, paramLabel, parseValue,
} from '../utils/unitConverters';
import { downloadXlsx, type Cell } from '../utils/xlsx';
import type {
  GatewayLifetimeParam, GatewaySection2, GatewaySection2Cycle, GatewaySection2Metal,
} from '../types';

/** A filter the admin applied from this page: the POST /api/admin/filter response and what goes with it. */
export interface AppliedFilter {
  result: GatewaySection2;
  // The parameters computed: the response's selectedParameters, or, from a
  // gateway that does not echo them yet, what the request asked for. null = all.
  selected: string[] | null;
}

/**
 * Which Section 2 tile opens which chart — the gateway dashboard's two maps. The time-only ones
 * are bucketed over the filter window, which a cycle or item filter does not have: those carry a
 * placeholder window, so their tiles show no chart icon at all.
 */
const GRAPHABLE_ALL_MODES: Record<string, string> = {
  production_qty_kg: 'Production per Casting Item',
  energy_kwh_total:  'Energy per Cycle',
};
const GRAPHABLE_TIME_ONLY: Record<string, string> = {
  machine_utility_pct: 'Machine Utility',
  blast_time_sec:      'Blast Time per Interval',
  cycle_count:         'Blast Cycles per Interval',
};

const PERIOD_NAMES: Record<string, string> = {
  hour: 'Hour', shift: 'Shift', day: 'Yesterday', week: 'Week', month: 'Month', year: 'Year',
};

/** The filter's name: "Yesterday", "Year", "Cycles 1–104", "Item: Aluminium" or "Custom range". */
export function filterName(s: GatewaySection2): string {
  if (s.filterBy === 'cycle') return `Cycles ${s.filterCycleFrom}–${s.filterCycleTo}`;
  if (s.filterBy === 'metal') return `Item: ${s.filterMetalName ?? ''}`;
  if (s.periodLabel) return PERIOD_NAMES[s.periodLabel] ?? s.periodLabel.charAt(0).toUpperCase() + s.periodLabel.slice(1);
  return 'Custom range';
}

// Column names exactly as the gateway writes them (the app theme uppercases table heads).
const TABLE_SX = { '& th': { textTransform: 'none', letterSpacing: 'normal', fontSize: '0.78rem' } } as const;

const CYCLE_LOG_PARAMETERS =['energy_kwh_total', 'energy_per_casting_kwh_kg', 'blast_time_sec', 'cycle_count', 'impeller_current'];

type Metal = 1 | 2 | 3 | 4;
const METAL_SLOTS: Metal[] = [1, 2, 3, 4];
const metalName = (c: GatewaySection2Cycle, i: Metal) => c[`metal${i}Name` as const] || null;
const metalWeight = (c: GatewaySection2Cycle, i: Metal) => c[`metal${i}WeightKg` as const];

/** `hkhl · 255.0 kg`; a weight with no name is `unspecified`; `—` only when both are empty. */
function itemCell(c: GatewaySection2Cycle, i: Metal): string {
  const name = metalName(c, i);
  const weight = metalWeight(c, i);
  if (name === null && weight == null) return '—';
  const shown = name ?? 'unspecified';
  return weight == null ? shown : `${shown} · ${formatNumber(weight, 1)} kg`;
}

function ProductionByItem({ metals, total }: { metals: GatewaySection2Metal[]; total: string | undefined }) {
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} mb={1}>Production by Item</Typography>
      {metals.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No casting item weights were declared for the cycles in this filter.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxWidth: 520 }}>
          <Table size="small" sx={TABLE_SX}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Weight (kg)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {metals.map((m, i) => (
                <TableRow key={`${m.metalName}-${i}`}>
                  <TableCell>
                    {m.metalName === 'unspecified' ? <Chip label="unspecified" size="small" variant="outlined" /> : m.metalName}
                  </TableCell>
                  <TableCell align="right">{formatNumber(m.productionKg, 2, true)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{formatNumber(parseValue(total), 2, true)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function CycleLog({ cycles }: { cycles: GatewaySection2Cycle[] }) {
  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={1}>
        <Typography variant="subtitle1" fontWeight={700}>Cycle Log</Typography>
        <Chip label={`${cycles.length} ${cycles.length === 1 ? 'cycle' : 'cycles'}`} size="small" variant="outlined" />
      </Box>
      {cycles.length === 0 ? (
        <Typography color="text.secondary" variant="body2">No completed blast cycles fall within this filter.</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 520 }}>
          <Table size="small" stickyHeader sx={TABLE_SX}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Cycle No.</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Start Time</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>End Time</TableCell>
                {METAL_SLOTS.map(i => <TableCell key={i} sx={{ fontWeight: 700 }}>Item {i}</TableCell>)}
                <TableCell sx={{ fontWeight: 700 }} align="right">Tonnage Produced (kg)</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Energy (kWh)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cycles.map(c => (
                <TableRow key={c.cycleNumber}>
                  <TableCell>{c.cycleNumber}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatPlantDateTime(c.blastStart)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatPlantDateTime(c.blastEnd)}</TableCell>
                  {METAL_SLOTS.map(i => <TableCell key={i}>{itemCell(c, i)}</TableCell>)}
                  <TableCell align="right">{formatNumber(c.productionKg, 2)}</TableCell>
                  <TableCell align="right">{formatNumber(c.energyKwh, 3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

/** The three-sheet workbook: Parameters, Item Production and Cycles. */
function exportWorkbook(clientName: string, s: GatewaySection2, tiles: { label: string; value: string }[]) {
  const total = s.results.find(r => r.parameterName === 'production_qty_kg')?.value;
  const cycleHeader: Cell[] = ['Cycle No.', 'Start Time', 'End Time'];
  for (const i of METAL_SLOTS) cycleHeader.push(`Item ${i}`, `Item ${i} (kg)`);
  cycleHeader.push('Tonnage Produced (kg)', 'Energy (kWh)');

  downloadXlsx(
    [
      { name: 'Parameters', rows: [['Parameter', 'Value'], ...tiles.map(t => [t.label, t.value])] },
      {
        name: 'Item Production',
        rows: [
          ['Item', 'Weight (kg)'],
          ...s.metals.map(m => [m.metalName, m.productionKg]),
          ...(s.metals.length > 0 ? [['Total', Number.isFinite(parseValue(total)) ? parseValue(total) : null]] : []),
        ],
      },
      {
        name: 'Cycles',
        rows: [
          cycleHeader,
          ...s.cycles.map(c => {
            const row: Cell[] = [c.cycleNumber, formatPlantDateTime(c.blastStart), formatPlantDateTime(c.blastEnd)];
            for (const i of METAL_SLOTS) {
              const weight = metalWeight(c, i);
              row.push(metalName(c, i) ?? (weight == null ? null : 'unspecified'), weight);
            }
            row.push(c.productionKg, c.energyKwh);
            return row;
          }),
        ],
      },
    ],
    `${clientName} - Filtered Parameters - ${filterName(s)}.xlsx`
  );
}

interface Props {
  clientId: string;
  clientName: string;
  lifetime: GatewayLifetimeParam[];
  applied: AppliedFilter | null;
}

/**
 * Filtered Parameters. Until a filter is applied it shows the lifetime values
 * (nothing is calculated until Apply is pressed); after, the POST
 * /api/admin/filter result and the tables for the parameters it computed.
 */
export default function FilteredParameters({ clientId, clientName, lifetime, applied }: Props) {
  if (!applied) {
    return (
      <Box>
        <Typography variant="h6" fontWeight={700}>Filtered Parameters</Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={2}>No filter applied</Typography>
        <TileGrid>
          {orderedParams(lifetime, FILTERED_ORDER).map(p => (
            <LifetimeTile key={p.parameterName} param={p} clientId={clientId} />
          ))}
        </TileGrid>
      </Box>
    );
  }

  const { result: s, selected } = applied;
  const has = (key: string) => !selected || selected.length === 0 || selected.includes(key);
  const byName = new Map(s.results.map(r => [r.parameterName, r.value]));

  // A cycle or item filter carries a placeholder time window, so the bucketed charts cannot be
  // drawn for it — exactly as on the gateway dashboard.
  const isTimeFilter = s.filterBy === 'time';
  const title = (name: string) =>
    GRAPHABLE_ALL_MODES[name] ?? (isTimeFilter ? GRAPHABLE_TIME_ONLY[name] : undefined);

  function chartFor(name: string): TileChart | undefined {
    const dialogTitle = title(name);
    if (!dialogTitle) return undefined;
    switch (name) {
      case 'machine_utility_pct':
        return { title: dialogTitle, render: () => <UtilityGraph clientId={clientId} windowStart={s.filterStart} windowEnd={s.filterEnd} /> };
      case 'production_qty_kg':
        return { title: dialogTitle, render: () => <ItemProductionGraph items={s.metals} /> };
      case 'energy_kwh_total':
        return { title: dialogTitle, render: () => <CycleDataGraph cycles={s.cycles} /> };
      // Blast time and cycle count are bucketed over the filter window, the same series and the
      // same component Section 1 uses — so the two sections show the same shape at two scopes.
      case 'blast_time_sec':
        return { title: dialogTitle, render: () => <TrendMetricGraph clientId={clientId} metric="blastTime" windowStart={s.filterStart} windowEnd={s.filterEnd} /> };
      case 'cycle_count':
        return { title: dialogTitle, render: () => <TrendMetricGraph clientId={clientId} metric="cycleCount" windowStart={s.filterStart} windowEnd={s.filterEnd} /> };
      default:
        return undefined;
    }
  }
  const tiles = FILTERED_ORDER.filter(name => byName.has(name)).map(name => ({
    name,
    label: paramLabel(name, true),
    value: formatParameterValue(name, byName.get(name)),
  }));

  return (
    <Box>
      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2} mb={2}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Filtered Parameters</Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {s.filterBy === 'time'
              ? `${formatPlantDateTime(s.filterStart)} to ${formatPlantDateTime(s.filterEnd)}`
              : filterName(s)}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FileDownloadIcon />}
          onClick={() => exportWorkbook(clientName, s, tiles)}
          sx={{ borderRadius: 2, fontWeight: 700, flexShrink: 0 }}
        >
          Export
        </Button>
      </Box>

      {s.filterBy === 'metal' && (
        <Box mb={2}>
          <Chip label={`Casting item: ${s.filterMetalName ?? ''}`} size="small" variant="outlined" sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Every value below is computed from only the cycles that declared this item. Machine Utility is not
            shown: machine on-time is not attributable to a single item.
          </Typography>
        </Box>
      )}

      {tiles.length > 0 && (
        <TileGrid>
          {tiles.map(t => <ExpandableMetricCard key={t.name} label={t.label} value={t.value} chart={chartFor(t.name)} />)}
        </TileGrid>
      )}

      <Box display="flex" flexDirection="column" gap={4} mt={4}>
        {has('production_qty_kg') && <ProductionByItem metals={s.metals} total={byName.get('production_qty_kg')} />}
        {CYCLE_LOG_PARAMETERS.some(has) && <CycleLog cycles={s.cycles} />}
        {has('impeller_current') && s.amps && (
          <FilteredAmpsPanel key={s.requestId} clientId={clientId} requestId={s.requestId} amps={s.amps} />
        )}
      </Box>
    </Box>
  );
}
