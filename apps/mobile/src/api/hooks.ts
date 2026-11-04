import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
