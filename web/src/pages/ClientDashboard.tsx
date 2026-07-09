import React, { useCallback, useEffect, useState } from 'react';
import {
  Container, Divider, Box, Typography, IconButton, Tooltip, Button, Chip,
  Alert, CircularProgress, Switch, FormControlLabel, TextField, Autocomplete,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CodeIcon from '@mui/icons-material/Code';
import { useNavigate, useParams } from 'react-router-dom';
import MachineStatusTile from '../components/MachineStatusTile';
import { LifetimeSection } from '../components/LifetimeSection';
import SpareHealthTable from '../components/SpareHealthTable';
import HistoryGraph from '../components/HistoryGraph';
import { fetchLive, fetchHistory } from '../services/gatewayService';
import { licenseStatusOf } from '../services/clientService';
import { useClients } from '../contexts/ClientsContext';
import { PARAM_META } from '../utils/unitConverters';
import { formatDateTime } from '../utils/formatters';
import type { GatewayHistoryResponse, GatewayLiveResponse, LicenseStatus } from '../types';

const AUTO_REFRESH_MS = 30_000;
const DEFAULT_HISTORY_LIMIT = 2000;

type PullState = 'idle' | 'loading' | 'ok' | 'unreachable' | 'auth-failed' | 'gateway-error';

const statusChipSx: Record<LicenseStatus, object> = {
  active:    { backgroundColor: 'rgba(76, 175, 80, 0.1)',  color: '#81c784', border: '1px solid rgba(76, 175, 80, 0.2)' },
  grace:     { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)' },
  expired:   { backgroundColor: 'rgba(244, 67, 54, 0.1)',  color: '#e57373', border: '1px solid rgba(244, 67, 54, 0.2)' },
  suspended: { backgroundColor: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)' },
};

const eventChipColor: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  'license-ok': 'success',
  'license-denied': 'error',
  'pull-ok': 'success',
  'pull-unreachable': 'warning',
  'pull-auth-failed': 'error',
};

const dateInput = (d: Date) => d.toISOString().split('T')[0];

/** Per-client dashboard — mirrors the client's own dashboard layout, fed by
 *  on-demand pulls through the gateway proxy (nothing cached in the cloud). */
export const ClientDashboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clients, loading: clientsLoading } = useClients();
  const client = clients.find(c => c.id === id) ?? null;

  const [live, setLive] = useState<GatewayLiveResponse | null>(null);
  const [pullState, setPullState] = useState<PullState>('idle');
  const [pullDetail, setPullDetail] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showRawLive, setShowRawLive] = useState(false);

  // History form state
  const [metric, setMetric] = useState('');
  const [fromDate, setFromDate] = useState(dateInput(new Date(Date.now() - 7 * 24 * 3_600_000)));
  const [toDate, setToDate] = useState(dateInput(new Date()));
  const [historyKey, setHistoryKey] = useState(0); // bump to (re)load the graph
  const [historyLoaded, setHistoryLoaded] = useState<GatewayHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showRawHistory, setShowRawHistory] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setPullState('loading');
    try {
      const result = await fetchLive(id);
      if (result.ok) {
        setLive(result.data);
        setPullState('ok');
        setPullDetail(null);
        setLastFetched(new Date());
      } else {
        setPullState(result.reason);
        setPullDetail(result.status ? `HTTP ${result.status}` : null);
      }
    } catch (err) {
      setPullState('gateway-error');
      setPullDetail((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => { void load(); }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const loadHistory = async () => {
    if (!id || !metric.trim()) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryLoaded(null);
    try {
      const result = await fetchHistory(
        id, metric.trim(), new Date(fromDate), new Date(`${toDate}T23:59:59.999`), DEFAULT_HISTORY_LIMIT
      );
      if (result.ok) {
        setHistoryLoaded(result.data);
        setHistoryKey(k => k + 1);
      } else {
        setHistoryError(result.reason === 'unreachable'
          ? 'Client unreachable — its server or internet may be down.'
          : `Gateway request failed (${result.reason}${result.status ? ` ${result.status}` : ''}).`);
      }
    } catch (err) {
      setHistoryError((err as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (clientsLoading) {
    return <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>;
  }

  if (!client) {
    return (
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          Unknown client. It may have been deleted.
          <Button size="small" onClick={() => navigate('/clients')} sx={{ ml: 2 }}>Back to Clients</Button>
        </Alert>
      </Container>
    );
  }

  const licenseStatus = licenseStatusOf(client);
  const metricOptions = Array.from(new Set([
    ...(live?.lifetime.map(p => p.parameter) ?? []),
    ...Object.keys(PARAM_META),
  ]));

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* ── Header: client identity + pull controls ── */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={2}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <Tooltip title="Back to Clients">
            <IconButton onClick={() => navigate('/clients')} size="small">
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box>
            <Box display="flex" alignItems="center" gap={1.5}>
              <Typography variant="h5" fontWeight={800}>{client.name}</Typography>
              <Chip
                label={licenseStatus.toUpperCase()}
                size="small"
                sx={{ borderRadius: 1, fontSize: '0.65rem', fontWeight: 700, ...statusChipSx[licenseStatus] }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-mono)' }}>
              {(client.useTls ? 'https://' : 'http://') + (client.hostnameOverride || client.staticIp) + ':' + client.port}
              {lastFetched && ` · pulled ${lastFetched.toLocaleTimeString()}`}
            </Typography>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={1}>
          <FormControlLabel
            control={<Switch size="small" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />}
            label="Auto 30s"
            sx={{ '& .MuiTypography-root': { fontWeight: 600, fontSize: '0.8rem' } }}
          />
          <Tooltip title="Show raw JSON">
            <IconButton size="small" onClick={() => setShowRawLive(v => !v)} color={showRawLive ? 'primary' : 'default'}>
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={pullState === 'loading' ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
            onClick={() => void load()}
            disabled={pullState === 'loading'}
            sx={{ borderRadius: 2, fontWeight: 700 }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* ── Unreachable / error states (D3) ── */}
      {pullState === 'unreachable' && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
          <strong>Client unreachable.</strong> The client's server or internet connection may be down.
          Data shown below (if any) is from the last successful pull{lastFetched ? ` at ${formatDateTime(lastFetched)}` : ''}.
        </Alert>
      )}
      {pullState === 'auth-failed' && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
          <strong>Gateway rejected the stored API key</strong>{pullDetail ? ` (${pullDetail})` : ''}.
          Check that the client installation and the registry hold the same Admin API key.
        </Alert>
      )}
      {pullState === 'gateway-error' && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
          <strong>The gateway returned an error</strong>{pullDetail ? ` (${pullDetail})` : ''}. Try again shortly.
        </Alert>
      )}

      {pullState === 'loading' && !live && (
        <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
      )}

      {showRawLive && live && (
        <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1}>Raw /api/admin/live response</Typography>
          <Box component="pre" sx={{ m: 0, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', overflowX: 'auto', userSelect: 'text', maxHeight: 320 }}>
            {JSON.stringify(live, null, 2)}
          </Box>
        </Paper>
      )}

      {/* ── Section 1 mirror: status tile → lifetime grid → spares ── */}
      {live && (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(4,1fr)' },
              gap: 2,
            }}
          >
            <MachineStatusTile plcConnected={live.plcConnected} lastScanAt={live.lastScanAt} />
          </Box>

          <Divider sx={{ my: 3 }} />

          <LifetimeSection
            clientId={client.id}
            lifetime={live.lifetime}
            lastFetched={lastFetched}
            loading={pullState === 'loading'}
            onRefresh={() => void load()}
          />

          <Divider sx={{ my: 3 }} />

          <SpareHealthTable alerts={live.spareAlerts} />

          <Divider sx={{ my: 3 }} />
        </>
      )}

      {/* ── History view (D4) ── */}
      <Box>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1rem', mb: 0.5 }}>
          Historical Data
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={2}>
          One on-demand query against the client's stored history · up to {DEFAULT_HISTORY_LIMIT.toLocaleString()} points
        </Typography>

        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center" mb={2}>
          <Autocomplete
            freeSolo
            options={metricOptions}
            value={metric}
            onInputChange={(_, value) => setMetric(value)}
            renderInput={(params) => (
              <TextField {...params} label="Metric" size="small" placeholder="e.g. machine_utility_pct" />
            )}
            sx={{ minWidth: 260 }}
          />
          <TextField
            label="From"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => void loadHistory()}
            disabled={!metric.trim() || historyLoading}
            sx={{ borderRadius: 2, fontWeight: 700 }}
          >
            {historyLoading ? 'Loading…' : 'Load'}
          </Button>
          {historyLoaded && (
            <Tooltip title="Show raw JSON">
              <IconButton size="small" onClick={() => setShowRawHistory(v => !v)} color={showRawHistory ? 'primary' : 'default'}>
                <CodeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {historyError && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{historyError}</Alert>}

        {historyLoaded && (
          <>
            <Paper sx={{ p: 2, borderRadius: 3, mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} mb={1}>
                {PARAM_META[historyLoaded.metric]?.label ?? historyLoaded.metric}
                {' · '}{historyLoaded.count.toLocaleString()} points
              </Typography>
              <HistoryGraph
                key={historyKey}
                clientId={client.id}
                metric={historyLoaded.metric}
                windowStart={new Date(fromDate).toISOString()}
                windowEnd={new Date(`${toDate}T23:59:59.999`).toISOString()}
              />
            </Paper>

            {showRawHistory && (
              <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>Raw /api/admin/history response</Typography>
                <Box component="pre" sx={{ m: 0, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', overflowX: 'auto', userSelect: 'text', maxHeight: 320 }}>
                  {JSON.stringify(historyLoaded, null, 2)}
                </Box>
              </Paper>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Timestamp</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Value</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyLoaded.points.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontSize: '0.78rem' }}>{formatDateTime(p.timestamp)}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>{p.value ?? '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{p.reason}</TableCell>
                    </TableRow>
                  ))}
                  {historyLoaded.points.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No points in this window.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* ── Recent events (E3) ── */}
      <Box mb={4}>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1rem', mb: 2 }}>
          Recent Events
        </Typography>
        {client.recentEvents.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No recorded events yet — license check-ins and admin pulls will appear here.
          </Typography>
        ) : (
          <Paper sx={{ borderRadius: 3 }}>
            <Table size="small">
              <TableBody>
                {[...client.recentEvents].reverse().map((e, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ width: 190, fontSize: '0.78rem', color: 'text.secondary' }}>
                      {formatDateTime(e.at)}
                    </TableCell>
                    <TableCell sx={{ width: 160 }}>
                      <Chip
                        label={e.type}
                        size="small"
                        color={eventChipColor[e.type] ?? 'default'}
                        variant="outlined"
                        sx={{ borderRadius: 1, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                      {e.detail ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    </Container>
  );
};
