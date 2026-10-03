import AppRoutes from './routes';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

