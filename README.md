<p align="center">
  <img src="public/logo.png" alt="KepRoop Logo" width="120" />
</p>

<h1 align="center">KepRoop (เก็บรูป)</h1>

<p align="center">
  <strong>A self-hosted, privacy-first photo album platform for organizing, sharing, and exploring your memories.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#environment-variables">Environment Variables</a> •
  <a href="#database-schema">Database Schema</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#security">Security</a> •
  <a href="#license">License</a>
</p>

---

## Features

### 📸 Album Management

- Create, edit, and delete photo albums with titles, descriptions, and custom cover images
- Toggle albums between **Public** and **Private** visibility
- **Favorite albums** for quick access
- Cursor-based pagination with sorting and filtering (by date range, visibility, search)
- **Folder organization** — nest photos into folders within albums for structured management

### 🖼️ Image Processing Pipeline

Every uploaded image is automatically processed into **three WebP variants** via [Sharp](https://sharp.pixelplumbing.com/):

| Variant       | Quality | Max Size | Purpose             |
|---------------|---------|----------|---------------------|
| **Original**  | 95      | —        | Full-quality archive |
| **Display**   | 90      | 2000 px  | Photo viewer         |
| **Thumbnail** | 70      | 400 px   | Gallery grid         |

- Automatic **EXIF metadata extraction** — date taken, camera make/model, GPS coordinates
- Orientation auto-correction via EXIF rotation
- Bulk upload, delete, move, and restore operations

### 🗺️ Interactive Photo Map

- Visualize geotagged photos on a **Mapbox GL** world map
- **Dynamic Precision Grouping** — spatial clustering adapts to zoom level (1 m → 111 km)
- Photo markers display up to 3 thumbnail previews per cluster
- Sidebar panel with individual photos in viewport, supporting **infinite scroll** pagination
- Timeline slider with date-range filtering based on actual photo dates

### 📅 Timeline View

- Browse all photos across albums in a unified chronological timeline
- Group photos by **month** or by **date** with a toggle control
- Infinite scroll with intersection observer for seamless loading
- Full-screen photo viewer with keyboard navigation and download support

### 🤝 Collaborative Sharing

- Invite members via **secure shareable links**
- **Role-Based Access Control (RBAC)** with three tiers:

| Role       | View | Upload / Edit | Manage Members | Delete Album |
|------------|------|---------------|----------------|--------------|
| **Viewer** | ✅    | ❌             | ❌              | ❌            |
| **Editor** | ✅    | ✅             | ❌              | ❌            |
| **Owner**  | ✅    | ✅             | ✅              | ✅            |

- **Advanced invites** — set expiration times and usage limits on invite links
- **Guest access** — unauthenticated users can view public albums or accept viewer invite links via JWT-based guest tokens
- Role upgrades — if a viewer accepts an editor invite, their role is automatically upgraded

### 🔐 Authentication

- **Email / Password** — bcrypt-hashed passwords with secure JWT sessions
- **Google OAuth** — one-click sign-in via Google Identity Services
- **JWT Token System**:
  - Access tokens (HS256, 1-hour expiry)
  - Refresh tokens (HS256, 90-day expiry) stored hashed in the database
  - Guest tokens (1-hour, scoped to specific albums)
- Automatic silent token refresh via middleware redirect

### 🔑 API Key System

- Generate API keys with a `kp_` prefix for programmatic access
- Keys are bcrypt-hashed; only a prefix is stored for lookup
- **Dual-layer rate limiting**:
  - 60 requests / minute (fixed-window counter)
  - 2,000 requests / day
- Usage logging with endpoint, method, IP, user-agent, and status code
- Key rotation and revocation support
- Usage statistics dashboard (minute + daily counters)

### 🗑️ Trash & Recovery

- Soft-delete system — deleted photos are recoverable
- Permanent deletion removes images from S3 and the database
- Activity logs record who deleted and restored each photo

### 📊 Activity Logs

Track every action within an album:

`image_upload` · `image_delete` · `image_restore` · `image_permanent_delete` · `image_update` · `album_create` · `album_update` · `album_delete` · `folder_create` · `folder_update` · `folder_delete` · `member_join` · `member_leave` · `member_role_change`

### 📜 API Documentation

- Integrated **Swagger / OpenAPI** documentation
- Auto-generated at build time via `next-swagger-doc`
- Interactive UI available at `/api-doc`

### 🌗 Dark Mode

- Full dark mode support via `next-themes`
- Consistent theming across all components with CSS design tokens

---

## Tech Stack

| Layer            | Technology                                          |
|------------------|-----------------------------------------------------|
| **Framework**    | [Next.js 16](https://nextjs.org/) (App Router, RSC) |
| **Language**     | [TypeScript](https://www.typescriptlang.org/) (Strict) |
| **Database**     | [PostgreSQL](https://www.postgresql.org/)           |
| **ORM**          | [Drizzle ORM](https://orm.drizzle.team/)            |
| **UI**           | [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) |
| **Styling**      | [Tailwind CSS v4](https://tailwindcss.com/) + `tailwindcss-animate` |
| **State**        | [SWR](https://swr.vercel.app/) (server) + [Zustand](https://zustand.docs.pmnd.rs/) (client) |
| **Forms**        | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| **Storage**      | [AWS S3 SDK](https://aws.amazon.com/s3/) (compatible with MinIO, Cloudflare R2, etc.) |
| **Map**          | [Mapbox GL JS](https://www.mapbox.com/) via `react-map-gl` |
| **Image Processing** | [Sharp](https://sharp.pixelplumbing.com/) + [exifr](https://github.com/nickersp/exifr) |
| **Auth**         | [jose](https://github.com/panva/jose) (JWT) + [bcryptjs](https://github.com/nicolo-ribaudo/bcryptjs) |
| **Toasts**       | [Sonner](https://sonner.emilkowal.dev/)             |
| **Icons**        | [Lucide React](https://lucide.dev/)                 |
| **Fonts**        | [Geist](https://vercel.com/font) (Sans + Mono)      |

---

## Architecture

```
keproop/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Auth landing page
│   │   ├── layout.tsx          # Root layout (ThemeProvider, AuthProvider)
│   │   ├── albums/             # Album dashboard + detail pages
│   │   ├── map/                # Photo map page
│   │   ├── timeline/           # Timeline page
│   │   ├── invite/             # Invite acceptance page
│   │   ├── api-doc/            # Swagger UI page
│   │   └── api/                # API route handlers
│   │       ├── auth/           # login, register, google, refresh, logout, api-keys
│   │       ├── albums/         # CRUD, folders, images, members, invites, trash, favorites, activity
│   │       ├── images/         # upload-url, register, bulk operations, single image
│   │       ├── map/            # points, photos, date-range
│   │       ├── invites/        # accept
│   │       ├── timeline/       # photo feed
│   │       ├── user/           # profile, password
│   │       └── og/             # Dynamic Open Graph image generation
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui primitives (20 components)
│   │   ├── map/                # MapSidebar, PhotoMarker
│   │   ├── providers/          # AuthProvider, ThemeProvider
│   │   └── *.tsx               # Feature dialogs & layouts
│   ├── db/
│   │   ├── schema.ts           # Drizzle ORM schema (10 tables)
│   │   └── index.ts            # Database connection
│   ├── lib/
│   │   ├── auth/               # tokens, session, password, rbac, api-keys
│   │   ├── services/           # album, image, invite, map, user services
│   │   ├── image-processing.ts # Sharp pipeline (3 WebP variants)
│   │   ├── s3.ts               # S3 client (upload, download, delete)
│   │   ├── api-middleware.ts    # API key auth wrapper + rate limiting
│   │   ├── activity.ts         # Activity logging helper
│   │   └── utils.ts            # Shared utilities (cn)
│   ├── stores/                 # Zustand stores
│   │   ├── useAlbumStore.ts    # Album list state
│   │   ├── useAlbumDetailStore.ts # Single album state
│   │   ├── useMapStore.ts      # Map viewport state
│   │   └── useTimelineStore.ts # Timeline state
│   ├── types/                  # Shared TypeScript types
│   └── middleware.ts           # Edge middleware (auth, API key bypass)
├── drizzle/                    # Database migrations
├── public/                     # Static assets + generated swagger.json
├── scripts/                    # Build scripts (Swagger generation)
└── package.json
```

---

## Getting Started

### Prerequisites

| Requirement               | Version       |
|---------------------------|---------------|
| **Node.js**               | 18+           |
| **PostgreSQL**            | 14+           |
| **S3-compatible storage** | AWS S3, MinIO, Cloudflare R2, etc. |
| **Mapbox access token**   | [Get one here](https://account.mapbox.com/) |

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/keproop.git
cd keproop
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the project root (see [Environment Variables](#environment-variables) for all options):

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/keproop"

# Storage (S3-compatible)
AWS_REGION="us-east-1"
AWS_S3_ENDPOINT="https://s3.amazonaws.com"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_S3_BUCKET_NAME="your-bucket-name"

# Map
NEXT_PUBLIC_MAPBOX_TOKEN="your-mapbox-token"

# Auth (generate with: openssl rand -base64 32)
JWT_SECRET="your-jwt-secret"
REFRESH_TOKEN_SECRET="your-refresh-token-secret"

# Google OAuth (optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"
```

### 4. Set Up the Database

Push the schema to your PostgreSQL instance:

```bash
npx drizzle-kit push
```

### 5. Start the Development Server

```bash
npm run dev
```

The application will be available at:

| URL                              | Description          |
|----------------------------------|----------------------|
| `http://localhost:3000`          | Application          |
| `http://localhost:3000/api-doc`  | Swagger API docs     |

### Production Build

```bash
npm run build
npm start
```

---

## Environment Variables

| Variable                    | Required | Description                                      |
|-----------------------------|----------|--------------------------------------------------|
| `DATABASE_URL`              | ✅        | PostgreSQL connection string                     |
| `AWS_REGION`                | ✅        | S3 region                                        |
| `AWS_S3_ENDPOINT`           | ✅        | S3 endpoint (custom for MinIO / R2)              |
| `AWS_ACCESS_KEY_ID`         | ✅        | S3 access key                                    |
| `AWS_SECRET_ACCESS_KEY`     | ✅        | S3 secret key                                    |
| `AWS_S3_BUCKET_NAME`       | ✅        | S3 bucket name                                   |
| `NEXT_PUBLIC_MAPBOX_TOKEN`  | ✅        | Mapbox public access token                       |
| `JWT_SECRET`                | ✅        | Secret for signing access & guest tokens         |
| `REFRESH_TOKEN_SECRET`      | ✅        | Secret for signing refresh tokens                |
| `GOOGLE_CLIENT_ID`          | ❌        | Google OAuth client ID                           |
| `GOOGLE_CLIENT_SECRET`      | ❌        | Google OAuth client secret                       |
| `GOOGLE_REDIRECT_URI`       | ❌        | Google OAuth redirect URI                        |

---

## Database Schema

KepRoop uses **10 tables** in PostgreSQL managed by Drizzle ORM:

```mermaid
erDiagram
    users ||--o{ albums : owns
    users ||--o{ album_members : "member of"
    users ||--o{ favorite_albums : favorites
    users ||--o{ api_keys : creates
    albums ||--o{ album_members : has
    albums ||--o{ album_invites : has
    albums ||--o{ folders : contains
    albums ||--o{ images : contains
    albums ||--o{ activity_logs : tracks
    folders ||--o{ images : organizes
    api_keys ||--o{ api_key_logs : logs
    api_keys ||--o{ rate_limits : "rate limited"

    users {
        uuid id PK
        text email UK
        text password_hash
        text google_id
        text name
        text avatar_url
    }

    albums {
        uuid id PK
        uuid owner_id FK
        text title
        text description
        text visibility
        uuid cover_image_id
        timestamp album_date
    }

    images {
        uuid id PK
        uuid album_id FK
        uuid folder_id FK
        uuid uploader_id FK
        text s3_key_original
        text s3_key_display
        text s3_key_thumb
        integer width
        integer height
        timestamp date_taken
        text camera_make
        text camera_model
        float gps_lat
        float gps_lng
    }

    album_members {
        uuid user_id FK
        uuid album_id FK
        text role
    }

    album_invites {
        uuid id PK
        uuid album_id FK
        text token
        text role
        timestamp expires_at
        integer max_use
        integer used_count
    }

    folders {
        uuid id PK
        uuid album_id FK
        text name
    }

    activity_logs {
        uuid id PK
        uuid user_id FK
        uuid album_id FK
        text action
        text metadata
    }

    api_keys {
        uuid id PK
        uuid user_id FK
        text key_hash
        text name
        text prefix
        integer rate_limit
        integer rate_limit_per_day
    }

    api_key_logs {
        uuid id PK
        uuid key_id FK
        text endpoint
        text method
        integer status_code
    }

    rate_limits {
        uuid key_id FK
        timestamp window_start
        integer request_count
    }
```

All entities use **soft deletes** (`deleted_at` column) unless otherwise noted. Queries always filter on `deleted_at IS NULL`.

---

## API Reference

The full interactive API documentation is available at `/api-doc` when the server is running. Below is a summary of the available endpoints:

### Authentication

| Method | Endpoint                    | Description                |
|--------|-----------------------------|---------------------------|
| POST   | `/api/auth/register`        | Create a new account       |
| POST   | `/api/auth/login`           | Email/password sign-in     |
| POST   | `/api/auth/google`          | Google OAuth sign-in       |
| GET    | `/api/auth/refresh`         | Silent token refresh       |
| POST   | `/api/auth/logout`          | Sign out (revoke tokens)   |
| GET    | `/api/auth/me`              | Get current user           |
| GET    | `/api/auth/api-keys`        | List API keys              |
| POST   | `/api/auth/api-keys`        | Create API key             |
| DELETE | `/api/auth/api-keys/[id]`   | Revoke API key             |

### Albums

| Method | Endpoint                              | Description                          |
|--------|---------------------------------------|--------------------------------------|
| GET    | `/api/albums`                         | List albums (paginated, filterable)  |
| POST   | `/api/albums`                         | Create album                         |
| GET    | `/api/albums/[id]`                    | Get album details                    |
| PATCH  | `/api/albums/[id]`                    | Update album                         |
| DELETE | `/api/albums/[id]`                    | Delete album                         |
| POST   | `/api/albums/[id]/favorite`           | Toggle favorite                      |
| GET    | `/api/albums/[id]/activity`           | Get activity logs                    |
| GET    | `/api/albums/[id]/members`            | List members                         |
| PATCH  | `/api/albums/[id]/members/[userId]`   | Update member role                   |
| DELETE | `/api/albums/[id]/members/[userId]`   | Remove member                        |
| POST   | `/api/albums/[id]/invite`             | Create invite link                   |
| GET    | `/api/albums/[id]/trash`              | List trashed images                  |

### Images

| Method | Endpoint                     | Description                            |
|--------|------------------------------|----------------------------------------|
| POST   | `/api/images/upload-url`     | Get pre-signed S3 upload URL           |
| POST   | `/api/images/register`       | Register uploaded image (process + save metadata) |
| GET    | `/api/images/[id]`           | Get image URLs (thumb, display, original) |
| DELETE | `/api/images/[id]`           | Soft-delete image                      |
| PATCH  | `/api/images/[id]`           | Restore image from trash               |
| POST   | `/api/images/bulk`           | Bulk delete or move images             |

### Map

| Method | Endpoint                  | Description                        |
|--------|---------------------------|------------------------------------|
| GET    | `/api/map/points`         | Get clustered photo markers        |
| GET    | `/api/map/photos`         | Get individual photos in viewport  |
| GET    | `/api/map/date-range`     | Get min/max date for timeline slider |

### Other

| Method | Endpoint                | Description                     |
|--------|-------------------------|---------------------------------|
| GET    | `/api/timeline`         | Get photos for timeline view    |
| POST   | `/api/invites/accept`   | Accept an invite link           |
| GET    | `/api/og`               | Generate dynamic OG image       |
| GET    | `/api/user/profile`     | Get user profile                |
| PATCH  | `/api/user/profile`     | Update profile                  |
| PUT    | `/api/user/password`    | Change password                 |

---

## Security

### Authentication Flow

```
Client                        Server
  │                              │
  ├─ Login/Register ──────────►  │ Validate credentials
  │                              │ Create access token (1h)
  │  ◄── Set cookies ───────────┤ Create refresh token (90d)
  │                              │ Store refresh token hash in DB
  │                              │
  ├─ API Request ─────────────►  │ Edge middleware validates access token
  │                              │
  ├─ Token Expired ───────────►  │ Middleware redirects to /api/auth/refresh
  │                              │ Validates refresh token
  │  ◄── New tokens ────────────┤ Rotates refresh token (revoke old)
  │                              │
  ├─ API Key Request ─────────►  │ Bypass edge middleware
  │                              │ Route handler validates API key
  │                              │ Check rate limits (60/min, 2000/day)
  │  ◄── Response ──────────────┤ Log usage
```

### Key Security Measures

- **Passwords** — bcrypt-hashed with automatic salting
- **JWT Tokens** — HS256 signed, short-lived access tokens (1h)
- **Refresh Token Rotation** — old tokens are revoked on refresh
- **API Keys** — bcrypt-hashed storage, prefix-based lookup optimization
- **Rate Limiting** — fixed-window counters per minute and per day
- **RBAC** — hierarchical role checks on every mutation (`viewer < editor < owner`)
- **Soft Deletes** — all queries filter `deleted_at IS NULL` to prevent data leaks
- **UUID Validation** — all ID inputs validated against UUID format
- **S3 Signed URLs** — pre-signed URLs with 5-minute upload and 1-hour download expiry
- **Guest Tokens** — scoped, time-limited JWT for unauthenticated album access

---

## Scripts

| Script                | Description                             |
|-----------------------|-----------------------------------------|
| `npm run dev`         | Start development server                |
| `npm run build`       | Build for production                    |
| `npm start`           | Run production build                    |
| `npm run lint`        | Run ESLint                              |
| `npm run build:swagger` | Generate Swagger JSON spec            |
| `npx drizzle-kit push`  | Push schema to database              |
| `npx drizzle-kit generate` | Generate migration files          |

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

Copyright © 2026 Thitivath Mongkolgittichot