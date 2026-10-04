import { Box, Typography } from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  categoryXAxis, Y_AXIS, CHART_MARGIN, niceScaleOf, xAxisTitle, yAxisTitle,
} from '../utils/chartAxis';
import { PLANT, PLANT_LOCALE } from '../utils/trendBuckets';
import { formatPlantDateTime } from '../utils/formatters';
import type { GatewayShotsBreakdownEntry } from '../types';

interface Props {
  data: GatewayShotsBreakdownEntry[];
  /** Taller inside the expanded dialog than in the page. */
  height?: number;
}

/**
 * Blast cycles run in the interval that ENDED at each shot refill.
 * Copied from the gateway dashboard; the dates are formatted in plant time.
 *
 * A bar's label is the refill that CLOSED the interval, not the one that opened it. The tooltip
 * spells out both ends and the elapsed days, because "129 blasts at 26 Aug 15:42" is meaningless
 * without knowing the window it covers.
 *
 * There is no bar for the interval currently in progress: it has no closing refill yet, so nothing
 * has been written for it.
 *
 * The x-axis is refill EVENTS, not a time axis. Refills are triggered by the hopper crossing its
 * low mark, not by a schedule, so intervals are irregular — anything from hours to several days.
 * Bars are therefore evenly spaced as a SEQUENCE, and the varying interval length is carried in
 * the tooltip rather than in the bar geometry.
 *
 * Labels are DATE ONLY, with a clock time added only to bars that share a date with another.
 */
export default function ShotsBreakdownChart({ data, height = 300 }: Props) {
  if (data.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">No shots breakdown data available.</Typography>
      </Box>
    );
  }

  const dateOf = (iso: string) =>
    new Date(iso).toLocaleDateString(PLANT_LOCALE, { day: 'numeric', month: 'short', ...PLANT });

  // Only disambiguate with a clock time where a date genuinely repeats.
  const dateCounts = new Map<string, number>();
  for (const d of data) {
    const key = dateOf(d.refillTimestamp);
    dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1);
  }

  const chartData = data.map(d => {
    const t = new Date(d.refillTimestamp);
    const date = dateOf(d.refillTimestamp);

    // The opening refill comes from the API. It is NOT data[i-1]: that works for every bar except
    // the first, whose opener has no row of its own — which is exactly why the earliest bar used to
    // be the only one that could not name its own window.
    const prev = d.intervalStartTimestamp ? new Date(d.intervalStartTimestamp) : null;
    const days = prev ? (t.getTime() - prev.getTime()) / 86_400_000 : null;

    return {
      label: (dateCounts.get(date) ?? 0) > 1
        ? `${date} ${t.toLocaleTimeString(PLANT_LOCALE, { hour: '2-digit', minute: '2-digit', ...PLANT })}`
        : date,
      full: prev
        ? `${formatPlantDateTime(prev)} to ${formatPlantDateTime(t)} (${days!.toFixed(1)} days)`
        // Only reachable if this is the very first refill ever recorded, so there is genuinely no
        // earlier refill to open a window against.
        : `interval ending ${formatPlantDateTime(t)} (no earlier refill recorded)`,
      blastCount: d.blastCount,
    };
  });

  const y = niceScaleOf(chartData, d => d.blastCount);

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={CHART_MARGIN} barCategoryGap="12%">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            {...categoryXAxis(chartData.length)}
            dataKey="label"
            label={xAxisTitle('Refill Date')}
          />
          <YAxis
            {...Y_AXIS}
            domain={y.domain}
            ticks={y.ticks}
            allowDecimals={false}
            tickFormatter={(v: number) => v.toLocaleString()}
            label={yAxisTitle('Blast Cycles')}
          />
          <Tooltip
            formatter={(value) => [value != null ? Number(value).toLocaleString() : '—', 'Blast Cycles']}
            labelStyle={{ fontSize: 12 }}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.full ?? ''}
          />
          <Bar dataKey="blastCount" name="Blast Cycles" fill="#1976d2" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
