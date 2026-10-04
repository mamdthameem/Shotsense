import { Box, Typography } from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Y_AXIS, CHART_MARGIN, CHART_HEIGHT, niceScaleOf, xAxisTitle, yAxisTitle,
} from '../utils/chartAxis';
import type { GatewaySection2Metal } from '../types';

interface Props {
  /**
   * The filter response's own metals[]. The gateway dashboard fetches
   * /api/filter/{id}/metals here; POST /api/admin/filter already returns the
   * same rows, so there is no second call to make.
   */
  items: GatewaySection2Metal[];
}

/**
 * Section 2 production split per casting item — one bar per declared item name.
 * Copied from the gateway dashboard; the items arrive as a prop instead of a fetch.
 *
 * Under an item filter this is a single bar by design: the backend scopes the declared-weight sum
 * to the filtered item.
 *
 * The API field is still metalName — the PLC tags and DB columns say metal; only the wording shown
 * to the user says item.
 */
export default function ItemProductionGraph({ items }: Props) {
  if (!items.length) {
    return (
      <Typography color="text.secondary">
        No casting item weights were declared for the cycles in this filter.
      </Typography>
    );
  }

  const total = items.reduce((sum, i) => sum + i.productionKg, 0);

  // A weight declared against a blank name is recorded as 'unspecified' rather than dropped or
  // guessed at — call that out instead of letting it read as a real item name.
  const data = items.map(i => ({
    name: i.metalName,
    productionKg: i.productionKg,
    unspecified: i.metalName === 'unspecified',
  }));

  const y = niceScaleOf(data, d => d.productionKg);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Declared casting weight per item. Total{' '}
        {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg.
      </Typography>

      <Box sx={{ width: '100%', height: CHART_HEIGHT }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            {/* interval={0} prints every item name: this axis is a short list of categories, not a
                dense time series, so there is never a reason to hide one. */}
            <XAxis
              dataKey="name"
              angle={-30}
              textAnchor="end"
              interval={0}
              height={72}
              tickMargin={6}
              tick={{ fontSize: 12 }}
              label={xAxisTitle('Casting item')}
            />
            <YAxis
              {...Y_AXIS}
              domain={y.domain}
              ticks={y.ticks}
              tickFormatter={(v: number) => v.toLocaleString()}
              label={yAxisTitle('Declared weight (kg)')}
            />
            <Tooltip
              formatter={(v) => [
                `${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`,
                'Declared weight',
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" height={28} />
            <Bar dataKey="productionKg" name="Declared weight (kg)" radius={[4, 4, 0, 0]}>
              {data.map(d => (
                <Cell key={d.name} fill={d.unspecified ? '#94a3b8' : '#2563eb'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
