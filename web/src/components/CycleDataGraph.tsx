import { Box, Typography } from '@mui/material';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Y_AXIS, CHART_MARGIN, CHART_HEIGHT, numericTicks, niceScaleOf, xAxisTitle, yAxisTitle,
} from '../utils/chartAxis';
import { formatPlantDateTime } from '../utils/formatters';
import type { GatewaySection2Cycle } from '../types';

interface Props {
  /**
   * The filter response's own cycles[]. The gateway dashboard fetches
   * /api/filter/{id}/cycles here; POST /api/admin/filter already returns the
   * same rows, so there is no second call to make.
   */
  cycles: GatewaySection2Cycle[];
}

/** Above this many cycles, bars are narrower than a pixel — a line reads the shape better. */
const LINE_THRESHOLD = 120;

/**
 * Energy consumed per blast cycle within one filtered window.
 * Copied from the gateway dashboard; the cycles arrive as a prop instead of a fetch.
 *
 * EVERY cycle in the filter is plotted. Slicing to the most recent 200 silently discarded ~1 250
 * of 1 448 cycles on a month filter while the tile above it totalled all of them.
 *
 * The x-axis is the cycle number, which is a uniform interval by construction: one unit is one
 * cycle, so no cycle is spaced differently from any other.
 */
export default function CycleDataGraph({ cycles }: Props) {
  if (!cycles.length) return <Typography color="text.secondary">No cycle data in this filter.</Typography>;

  const data = cycles.map(c => ({
    cycle: c.cycleNumber,
    kWh:   Number(c.energyKwh.toFixed(3)),
    start: formatPlantDateTime(c.blastStart),
  }));

  const y = niceScaleOf(data, d => d.kWh);
  const asLine = data.length > LINE_THRESHOLD;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        One point per blast cycle. All {data.length.toLocaleString()} cycles in this filter are
        plotted, cycles {data[0].cycle.toLocaleString()} to {data[data.length - 1].cycle.toLocaleString()}.
      </Typography>

      <Box sx={{ width: '100%', height: CHART_HEIGHT }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" />
            {/* type="number" keeps ticks POSITIONAL, so they land on round cycle numbers.
                A category axis strides by row index and prints whatever cycle sits there. */}
            <XAxis
              dataKey="cycle"
              type="number"
              domain={[data[0].cycle, data[data.length - 1].cycle]}
              ticks={numericTicks(data[0].cycle, data[data.length - 1].cycle)}
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
              label={yAxisTitle('Energy (kWh)')}
            />
            <Tooltip
              formatter={(v) => [`${Number(v ?? 0).toFixed(3)} kWh`, 'Energy']}
              labelFormatter={(label, payload) =>
                `Cycle ${label}, ${payload?.[0]?.payload?.start ?? ''}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" height={28} />
            {asLine ? (
              <Line
                type="monotone"
                dataKey="kWh"
                name="Energy per cycle (kWh)"
                stroke="#1565c0"
                dot={false}
                strokeWidth={1.5}
              />
            ) : (
              <Bar
                dataKey="kWh"
                name="Energy per cycle (kWh)"
                fill="#1565c0"
                radius={[2, 2, 0, 0]}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
