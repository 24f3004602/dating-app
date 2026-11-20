import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import { StyleSheet } from "react-native";

import { t } from "@/i18n/en";
import { TourStage } from "@/tour/TourStage";
import { color } from "@/theme/tokens";
import { LineBar, Stop } from "@/ui/LineTabBar";
import { BETWEEN_BARS, ScreenEdges } from "@/ui/primitives";
import { SignBand } from "@/ui/SignBand";

// The main places as tabs on one line (stage 20e, D105), with Live at the centre (stage
// 23, D123). Their URLs stay the same (/discover, /likes, /live, /matches, /profile);
// everything else opens above them in the stack, so system Back works as before.
export default function TabsLayout() {
  return (
    <Tabs style={styles.root}>
      <SignBand />
      {/* The band covers the top edge and the bar the bottom one. The app tour's card (D136)
          sits over the place it describes, between the two. */}
      <ScreenEdges.Provider value={BETWEEN_BARS}>
        <TourStage>
          <TabSlot style={styles.slot} />
        </TourStage>
      </ScreenEdges.Provider>
      <TabList asChild>
        <LineBar label={t.tabs.label}>
          <TabTrigger name="discover" href="/discover" asChild>
            <Stop label={t.tabs.today} />
          </TabTrigger>
          <TabTrigger name="likes" href="/likes" asChild>
            <Stop label={t.tabs.likes} />
          </TabTrigger>
          <TabTrigger name="live" href="/live" asChild>
            <Stop label={t.tabs.live} />
          </TabTrigger>
          <TabTrigger name="matches" href="/matches" asChild>
            <Stop label={t.tabs.matches} />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <Stop label={t.tabs.you} />
          </TabTrigger>
        </LineBar>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  slot: { flex: 1 },
});
