import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * The root sends you where you can actually go.
 *
 * It used to redirect to /feed unconditionally, which for a signed-out
 * visitor meant landing on a page with nothing on it.
 */
export default async function Home() {
  const session = await auth();
  redirect((session?.user as { id?: string })?.id ? "/feed" : "/signin");
}
