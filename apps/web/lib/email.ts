import "server-only";
import type { EmailSender } from "@erp/api";

/**
 * Sends email through Resend's HTTP API. Without RESEND_API_KEY (local development) it only logs
 * that a message would have been sent, never the address or content.
 */
export function createEmailSender(): EmailSender {
  return {
    async send({ to, subject, text, html }) {
      const key = process.env.RESEND_API_KEY;
      if (!key) {
        console.info("[email] RESEND_API_KEY is not set; message not sent");
        return;
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "Pixel Schoolware <onboarding@resend.dev>",
          to: [to],
          subject,
          text,
          ...(html ? { html } : {}),
        }),
      });
      if (!response.ok) throw new Error(`Email provider answered ${response.status}`);
    },
  };
}
