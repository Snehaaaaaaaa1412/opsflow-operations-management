import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
          OpsFlow &mdash; Operational Work Management
        </div>
      </footer>
    </div>
  );
}
