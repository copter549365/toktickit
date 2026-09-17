import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchActiveRequesters } from '../api/requesters';
import { useRequester } from '../context/RequesterContext';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import type { Requester } from '../types/requester';

type ScreenState = 'loading' | 'loaded' | 'empty' | 'failure';

/**
 * Development Requester Selection screen (ui-spec.md §4.2).
 * Explicitly a Lab 2 test harness, not a login screen (BR-03).
 */
export function RequesterSelection() {
  const [state, setState] = useState<ScreenState>('loading');
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const { selectRequester } = useRequester();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setState('loading');
    setSelectedId('');
    try {
      const data = await fetchActiveRequesters();
      setRequesters(data);
      setState(data.length > 0 ? 'loaded' : 'empty');
    } catch {
      setState('failure');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = () => setSelectedId('');

  const handleContinue = () => {
    const requester = requesters.find((r) => String(r.id) === selectedId);
    if (!requester) return;
    selectRequester(requester);
    navigate('/tickets', { replace: true });
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="card border-0 shadow-sm zg-selection-card">
        <div className="card-body p-4">
          <div className="text-center mb-3" aria-hidden="true">
            <span style={{ fontSize: 32 }}>🧪</span>
          </div>
          <h1 className="h4 fw-bold text-center mb-2" style={{ color: 'var(--color-primary)' }}>
            Select Development Requester
          </h1>
          <p className="text-center small mb-4">
            Select a Development Requester to test requester-specific ticket behavior. This is
            not a login screen. Authentication and role-based access will be introduced in Lab 3.
          </p>

          {state === 'loading' && <LoadingState message="Loading development requesters…" />}

          {state === 'failure' && (
            <ErrorState
              message="Unable to load development requesters. Please try again."
              onRetry={load}
            />
          )}

          {state === 'empty' && (
            <div className="zg-state-panel" role="status">
              <div className="zg-state-panel__message">
                No active development requesters are available right now.
              </div>
            </div>
          )}

          {state === 'loaded' && (
            <>
              <FormField htmlFor="requester-select" label="Development Requester" required>
                <select
                  id="requester-select"
                  className="form-select field-editable"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a requester…
                  </option>
                  {requesters.map((requester) => (
                    <option key={requester.id} value={requester.id}>
                      {requester.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <p className="text-muted small mb-4">
                Only active development requesters are shown.
              </p>
            </>
          )}

          <div className="d-flex gap-2 justify-content-end mt-2">
            <Button variant="secondary" onClick={handleCancel} disabled={state !== 'loaded'}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={state !== 'loaded' || selectedId === ''}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RequesterSelection;
