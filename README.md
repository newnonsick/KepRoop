# KepRoop (เก็บรูป)

**KepRoop** is a modern, self-hosted photo album management and sharing platform. Built with performance and privacy in mind, it allows users to organize photos into albums, visualize them on a map, and collaborate with friends and family through granular permission settings.

![KepRoop Logo](public/logo.png)

## 🚀 Features

* **📸 Smart Album Management**: Create and organize albums with rich descriptions and custom cover images.
* **📂 Folder Organization**: Nest photos within folders for better organization within albums.
* **🗺️ Photo Map**: Visualize your photos on an interactive world map based on their GPS metadata.
* **🛡️ Privacy First**: Toggle albums between **Public** and **Private** visibility.
* **🤝 Collaborative Sharing**:
    * Invite members via secure links.
    * **Role-Based Access Control (RBAC)**: Assign roles like `Viewer`, `Editor`, or `Owner`.
    * **Advanced Invites**: Set expiration dates or usage limits on invite links.
    * **Activity Logs**: Track changes and updates within albums (uploads, deletions, edits).

* **☁️ Scalable Storage**: Built-in support for S3-compatible storage (AWS S3, MinIO, Cloudflare R2).
* **⚡ High-Performance Uploads**:
    * Automatic image resizing (Original, Display, Thumbnail).
    * EXIF metadata extraction (Date taken, Camera model, GPS coordinates).
    * Chunked/Parallel uploads for speed.
* **🔐 Secure Authentication**:
    * Email/Password authentication using `bcryptjs` and `jose` (JWT).
    * Google OAuth integration.
    * Secure session management with refresh tokens.

* **🗑️ Trash & Recovery**: Soft-delete system allows you to recover accidentally deleted albums or images.
* **📜 API Documentation**: Integrated Swagger/OpenAPI documentation for easy API exploration.
* **🎨 Modern UI**: Fully responsive interface built with **Shadcn UI** and **Tailwind CSS**.

## 🛠️ Tech Stack

* **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
* **Language**: [TypeScript](https://www.typescriptlang.org/)
* **Database**: [PostgreSQL](https://www.postgresql.org/)
* **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
* **UI Components**: [Shadcn UI](https://ui.shadcn.com/)
* **Map Integration**: [Mapbox GL JS](https://www.mapbox.com/)
* **Styling**: [Tailwind CSS](https://tailwindcss.com/)
* **Storage**: AWS S3 SDK (Compatible with S3 providers)
* **Validation**: Zod & React Hook Form

## ⚙️ Installation & Setup

### Prerequisites

* Node.js (v18+ recommended)
* PostgreSQL Database
* An S3-compatible storage bucket (AWS, MinIO, etc.)
* Mapbox Access Token (for Map features)

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/keproop.git
cd keproop
```

### 2. Install dependencies

```bash
npm install
# or
yarn install
```

### 3. Environment Configuration

Create a `.env` file in the root directory and configure the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/keproop"

# Storage (AWS S3 or Compatible)
AWS_REGION="us-east-1"
AWS_S3_ENDPOINT="https://s3.amazonaws.com" # or your custom endpoint
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_S3_BUCKET_NAME="your-bucket-name"

# Mapbox (Required for Map features)
NEXT_PUBLIC_MAPBOX_TOKEN="your-mapbox-public-token"

# Authentication
# Generate a secret using: openssl rand -base64 32
JWT_SECRET="your-secure-jwt-secret"
REFRESH_TOKEN_SECRET="your-secure-refresh-token-secret"

# Google OAuth (Optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"
```

### 4. Database Setup

Push the database schema to your PostgreSQL instance:

```bash
npm run drizzle-kit push
```

### 5. Run the application

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.
API Documentation will be available at `http://localhost:3000/api-doc`.

## 📜 Scripts

* `npm run dev`: Starts the development server.
* `npm run build`: Builds the application for production.
* `npm start`: Runs the built production application.
* `npm run lint`: Runs ESLint for code quality checks.
* `npm run build:swagger`: Generates the Swagger JSON specification.

## 🗄️ Database Schema

KepRoop uses a relational schema designed for scalability:

* **Users**: Stores profile info and authentication credentials.
* **Albums**: The core organizational unit.
* **AlbumFolders**: Nested folders within albums for organization.
* **Images**: Metadata for files stored in S3, including EXIF and GPS data.
* **AlbumMembers**: Join table handling user permissions per album.
* **AlbumInvites**: Manages secure, trackable invite tokens.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.