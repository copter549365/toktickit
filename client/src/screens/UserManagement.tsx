import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAdminUsers, createAdminUser, updateAdminUser, resetUserPassword, ApiError } from '../api/adminUsers';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { NoResultsState } from '../components/NoResultsState';
import { generateCompliantPassword } from '../utils/passwordGenerator';
import type { AdminUser, UserRole } from '../types/adminUser';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'REQUESTER', label: 'Requester' },
  { value: 'IT_STAFF', label: 'IT Staff' },
  { value: 'ADMINISTRATOR', label: 'Administrator' },
];

interface CreateFormState {
  name: string;
  email: string;
  role: UserRole;
  initialPassword: string;
}

function emptyCreateForm(): CreateFormState {
  return { name: '', email: '', role: 'REQUESTER', initialPassword: generateCompliantPassword() };
}

export function UserManagement() {
  const { user: currentUser } = useAuth();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [retryCount, setRetryCount] = useState(0);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm());
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; email: string; role: UserRole; isActive: boolean }>({
    name: '',
    email: '',
    role: 'REQUESTER',
    isActive: true,
  });
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Counted from its own unfiltered query: deriving it from `users` undercounts whenever a search
  // or role filter hides other Administrators, wrongly locking a non-last Admin's role/Active
  // controls (Issue 8 visual inspection). The server re-checks BR-20 regardless.
  const [activeAdminCount, setActiveAdminCount] = useState<number | null>(null);

  const hasActiveFilters = Boolean(search || roleFilter);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    fetchAdminUsers({ search: search || undefined, role: roleFilter || undefined })
      .then((data) => {
        setUsers(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setLoadError(
          err instanceof ApiError ? 'Unable to load users. Please try again.' : 'Unable to reach the server. Please try again.',
        );
        setIsLoading(false);
      });
  }, [search, roleFilter, retryCount]);

  useEffect(() => {
    fetchAdminUsers({ role: 'ADMINISTRATOR' })
      .then((admins) => setActiveAdminCount(admins.filter((u) => u.isActive).length))
      .catch(() => setActiveAdminCount(null));
  }, [retryCount]);

  const handleClearFilters = () => {
    setSearchInput('');
    setSearch('');
    setRoleFilter('');
  };

  const openCreateModal = () => {
    setCreateForm(emptyCreateForm());
    setCreateFieldErrors({});
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    setCreateError(null);
    setCreateFieldErrors({});
    try {
      await createAdminUser({ ...createForm, isActive: true });
      setShowCreateModal(false);
      setRetryCount((c) => c + 1);
    } catch (err) {
      if (err instanceof ApiError && err.data.fieldErrors) {
        setCreateFieldErrors(err.data.fieldErrors);
      } else if (err instanceof ApiError && err.data.error === 'EMAIL_ALREADY_EXISTS') {
        setCreateFieldErrors({ email: 'A user with this email address already exists.' });
      } else {
        setCreateError('Unable to create the user right now. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const openEditModal = (target: AdminUser) => {
    setEditingUser(target);
    setEditForm({ name: target.name, email: target.email, role: target.role, isActive: target.isActive });
    setEditFieldErrors({});
    setEditError(null);
    setResetPasswordValue('');
    setResetPasswordError(null);
    setResetPasswordSuccess(false);
  };

  const closeEditModal = () => setEditingUser(null);

  const isEditingSelf = editingUser !== null && currentUser !== null && editingUser.id === currentUser.id;
  const isEditingLastActiveAdmin =
    editingUser !== null &&
    editingUser.role === 'ADMINISTRATOR' &&
    editingUser.isActive &&
    activeAdminCount !== null &&
    activeAdminCount <= 1;

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser || isSavingEdit) return;

    setIsSavingEdit(true);
    setEditError(null);
    setEditFieldErrors({});
    try {
      await updateAdminUser(editingUser.id, editForm);
      setEditingUser(null);
      setRetryCount((c) => c + 1);
    } catch (err) {
      if (err instanceof ApiError && err.data.fieldErrors) {
        setEditFieldErrors(err.data.fieldErrors);
      } else if (err instanceof ApiError && err.data.error === 'EMAIL_ALREADY_EXISTS') {
        setEditFieldErrors({ email: 'A user with this email address already exists.' });
      } else if (err instanceof ApiError && err.data.error === 'SELF_DEACTIVATION_PROHIBITED') {
        setEditError('You cannot deactivate your own account.');
      } else if (err instanceof ApiError && err.data.error === 'LAST_ADMIN_PROTECTION') {
        setEditError('The last active Administrator cannot be deactivated or have their role changed.');
      } else {
        setEditError('Unable to save changes right now. Please try again.');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleGenerateResetPassword = () => {
    setResetPasswordValue(generateCompliantPassword());
    setResetPasswordSuccess(false);
    setResetPasswordError(null);
  };

  const handleResetPassword = async () => {
    if (!editingUser || !resetPasswordValue || isResettingPassword) return;
    setIsResettingPassword(true);
    setResetPasswordError(null);
    try {
      await resetUserPassword(editingUser.id, resetPasswordValue);
      setResetPasswordSuccess(true);
      setRetryCount((c) => c + 1);
    } catch (err) {
      if (err instanceof ApiError && err.data.fieldErrors) {
        setResetPasswordError(Object.values(err.data.fieldErrors)[0] ?? 'Unable to reset the password.');
      } else {
        setResetPasswordError('Unable to reset the password right now. Please try again.');
      }
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div className="container-fluid p-0">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-4">
        <h1 className="h4 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          User Management
        </h1>
        <Button variant="primary" onClick={openCreateModal}>
          Create New User
        </Button>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-6">
              <label htmlFor="user-search-input" className="zg-label">
                Search
              </label>
              <input
                id="user-search-input"
                type="search"
                className="form-control field-editable"
                placeholder="Search by name or email"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="col-8 col-md-4">
              <label htmlFor="user-role-filter" className="zg-label">
                Role
              </label>
              <select
                id="user-role-filter"
                className="form-select field-editable"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as UserRole | '')}
              >
                <option value="">All Roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-4 col-md-2">
              <Button variant="tertiary" onClick={handleClearFilters} disabled={!hasActiveFilters}>
                Clear Filters
              </Button>
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="py-5">
          <LoadingState message="Loading users…" />
        </div>
      )}

      {!isLoading && loadError && <ErrorState message={loadError} onRetry={() => setRetryCount((c) => c + 1)} />}

      {!isLoading && !loadError && users.length === 0 && !hasActiveFilters && (
        <EmptyState message="No users found." />
      )}

      {!isLoading && !loadError && users.length === 0 && hasActiveFilters && (
        <NoResultsState
          message="No users match your filters."
          action={
            <Button variant="secondary" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          }
        />
      )}

      {!isLoading && !loadError && users.length > 0 && (
        <>
        {/* Desktop / tablet table */}
        <div className="d-none d-md-block card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" data-testid="user-management-table">
              <thead>
                <tr>
                  <th scope="col">Full Name</th>
                  <th scope="col">Email Address</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.id}`}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <Badge kind="role" value={u.role} />
                    </td>
                    <td>
                      <span className={`zg-badge ${u.isActive ? 'badge-account-active' : 'badge-account-inactive'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <Button variant="secondary" onClick={() => openEditModal(u)}>
                        Edit User
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile card layout — a 5-column table cannot fit 375px without hiding Role/Status/Edit
            behind a horizontal scroll (ui-spec.md §6, Issue 8 visual inspection). */}
        <div className="d-md-none d-flex flex-column gap-2">
          {users.map((u) => (
            <div key={u.id} className="card border-0 shadow-sm" data-testid={`user-card-${u.id}`}>
              <div className="card-body p-3">
                <div className="fw-semibold">{u.name}</div>
                <div className="small text-muted text-break mb-2">{u.email}</div>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div className="d-flex flex-wrap gap-2">
                    <Badge kind="role" value={u.role} />
                    <span className={`zg-badge ${u.isActive ? 'badge-account-active' : 'badge-account-inactive'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <Button variant="secondary" onClick={() => openEditModal(u)}>
                    Edit User
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {showCreateModal && (
        <Modal title="Create New User" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateSubmit} noValidate>
            {createError && (
              <div className="zg-error-banner mb-3" role="alert">
                {createError}
              </div>
            )}

            <FormField htmlFor="create-name" label="Full Name" required error={createFieldErrors.name}>
              <input
                id="create-name"
                type="text"
                className={`form-control field-editable ${createFieldErrors.name ? 'field-invalid' : ''}`}
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                disabled={isCreating}
              />
            </FormField>

            <FormField htmlFor="create-email" label="Email Address" required error={createFieldErrors.email}>
              <input
                id="create-email"
                type="email"
                className={`form-control field-editable ${createFieldErrors.email ? 'field-invalid' : ''}`}
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                disabled={isCreating}
              />
            </FormField>

            <FormField htmlFor="create-role" label="Role" required error={createFieldErrors.role}>
              <select
                id="create-role"
                className="form-select field-editable"
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                disabled={isCreating}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              htmlFor="create-initial-password"
              label="Initial Password"
              required
              error={createFieldErrors.initialPassword}
            >
              <div className="d-flex gap-2">
                <input
                  id="create-initial-password"
                  type="text"
                  className={`form-control field-editable ${createFieldErrors.initialPassword ? 'field-invalid' : ''}`}
                  value={createForm.initialPassword}
                  onChange={(e) => setCreateForm((f) => ({ ...f, initialPassword: e.target.value }))}
                  disabled={isCreating}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCreateForm((f) => ({ ...f, initialPassword: generateCompliantPassword() }))}
                  disabled={isCreating}
                >
                  Generate
                </Button>
              </div>
            </FormField>
            <p className="text-muted small">User will be required to change their password on first login.</p>

            <div className="d-flex gap-2 justify-content-end mt-3">
              <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" busy={isCreating} busyLabel="Saving…">
                Save User
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {editingUser && (
        <Modal title="Edit User" onClose={closeEditModal}>
          <form onSubmit={handleEditSubmit} noValidate>
            {editError && (
              <div className="zg-error-banner mb-3" role="alert">
                {editError}
              </div>
            )}

            <FormField htmlFor="edit-name" label="Full Name" required error={editFieldErrors.name}>
              <input
                id="edit-name"
                type="text"
                className={`form-control field-editable ${editFieldErrors.name ? 'field-invalid' : ''}`}
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                disabled={isSavingEdit}
              />
            </FormField>

            <FormField htmlFor="edit-email" label="Email Address" required error={editFieldErrors.email}>
              <input
                id="edit-email"
                type="email"
                className={`form-control field-editable ${editFieldErrors.email ? 'field-invalid' : ''}`}
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                disabled={isSavingEdit}
              />
            </FormField>

            <FormField htmlFor="edit-role" label="Role" required error={editFieldErrors.role}>
              <select
                id="edit-role"
                className="form-select field-editable"
                value={editForm.role}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                disabled={isSavingEdit || isEditingLastActiveAdmin}
                title={isEditingLastActiveAdmin ? 'The last active Administrator cannot be demoted.' : undefined}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {isEditingLastActiveAdmin && (
                <div className="small text-muted mt-1">The last active Administrator cannot be demoted.</div>
              )}
            </FormField>

            <div className="zg-field">
              <label className="zg-label d-flex align-items-center gap-2" htmlFor="edit-active-toggle">
                <input
                  id="edit-active-toggle"
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                  disabled={isSavingEdit || isEditingSelf || isEditingLastActiveAdmin}
                  title={
                    isEditingSelf
                      ? 'You cannot deactivate your own account.'
                      : isEditingLastActiveAdmin
                        ? 'The last active Administrator cannot be deactivated.'
                        : undefined
                  }
                />
                Active
              </label>
              {isEditingSelf && (
                <div className="small text-muted">You cannot deactivate your own account.</div>
              )}
              {!isEditingSelf && isEditingLastActiveAdmin && (
                <div className="small text-muted">The last active Administrator cannot be deactivated.</div>
              )}
            </div>

            <div className="d-flex gap-2 justify-content-end mt-3">
              <Button variant="secondary" type="button" onClick={closeEditModal} disabled={isSavingEdit}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" busy={isSavingEdit} busyLabel="Saving…">
                Save Changes
              </Button>
            </div>
          </form>

          <hr className="my-4" />

          <h3 className="h6 fw-bold mb-2">Reset Initial Password</h3>
          <p className="text-muted small mb-2">
            Generates a new temporary password and requires the user to change it at next login.
          </p>
          <div className="d-flex gap-2 mb-2">
            <input
              type="text"
              className="form-control field-editable"
              placeholder="Click Generate to create a new password"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              aria-label="New initial password"
              disabled={isResettingPassword}
            />
            <Button type="button" variant="secondary" onClick={handleGenerateResetPassword} disabled={isResettingPassword}>
              Generate
            </Button>
          </div>
          {resetPasswordError && (
            <div className="zg-validation-message mb-2" role="alert">
              {resetPasswordError}
            </div>
          )}
          {resetPasswordSuccess && (
            <div className="text-success small mb-2" role="status">
              ✓ Password reset. The user must change it at next login.
            </div>
          )}
          <Button
            variant="destructive"
            onClick={handleResetPassword}
            disabled={!resetPasswordValue || isResettingPassword}
            busy={isResettingPassword}
            busyLabel="Resetting…"
          >
            Reset Password
          </Button>
        </Modal>
      )}
    </div>
  );
}

export default UserManagement;
