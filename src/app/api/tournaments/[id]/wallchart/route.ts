import { generateWallchart } from "@/lib/pdf/wallchart";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pdf = await generateWallchart(id);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="wallchart-${id}.pdf"`,
    },
  });
}
