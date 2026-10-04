import { useState, type ReactNode } from 'react';
import {
  Box, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Paper, Tooltip, Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { CHART_HEIGHT } from '../utils/chartAxis';
import { formatTileTimestamp } from '../utils/formatters';

export interface TileChart {
  /** Dialog title; defaults to the tile's own name. */
  title?: string;
  /**
   * What the chart measures, in prose. Sits behind an info icon next to the dialog title rather
   * than in a caption under it: it is reference material a reader wants once, not every time.
   * Section 2 dialogs have none.
   */
  info?: string;
  render: () => ReactNode;
}

interface Props {
  label: string;
  value: string;               // already formatted
  timestamp?: string | null;   // shown with the tile timestamp rule
  chart?: TileChart;
}

/** Name, value and time of one parameter. With a chart, the whole tile opens it in a wide dialog. */
export default function ExpandableMetricCard({ label, value, timestamp, chart }: Props) {
  const [open, setOpen] = useState(false);

  // Recharts' ResponsiveContainer sizes itself from its parent. Mounted while the dialog is still
  // animating open, it can measure zero width and render nothing. Waiting for the transition to
  // finish guarantees it measures a settled container.
  const [chartReady, setChartReady] = useState(false);
  const closeDialog = () => { setOpen(false); setChartReady(false); };

  return (
    <>
      <Paper
        onClick={chart ? () => setOpen(true) : undefined}
        onKeyDown={chart ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } } : undefined}
        role={chart ? 'button' : undefined}
        tabIndex={chart ? 0 : undefined}
        aria-label={chart ? `${label}: open chart` : undefined}
        sx={{
          p: 2.25,
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          height: '100%',
          position: 'relative',
          cursor: chart ? 'pointer' : 'default',
          transition: 'box-shadow 0.15s',
          '&:hover': chart ? { boxShadow: 4 } : {},
        }}
      >
        {chart && (
          <Tooltip title="View chart">
            <BarChartIcon sx={{ position: 'absolute', top: 10, right: 10, color: 'text.disabled', fontSize: 18 }} />
          </Tooltip>
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.8rem', pr: chart ? 3 : 0 }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.25, color: 'text.primary' }}>
          {value}
        </Typography>
        {timestamp && (
          <Box sx={{ mt: 'auto', pt: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
              {formatTileTimestamp(timestamp)}
            </Typography>
          </Box>
        )}
      </Paper>

      {chart && (
        <Dialog
          open={open}
          onClose={closeDialog}
          maxWidth="lg"
          fullWidth
          slotProps={{ transition: { onEntered: () => setChartReady(true) } }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {/* Defaults to the tile's own name: the dialog opened FROM that tile, so a separate
                  title can only repeat it or contradict it. */}
              {chart.title ?? label}
              {chart.info && (
                <Tooltip title={chart.info}>
                  <InfoOutlinedIcon sx={{ fontSize: 17, color: 'text.disabled', cursor: 'help' }} />
                </Tooltip>
              )}
            </Box>
            <IconButton onClick={closeDialog} size="small" aria-label="Close">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          {/* Charts need room: a dense series in a 600 px dialog was the reason axis labels had to
              be thinned to the point of disappearing. */}
          <DialogContent sx={{ pb: 3 }}>
            {chartReady ? chart.render() : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: CHART_HEIGHT }}>
                <CircularProgress />
              </Box>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
