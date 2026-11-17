import React from 'react';
import { createHashRouter, Navigate, Outlet } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { SignupPage } from './components/auth/SignupPage';
import { ForgotPasswordPage } from './components/auth/ForgotPasswordPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import { MyTasksPage } from './pages/MyTasksPage';
import { InboxPage } from './pages/InboxPage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChatPage } from './pages/ChatPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { ImpersonatePage } from './pages/ImpersonatePage';

export const router = createHashRouter([
  {
    path: '/',
    element: <Outlet />,
    errorElement: <RouteErrorPage />,
    children: [
  {
    index: true,
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: 'login',
    element: <LoginPage />,
  },
  {
    path: 'impersonate',
    element: <ImpersonatePage />,
  },
  {
    path: 'signup',
    element: <SignupPage />,
  },
  {
    path: 'forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: 'privacy',
    element: <PrivacyPage />,
  },
  {
    path: 'terms',
    element: <TermsPage />,
  },
  {
    // Protected routes: any authenticated user
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'projects',
        element: <ProjectsPage />,
      },
      {
        path: 'projects/:id',
        element: <ProjectDetailPage />,
      },
      {
        path: 'my-tasks',
        element: <MyTasksPage />,
      },
      {
        path: 'inbox',
        element: <InboxPage />,
      },
      {
        path: 'chat',
        element: <ChatPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
  {
    // Admin routes: Super Admin & Admin (Admin sees limited tabs inside AdminPage)
    element: (
      <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'admin',
        element: <AdminPage />,
      },
      {
        path: 'admin/users',
        element: <AdminPage />,
      },
      {
        path: 'admin/departments',
        element: <AdminPage />,
      },
      {
        path: 'admin/invite',
        element: <AdminPage />,
      },
      {
        path: 'admin/analytics',
        element: <AdminPage />,
      },
    ],
  },
  {
    // Payroll: Super Admin ONLY
    element: (
      <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'admin/payroll',
        element: <AdminPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
    ],
  },
]);
