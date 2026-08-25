import { useRequester } from '../context/RequesterContext';

interface ComingSoonProps {
  title: string;
  issue: string;
}

/** Placeholder for a screen built in a later Lab 2 issue; proves routing/guard/context wiring now. */
export function ComingSoon({ title, issue }: ComingSoonProps) {
  const { requester } = useRequester();

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-4">
        <h1 className="h4 fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>
          {title}
        </h1>
        <p className="text-muted mb-0">
          Acting as <strong>{requester?.name}</strong>. This screen is implemented in {issue}.
        </p>
      </div>
    </div>
  );
}

export default ComingSoon;
