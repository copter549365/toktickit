import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { AppShell } from './components/AppShell';
import { Login } from './screens/Login';
import { ChangePassword } from './screens/ChangePassword';
import { CreateTicket } from './screens/CreateTicket';
import { MyTickets } from './screens/MyTickets';
import { RequesterTicketDetail } from './screens/RequesterTicketDetail';
import { StaffTicketQueue } from './screens/StaffTicketQueue';
import { StaffTicketDetail } from './screens/StaffTicketDetail';
import { UserManagement } from './screens/UserManagement';

/**
 * Role-appropriate landing screen. Requesters continue into the Lab 2 ticket screens, IT Staff
 * land on their Ticket Queue, and Administrators land on User Management (ui-spec.md §5.3, §5.7).
 */
function AuthenticatedHome() {
  const { user } = useAuth();

  if (user?.role === 'REQUESTER') {
    return <Navigate to="/tickets" replace />;
  }

  if (user?.role === 'IT_STAFF') {
    return <Navigate to="/staff/tickets" replace />;
  }

  if (user?.role === 'ADMINISTRATOR') {
    return <Navigate to="/admin/users" replace />;
  }

  return null;
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
              <Route path="staff/tickets" element={<StaffTicketQueue />} />
              <Route path="staff/tickets/:id" element={<StaffTicketDetail />} />
              <Route path="admin/users" element={<UserManagement />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
