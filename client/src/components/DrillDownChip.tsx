interface DrillDownChipProps {
  onClear: () => void;
  onDismiss: () => void;
}

/** "Filtered from Dashboard" chip shown on a list opened by a dashboard link (ui-spec §7). */
export function DrillDownChip({ onClear, onDismiss }: DrillDownChipProps) {
  return (
    <div className="zg-drilldown-chip mb-3" role="status" aria-label="Filtered from Dashboard">
      <span>Filtered from Dashboard</span>
      <button type="button" className="btn btn-link p-0 zg-drilldown-chip__clear" onClick={onClear}>
        Clear filters
      </button>
      <button type="button" className="btn-close zg-drilldown-chip__dismiss" aria-label="Dismiss" onClick={onDismiss} />
    </div>
  );
}

export default DrillDownChip;
