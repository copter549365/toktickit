import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { AppShell } from './components/AppShell';
import { Login } from './screens/Login';
import { ChangePassword } from './screens/ChangePassword';
import { CreateTicket } from './screens/CreateTicket';
import { MyTickets } from './screens/MyTickets';
import { RequesterTicketDetail } from './screens/RequesterTicketDetail';

/**
 * Role-appropriate landing screen. Requesters continue into the Lab 2 ticket screens;
 * IT Staff and Administrator workspaces land in later Lab 3 issues, so there is
 * intentionally nothing to route them into yet (ui-spec.md §5.3).
 */
function AuthenticatedHome() {
  const { user } = useAuth();

  if (user?.role === 'REQUESTER') {
    return <Navigate to="/tickets" replace />;
  }

  return (
    <div className="zg-state-panel" role="status">
      <div className="zg-state-panel__icon" aria-hidden="true">
        🚧
      </div>
      <div className="zg-state-panel__message">
        Your {user?.role === 'IT_STAFF' ? 'IT Staff' : 'Administrator'} workspace is coming in a later
        increment.
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<AuthenticatedHome />} />
              <Route path="tickets" element={<MyTickets />} />
              <Route path="tickets/new" element={<CreateTicket />} />
              <Route path="tickets/:id" element={<RequesterTicketDetail />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
