import Link from "next/link";
import { auth } from "@/lib/auth";
import { ProfileView } from "@/components/ProfileView";

export default async function MyProfilePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;

  if (!userId) {
    return (
      <div style={{ paddingTop: 48, textAlign: "center" }}>
        <p className="font-display" style={{ fontSize: 22 }}>You&apos;re not signed in.</p>
        <Link href="/api/auth/signin" className="bg-gold text-night"
          style={{ display: "inline-block", marginTop: 16, borderRadius: 12, padding: "10px 20px", fontWeight: 600 }}>
          Sign in
        </Link>
      </div>
    );
  }
  return <ProfileView userId={userId} isMe />;
}