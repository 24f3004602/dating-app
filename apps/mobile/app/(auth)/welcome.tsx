import { WelcomeScreen } from "@/screens/auth";
import { ALL_EDGES, ScreenEdges } from "@/ui/primitives";

// No top bar here (the layout hides it), so the screen pads every edge itself.
export default function Route() {
  return (
    <ScreenEdges.Provider value={ALL_EDGES}>
      <WelcomeScreen />
    </ScreenEdges.Provider>
  );
}
