import React, { useCallback, useEffect, useState } from 'react';
import {
  Container, Divider, Box, Typography, IconButton, Tooltip, Button, Chip,
  Alert, CircularProgress, Switch, FormControlLabel, Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CodeIcon from '@mui/icons-material/Code';
import { useNavigate, useParams } from 'react-router-dom';
import MachineStatusTile from '../components/MachineStatusTile';
import { LifetimeSection, TileGrid } from '../components/LifetimeSection';
import AmpsPanel from '../components/AmpsPanel';
import SpareHealthTable from '../components/SpareHealthTable';
import FilteredParameters, { filterName, type AppliedFilter } from '../components/FilteredParameters';
import FilterBar from '../components/FilterBar';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import { fetchLive, fetchFilteredCalculation, describeGatewayFailure } from '../services/gatewayService';
import { licenseStatusOf } from '../services/clientService';
import { useClients } from '../contexts/ClientsContext';
import { formatPlantDateTime, formatPlantTime } from '../utils/formatters';
import type {
  GatewayFailureReason, GatewayFilterRequest, GatewayLiveResponse, LicenseStatus,
} from '../types';

const AUTO_REFRESH_MS = 30_000;

type PullState = 'idle' | 'loading' | 'ok' | GatewayFailureReason;

const statusChipSx: Record<LicenseStatus, object> = {
  active:    { backgroundColor: 'rgba(76, 175, 80, 0.1)',  color: '#81c784', border: '1px solid rgba(76, 175, 80, 0.2)' },
  grace:     { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)' },
  expired:   { backgroundColor: 'rgba(244, 67, 54, 0.1)',  color: '#e57373', border: '1px solid rgba(244, 67, 54, 0.2)' },
  suspended: { backgroundColor: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)' },
};

const FILTER_FAILED = 'Calculation failed. Please try again.';

/** Per-client dashboard — mirrors the client's own gateway dashboard, fed by
 *  on-demand pulls of /api/admin/* (nothing cached). */
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

  // Filtered Parameters: only a filter applied from this page. live.section2
  // (the gateway's latest calculation, whoever ran it) is never shown, and
  // nothing is calculated until Apply is pressed. Live refreshes leave it alone.
  const [applied, setApplied] = useState<AppliedFilter | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);

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
        setPullDetail(describeGatewayFailure(result));
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

  const applyFilter = async (req: GatewayFilterRequest) => {
    if (!id) return;
    setFilterLoading(true);
    setFilterError(null);
    try {
      const result = await fetchFilteredCalculation(id, req);
      if (!result.ok) {
        // The reason is also recorded in Recent Events by the proxy.
        // The proxy also records the reason against the client in Firestore.
        console.warn('Filter calculation failed:', describeGatewayFailure(result));
        setFilterError(FILTER_FAILED);
        return;
      }
      const s = result.data;
      setApplied({
        result: s,
        selected: s.selectedParameters !== undefined ? s.selectedParameters : req.selectedParameters ?? null,
      });
    } catch (err) {
      console.warn('Filter calculation failed:', err);
      setFilterError(FILTER_FAILED);
    } finally {
      setFilterLoading(false);
    }
  };

  const resetFilter = () => {
    setApplied(null);
    setFilterError(null);
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
              {lastFetched && ` · pulled ${formatPlantTime(lastFetched)}`}
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

      {/* ── Unreachable / error states (D3) — one alert covering every distinguishable failure reason ── */}
      {pullState !== 'idle' && pullState !== 'loading' && pullState !== 'ok' && (
        <Alert severity={pullState === 'auth-failed' || pullState === 'gateway-error' ? 'warning' : 'error'} sx={{ mb: 3, borderRadius: 3 }}>
          <strong>{pullDetail ?? 'Gateway request failed.'}</strong>
          {pullState === 'auth-failed'
            ? ' Check that the client installation and the registry hold the same Admin API key.'
            : ` Data shown below (if any) is from the last successful pull${lastFetched ? ` at ${formatPlantDateTime(lastFetched)}` : ''}.`}
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
          {applied && (
            <>
              <Typography variant="subtitle2" fontWeight={700} mt={2} mb={1}>Raw /api/admin/filter response</Typography>
              <Box component="pre" sx={{ m: 0, fontFamily: 'var(--font-mono)', fontSize: '0.72rem', overflowX: 'auto', userSelect: 'text', maxHeight: 320 }}>
                {JSON.stringify(applied.result, null, 2)}
              </Box>
            </>
          )}
        </Paper>
      )}

      {/* ── The gateway dashboard, top to bottom ── */}
      {live && (
        <>
          <TileGrid>
            <SectionErrorBoundary name="Machine status" resetKey={live}>
              <MachineStatusTile machineStatus={live.machineStatus} plcConnected={live.plcConnected} lastScanAt={live.lastScanAt} />
            </SectionErrorBoundary>
          </TileGrid>

          <Divider sx={{ my: 3 }} />

          <SectionErrorBoundary name="Lifetime parameters" resetKey={live}>
            <LifetimeSection
              clientId={client.id}
              lifetime={live.lifetime}
              shotsBreakdown={live.shotsBreakdown}
              lastUpdated={lastFetched}
              loading={pullState === 'loading'}
              onRefresh={() => void load()}
            />
          </SectionErrorBoundary>

          <Divider sx={{ my: 3 }} />

          <SectionErrorBoundary name="Impeller current" resetKey={live}>
            <AmpsPanel
              clientId={client.id}
              amps={live.amps}
              ampsLastCycle={live.ampsLastCycle}
              selected={live.impellers?.selected}
              plcConnected={live.plcConnected}
              lastScanAt={live.lastScanAt}
            />
          </SectionErrorBoundary>

          <Divider sx={{ my: 3 }} />

          <SectionErrorBoundary name="Spare part life" resetKey={live}>
            <SpareHealthTable spareGrid={live.spareGrid} plcConnected={live.plcConnected} lastScanAt={live.lastScanAt} />
          </SectionErrorBoundary>

          <Divider sx={{ my: 3 }} />

          <FilterBar
            onApply={(req) => void applyFilter(req)}
            onReset={resetFilter}
            loading={filterLoading}
            appliedName={applied ? filterName(applied.result) : null}
            error={filterError}
          />

          <SectionErrorBoundary name="Filtered parameters" resetKey={applied ?? live}>
            <FilteredParameters
              clientId={client.id}
              clientName={client.name}
              lifetime={live.lifetime}
              applied={applied}
            />
          </SectionErrorBoundary>
        </>
      )}
    </Container>
  );
};
