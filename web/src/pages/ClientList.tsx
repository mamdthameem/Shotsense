import React, { useState } from 'react';
import {
    Box,
    Typography,
    Container,
    Paper,
    Chip,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Divider,
    MenuItem,
    Menu,
    Alert,
    CircularProgress,
    Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DashboardIcon from '@mui/icons-material/Dashboard';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import { useNavigate } from 'react-router-dom';
import type { Client, LicenseStatus } from '../types';
import { deleteClient, extendLicense, licenseStatusOf } from '../services/clientService';
import { useClients } from '../contexts/ClientsContext';
import { useUI } from '../contexts/UIContext';
import { formatDate, daysUntil, timeAgo } from '../utils/formatters';
import { ClientDialog } from './ClientDialog';

const EXPIRING_SOON_DAYS = 14;

const statusChipSx: Record<LicenseStatus, object> = {
    active:    { backgroundColor: 'rgba(76, 175, 80, 0.1)',  color: '#81c784', border: '1px solid rgba(76, 175, 80, 0.2)' },
    grace:     { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)' },
    expired:   { backgroundColor: 'rgba(244, 67, 54, 0.1)',  color: '#e57373', border: '1px solid rgba(244, 67, 54, 0.2)' },
    suspended: { backgroundColor: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)' },
};

export const ClientList: React.FC = () => {
    const { clients, loading, error } = useClients();
    const { searchTerm } = useUI();
    const navigate = useNavigate();

    const [clientDialogOpen, setClientDialogOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);

    // Menu state
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [menuTargetClient, setMenuTargetClient] = useState<Client | null>(null);

    // Extend-license dialog state
    const [extendDialogOpen, setExtendDialogOpen] = useState(false);
    const [extendDate, setExtendDate] = useState('');
    const [extendSaving, setExtendSaving] = useState(false);

    // Delete confirmation state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [confirmName, setConfirmName] = useState('');
    const [nameError, setNameError] = useState(false);

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, client: Client) => {
        setAnchorEl(event.currentTarget);
        setMenuTargetClient(client);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleEditClick = () => {
        if (menuTargetClient) {
            setEditingClient(menuTargetClient);
            setClientDialogOpen(true);
        }
        handleMenuClose();
    };

    const handleViewClick = () => {
        if (menuTargetClient) {
            navigate(`/clients/${menuTargetClient.id}/dashboard`);
        }
        handleMenuClose();
    };

    const handleExtendClick = () => {
        if (menuTargetClient) {
            setExtendDate(
                menuTargetClient.licenseExpiresAt
                    ? menuTargetClient.licenseExpiresAt.toISOString().split('T')[0]
                    : ''
            );
            setExtendDialogOpen(true);
        }
        handleMenuClose();
    };

    const handleDeleteClick = () => {
        setDeleteDialogOpen(true);
        setConfirmName('');
        setNameError(false);
        handleMenuClose();
    };

    const processExtend = async () => {
        if (!menuTargetClient || !extendDate) return;
        setExtendSaving(true);
        try {
            await extendLicense(menuTargetClient.id, new Date(extendDate));
            setExtendDialogOpen(false);
            setMenuTargetClient(null);
        } finally {
            setExtendSaving(false);
        }
    };

    const processDelete = () => {
        if (confirmName === menuTargetClient?.name) {
            if (menuTargetClient) {
                void deleteClient(menuTargetClient.id);
                setDeleteDialogOpen(false);
                setMenuTargetClient(null);
            }
        } else {
            setNameError(true);
        }
    };

    const term = searchTerm.toLowerCase();
    const visibleClients = term
        ? clients.filter(c =>
            c.name.toLowerCase().includes(term) ||
            c.staticIp.toLowerCase().includes(term)
        )
        : clients;

    const expiringSoon = clients.filter(c => {
        if (licenseStatusOf(c) !== 'active' || !c.licenseExpiresAt) return false;
        const d = daysUntil(c.licenseExpiresAt);
        return d !== null && d >= 0 && d <= EXPIRING_SOON_DAYS;
    });

    return (
        <Container maxWidth="xl" sx={{ transition: 'all 0.3s ease' }}>
            <Box mb={4} display="flex" justifyContent="space-between" alignItems="flex-end">
                <Box>
                    <Typography variant="h4" fontWeight={800} mb={1} sx={{ color: (theme) => theme.palette.text.primary }}>
                        Clients
                    </Typography>
                    <Typography variant="body1" sx={{ color: (theme) => theme.palette.text.secondary }}>
                        Manage client licenses, gateway endpoints, and reachability.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => { setEditingClient(null); setClientDialogOpen(true); }}
                        sx={{
                            borderRadius: 2,
                            fontWeight: 700,
                            px: 3,
                            transition: 'all 0.3s ease',
                        }}
                    >
                        Add Client
                    </Button>
                </Box>
            </Box>

            {expiringSoon.length > 0 && (
                <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
                    {expiringSoon.length === 1
                        ? `1 license expires within ${EXPIRING_SOON_DAYS} days: `
                        : `${expiringSoon.length} licenses expire within ${EXPIRING_SOON_DAYS} days: `}
                    {expiringSoon.map(c => `${c.name} (${formatDate(c.licenseExpiresAt)})`).join(', ')}
                </Alert>
            )}

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {loading ? (
                <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 4, transition: 'all 0.3s ease' }}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                                <TableCell sx={{ fontWeight: 700, color: (theme) => theme.palette.text.secondary, fontSize: '0.75rem' }}>NAME</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: (theme) => theme.palette.text.secondary, fontSize: '0.75rem' }}>GATEWAY</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: (theme) => theme.palette.text.secondary, fontSize: '0.75rem' }}>LICENSE</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: (theme) => theme.palette.text.secondary, fontSize: '0.75rem' }}>EXPIRY</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: (theme) => theme.palette.text.secondary, fontSize: '0.75rem' }}>LAST CHECK-IN</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: (theme) => theme.palette.text.secondary, fontSize: '0.75rem' }} align="right">ACTIONS</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visibleClients.map((c) => {
                                const status = licenseStatusOf(c);
                                const d = c.licenseExpiresAt ? daysUntil(c.licenseExpiresAt) : null;
                                return (
                                    <TableRow
                                        key={c.id}
                                        sx={{
                                            '&:hover': {
                                                backgroundColor: (theme) => theme.palette.mode === 'dark'
                                                    ? 'rgba(255,255,255,0.02)'
                                                    : 'rgba(0,0,0,0.02)',
                                            },
                                            transition: 'background-color 0.3s ease',
                                        }}
                                    >
                                        <TableCell sx={{ fontWeight: 600, color: (theme) => theme.palette.text.primary }}>{c.name}</TableCell>
                                        <TableCell sx={{ color: (theme) => theme.palette.text.secondary, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                                            {(c.useTls ? 'https://' : 'http://') + c.staticIp + ':' + c.port}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={status.toUpperCase()}
                                                size="small"
                                                sx={{ borderRadius: 1, fontSize: '0.65rem', fontWeight: 700, ...statusChipSx[status] }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ color: (theme) => theme.palette.text.secondary, fontSize: '0.85rem' }}>
                                            {c.licenseExpiresAt ? formatDate(c.licenseExpiresAt) : 'N/A'}
                                            {status === 'active' && d !== null && d >= 0 && (
                                                <Typography variant="caption" display="block" sx={{ color: (theme) => d <= EXPIRING_SOON_DAYS ? '#fbbf24' : theme.palette.text.disabled }}>
                                                    {d === 0 ? 'expires today' : `${d} day${d === 1 ? '' : 's'} left`}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ color: (theme) => theme.palette.text.secondary, fontSize: '0.85rem' }}>
                                            {timeAgo(c.lastLicenseCheckAt)}
                                            {c.lastContactStatus && c.lastContactStatus !== 'ok' && (
                                                <Tooltip title={`Last admin pull: ${c.lastContactStatus}`}>
                                                    <Typography variant="caption" display="block" sx={{ color: '#e57373' }}>
                                                        {c.lastContactStatus === 'auth-failed' ? 'auth failed' : 'unreachable'}
                                                    </Typography>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton
                                                size="small"
                                                onClick={(e) => handleMenuOpen(e, c)}
                                                sx={{
                                                    color: (theme) => theme.palette.text.secondary,
                                                    '&:hover': {
                                                        color: (theme) => theme.palette.text.primary,
                                                        backgroundColor: (theme) => theme.palette.mode === 'dark'
                                                            ? 'rgba(255,255,255,0.05)'
                                                            : 'rgba(0,0,0,0.05)',
                                                    },
                                                    transition: 'all 0.3s ease',
                                                }}
                                            >
                                                <MoreVertIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {visibleClients.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: (theme) => theme.palette.text.secondary }}>
                                        {clients.length === 0 ? 'No clients yet. Add the first one to get started.' : 'No clients match the search.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Add/Edit dialog */}
            <ClientDialog
                open={clientDialogOpen}
                editingClient={editingClient}
                onClose={() => setClientDialogOpen(false)}
            />

            {/* Actions Menu */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                PaperProps={{
                    sx: {
                        borderRadius: 2,
                        mt: 1,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        minWidth: 180,
                    }
                }}
            >
                <MenuItem onClick={handleViewClick} sx={{ fontWeight: 600, py: 1.5 }}>
                    <DashboardIcon fontSize="small" sx={{ mr: 2, color: 'text.secondary' }} />
                    View Dashboard
                </MenuItem>
                <MenuItem onClick={handleEditClick} sx={{ fontWeight: 600, py: 1.5 }}>
                    <EditIcon fontSize="small" sx={{ mr: 2, color: 'text.secondary' }} />
                    Edit Client
                </MenuItem>
                <MenuItem onClick={handleExtendClick} sx={{ fontWeight: 600, py: 1.5 }}>
                    <EventRepeatIcon fontSize="small" sx={{ mr: 2, color: 'text.secondary' }} />
                    Extend License
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleDeleteClick} sx={{ fontWeight: 600, py: 1.5, color: '#f44336' }}>
                    <DeleteIcon fontSize="small" sx={{ mr: 2 }} />
                    Delete Client
                </MenuItem>
            </Menu>

            {/* Extend License Dialog */}
            <Dialog
                open={extendDialogOpen}
                onClose={() => setExtendDialogOpen(false)}
                PaperProps={{ sx: { borderRadius: 4, p: 1 } }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>Extend License</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" mb={3}>
                        Set the new expiry date for <strong>{menuTargetClient?.name}</strong>.
                        The license stays valid through the end of the chosen day.
                    </Typography>
                    <TextField
                        label="Valid Until"
                        type="date"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={extendDate}
                        onChange={(e) => setExtendDate(e.target.value)}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setExtendDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={processExtend}
                        disabled={!extendDate || extendSaving}
                        sx={{ fontWeight: 700, px: 3 }}
                    >
                        {extendSaving ? 'Saving…' : 'Extend License'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                PaperProps={{ sx: { borderRadius: 4, p: 1 } }}
            >
                <DialogTitle>
                    <Typography variant="h5" fontWeight={800} color="error">Confirm Deletion</Typography>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" mb={3}>
                        This action is <strong>irreversible</strong>. This will permanently delete the client <strong>{menuTargetClient?.name}</strong> and its keys — its installation will fail license checks afterwards.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Please type the client's name <strong>{menuTargetClient?.name}</strong> to confirm.
                    </Typography>
                    <TextField
                        fullWidth
                        size="small"
                        autoFocus
                        placeholder="Enter client name"
                        value={confirmName}
                        onChange={(e) => {
                            setConfirmName(e.target.value);
                            setNameError(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                processDelete();
                            }
                        }}
                        error={nameError}
                        helperText={nameError ? "Name does not match." : ""}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={processDelete}
                        sx={{ fontWeight: 700, px: 3 }}
                    >
                        I understand, delete this client
                    </Button>
                </DialogActions>
            </Dialog>

        </Container>
    );
};
