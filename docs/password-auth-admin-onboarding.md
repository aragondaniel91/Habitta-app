# Password authentication and administrator onboarding

## Scope

This release replaces everyday magic-link access with Supabase email/password authentication and adds the secure administrator onboarding flow for Habitta.

## Authentication flows

### Existing user

- Email and password sign-in through `signInWithPassword`.
- Optional persistent session using **Remember session**.
- Password visibility control.
- Spanish error messages.
- Password recovery redirects to `/reset-password`.
- Password updates close the user's other sessions.

### New administrator

- Public registration is only presented as **Create a new condominium**.
- Required personal fields: full name, email, password, confirmation and terms acceptance.
- Password requirements: at least 10 characters, uppercase, lowercase and a number.
- Supabase email confirmation is required before onboarding.
- Registration metadata identifies the source as `public_admin_onboarding`; it does not contain an administrative role.

### Invited administrator

- Invitation links use `/admin-invite/:token`.
- Existing users sign in with the exact invited email.
- New users create a password and confirm the invited email.
- The role and condominium are assigned only by the database after token and email validation.

## Administrator onboarding

The onboarding captures:

- independent administration or management company;
- organization name;
- condominium name;
- country and city;
- IANA timezone;
- primary and optional secondary currency;
- approximate number of units;
- optional first tower.

`create_admin_workspace` creates the organization, organization membership, condominium, condominium membership and optional building in one PostgreSQL transaction. The browser never submits a role.

An existing organization owner can use `create_condominium_with_profile` to add another condominium without creating another Habitta account.

## Progressive configuration

After onboarding, Habitta directs the administrator to complete these tasks progressively:

1. Create towers and units.
2. Add payment methods.
3. Configure fees.
4. Invite administrators.
5. Import owners and residents.
6. Configure notifications.

## Team and access

Administrative invitations support:

- `condominium_admin`;
- `accountant`;
- `assistant`;
- `payment_reviewer`.

Security controls:

- 256-bit random invitation token;
- SHA-256 token hash stored in PostgreSQL;
- configurable expiration from one hour to 90 days;
- one pending invitation per condominium and email;
- revocation;
- exact authenticated email match;
- single acceptance;
- invitation event audit trail.

Owner and tenant invitations remain separate and unit-scoped.

## Brand and browser integration

- Habitta mark used in authentication, onboarding and application navigation.
- SVG favicon and web app manifest.
- Cloudflare Pages SPA fallback for direct authentication and invitation links.

## Required environment configuration

Supabase Auth must allow password signups and email confirmations. Redirect allowlists must include the deployed Habitta web origin and its authentication paths.

Development allowlist:

- `http://localhost:5173/**`
- `http://127.0.0.1:5173/**`
- `https://habitta-web-dev.pages.dev/**`

Before production, add the production web origin to the Supabase redirect allowlist.

## Email delivery

Supabase authentication emails use the configured SMTP provider.

Administrator invitations are created through the authenticated Worker endpoint and delivered through the same transactional email provider abstraction used by Habitta notifications. Development currently selects ZeptoMail, while Resend remains available as a rollback provider:

- `disabled`: creates the secure invitation and returns the backup link without sending email;
- `sandbox`: sends the invitation to `NOTIFICATIONS_SANDBOX_EMAIL` with a development subject prefix;
- `live`: sends directly to the invited administrator.

The Worker uses a provider-independent deduplication key based on the invitation ID. ZeptoMail receives it as `client_reference`, while Resend receives it as `Idempotency-Key`. The interface always displays the one-time invitation link as a backup when delivery is disabled or fails.

Required Worker bindings for email delivery:

- `APP_BASE_URL`;
- `NOTIFICATIONS_EMAIL_PROVIDER`;
- `ZEPTOMAIL_SEND_TOKEN` when ZeptoMail is selected;
- `RESEND_API_KEY` when Resend is selected;
- `NOTIFICATIONS_EMAIL_MODE`;
- `NOTIFICATIONS_FROM_EMAIL`;
- `NOTIFICATIONS_FROM_NAME`;
- `NOTIFICATIONS_SANDBOX_EMAIL` when sandbox mode is enabled.

## Release requirements

Do not merge or deploy until all of the following pass:

- formatting;
- lint;
- TypeScript;
- frontend and API tests;
- production build;
- Supabase migration startup;
- pgTAP database tests;
- responsive review of login, registration, onboarding, password recovery, team access and invitation acceptance;
- production Supabase redirect and SMTP configuration review.
