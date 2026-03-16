import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured. Add it to your .env.local file." },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const body = await req.json();
    const { clientName, clientEmail, onboardingLink, businessName } = body;

    if (!clientEmail || !onboardingLink) {
      return NextResponse.json(
        { error: "Missing required fields: clientEmail and onboardingLink" },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Business Funding CRM <onboarding@resend.dev>",
      to: [clientEmail],
      subject: "Complete Your Business Funding Onboarding",
      html: buildOnboardingEmail({
        clientName: clientName || "Client",
        onboardingLink,
        businessName: businessName || "",
      }),
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, emailId: data?.id });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json(
      { error: "Failed to send email. Check your RESEND_API_KEY." },
      { status: 500 }
    );
  }
}

function buildOnboardingEmail({
  clientName,
  onboardingLink,
  businessName,
}: {
  clientName: string;
  onboardingLink: string;
  businessName: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding:32px 40px; text-align:center;">
              <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">Business Funding Portal</h1>
              <p style="color:#bfdbfe; font-size:14px; margin:8px 0 0;">Your onboarding is ready to begin</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#374151; font-size:16px; margin:0 0 16px; line-height:1.6;">
                Hi <strong>${clientName}</strong>,
              </p>
              <p style="color:#6b7280; font-size:15px; margin:0 0 24px; line-height:1.6;">
                ${businessName ? `We're excited to help <strong>${businessName}</strong> secure funding. ` : ""}To get started, please complete the onboarding process by clicking the button below. This includes:
              </p>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="padding:12px 16px; background-color:#eff6ff; border-radius:8px; margin-bottom:8px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:32px; vertical-align:top;">
                          <div style="width:24px; height:24px; background-color:#3b82f6; border-radius:50%; color:#fff; text-align:center; line-height:24px; font-size:12px; font-weight:700;">1</div>
                        </td>
                        <td style="padding-left:12px;">
                          <p style="color:#1e40af; font-size:14px; font-weight:600; margin:0;">Sign the Business Funding Agreement</p>
                          <p style="color:#6b7280; font-size:13px; margin:4px 0 0;">Review and sign the funding agreement with your full name and signature</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px; background-color:#eff6ff; border-radius:8px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:32px; vertical-align:top;">
                          <div style="width:24px; height:24px; background-color:#3b82f6; border-radius:50%; color:#fff; text-align:center; line-height:24px; font-size:12px; font-weight:700;">2</div>
                        </td>
                        <td style="padding-left:12px;">
                          <p style="color:#1e40af; font-size:14px; font-weight:600; margin:0;">Complete the Business Funding Form</p>
                          <p style="color:#6b7280; font-size:13px; margin:4px 0 0;">Provide your personal and business details so we can match you with the best funding options</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px; background-color:#eff6ff; border-radius:8px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:32px; vertical-align:top;">
                          <div style="width:24px; height:24px; background-color:#3b82f6; border-radius:50%; color:#fff; text-align:center; line-height:24px; font-size:12px; font-weight:700;">3</div>
                        </td>
                        <td style="padding-left:12px;">
                          <p style="color:#1e40af; font-size:14px; font-weight:600; margin:0;">Activate Credit Monitoring</p>
                          <p style="color:#6b7280; font-size:13px; margin:4px 0 0;">Set up or confirm your credit monitoring so we can track your progress</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${onboardingLink}" style="display:inline-block; background-color:#1e40af; color:#ffffff; text-decoration:none; padding:14px 40px; border-radius:8px; font-size:16px; font-weight:600; letter-spacing:0.3px;">
                      Start Onboarding
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#9ca3af; font-size:13px; margin:24px 0 0; text-align:center; line-height:1.5;">
                Or copy and paste this link into your browser:<br/>
                <a href="${onboardingLink}" style="color:#3b82f6; word-break:break-all;">${onboardingLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb; padding:24px 40px; border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af; font-size:12px; margin:0; text-align:center; line-height:1.5;">
                This email was sent as part of your business funding application process.<br/>
                If you did not request this, please disregard this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
