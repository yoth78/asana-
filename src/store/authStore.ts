import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Role, Invitation } from '../types';
import { useWorkspaceStore } from './workspaceStore';
import { useChatStore } from './chatStore';
import { useNotificationStore } from './notificationStore';
import { clearClientDataCaches } from '../hooks/useWorkspaceBootstrap';

const clearSessionStores = () => {
  useWorkspaceStore.getState().reset();
  useChatStore.getState().reset();
  useNotificationStore.getState().reset();
  clearClientDataCaches();
};

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  allUsers: User[];
  invitations: Invitation[];
  
  // Actions
  login: (email: string, password?: string) => Promise<void>;
  loginWithGoogle: (idToken: string, opts?: { intent?: 'login' | 'signup'; companyName?: string }) => Promise<void>;
  signup: (
    email: string,
    name: string,
    password?: string,
    companyName?: string
  ) => Promise<{
    requiresVerification: boolean;
    email: string;
    previewUrl?: string | null;
    devCode?: string;
    devHint?: string;
  }>;
  verifySignup: (email: string, code: string) => Promise<void>;
  resendSignupOtp: (email: string) => Promise<{
    previewUrl?: string | null;
    message?: string;
    devCode?: string;
    devHint?: string;
  }>;
  acceptInvitationWithToken: (token: string, code: string, password?: string) => Promise<void>;
  previewInvitation: (token: string) => Promise<{
    email: string;
    workspaceName: string;
    existingUser: boolean;
    requiresPassword: boolean;
    role?: string;
  }>;
  startInvitationAccept: (token: string) => Promise<{
    email: string;
    workspaceName?: string;
    existingUser?: boolean;
    requiresPassword?: boolean;
    message?: string;
    devCode?: string;
  }>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  setUser: (user: User | null) => void;
  inviteUser: (
    email: string,
    name: string,
    role: Role,
    departmentId?: string
  ) => Promise<{
    inviteUrl?: string;
    previewUrl?: string | null;
    message?: string;
    emailDelivered?: boolean;
    emailError?: string | null;
  }>;
  fetchMyWorkspaces: () => Promise<
    Array<{ id: string; name: string; role: Role; isActive: boolean; plan?: string }>
  >;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
  getInvitationLink: (invitationId: string) => Promise<string>;
  declineInvitation: (invitationId: string) => Promise<void>;
  updateUserRole: (userId: string, newRole: Role, departmentId?: string) => Promise<void>;
  removeUser: (userId: string) => Promise<void>;
  getUsersByDepartment: (departmentId: string) => User[];
  fetchUsers: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      allUsers: [],
      invitations: [],

      login: async (email: string, password?: string) => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const err = new Error(data.error || 'Login failed') as Error & {
              code?: string;
              email?: string;
            };
            err.code = data.code;
            err.email = data.email;
            throw err;
          }
          const { user, token } = await res.json();
          localStorage.setItem('token', token);
          clearSessionStores();
          set({ user, isAuthenticated: true, isLoading: false });
          get().fetchUsers();
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      loginWithGoogle: async (idToken, opts) => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              intent: opts?.intent || 'login',
              companyName: opts?.companyName
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = new Error(data.error || 'Google sign-in failed') as Error & {
              code?: string;
            };
            err.code = data.code;
            throw err;
          }
          localStorage.setItem('token', data.token);
          clearSessionStores();
          set({ user: data.user, isAuthenticated: true, isLoading: false });
          get().fetchUsers();
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      signup: async (email: string, name: string, password?: string, companyName?: string) => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, password, companyName })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || 'Signup failed');
          }

          // OTP step — do not touch session / localStorage yet.
          if (data.requiresVerification || !data.token || !data.user) {
            set({ isLoading: false });
            return {
              requiresVerification: true as const,
              email: (data.email as string) || email,
              previewUrl: (data.previewUrl as string | null | undefined) ?? null,
              devCode: data.devCode as string | undefined,
              devHint: data.devHint as string | undefined
            };
          }

          localStorage.setItem('token', data.token);
          clearSessionStores();
          set({ user: data.user, isAuthenticated: true, isLoading: false });
          get().fetchUsers();
          return { requiresVerification: false as const, email };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      verifySignup: async (email: string, code: string) => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/auth/verify-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || 'Verification failed');
          }
          const { user, token } = data;
          localStorage.setItem('token', token);
          clearSessionStores();
          set({ user, isAuthenticated: true, isLoading: false });
          get().fetchUsers();
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      resendSignupOtp: async (email: string) => {
        const res = await fetch('/api/auth/resend-signup-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to resend code');
        }
        return {
          previewUrl: (data.previewUrl as string | null | undefined) ?? null,
          message: data.message as string | undefined,
          devCode: data.devCode as string | undefined,
          devHint: data.devHint as string | undefined
        };
      },

      previewInvitation: async (token: string) => {
        const res = await fetch('/api/auth/invitations/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load invitation');
        }
        return {
          email: data.email as string,
          workspaceName: (data.workspaceName as string) || 'a workspace',
          existingUser: Boolean(data.existingUser),
          requiresPassword: data.requiresPassword !== false,
          role: data.role as string | undefined
        };
      },

      startInvitationAccept: async (token: string) => {
        const res = await fetch('/api/auth/invitations/accept/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to send confirmation code');
        }
        return {
          email: data.email as string,
          workspaceName: data.workspaceName as string | undefined,
          existingUser: Boolean(data.existingUser),
          requiresPassword: data.requiresPassword !== false,
          message: data.message as string | undefined,
          devCode: data.devCode as string | undefined
        };
      },

      acceptInvitationWithToken: async (token: string, code: string, password?: string) => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/auth/invitations/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, code, password })
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to accept invitation');
          }

          const { user, token: sessionToken } = await res.json();
          localStorage.setItem('token', sessionToken);
          clearSessionStores();
          set({ user, isAuthenticated: true, isLoading: false });
          get().fetchUsers();
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, isAuthenticated: false, allUsers: [], invitations: [] });
        // Prevent the next login from seeing the previous user's departments/projects.
        clearSessionStores();
      },

      updateProfile: async (data: Partial<User>) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');

        const res = await fetch('/api/auth/me', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(data)
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || 'Failed to update profile');
        }

        set((state) => ({ user: { ...(state.user as User), ...payload } }));
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      inviteUser: async (email: string, name: string, role: Role, departmentId?: string) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');
        
        const res = await fetch('/api/auth/invite', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Frontend-Url': window.location.origin
          },
          body: JSON.stringify({
            email,
            name,
            role,
            departmentId: departmentId || null,
            frontendUrl: window.location.origin
          })
        });
        
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to send invite');
        }
        
        await get().fetchUsers();
        return {
          inviteUrl: data.inviteUrl,
          previewUrl: data.previewUrl,
          message: data.message,
          emailDelivered: Boolean(data.emailDelivered),
          emailError: (data.emailError as string | null | undefined) ?? null
        };
      },

      getInvitationLink: async (invitationId: string) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');

        const res = await fetch(`/api/auth/invitations/${invitationId}/link`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Frontend-Url': window.location.origin
          },
          body: JSON.stringify({ frontendUrl: window.location.origin })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to get invitation link');
        }
        if (!data.inviteUrl) throw new Error('No invitation link returned');
        return data.inviteUrl as string;
      },

      fetchMyWorkspaces: async () => {
        const token = localStorage.getItem('token');
        if (!token) return [];
        const res = await fetch('/api/auth/workspaces', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data.error || 'Failed to load workspaces');
        return data as Array<{ id: string; name: string; role: Role; isActive: boolean; plan?: string }>;
      },

      switchWorkspace: async (workspaceId: string) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');
        const res = await fetch('/api/auth/switch-workspace', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ workspaceId })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to switch workspace');
        clearSessionStores();
        set({ user: data.user, isAuthenticated: true });
        await get().fetchUsers();
      },

      createWorkspace: async (name: string) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');
        const res = await fetch('/api/auth/workspaces', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to create workspace');
        clearSessionStores();
        set({ user: data.user, isAuthenticated: true });
        await get().fetchUsers();
      },

      fetchUsers: async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
          const headers = { Authorization: `Bearer ${token}` };
          const [meRes, usersRes, invRes] = await Promise.all([
            fetch('/api/auth/me', { headers }),
            fetch('/api/auth/users', { headers }),
            fetch('/api/auth/invitations/pending', { headers })
          ]);

          if (meRes.ok) {
            const me = await meRes.json();
            set({ user: me, isAuthenticated: true });
          }

          if (usersRes.ok) {
            const users = await usersRes.json();
            set({ allUsers: users });
          }

          if (invRes.ok) {
            const pendingInvitations = await invRes.json();
            set({ invitations: pendingInvitations });
          } else {
            set({ invitations: [] });
          }
        } catch (error) {
          console.error('Failed to fetch users', error);
        }
      },

      declineInvitation: async (invitationId: string) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');
        try {
          const res = await fetch(`/api/auth/invitations/${invitationId}/decline`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to revoke invitation');
          }
          await get().fetchUsers();
        } catch (error) {
          console.error(error);
          throw error;
        }
      },

      updateUserRole: async (userId: string, newRole: Role, departmentId?: string) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');

        const res = await fetch(`/api/auth/users/${userId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ role: newRole, departmentId: departmentId || null })
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update user');
        }

        const updated = await res.json().catch(() => null);
        if (updated && get().user?.id === userId) {
          set((state) => ({ user: { ...(state.user as User), ...updated } }));
        }
        await get().fetchUsers();
      },

      removeUser: async (userId: string) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');

        const res = await fetch(`/api/auth/users/${userId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to remove user');
        }

        await get().fetchUsers();
      },

      getUsersByDepartment: (departmentId: string) => {
        return get().allUsers.filter(u => (u as any).teamId === departmentId || u.departmentId === departmentId);
      }
    }),
    {
      name: 'auth-storage-v4',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);
