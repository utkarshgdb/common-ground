import { Room } from "@/components/room/Room";

export const dynamic = "force-dynamic";

export default function RoomPage({ params, searchParams }: { params: { id: string }; searchParams: { as?: string } }) {
  return <Room id={params.id} initialAs={searchParams.as ?? null} />;
}
