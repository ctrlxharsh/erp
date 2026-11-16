/** Sends an email. Implemented on Resend in the web app; faked in tests. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
