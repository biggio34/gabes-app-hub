import { areaMeta, type Area } from "@/lib/areas";

export function isInviteEmailConfigured() {
  return Boolean(
    (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
      process.env.RESEND_API_KEY,
  );
}

export function loginPageUrl() {
  const fromEnv = process.env.HUB_PUBLIC_URL || process.env.URL;
  if (fromEnv) return `${fromEnv.replace(/\/$/, "")}/login`;
  if (process.env.NODE_ENV !== "production") {
    return "http://127.0.0.1:43147/login";
  }
  return "https://gabes-app-hub.netlify.app/login";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendInviteEmail(input: {
  to: string;
  name: string;
  username: string;
  password?: string;
  areas: Area[];
}): Promise<{ sent: boolean; error?: string }> {
  const to = input.to.trim();
  if (!isValidEmail(to)) {
    return { sent: false, error: "That email address does not look right." };
  }
  if (!isInviteEmailConfigured()) {
    return {
      sent: false,
      error: "Email sending is not set up yet.",
    };
  }

  const loginUrl = loginPageUrl();
  const firstName = input.name.trim().split(/\s+/)[0] || input.username;
  const areaList = input.areas.map((area) => areaMeta[area].label).join(", ");
  const subject = "Your login for Gabe's Apps";
  const passwordLine = input.password
    ? `Password: ${input.password}`
    : "Use the password Gabe already gave you. If you do not have it, ask him for a new one.";
  const text = [
    `Hi ${firstName},`,
    "",
    "Gabe set up a login for you on Gabe's Apps.",
    "",
    `Sign in here: ${loginUrl}`,
    `Username: ${input.username}`,
    passwordLine,
    areaList ? `You will see: ${areaList}` : "",
    "",
    "If you were not expecting this, you can ignore the email.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Georgia,serif;background:#0f172a;color:#e2e8f0;padding:32px">
      <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:24px;padding:28px">
        <p style="margin:0 0 8px;color:#f87171;font-size:13px">Gabe's Apps</p>
        <h1 style="margin:0 0 16px;font-size:24px;color:#f8fafc">You have a login</h1>
        <p style="margin:0 0 16px;line-height:1.5">Hi ${escapeHtml(firstName)}, Gabe set up a login for you.</p>
        <p style="margin:0 0 20px">
          <a href="${loginUrl}" style="display:inline-block;background:#b91c1c;color:white;text-decoration:none;padding:10px 16px;border-radius:12px;font-weight:600">Open the sign-in page</a>
        </p>
        <p style="margin:0 0 8px;font-size:14px"><strong>Username:</strong> ${escapeHtml(input.username)}</p>
        <p style="margin:0 0 8px;font-size:14px">${
          input.password
            ? `<strong>Password:</strong> ${escapeHtml(input.password)}`
            : "Use the password Gabe already gave you."
        }</p>
        ${
          areaList
            ? `<p style="margin:16px 0 0;font-size:14px;color:#94a3b8">You will see: ${escapeHtml(areaList)}</p>`
            : ""
        }
      </div>
    </div>
  `;

  try {
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      await sendWithGmail({ to, subject, text, html });
      return { sent: true };
    }
    await sendWithResend({ to, subject, text, html });
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Could not send the email.",
    };
  }
}

async function sendWithGmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const nodemailer = (await import("nodemailer")).default;
  const user = process.env.GMAIL_USER as string;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: `Gabe's Apps <${user}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

async function sendWithResend(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const from =
    process.env.HUB_INVITE_FROM_EMAIL || "Gabe's Apps <beth.t@example.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message || "Resend could not send the email.");
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
