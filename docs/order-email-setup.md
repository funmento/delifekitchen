# Order email setup

Order emails use Resend. Add the following variables in Netlify under **Project configuration → Environment variables** and scope them to Functions for the Preview context before testing:

- `RESEND_API_KEY` — required Resend API key.
- `ORDER_EMAIL_FROM` — required sender using a domain verified in Resend, for example `DeLife Kitchen <orders@yourdomain.com>`.
- `ORDER_NOTIFICATION_EMAIL` — required business address that receives new paid order notifications.
- `ORDER_HELP_EMAIL` — optional customer support reply-to address. It falls back to `ORDER_NOTIFICATION_EMAIL`.
- `ORDER_HELP_PHONE` — optional phone number shown in customer help messages.

The existing Stripe variables remain required for payment processing: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

Do not put real values in `.env.example` or commit local `.env` files. After setting Preview values, trigger a Stripe test payment and confirm both delivery records appear in the admin order panel.
