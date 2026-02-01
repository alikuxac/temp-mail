export interface EmailAddress {
  id: string;
  user_id: number;
  address: string;
  created_at: number;
  expires_at?: number;
}
