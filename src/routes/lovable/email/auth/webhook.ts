import * as React from "react";
import { createAuthEmailHandler } from "@lovable.dev/email-js";
import { createFileRoute } from "@tanstack/react-router";
import { SignupEmail } from "@/lib/email-templates/signup";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";

// Configuration
const SITE_NAME = "mikromagic";
const SENDER_DOMAIN = "notify.mikromagic.app";
const ROOT_DOMAIN = "mikromagic.app";
const FROM_DOMAIN = "mikromagic.app";
const SITE_URL = `https://${ROOT_DOMAIN}`;

// Lazy so a missing LOVABLE_API_KEY does not crash the whole route tree
// (and local /app preview) at import time. Production still needs the key
// when this webhook is actually called.
function getHandler() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return async () =>
      new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
  }
  return createAuthEmailHandler({
    apiKey,
    from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
    senderDomain: SENDER_DOMAIN,
    sendUrl: process.env["LOVABLE_SEND_URL"],
    emails: {
      signup: {
        subject: "Confirm your email",
        render: (data) =>
          React.createElement(SignupEmail, {
            siteName: SITE_NAME,
            siteUrl: SITE_URL,
            recipient: data.email,
            confirmationUrl: data.url,
          }),
      },
      invite: {
        subject: "You've been invited",
        render: (data) =>
          React.createElement(InviteEmail, {
            siteName: SITE_NAME,
            siteUrl: SITE_URL,
            confirmationUrl: data.url,
          }),
      },
      magiclink: {
        subject: "Your login link",
        render: (data) =>
          React.createElement(MagicLinkEmail, {
            siteName: SITE_NAME,
            confirmationUrl: data.url,
          }),
      },
      recovery: {
        subject: "Reset your password",
        render: (data) =>
          React.createElement(RecoveryEmail, {
            siteName: SITE_NAME,
            confirmationUrl: data.url,
          }),
      },
      email_change: {
        subject: "Confirm your new email",
        render: (data) =>
          React.createElement(EmailChangeEmail, {
            siteName: SITE_NAME,
            oldEmail: data.old_email ?? "",
            email: data.email,
            newEmail: data.new_email ?? "",
            confirmationUrl: data.url,
          }),
      },
      reauthentication: {
        subject: "Your verification code",
        render: (data) => React.createElement(ReauthenticationEmail, { token: data.token ?? "" }),
      },
    },
  });
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => getHandler()(request),
    },
  },
});
