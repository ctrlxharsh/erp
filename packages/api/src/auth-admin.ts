/** Account administration in the auth system (Neon Auth). Implemented in the web app; faked in tests. */
export interface AuthAdmin {
  /** The user's id if an account with this email exists. */
  findUserIdByEmail(email: string): Promise<string | null>;
  /** Creates an account without a password and returns its id. */
  createUser(input: { email: string; name: string }): Promise<{ id: string }>;
  /** Emails a link where the person sets their own password. */
  sendPasswordSetupEmail(email: string): Promise<void>;
}
