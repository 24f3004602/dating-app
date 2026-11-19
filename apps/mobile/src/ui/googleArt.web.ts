import type { ImageSourcePropType } from "react-native";

/**
 * Google's G and words on the web (D135). Expo's web build serves an image's 1x file only, which
 * a phone's browser enlarges and blurs; this is the 3x file's pixels under a name of its own,
 * drawn at 155 x 20 points like the others, so it stays sharp on screens up to 3x.
 */
export const GOOGLE_ART: ImageSourcePropType = require("../../assets/google/sign-in-logo-and-words-web.png");
