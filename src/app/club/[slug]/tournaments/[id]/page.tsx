import { redirect } from "next/navigation";

/**
 * Tournaments now live at a single canonical address so there is one
 * screen to maintain, not two that drift apart.
 */
export default async function ClubTournamentRedirect({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { id } = await params;
  redirect(`/tournaments/${id}`);
}
