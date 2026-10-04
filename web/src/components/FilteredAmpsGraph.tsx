import { useState, useEffect } from 'react';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fetchFilteredAmps } from '../services/gatewayService';
import { IMPELLER_COLORS } from './AmpsGraph';
import { formatPlantDateTime } from '../utils/formatters';
import {
  Y_AXIS, CHART_MARGIN, CHART_HEIGHT, numericTicks, niceScaleOf, xAxisTitle, yAxisTitle,
} from '../utils/chartAxis';

interface Props {
  clientId: string;
  requestId: number;
  impellerNumber: number; // 1–10
}

interface Row { cycle: number; amps: number | null; when: string }

/**
 * Section 2 counterpart to AmpsGraph — one point per cycle in this filter (the cycle's average
 * current). Copied from the gateway dashboard; only the fetch and the timestamp format differ.
 *
 * All cycles in the filter are plotted. Slicing to the most recent 200 made the chart and the tile
 * beside it disagree whenever a filter covered more than 200 cycles.
 *
 * The x-axis is the cycle number rather than the blast-end timestamp: cycle numbers are a uniform
 * interval, whereas timestamps of unevenly-spaced cycles were being drawn evenly spaced anyway.
 * The tooltip carries the wall-clock time.
 */
export default function FilteredAmpsGraph({ clientId, requestId, impellerNumber }: Props) {
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const color = IMPELLER_COLORS[(impellerNumber - 1) % IMPELLER_COLORS.length];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchFilteredAmps(clientId, requestId)
      .then(data => {
        if (!active) return;
        const forImpeller = data.find(d => d.impellerNumber === impellerNumber);
        const cycles = forImpeller?.cycles ?? [];

        setRows(cycles.map(c => ({
          cycle: c.cycleNumber,
          amps:  c.avgAmps,
          when:  formatPlantDateTime(c.blastEnd),
        })));
        setLoading(false);
      })
      .catch(e => {
        if (!active) return;
        setError((e as Error).message);
        setLoading(false);
      });

    return () => { active = false; };
  }, [clientId, requestId, impellerNumber]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: CHART_HEIGHT }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows.length) {
    return <Typography color="text.secondary">No cycle data for this impeller in the filter.</Typography>;
  }

  const y = niceScaleOf(rows, r => r.amps ?? 0);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Average current per cycle, impeller {impellerNumber}. All {rows.length.toLocaleString()}
        {' '}cycles in this filter are plotted.
      </Typography>

      <Box sx={{ width: '100%', height: CHART_HEIGHT }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" />
            {/* type="number" keeps ticks POSITIONAL, so they land on round cycle numbers.
                A category axis strides by row index and prints whatever cycle sits there. */}
            <XAxis
              dataKey="cycle"
              type="number"
              domain={[rows[0].cycle, rows[rows.length - 1].cycle]}
              ticks={numericTicks(rows[0].cycle, rows[rows.length - 1].cycle)}
              tick={{ fontSize: 11 }}
              height={52}
              tickMargin={6}
              tickFormatter={(v: number) => v.toLocaleString()}
              label={xAxisTitle('Cycle number')}
            />
            <YAxis
              {...Y_AXIS}
              domain={y.domain}
              ticks={y.ticks}
              tickFormatter={(v: number) => v.toLocaleString()}
              label={yAxisTitle('Average current (A)')}
            />
            <Tooltip
              formatter={(v) => [typeof v === 'number' ? `${v.toFixed(2)} A` : '—', `Impeller ${impellerNumber}`]}
              labelFormatter={(label, payload) =>
                `Cycle ${label}, ended ${payload?.[0]?.payload?.when ?? ''}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" height={28} />
            <Line
              type="monotone"
              dataKey="amps"
              stroke={color}
              dot={rows.length <= 60 ? { r: 2 } : false}
              strokeWidth={2}
              name={`Impeller ${impellerNumber} average current (A)`}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
