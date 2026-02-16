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
- `POST /api/auth/google`
  - body: `{ "email": "user@gmail.com", "name": "User Name" }`
- `GET /api/features/maintenance`
- `GET /api/features/visitors`
- `GET /api/features/notices`
- `GET /api/features/complaints`
- `GET /api/features/updates`
- `GET /api/features/stats`
  - all require header: `Authorization: Bearer <token>`
