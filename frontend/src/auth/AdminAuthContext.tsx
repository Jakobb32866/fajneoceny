import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { invalidate } from '../api/cache';
import { setAdminUnauthorizedHandler } from '../api/client';
import { clearToken, getToken, setToken } from '../api/token';
import type { AdminAccount } from '../api/types';

/**
 * Admin session state, deliberately kept separate from AuthContext.
 *
 * Admins are a different account type on the backend — different credentials,
 * a differently-signed token, and routes that each side's token is refused on.
 * Modelling them as one identity would mean one of the two is always wrong.
 * Keeping them apart also means an admin signing in on a shared machine does
 * not end a student's session, and vice versa.
 */

export type AdminAuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  admin: AdminAccount | null;
  /** True for the single server-wide super admin. */
  isSuperAdmin: boolean;
  /**
   * The university an admin request should act on: a normal admin's own, or
   * whichever one a super admin has selected. Undefined means "not chosen
   * yet", which university-scoped screens must handle rather than querying.
   */
  scopedUniversityId: string | undefined;
  selectUniversity: (universityId: string | undefined) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [admin, setAdmin] = useState<AdminAccount | null>(null);
  const [selectedUniversityId, setSelectedUniversityId] = useState<string | undefined>();

  useEffect(() => {
    setAdminUnauthorizedHandler(() => {
      // Fires when the backend rejects the admin token — including the case
      // where this admin was disabled or demoted mid-session, since the
      // backend re-reads the account on every request.
      invalidate('admin');
      setAdmin(null);
      setSelectedUniversityId(undefined);
      setStatus('signedOut');
    });

    (async () => {
      const token = await getToken('admin');
      if (!token) {
        setStatus('signedOut');
        return;
      }
      try {
        const me = await api.admin.me();
        setAdmin(me);
        setStatus('signedIn');
      } catch {
        await clearToken('admin');
        setAdmin(null);
        setStatus('signedOut');
      }
    })();

    return () => setAdminUnauthorizedHandler(null);
  }, []);

  async function signIn(email: string, password: string) {
    const response = await api.admin.login(email, password);
    await setToken(response.token, 'admin');
    setAdmin(response.admin);
    setSelectedUniversityId(undefined);
    setStatus('signedIn');
  }

  async function signOut() {
    await clearToken('admin');
    // Admin views are per-account: another admin signing in on this device
    // must not see the previous one's cached queues and user lists.
    invalidate('admin');
    setAdmin(null);
    setSelectedUniversityId(undefined);
    setStatus('signedOut');
  }

  const isSuperAdmin = admin?.role === 'SuperAdmin';

  return (
    <AdminAuthContext.Provider
      value={{
        status,
        admin,
        isSuperAdmin,
        // A normal admin's scope comes from their account and cannot be
        // changed; only a super admin picks one.
        scopedUniversityId: isSuperAdmin ? selectedUniversityId : admin?.universityId ?? undefined,
        selectUniversity: setSelectedUniversityId,
        signIn,
        signOut,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return ctx;
}
