import { useLocalSearchParams } from "expo-router";

import { ReportScreen } from "@/screens/safety";

export default function Route() {
  const { id, name, match, call } = useLocalSearchParams<{ id: string; name?: string; match?: string; call?: string }>();
  return (
    <ReportScreen
      subjectId={String(id)}
      name={String(name ?? "")}
      matchId={match ? String(match) : undefined}
      callId={call ? String(call) : undefined}
    />
  );
}
