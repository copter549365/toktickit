export type UserRole = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AdminUserListParams {
  search?: string;
  role?: UserRole;
  /** Lab 4 D-18: filter by account status. Omit for all accounts. */
  isActive?: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  initialPassword: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}
