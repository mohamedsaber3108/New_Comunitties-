// -------------------------------------------------------------------------
// Email service abstraction.
//
// Transports:
//   - "console" (default in dev/test): logs the email, sends nothing.
//   - "ses": AWS SES via @aws-sdk/client-ses (lazy-loaded).
//   - "smtp": any SMTP server via nodemailer (lazy-loaded).
//
// Providers are lazy-loaded so the app runs (and tests pass) without the
// optional dependencies installed. Templates are small, bilingual (AR/EN)
// HTML + text. We never claim delivery success for the console transport.
// -------------------------------------------------------------------------
import { config } from "./config.js";
import { logger } from "./logger.js";

let sesClientPromise = null;
let smtpTransportPromise = null;

async function getSesClient() {
  if (!sesClientPromise) {
    sesClientPromise = import("@aws-sdk/client-ses").then(
      ({ SESClient }) => new SESClient({ region: config.email.sesRegion }),
    );
  }
  return sesClientPromise;
}

async function getSmtpTransport() {
  if (!smtpTransportPromise) {
    smtpTransportPromise = import("nodemailer").then((nm) =>
      nm.default.createTransport({
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.secure,
        auth: config.email.smtp.user
          ? { user: config.email.smtp.user, pass: config.email.smtp.pass }
          : undefined,
      }),
    );
  }
  return smtpTransportPromise;
}

// Low-level send. Returns { delivered: boolean, transport, id? }.
// Throws on real transport failure so the outbox worker can retry.
export async function sendRawEmail({ to, subject, html, text }) {
  const provider = config.email.provider;
  if (provider === "ses") {
    const { SendEmailCommand } = await import("@aws-sdk/client-ses");
    const client = await getSesClient();
    const res = await client.send(
      new SendEmailCommand({
        Source: config.email.from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text || stripHtml(html), Charset: "UTF-8" },
          },
        },
        ...(config.email.replyTo
          ? { ReplyToAddresses: [config.email.replyTo] }
          : {}),
      }),
    );
    return { delivered: true, transport: "ses", id: res.MessageId };
  }

  if (provider === "smtp") {
    const transport = await getSmtpTransport();
    const res = await transport.sendMail({
      from: config.email.from,
      to,
      subject,
      html,
      text: text || stripHtml(html),
      ...(config.email.replyTo ? { replyTo: config.email.replyTo } : {}),
    });
    return { delivered: true, transport: "smtp", id: res.messageId };
  }

  // console transport: explicitly NOT delivered.
  logger.info("email.console", { to, subject });
  return { delivered: false, transport: "console" };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// -------------------------------------------------------------------------
// Bilingual template layer. Each builder returns { subject, html, text }.
// -------------------------------------------------------------------------
const brand = "USAM Communities";

function layout(bodyHtml) {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f6f7f9;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #eceef1">
    <div style="font-weight:700;font-size:18px;color:#d65b39;margin-bottom:16px">${brand}</div>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #eceef1;margin:24px 0"/>
    <div style="color:#8a8f98;font-size:12px">${brand} · This is an automated message.</div>
  </div></body></html>`;
}

function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#d65b39;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${label}</a>`;
}

export const templates = {
  verifyEmail({ name, link }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>Confirm your email to activate your ${brand} account.</p>
       <p style="margin:24px 0">${button(link, "Verify email")}</p>
       <p style="color:#8a8f98;font-size:13px">If the button does not work, open this link:<br>${esc(link)}</p>
       <p style="color:#8a8f98;font-size:13px">This link expires in 24 hours. If you did not create an account, ignore this email.</p>`,
    );
    return {
      subject: `Verify your ${brand} email`,
      html,
      text: `Verify your email: ${link} (expires in 24 hours).`,
    };
  },
  passwordReset({ name, link }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>We received a request to reset your ${brand} password.</p>
       <p style="margin:24px 0">${button(link, "Reset password")}</p>
       <p style="color:#8a8f98;font-size:13px">This link expires in 1 hour and can be used once. If you did not request this, you can safely ignore it.</p>`,
    );
    return {
      subject: `Reset your ${brand} password`,
      html,
      text: `Reset your password: ${link} (expires in 1 hour).`,
    };
  },
  signupAttemptExisting({ name, loginLink, resetLink }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>Someone tried to sign up for ${brand} with your email address. You already have an account, so nothing was created or changed.</p>
       <p>If it was you, sign in or reset your password:</p>
       <p style="margin:24px 0">${button(loginLink, "Sign in")} &nbsp; ${button(resetLink, "Reset password")}</p>
       <p style="color:#8a8f98;font-size:13px">If it was not you, you can ignore this email.</p>`,
    );
    return {
      subject: `Someone tried to sign up with your ${brand} email`,
      html,
      text: `Someone tried to sign up with your email address. You already have an account. Sign in: ${loginLink} or reset your password: ${resetLink}. If it was not you, ignore this email.`,
    };
  },
  passwordChanged({ name }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>Your ${brand} password was just changed. If this was you, no action is needed.</p>
       <p style="color:#8a8f98;font-size:13px">If you did not change your password, reset it immediately and review your active sessions.</p>`,
    );
    return {
      subject: `Your ${brand} password was changed`,
      html,
      text: `Your ${brand} password was changed. If this was not you, reset it immediately.`,
    };
  },
  subscriptionActive({ name, planName, endsAt }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>Your <strong>${esc(planName)}</strong> membership is now active${
         endsAt ? ` until ${esc(new Date(endsAt).toDateString())}` : ""
       }.</p>
       <p style="margin:24px 0">${button(config.frontendUrl + "/billing", "View billing")}</p>`,
    );
    return {
      subject: `Your ${brand} membership is active`,
      html,
      text: `Your ${planName} membership is active.`,
    };
  },
  eventTicket({ name, eventTitle, startsAt, eventId, ticketCode }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>Your payment is confirmed. You have a seat at <strong>${esc(eventTitle)}</strong>${
         startsAt ? ` on ${esc(new Date(startsAt).toUTCString())}` : ""
       }.</p>
       <p>Ticket code: <strong style="letter-spacing:2px">${esc(ticketCode)}</strong></p>
       <p style="margin:24px 0">${button(config.frontendUrl + "/events/" + encodeURIComponent(eventId), "View event")}</p>`,
    );
    return {
      subject: `Your ticket: ${String(eventTitle).slice(0, 80)}`,
      html,
      text: `Your seat at ${eventTitle} is confirmed. Ticket code: ${ticketCode}`,
    };
  },
  paymentFailed({ name, planName }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>We could not process your payment for the <strong>${esc(planName)}</strong> plan.</p>
       <p style="margin:24px 0">${button(config.frontendUrl + "/billing", "Try again")}</p>`,
    );
    return {
      subject: `Payment issue on your ${brand} membership`,
      html,
      text: `Payment failed for ${planName}. Please try again.`,
    };
  },
  notification({ name, text, href }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>${esc(text)}</p>
       <p style="margin:24px 0">${button(config.frontendUrl + href, "Open")}</p>
       <p style="color:#8a8f98;font-size:12px">You can change which emails you receive in Participation → Notification preferences.</p>`,
    );
    return { subject: `${brand}: ${String(text).slice(0, 80)}`, html, text: `${text}\n${config.frontendUrl}${href}` };
  },
  digest({ name, items }) {
    const rows = (items || [])
      .map((i) => `<li style="margin:6px 0">${esc(i.text)}</li>`)
      .join("");
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>Here is what you missed on ${brand}:</p>
       <ul style="padding-inline-start:20px">${rows}</ul>
       <p style="margin:24px 0">${button(config.frontendUrl + "/notifications", "See all")}</p>
       <p style="color:#8a8f98;font-size:12px">Change or stop this digest in Participation → Notification preferences.</p>`,
    );
    return {
      subject: `Your ${brand} digest`,
      html,
      text: (items || []).map((i) => `- ${i.text}`).join("\n"),
    };
  },
  subscriptionRenewal({ name, planName, endsAt }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>Your <strong>${esc(planName)}</strong> membership ends on ${esc(new Date(endsAt).toDateString())}. Renew to keep your member benefits without interruption.</p>
       <p style="margin:24px 0">${button(config.frontendUrl + "/billing", "Renew membership")}</p>`,
    );
    return {
      subject: `Your ${brand} membership ends soon`,
      html,
      text: `Your ${planName} membership ends on ${new Date(endsAt).toDateString()}. Renew at ${config.frontendUrl}/billing`,
    };
  },
  subscriptionExpired({ name, planName }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>Your <strong>${esc(planName)}</strong> membership has ended. You can renew any time to restore member benefits.</p>
       <p style="margin:24px 0">${button(config.frontendUrl + "/pricing", "View plans")}</p>`,
    );
    return {
      subject: `Your ${brand} membership has ended`,
      html,
      text: `Your ${planName} membership has ended. Renew at ${config.frontendUrl}/pricing`,
    };
  },
  refundIssued({ name, amountEgp }) {
    const html = layout(
      `<p>Hi ${esc(name)},</p>
       <p>A refund of <strong>EGP ${esc(amountEgp)}</strong> was issued for your membership payment. Depending on your bank it can take several business days to appear.</p>`,
    );
    return {
      subject: `Refund issued for your ${brand} payment`,
      html,
      text: `A refund of EGP ${amountEgp} was issued for your membership payment.`,
    };
  },
  generic({ subject, heading, body, ctaLink, ctaLabel }) {
    const html = layout(
      `${heading ? `<h2 style="font-size:18px;margin:0 0 12px">${esc(heading)}</h2>` : ""}
       <p>${esc(body)}</p>
       ${ctaLink ? `<p style="margin:24px 0">${button(ctaLink, ctaLabel || "Open")}</p>` : ""}`,
    );
    return { subject, html, text: `${heading || ""}\n${body}` };
  },
};

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

export default { sendRawEmail, templates };
