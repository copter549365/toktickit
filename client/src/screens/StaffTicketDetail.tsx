import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';

/**
 * Placeholder destination for the Ticket Queue's "Open" action (ui-spec.md §5.5). The full
 * operational view — claim/reassign, IT Priority, status transitions, and Internal Notes — is
 * Issue 6's scope, which will replace this screen entirely.
 */
export function StaffTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="py-5 text-center">
      <div className="zg-state-panel">
        <div className="zg-state-panel__icon" aria-hidden="true">
          🚧
        </div>
        <div className="zg-state-panel__message">
          Ticket #{id}: full operational detail is coming in a later increment.
        </div>
        <Button variant="primary" onClick={() => navigate('/staff/tickets')}>
          Back to Ticket Queue
        </Button>
      </div>
    </div>
  );
}

export default StaffTicketDetail;
