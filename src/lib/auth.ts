import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/**
 * Google sign-in is deliberately NOT registered here.
 *
 * It was configured with `session: { strategy: "jwt" }` and no
 * database adapter, which meant a Google login produced a session
 * whose `uid` was Google's account id rather than a row in `User`.
 * Every query keyed on that id came back empty, so the app silently
 * broke for anyone who used it.
 *
 * Re-enabling it needs either `@auth/prisma-adapter`, or a `signIn`
 * callback that finds-or-creates the `User` and `Profile` and puts
 * the real database id on the token. Until one of those exists,
 * leaving the provider out is what keeps /api/auth/signin/google
 * from handing out broken sessions.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const user = await prisma.user.findUnique({
          where: { email: String(creds.email) },
          include: { profile: true },
        });
        if (!user?.passwordHash || user.bannedAt) return null;
        const ok = await bcrypt.compare(String(creds.password), user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.profile?.fullName };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  const id = (session?.user as { id?: string })?.id;
  if (!id) throw new Response("Unauthorized", { status: 401 });
  return id;
}
