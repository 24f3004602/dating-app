/**
 * The banner (D137): Google's anchored adaptive banner at the foot of the lists (Today, Likes,
 * Matches), above the line bar, under a hairline and a plain "Ad" label so it never passes for
 * the app's own content. One banner stays loaded across the three; with no ad to show it takes
 * no room at all.
 */
import { usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";

import { AD_REQUEST, AD_UNITS, BANNER_PATHS } from "@/ads/config";
import { useAds } from "@/ads/AdsProvider";
import { t } from "@/i18n/en";
import { color, space, type } from "@/theme/tokens";

export function AdBanner() {
  const ads = useAds();
  const pathname = usePathname();
  const [empty, setEmpty] = useState(false);
  // Moving between the lists tries again after a "no ad to show".
  useEffect(() => setEmpty(false), [pathname]);
  if (!ads.banners || !BANNER_PATHS.has(pathname) || empty) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.label} aria-label={t.ads.spoken}>
        {t.ads.label}
      </Text>
      <BannerAd
        unitId={AD_UNITS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={AD_REQUEST}
        onAdFailedToLoad={() => setEmpty(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.xs },
  label: { ...type.caption, color: color.textMuted, alignSelf: "flex-start", paddingHorizontal: space.xl },
});
