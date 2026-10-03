import { Routes, Route } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import HomePage from '../pages/HomePage';
import NotFoundPage from '../pages/NotFoundPage';
import LoginPage from '../features/auth/LoginPage';
import RegisterPage from '../features/auth/RegisterPage';
import DashboardPage from '../features/dashboard/DashboardPage';
import WorkItemDetailPage from '../features/workItems/WorkItemDetailPage';
import ProtectedRoute from '../components/ProtectedRoute';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* Public Routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected Operational Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/work-items/:id" element={<WorkItemDetailPage />} />
        </Route>

        {/* Catch-all Not Found Route */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

