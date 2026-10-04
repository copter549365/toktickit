import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../../src/components/Badge';

describe('UI-15: Badge', () => {
  it('renders LOW requested priority with the low-priority class and label', () => {
    render(<Badge kind="priority" value="LOW" />);
    const badge = screen.getByText('Low');
    expect(badge).toHaveClass('badge-priority-low');
  });

  it('renders MEDIUM requested priority with the medium-priority class and label', () => {
    render(<Badge kind="priority" value="MEDIUM" />);
    const badge = screen.getByText('Medium');
    expect(badge).toHaveClass('badge-priority-medium');
  });

  it('renders HIGH requested priority with the high-priority class and label', () => {
    render(<Badge kind="priority" value="HIGH" />);
    const badge = screen.getByText('High');
    expect(badge).toHaveClass('badge-priority-high');
  });

  it('renders Current Status NEW with the status class and "New" label', () => {
    render(<Badge kind="status" value="NEW" />);
    const badge = screen.getByText('New');
    expect(badge).toHaveClass('badge-status-new');
  });

  it('renders IT Priority as "Not yet triaged" when no priority has been assigned', () => {
    render(<Badge kind="itPriority" value={null} />);
    const badge = screen.getByText('Not yet triaged');
    expect(badge).toHaveClass('badge-triage-pending');
  });

  it('renders IT Priority with the assigned value once triaged', () => {
    render(<Badge kind="itPriority" value="HIGH" />);
    const badge = screen.getByText('High');
    expect(badge).toHaveClass('badge-priority-high');
  });

  it('always pairs color with a readable text label, never color alone', () => {
    render(<Badge kind="priority" value="HIGH" />);
    expect(screen.getByText('High').textContent).toBe('High');
  });
});
