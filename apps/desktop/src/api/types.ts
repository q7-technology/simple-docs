export type Role = "admin" | "editor" | "reviewer";

/** GET /v1/auth/me */
export interface Me {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  scopes: string[];
}

/** GET /v1/branding: needs no session. */
export interface Branding {
  setup_needed: boolean;
  org_name: string | null;
  logo_id: string | null;
}

/** GET /v1/users */
export interface User {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
  locked: boolean;
  last_sign_in_at: string | null;
  created_at: string;
}

/** GET /v1/settings/org */
export interface Org {
  name: string | null;
  abn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_id: string | null;
}
