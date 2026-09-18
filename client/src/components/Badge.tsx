export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TicketCurrentStatus = 'NEW';
export type UserRole = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

type BadgeProps =
  | { kind: 'priority'; value: TicketPriority }
  | { kind: 'status'; value: TicketCurrentStatus }
  | { kind: 'itPriority' }
  | { kind: 'role'; value: UserRole };

const ROLE_LABEL: Record<UserRole, string> = {
  REQUESTER: 'Requester',
  IT_STAFF: 'IT Staff',
  ADMINISTRATOR: 'Administrator',
};

const ROLE_CLASS: Record<UserRole, string> = {
  REQUESTER: 'badge-role-requester',
  IT_STAFF: 'badge-role-it-staff',
  ADMINISTRATOR: 'badge-role-administrator',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  LOW: 'badge-priority-low',
  MEDIUM: 'badge-priority-medium',
  HIGH: 'badge-priority-high',
};

const STATUS_LABEL: Record<TicketCurrentStatus, string> = {
  NEW: 'New',
};

const STATUS_CLASS: Record<TicketCurrentStatus, string> = {
  NEW: 'badge-status-new',
};

/**
 * Presentational Requested Priority / Current Status / IT Priority badge.
 * Always pairs color with a text label (ui-spec.md §3) — never color-only.
 */
export function Badge(props: BadgeProps) {
  if (props.kind === 'itPriority') {
    return <span className="zg-badge badge-triage-pending">Not yet triaged</span>;
  }

  if (props.kind === 'role') {
    return <span className={`zg-badge ${ROLE_CLASS[props.value]}`}>{ROLE_LABEL[props.value]}</span>;
  }

  if (props.kind === 'priority') {
    return (
      <span className={`zg-badge ${PRIORITY_CLASS[props.value]}`}>
        {PRIORITY_LABEL[props.value]}
      </span>
    );
  }

  return <span className={`zg-badge ${STATUS_CLASS[props.value]}`}>{STATUS_LABEL[props.value]}</span>;
}

export default Badge;
