// Default expiry-reminder email template, seeded into PlatformSetting on
// first boot. The super admin can rewrite this freely from Settings - this
// is only the starting point so the feature looks finished out of the box.
//
// Placeholders (see email.ts renderTemplate): {{name}} {{business_name}}
// {{days_left}} {{expiry_date}} {{plan}} {{renew_url}}
export const DEFAULT_REMINDER_SUBJECT = "Your subscription expires in {{days_left}} days";

export const DEFAULT_REMINDER_BODY = `
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
  <h2 style="color: #1D9E75; margin: 0 0 8px;">Furniture Business Management</h2>
  <p style="color: #334155; margin: 0 0 16px;">Hi {{name}},</p>
  <p style="color: #334155; margin: 0 0 16px;">
    Your <strong>{{business_name}}</strong> workspace subscription ({{plan}} plan) will expire on
    <strong>{{expiry_date}}</strong> &mdash; that's just <strong>{{days_left}} day(s)</strong> from now.
  </p>
  <div style="text-align: center; margin: 0 0 20px;">
    <a href="{{renew_url}}" style="display: inline-block; background: #1D9E75; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
      Payment Now
    </a>
  </div>
  <p style="color: #334155; margin: 0 0 16px;">
    Renew now to avoid losing access &mdash; the button above takes you straight to the plan &amp; payment page.
  </p>
  <p style="color: #94a3b8; font-size: 12px; margin: 0;">
    If you have already renewed, please ignore this email.
  </p>
</div>
`.trim();
