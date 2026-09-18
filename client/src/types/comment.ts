export interface PublicComment {
  id: number;
  content: string;
  createdAt: string;
  author: {
    id: number;
    name: string;
    role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
  };
}

/** Same wire shape as PublicComment (api-spec.md §5) — kept as a distinct name for clarity. */
export type InternalNote = PublicComment;
