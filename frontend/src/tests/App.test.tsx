import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('App', () => {
  it('should render the app shell with OpsFlow header', () => {
    renderApp();
    expect(screen.getByText('OpsFlow')).toBeInTheDocument();
  });

  it('should render the welcome message on home page', () => {
    renderApp();
    expect(screen.getByText('Welcome to OpsFlow')).toBeInTheDocument();
  });
});
