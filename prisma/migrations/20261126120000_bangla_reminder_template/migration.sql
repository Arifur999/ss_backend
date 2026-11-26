-- Put the expiry reminder into Bangla on workspaces that already exist.
--
-- The template is not code: it is seeded into platform_settings once and
-- edited from the super admin's Settings page afterwards. So changing the
-- default constant alone would leave every live installation sending the old
-- English mail for ever, and the only way to pick the new one up would be
-- pressing "Reset to default" by hand.
--
-- Only rows still carrying the English default are touched. "Renew now to
-- avoid losing access" is a sentence out of that default and nothing a super
-- admin writing their own template would type, so a customised template -
-- whatever language it is in - is left exactly as it is.

UPDATE platform_settings
SET
    reminder_subject = 'আপনার সাবস্ক্রিপশনের মেয়াদ শেষ হতে আর {{days_left}} দিন বাকি',
    reminder_body = $body$<div style="font-family: 'Noto Sans Bengali', 'Hind Siliguri', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
  <h2 style="color: #1D9E75; margin: 0 0 8px;">ফার্নিফাই</h2>
  <p style="color: #334155; margin: 0 0 16px;">প্রিয় {{name}},</p>
  <p style="color: #334155; margin: 0 0 16px; line-height: 1.7;">
    আপনার <strong>{{business_name}}</strong> ওয়ার্কস্পেসের <strong>{{plan}}</strong> প্ল্যানের মেয়াদ
    <strong>{{expiry_date}}</strong> তারিখে শেষ হবে &mdash; আর মাত্র <strong>{{days_left}} দিন</strong> বাকি।
  </p>
  <div style="text-align: center; margin: 0 0 20px;">
    <a href="{{renew_url}}" style="display: inline-block; background: #1D9E75; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
      এখনই পেমেন্ট করুন
    </a>
  </div>
  <p style="color: #334155; margin: 0 0 16px; line-height: 1.7;">
    মেয়াদ শেষ হয়ে গেলে হিসাব দেখা বন্ধ হয়ে যাবে। উপরের বাটনে চাপলে সরাসরি প্ল্যান ও পেমেন্ট পেজে চলে যাবেন।
  </p>
  <p style="color: #94a3b8; font-size: 12px; margin: 0;">
    ইতিমধ্যে নবায়ন করে থাকলে এই মেইলটি উপেক্ষা করুন।
  </p>
</div>$body$
WHERE reminder_body LIKE '%Renew now to avoid losing access%';
