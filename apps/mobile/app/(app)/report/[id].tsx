import { useLocalSearchParams } from "expo-router";

import { ReportScreen } from "@/screens/safety";

export default function Route() {
  const { id, name, match } = useLocalSearchParams<{ id: string; name?: string; match?: string }>();
  return <ReportScreen subjectId={String(id)} name={String(name ?? "")} matchId={match ? String(match) : undefined} />;
}
