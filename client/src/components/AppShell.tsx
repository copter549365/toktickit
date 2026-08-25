import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useRequester } from '../context/RequesterContext';
import { Button } from './Button';

/** Application shell: brand, nav, current Requester identity (ui-spec.md §4.1). */
export function AppShell() {
  const { requester, changeRequester } = useRequester();
  const navigate = useNavigate();

  const handleChangeRequester = () => {
    changeRequester();
    navigate('/select-requester', { replace: true });
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
                <NavLink to="/tickets" end className={navLinkClass}>
                  My Tickets
                </NavLink>
                <NavLink to="/tickets/new" className={navLinkClass}>
                  Create Ticket
                </NavLink>
              </div>
              <div className="d-flex align-items-center gap-3 mt-3 mt-md-0 text-white">
                {requester && (
                  <>
                    <span data-testid="acting-requester-name">{requester.name}</span>
                    <Button variant="secondary" onClick={handleChangeRequester}>
                      Change Requester
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
