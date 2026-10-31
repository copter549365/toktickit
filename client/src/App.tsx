import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { AppShell } from './components/AppShell';
import { Login } from './screens/Login';
import { ChangePassword } from './screens/ChangePassword';
import { CreateTicket } from './screens/CreateTicket';
import { MyTickets } from './screens/MyTickets';
import { RequesterTicketDetail } from './screens/RequesterTicketDetail';
import { StaffTicketQueue } from './screens/StaffTicketQueue';
import { StaffTicketDetail } from './screens/StaffTicketDetail';
import { UserManagement } from './screens/UserManagement';
import { DashboardHome } from './screens/Dashboard';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              {/* FR-17, D-05: `/` and the post-login redirect open the role's dashboard. */}
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardHome />} />
              <Route element={<RequireRole roles={['REQUESTER']} />}>
                <Route path="tickets" element={<MyTickets />} />
                <Route path="tickets/new" element={<CreateTicket />} />
                <Route path="tickets/:id" element={<RequesterTicketDetail />} />
              </Route>
              <Route element={<RequireRole roles={['IT_STAFF', 'ADMINISTRATOR']} />}>
                <Route path="staff/tickets" element={<StaffTicketQueue />} />
                <Route path="staff/tickets/:id" element={<StaffTicketDetail />} />
              </Route>
              <Route element={<RequireRole roles={['ADMINISTRATOR']} />}>
                <Route path="admin/users" element={<UserManagement />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
