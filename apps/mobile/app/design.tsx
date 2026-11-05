import { Redirect } from "expo-router";

import { DESIGN_GALLERY } from "@/config";
import { DesignGallery } from "@/screens/design";

export default function Route() {
  if (!DESIGN_GALLERY) return <Redirect href="/" />;
  return <DesignGallery />;
}
