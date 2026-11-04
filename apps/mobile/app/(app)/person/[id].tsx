import { useLocalSearchParams } from "expo-router";

import { PersonScreen } from "@/screens/discover";

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonScreen id={String(id)} />;
}
