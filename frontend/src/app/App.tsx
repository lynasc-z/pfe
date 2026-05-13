import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginPage } from './components/LoginPage';
import { EmployeeDashboard } from './components/EmployeeDashboard';
import { ManagerDashboard } from './components/ManagerDashboard';
import { HRDashboard } from './components/HRDashboard';
import { AdminDashboard } from './components/AdminDashboard';

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  if (!splashDone) {
    return <LoadingScreen ready={!authLoading} onComplete={() => setSplashDone(true)} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/dashboard/*"
        element={
          user.role === 'ADMIN' ? <AdminDashboard /> :
          user.role === 'HR' ? <HRDashboard /> :
          user.role === 'MANAGER' ? <ManagerDashboard /> :
          <EmployeeDashboard />
        }
      />
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="size-full">
          <AppRoutes />
        </div>
        <Toaster richColors position="top-right" closeButton />
      </AuthProvider>
    </BrowserRouter>
  );
}