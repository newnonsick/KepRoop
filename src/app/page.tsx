import AuthLanding from "@/components/AuthLanding";

export default function Home() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID || "";

  return (
    <main className="min-h-screen bg-background">
      <AuthLanding googleClientId={googleClientId} />
    </main>
  );
}

