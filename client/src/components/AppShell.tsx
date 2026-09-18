import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';
import { Badge } from './Badge';

/** Application shell: brand, role-based nav, authenticated identity (ui-spec.md §5.3). */
export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `zg-shell-nav-link${isActive ? ' active' : ''}`;

  return (
    <div className="min-vh-100 d-flex flex-column" style={{ background: 'var(--color-bg)' }}>
      <header className="zg-shell-header">
        <nav className="navbar navbar-dark navbar-expand-md">
          <div className="container-fluid" style={{ maxWidth: 1140 }}>
            <span className="navbar-brand zg-shell-brand mb-0">TokTickIT</span>
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#zg-shell-nav"
              aria-controls="zg-shell-nav"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span className="navbar-toggler-icon" />
            </button>
            <div className="collapse navbar-collapse" id="zg-shell-nav">
              <div className="d-flex flex-column flex-md-row gap-2 me-auto mt-3 mt-md-0 ms-md-3">
                {user?.role === 'REQUESTER' && (
                  <>
                    <NavLink to="/tickets" end className={navLinkClass}>
                      My Tickets
                    </NavLink>
                    <NavLink to="/tickets/new" className={navLinkClass}>
                      Create Ticket
                    </NavLink>
                  </>
                )}
              </div>
              <div className="d-flex align-items-center gap-3 mt-3 mt-md-0 text-white">
                {user && (
                  <>
                    <span data-testid="auth-user-name">{user.name}</span>
                    <Badge kind="role" value={user.role} />
                    <Button variant="secondary" onClick={handleSignOut}>
                      Sign Out
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </nav>
      </header>

      <main className="zg-shell-main flex-grow-1 w-100">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;
