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
