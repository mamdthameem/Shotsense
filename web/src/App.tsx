import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider as MuiThemeProvider, CssBaseline, Box } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import { ClientsProvider } from './contexts/ClientsContext';
import { UIProvider, useUI } from './contexts/UIContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import SectionErrorBoundary from './components/SectionErrorBoundary';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ClientList } from './pages/ClientList';
import { ClientDashboard } from './pages/ClientDashboard';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const { sidebarOpen } = useUI();
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.palette.background.default }}>
      <Sidebar />
      <Box
        sx={{
          flexGrow: 1,
          ml: sidebarOpen ? '64px' : 0,
          display: 'flex',
          flexDirection: 'column',
          transition: 'margin-left 0.3s ease',
        }}
      >
        <TopBar />
        <Box component="main" sx={{ p: 2, flexGrow: 1, backgroundColor: theme.palette.background.default }}>
          <SectionErrorBoundary name="This page">{children}</SectionErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
};

const ThemeWrapper: React.FC = () => {
  const { theme } = useTheme();
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <ClientsProvider>
          <NotificationProvider>
            <UIProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route
                    path="/clients"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <ClientList />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/clients/:id/dashboard"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <ClientDashboard />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/" element={<Navigate to="/clients" replace />} />
                  <Route path="*" element={<Navigate to="/clients" replace />} />
                </Routes>
              </BrowserRouter>
            </UIProvider>
          </NotificationProvider>
        </ClientsProvider>
      </AuthProvider>
    </MuiThemeProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <ThemeWrapper />
    </ThemeProvider>
  );
}

export default App;
