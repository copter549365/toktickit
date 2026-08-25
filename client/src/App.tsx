import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequesterProvider } from './context/RequesterContext';
import { RequireRequester } from './components/RequireRequester';
import { AppShell } from './components/AppShell';
import { RequesterSelection } from './screens/RequesterSelection';
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
              <Route
                path="tickets"
                element={<ComingSoon title="My Tickets" issue="Issue 5" />}
              />
              <Route
                path="tickets/new"
                element={<ComingSoon title="Create Ticket" issue="Issue 4" />}
              />
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
