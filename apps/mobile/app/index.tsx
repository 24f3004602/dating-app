import { Redirect } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { t } from "@/i18n/en";
import { Loading } from "@/ui/primitives";

export default function Index() {
  const { status } = useAuth();
  if (status === "loading") return <Loading label={t.common.loading} />;
  return <Redirect href={status === "signedIn" ? "/profile" : "/welcome"} />;
}
