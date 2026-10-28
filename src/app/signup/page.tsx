import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata = { title: "Create your account" };

export default async function SignUpPage() {
  if (await auth()) redirect("/challenges");
  return (
    <AuthShell
      title="Create your account"
      sub="A handle, a name, and you are in. Everything else can wait."
      footer={
        <>
          Already have one?{" "}
          <Link href="/signin" style={{ color: "var(--gold)" }}>Sign in</Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
