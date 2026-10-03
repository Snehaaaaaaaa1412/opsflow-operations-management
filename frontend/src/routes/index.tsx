import { Routes, Route } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import HomePage from '../pages/HomePage';
import NotFoundPage from '../pages/NotFoundPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        {/* Future routes will be added here:
            Phase 1: /login
            Phase 2: /teams
            Phase 3: /work-items
            Phase 10: /dashboard
        */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
