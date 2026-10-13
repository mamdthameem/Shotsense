import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useNavigate, useParams } from 'react-router-dom';
import { useClients } from '../contexts/ClientsContext';
import {
  changeUserRole, createClientUser, describeCallFailure, listClientUsers, sendPasswordReset,
  setClientUserDisabled, type InviteResult,
} from '../services/clientUserService';
import { formatPlantDateTime } from '../utils/formatters';
import type { ClientUser, ClientUserRole } from '../types';

const ROLES: { value: ClientUserRole; label: string; help: string }[] = [
  { value: 'admin', label: 'Admin', help: 'Can change settings on the client dashboard' },
  { value: 'viewer', label: 'Viewer', help: 'Can see the dashboard, change nothing' },
];

/** The link to pass on by hand when the email does not arrive. */
function InviteNotice({ invite, onClose }: { invite: InviteResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.resetLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Alert severity={invite.emailSent ? 'success' : 'warning'} onClose={onClose} sx={{ mb: 2, borderRadius: 2 }}>
      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
        {invite.emailSent
          ? 'Firebase has emailed a link for setting the password.'
          : 'The email could not be sent. Pass this link on instead:'}
        <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => void copy()}>
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
      </Box>
    </Alert>
  );
}

function AddUserDialog({ open, clientId, onClose, onCreated }: {
  open: boolean;
  clientId: string;
  onClose: () => void;
  onCreated: (invite: InviteResult) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<ClientUserRole>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setEmail(''); setName(''); setRole('viewer'); setError(null);
    onClose();
  };

  const submit = async () => {
    if (!name.trim()) return setError('Enter the person’s name.');
    if (!email.trim()) return setError('Enter an email address.');
    setBusy(true);
    setError(null);
    try {
      const invite = await createClientUser({ email, name, clientId, role });
      onCreated(invite);
      close();
    } catch (err) {
      setError(describeCallFailure(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : close} maxWidth="xs" fullWidth>
      <DialogTitle>Add user</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={0.5}>
          <TextField label="Name" size="small" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <TextField label="Email" size="small" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <TextField label="Role" size="small" select value={role} onChange={e => setRole(e.target.value as ClientUserRole)}>
            {ROLES.map(r => (
              <MenuItem key={r.value} value={r.value}>{r.label} — {r.help}</MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            They set their own password from a link Firebase emails them. Nobody here ever sees it.
          </Typography>
          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy} sx={{ fontWeight: 700 }}>
          {busy ? 'Creating…' : 'Create and send link'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** One client company's logins: who can sign in, as what, and whether they still can. */
export const ClientUsers: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clients, loading: clientsLoading } = useClients();
  const client = clients.find(c => c.id === id) ?? null;

  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setUsers(await listClientUsers(id));
      setError(null);
    } catch (err) {
      setError(describeCallFailure(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Reached only through ProtectedRoute, so the viewer is a cloud admin; every admin may manage logins.
  useEffect(() => { void load(); }, [load]);

  /** Runs one action for a row, then reloads so the table shows what the server now holds. */
  const act = async (uid: string, action: () => Promise<void>) => {
    setBusyUid(uid);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(describeCallFailure(err));
    } finally {
      setBusyUid(null);
    }
  };

  if (clientsLoading) {
    return <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>;
  }

  if (!client) {
    return (
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          Unknown client. It may have been deleted.
          <Button size="small" onClick={() => navigate('/clients')} sx={{ ml: 2 }}>Back to Clients</Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3} gap={2} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.5}>
          <Tooltip title="Back to the dashboard">
            <IconButton onClick={() => navigate(`/clients/${client.id}/dashboard`)} size="small">
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box>
            <Typography variant="h5" fontWeight={800}>Users</Typography>
            <Typography variant="caption" color="text.secondary">
              {client.name} · {users.length} {users.length === 1 ? 'login' : 'logins'}
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setAddOpen(true)}
          sx={{ borderRadius: 2, fontWeight: 700 }}
        >
          Add User
        </Button>
      </Box>

      {invite && <InviteNotice invite={invite} onClose={() => setInvite(null)} />}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : users.length === 0 ? (
        <Paper sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No one can sign in for this client yet. Add the first user.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last sign-in</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.uid} hover>
                  <TableCell>{u.name || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{u.email}</TableCell>
                  <TableCell sx={{ minWidth: 130 }}>
                    <TextField
                      select
                      size="small"
                      value={u.role}
                      disabled={busyUid === u.uid}
                      onChange={e => void act(u.uid, () => changeUserRole(u.uid, e.target.value as ClientUserRole))}
                      variant="standard"
                      slotProps={{ input: { disableUnderline: true } }}
                    >
                      {ROLES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={u.disabled ? 'Disabled' : 'Active'}
                      size="small"
                      color={u.disabled ? 'default' : 'success'}
                      variant="outlined"
                      sx={{ fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {u.lastSignInAt ? formatPlantDateTime(u.lastSignInAt) : 'never'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Email a password-reset link">
                      <span>
                        <IconButton
                          size="small"
                          disabled={busyUid === u.uid}
                          onClick={() => void act(u.uid, async () => setInvite(await sendPasswordReset(u.email)))}
                        >
                          <MailOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={u.disabled ? 'Let this person sign in again' : 'Block this person from signing in'}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={busyUid === u.uid}
                          color={u.disabled ? 'success' : 'default'}
                          onClick={() => void act(u.uid, () => setClientUserDisabled(u.uid, !u.disabled))}
                        >
                          {u.disabled ? <CheckCircleOutlineIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <AddUserDialog
        open={addOpen}
        clientId={client.id}
        onClose={() => setAddOpen(false)}
        onCreated={(result) => { setInvite(result); void load(); }}
      />
    </Container>
  );
};

export default ClientUsers;
