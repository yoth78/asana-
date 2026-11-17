import React from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { ErrorPage } from '../components/common/ErrorPage';

/** Shown when a route loader/action/render fails (React Router errorElement). */
export const RouteErrorPage: React.FC = () => {
  const error = useRouteError();

  let title = 'Something went wrong';
  let message =
    'We could not open this page. Try again in a moment, or go back to your dashboard.';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Page not found';
      message = 'This link does not match any page in Teamflow.';
    } else if (error.status === 401 || error.status === 403) {
      title = 'Access denied';
      message = 'You do not have permission to view this page.';
    } else if (error.status >= 500) {
      title = 'Service unavailable';
      message = 'Our servers had a problem. Please try again shortly.';
    }
  }

  if (import.meta.env.DEV && error instanceof Error) {
    console.error('[RouteError]', error);
  }

  return (
    <ErrorPage
      title={title}
      message={message}
      onRetry={() => window.location.reload()}
    />
  );
};
