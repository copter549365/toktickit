import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequesterProvider } from './context/RequesterContext';
import { RequireRequester } from './components/RequireRequester';
import { AppShell } from './components/AppShell';
import { RequesterSelection } from './screens/RequesterSelection';
import { CreateTicket } from './screens/CreateTicket';
import { MyTickets } from './screens/MyTickets';
import { ComingSoon } from './pages/ComingSoon';

function App() {
  return (
    <BrowserRouter>
      <RequesterProvider>
        <Routes>
          <Route path="/select-requester" element={<RequesterSelection />} />
          <Route element={<RequireRequester />}>
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/tickets" replace />} />
              <Route path="tickets" element={<MyTickets />} />
              <Route path="tickets/new" element={<CreateTicket />} />
              <Route
                path="tickets/:id"
                element={<ComingSoon title="Ticket Detail" issue="Issue 6" />}
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RequesterProvider>
    </BrowserRouter>
  );
}

export default App;
