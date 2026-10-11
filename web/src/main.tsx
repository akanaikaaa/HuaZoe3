import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks';
import { Layout, Loading } from './components';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { Upload, ReportDetail } from './pages/Reports';
import Compare from './pages/Compare';
import Tracking from './pages/Tracking';
import Profile from './pages/Profile';
import { Patients, PatientDetail } from './pages/Admin';
import './styles.css';

function Protected({ children, staff }: { children: ReactNode; staff?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (staff && user.role === 'patient') return <Navigate to="/" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<Upload />} />
            <Route path="reports/:id" element={<ReportDetail />} />
            <Route path="compare" element={<Compare />} />
            <Route path="tracking" element={<Tracking />} />
            <Route path="profile" element={<Profile />} />
            <Route path="patients" element={<Protected staff><Patients /></Protected>} />
            <Route path="patients/:id" element={<Protected staff><PatientDetail /></Protected>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
