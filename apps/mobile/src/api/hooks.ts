import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";

import { ApiError, type Schemas, unwrap } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";

export const keys = {
  me: ["me"] as const,
  profile: ["me", "profile"] as const,
  photos: ["me", "photos"] as const,
  areas: ["areas"] as const,
  prompts: ["prompts"] as const,
};

export type MyProfile = Schemas["MyProfileOut"];
export type Photo = Schemas["PhotoOut"];
export type ProfileBody = Schemas["ProfileIn"];

export function useMyProfile() {
  const { api } = useAuth();
  return useQuery({
    queryKey: keys.profile,
    queryFn: async (): Promise<MyProfile | null> => {
      try {
        return await unwrap(api.GET("/v1/me/profile"));
      } catch (e) {
        if (e instanceof ApiError && e.code === "profile_not_found") return null; // not created yet
        throw e;
      }
    },
  });
}

export function useMe() {
  const { api } = useAuth();
  return useQuery({ queryKey: keys.me, queryFn: () => unwrap(api.GET("/v1/me")) });
}

export function useAreas() {
  const { api } = useAuth();
  return useQuery({ queryKey: keys.areas, queryFn: () => unwrap(api.GET("/v1/areas")), staleTime: Infinity });
}

export function usePrompts() {
  const { api } = useAuth();
  return useQuery({ queryKey: keys.prompts, queryFn: () => unwrap(api.GET("/v1/prompts")), staleTime: Infinity });
}

export function usePhotos() {
  const { api } = useAuth();
  return useQuery({ queryKey: keys.photos, queryFn: () => unwrap(api.GET("/v1/me/photos")) });
}

export function useSaveProfile() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileBody) => unwrap(api.PUT("/v1/me/profile", { body })),
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  });
}

export function useSavePrivacy() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["PrivacyIn"]) => unwrap(api.PATCH("/v1/me/privacy", { body })),
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  });
}

export type PickedImage = { uri: string; mimeType?: string | null; fileName?: string | null };

async function asFormData(image: PickedImage): Promise<FormData> {
  const form = new FormData();
  const name = image.fileName ?? "photo.jpg";
  const type = image.mimeType ?? "image/jpeg";
  if (Platform.OS === "web") {
    const blob = await (await fetch(image.uri)).blob();
    form.append("file", blob, name);
  } else {
    // React Native's FormData accepts a file descriptor object.
    form.append("file", { uri: image.uri, name, type } as unknown as Blob);
  }
  return form;
}

export function useUploadPhoto() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (image: PickedImage) => {
      const form = await asFormData(image);
      return unwrap(
        api.POST("/v1/me/photos", {
          body: form as unknown as Schemas["PhotoUploadForm"],
          bodySerializer: (b) => b as unknown as FormData,
        }),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.photos });
      void qc.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

export function useDeletePhoto() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) =>
      unwrap(api.DELETE("/v1/me/photos/{photo_id}", { params: { path: { photo_id: photoId } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.photos });
      void qc.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

export function useReorderPhotos() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoIds: string[]) => unwrap(api.PATCH("/v1/me/photos/order", { body: { photo_ids: photoIds } })),
    onSuccess: (photos) => {
      qc.setQueryData(keys.photos, photos);
      void qc.invalidateQueries({ queryKey: keys.profile });
    },
  });
}

/** Photo URLs from the API are relative signed paths in development. */
export function absoluteUrl(baseUrl: string, path: string): string {
  return path.startsWith("http") ? path : `${baseUrl.replace(/\/$/, "")}${path}`;
}

export type Today = Schemas["TodayOut"];
export type Card = Schemas["DiscoveryCard"];
export type Person = Schemas["PublicProfileOut"];
export type Prefs = Schemas["PreferencesOut"];

export const discoveryKeys = {
  today: ["discovery", "today"] as const,
  person: (id: string) => ["profiles", id] as const,
  preferences: ["me", "preferences"] as const,
};

export function useToday() {
  const { api } = useAuth();
  return useQuery({ queryKey: discoveryKeys.today, queryFn: () => unwrap(api.GET("/v1/discovery/today")), retry: false });
}

export function usePerson(id: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: discoveryKeys.person(id),
    queryFn: () => unwrap(api.GET("/v1/profiles/{user_id}", { params: { path: { user_id: id } } })),
    retry: false,
  });
}

export function usePreferences() {
  const { api } = useAuth();
  return useQuery({ queryKey: discoveryKeys.preferences, queryFn: () => unwrap(api.GET("/v1/me/preferences")) });
}

export function useSavePreferences() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["PreferencesIn"]) => unwrap(api.PUT("/v1/me/preferences", { body })),
    onSuccess: (prefs) => qc.setQueryData(discoveryKeys.preferences, prefs),
  });
}

export type MatchItem = Schemas["MatchOut"];
export type LikeReceived = Schemas["LikeReceivedOut"];
export type Decision = Schemas["InteractionOut"];

export const matchingKeys = { likes: ["likes", "received"] as const, matches: ["matches"] as const };

export function useLikesReceived() {
  const { api } = useAuth();
  return useQuery({ queryKey: matchingKeys.likes, queryFn: () => unwrap(api.GET("/v1/likes/received")) });
}

export function useMatches() {
  const { api } = useAuth();
  return useQuery({ queryKey: matchingKeys.matches, queryFn: () => unwrap(api.GET("/v1/matches")) });
}

export function useDecide() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["InteractionIn"]) => unwrap(api.POST("/v1/interactions", { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: discoveryKeys.today });
      void qc.invalidateQueries({ queryKey: matchingKeys.likes });
      void qc.invalidateQueries({ queryKey: matchingKeys.matches });
    },
  });
}

export type Message = Schemas["MessageOut"];
export type MessagePage = Schemas["MessagePage"];

export const chatKeys = {
  all: ["conversation"] as const,
  conversation: (matchId: string) => ["conversation", matchId] as const,
  match: (matchId: string) => ["matches", matchId] as const,
  nudge: ["safety", "nudge-terms"] as const,
};

/** History, newest page first; `fetchNextPage` loads older messages. */
export function useConversation(matchId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const { api } = useAuth();
  return useInfiniteQuery({
    enabled,
    queryKey: chatKeys.conversation(matchId),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/matches/{match_id}/messages", {
          params: { path: { match_id: matchId }, query: pageParam === undefined ? {} : { before: pageParam } },
        }),
      ),
    getNextPageParam: (last: MessagePage) => (last.has_more ? last.items[0]?.n : undefined),
    retry: false,
  });
}

/** Every message once, oldest first (pages can overlap after a refetch). */
export function flattenPages(pages: MessagePage[] | undefined): Message[] {
  const byN = new Map<number, Message>();
  for (const page of pages ?? []) for (const m of page.items) byN.set(m.n, m);
  return [...byN.values()].sort((a, b) => a.n - b.n);
}

export function useMatch(matchId: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: chatKeys.match(matchId),
    queryFn: () => unwrap(api.GET("/v1/matches/{match_id}", { params: { path: { match_id: matchId } } })),
    retry: false,
  });
}

export function useSendMessage(matchId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["MessageIn"]) =>
      unwrap(api.POST("/v1/matches/{match_id}/messages", { params: { path: { match_id: matchId } }, body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.conversation(matchId) });
      void qc.invalidateQueries({ queryKey: matchingKeys.matches });
    },
  });
}

export function useMarkRead(matchId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (upToN: number) =>
      unwrap(
        api.POST("/v1/matches/{match_id}/read", { params: { path: { match_id: matchId } }, body: { up_to_n: upToN } }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: matchingKeys.matches }),
  });
}

export function useNudgeTerms() {
  const { api } = useAuth();
  return useQuery({
    queryKey: chatKeys.nudge,
    queryFn: () => unwrap(api.GET("/v1/safety/nudge-terms")),
    staleTime: 60 * 60 * 1000,
  });
}

export type Blocked = Schemas["BlockedOut"];
export type ReportItem = Schemas["ReportOut"];
export type ReportBody = Schemas["ReportIn"];

export const safetyKeys = { blocks: ["safety", "blocks"] as const, reports: ["safety", "reports"] as const };

/** After a block, unmatch or report, everything that might show them is refreshed. */
function useForget() {
  const qc = useQueryClient();
  return () => {
    for (const queryKey of [matchingKeys.matches, matchingKeys.likes, discoveryKeys.today, chatKeys.all, ["profiles"], safetyKeys.blocks, safetyKeys.reports]) {
      void qc.invalidateQueries({ queryKey });
    }
  };
}

export function useBlock() {
  const { api } = useAuth();
  const forget = useForget();
  return useMutation({
    mutationFn: (userId: string) => unwrap(api.POST("/v1/blocks", { body: { user_id: userId } })),
    onSuccess: forget,
  });
}

export function useUnblock() {
  const { api } = useAuth();
  const forget = useForget();
  return useMutation({
    mutationFn: (userId: string) => unwrap(api.DELETE("/v1/blocks/{user_id}", { params: { path: { user_id: userId } } })),
    onSuccess: forget,
  });
}

export function useBlocks() {
  const { api } = useAuth();
  return useQuery({ queryKey: safetyKeys.blocks, queryFn: () => unwrap(api.GET("/v1/blocks")) });
}

export function useUnmatch() {
  const { api } = useAuth();
  const forget = useForget();
  return useMutation({
    mutationFn: (matchId: string) =>
      unwrap(api.POST("/v1/matches/{match_id}/unmatch", { params: { path: { match_id: matchId } } })),
    onSuccess: forget,
  });
}

export function useReport() {
  const { api } = useAuth();
  const forget = useForget();
  return useMutation({
    mutationFn: (body: ReportBody) => unwrap(api.POST("/v1/reports", { body })),
    onSuccess: forget,
  });
}

export function useMyReports() {
  const { api } = useAuth();
  return useQuery({ queryKey: safetyKeys.reports, queryFn: () => unwrap(api.GET("/v1/reports/mine")) });
}

// --- notifications (stage 16, D093) ---------------------------------------------------

export type NotificationPrefs = Schemas["PrefsBody"];
export type Notice = Schemas["NoticeOut"];
export const notifyKeys = { prefs: ["notify", "prefs"] as const, notices: ["notify", "notices"] as const };

export function useNotificationPrefs() {
  const { api } = useAuth();
  return useQuery({ queryKey: notifyKeys.prefs, queryFn: () => unwrap(api.GET("/v1/me/notifications")) });
}

export function useSaveNotificationPrefs() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationPrefs) => unwrap(api.PUT("/v1/me/notifications", { body })),
    onSuccess: (data) => qc.setQueryData(notifyKeys.prefs, data),
  });
}

export function useNotices() {
  const { api } = useAuth();
  return useQuery({ queryKey: notifyKeys.notices, queryFn: () => unwrap(api.GET("/v1/me/notices")) });
}

export function useMarkNoticeRead() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/v1/me/notices/{notice_id}/read", { params: { path: { notice_id: id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: notifyKeys.notices }),
  });
}
