import { useLocalSearchParams } from "expo-router";

import { ChatScreen } from "@/screens/chat";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatScreen matchId={String(id)} />;
}
