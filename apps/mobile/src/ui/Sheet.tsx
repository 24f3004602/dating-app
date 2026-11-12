/**
 * A modal bottom sheet (Material's, in the Interchange, stage 20e): white and square under
 * a graphite rule, over the sign's graphite as a scrim. Back, Escape on the web, a tap on
 * the scrim and the sheet's own Close all dismiss it. It slides up from the bottom edge as
 * the scrim fades in; with reduce motion it is simply there. Its rows are `ListRow`s.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color, motion, scrim, size, space } from "@/theme/tokens";
import { easing, nativeDriver, useReducedMotion } from "@/ui/motion";

type Props = { visible: boolean; onClose: () => void; label: string; children: ReactNode };

export function Sheet({ visible, onClose, label, children }: Props) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const window = useWindowDimensions();
  const [height, setHeight] = useState(0);
  // 1: below the bottom edge; 0: in place.
  const shift = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      shift.setValue(1);
      setHeight(0);
    } else if (reduced) {
      shift.setValue(0);
    } else if (height > 0) {
      Animated.timing(shift, {
        toValue: 0,
        duration: motion.duration.base,
        easing: easing.decelerate,
        useNativeDriver: nativeDriver,
      }).start();
    }
  }, [visible, reduced, height, shift]);

  // Until the sheet has measured itself it waits below the screen, so it never flashes in place first.
  const translateY = shift.interpolate({ inputRange: [0, 1], outputRange: [0, height || window.height] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root}>
        {/* The scrim: a tap closes the sheet. Screen readers have Close and Back instead. */}
        <Pressable style={styles.scrim} onPress={onClose} accessible={false} importantForAccessibility="no" aria-hidden />
        <Animated.View
          role="dialog"
          aria-modal
          aria-label={label}
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[styles.sheet, { paddingBottom: insets.bottom + space.lg, transform: [{ translateY }] }]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.sign, opacity: scrim.opacity },
  sheet: {
    backgroundColor: color.bg,
    borderTopWidth: 2,
    borderTopColor: color.sign,
    paddingTop: space.xl,
    paddingHorizontal: space.xl,
    gap: space.lg,
    width: "100%",
    maxWidth: size.contentMax,
    alignSelf: "center",
  },
});
