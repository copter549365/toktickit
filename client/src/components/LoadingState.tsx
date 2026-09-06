interface LoadingStateProps {
  message?: string;
}

/** Spinner + text loading indicator (ui-spec.md §3 "Loading") — never a blank screen. */
export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="zg-state-panel" role="status">
      <span className="spinner-border text-success mb-2" aria-hidden="true" />
      <div className="zg-state-panel__message">{message}</div>
    </div>
  );
}

export default LoadingState;
