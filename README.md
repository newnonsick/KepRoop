# KepRoop - Secure Photo Albums

KepRoop is a modern, secure photo album management application designed for simplicity and privacy. It allows users to create albums, manage photos, and share them with granular permissions (Viewer/Editor) via secure invite links.

![KepRoop Logo](public/logo.png)

## ✨ Features

### 📸 Album Management
- **Create & Organize**: specialized albums with custom cover images.
- **Privacy Controls**: Set albums as **Public** or **Private**.
- **Collage Covers**: Dynamic 2x2 collage previews for albums.
- **Search & Filter**: Unified search bar with visibility and date range filters.

### 👥 Collaboration & Sharing
- **Role-Based Access**:
    - **Owner**: Full control.
    - **Editor**: Can upload and manage photos.
    - **Viewer**: Read-only access.
- **Smart Invites**:
    - Secure invite links with role-specific tokens.
    - **Auto-Upgrade**: Viewers using Editor links are automatically upgraded.
    - **Downgrade Protection**: Existing Editors using Viewer links retain their privileges.
- **Guest Access**: Secure cookie-based access for non-authenticated guests via invite links.

### 🛡️ Authentication & Security
- **Secure Login**: Email/Password and Google OAuth.
- **Session Management**: "Remember Me" functionality for 30-day persistent sessions.
- **Token-Based Auth**: Secure Access and Refresh token rotation with httpOnly cookies.

### 🎨 Modern UI/UX
- **Premium Aesthetic**: Clean, minimal design using `shadcn/ui` components.
- **Responsive**: Fully optimized mobile and desktop experiences.
- **Interactive Feedback**: Custom toasts (`sonner`) and themed confirmation dialogs.

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4, `shadcn/ui`
- **Database**: PostgreSQL (via Neon/Supabase)
- **ORM**: Drizzle ORM
- **Storage**: AWS S3 (for image storage)
- **Authentication**: Custom JWT (JOSE) + Google OAuth

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL Database
- AWS S3 Bucket

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/newnonsick/KepRoop.git
   cd KepRoop
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=postgresql://...
   JWT_SECRET=your_jwt_secret
   REFRESH_TOKEN_SECRET=your_refresh_secret
   
   # AWS S3
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   S3_BUCKET_NAME=...
   
   # Google OAuth
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=...
   ```

4. Run database migrations:
   ```bash
   npm run db:push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
