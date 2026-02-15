# Our World Backend

## Setup

1. Copy `.env.example` to `.env`.
2. Update env values.
3. Install packages:
   - `npm install`
4. Run:
   - `npm run dev`

## API

- `GET /api/health`
- `POST /api/auth/request-otp`
  - body: `{ "mobile": "9876543210" }`
- `POST /api/auth/verify-otp`
  - body: `{ "mobile": "9876543210", "otp": "123456" }`
- `GET /api/dashboard`
  - header: `Authorization: Bearer <token>`

