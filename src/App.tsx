import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { router } from './router';
import { queryClient } from './lib/queryClient';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--surface-dark, #161B22)',
            color: 'var(--text-primary, #E6EDF3)',
            border: '1px solid var(--border-dark, #30363D)',
            borderRadius: '8px',
            fontSize: '14px',
          },
          success: {
            iconTheme: {
              primary: '#00B894',
              secondary: '#FFFFFF',
            },
          },
          error: {
            iconTheme: {
              primary: '#FF6B6B',
              secondary: '#FFFFFF',
            },
          },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
