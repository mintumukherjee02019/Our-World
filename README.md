# Our World Backend

## Setup

1. Copy `.env.example` to `.env`.
2. Update env values.
3. Install packages:
   - `npm install`
4. Run:
   - `npm run dev`

## OTP behavior

- Current mode is mock OTP verification using `FAKE_OTP` (default: `123456`).
- Configure in `.env`:
  - `OTP_MODE=mock`
  - `FAKE_OTP=123456`
- For future SMS integration, switch `OTP_MODE=sms` and implement provider logic in `src/services/otp.service.js` placeholder blocks.
- OTP send rate limits (keyed by `x-device-id + mobile`):
  - Minimum 1 minute gap between sends
  - Maximum 3 sends within a 30 minute window
  - Attempts automatically reset after 30 minutes

## API

- `GET /api/health`
- `POST /api/auth/request-otp`
  - body: `{ "mobile": "9876543210" }`
- `POST /api/auth/verify-otp`
  - body: `{ "mobile": "9876543210", "otp": "123456" }`
- `POST /api/auth/request-registration-otp`
  - body: `{ "mobile": "9876543210" }`
- `POST /api/auth/verify-registration-otp`
  - body: `{ "mobile": "9876543210", "otp": "123456" }`
- `GET /api/dashboard`
  - header: `Authorization: Bearer <token>`
- `POST /api/auth/google`
  - body: `{ "email": "user@gmail.com", "name": "User Name" }`
- `GET /api/features/maintenance`
- `GET /api/features/visitors`
- `GET /api/features/notices`
- `GET /api/features/complaints`
- `GET /api/features/updates`
- `GET /api/features/stats`
  - all require header: `Authorization: Bearer <token>`
