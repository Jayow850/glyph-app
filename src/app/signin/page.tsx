import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  if (await auth()) redirect("/challenges");
  const { callbackUrl, error } = await searchParams;

  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          New here?{" "}
          <Link href="/signup" style={{ color: "var(--gold)" }}>Create an account</Link>
        </>
      }
    >
      <SignInForm callbackUrl={callbackUrl ?? "/challenges"} initialError={error ? true : false} />
    </AuthShell>
  );
}
