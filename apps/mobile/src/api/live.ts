/** Live calls and the plan (stage 23, D123). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type Api, type Schemas, unwrap } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import type { LiveApi } from "@/calls/session";

export const liveKeys = {
  live: ["live"] as const,
  plan: ["plan"] as const,
  subscription: ["me", "subscription"] as const,
  plusPayment: ["me", "plus-payment"] as const,
};

export type LiveOut = Schemas["LiveOut"];
export type PlanOut = Schemas["PlanOut"];
export type SubscriptionOut = Schemas["SubscriptionOut"];
export type PlusPaymentOut = Schemas["PlusPaymentOut"];

/** `enabled: false` waits until it's needed (the app tour asks only while it's open). */
export function useLive({ enabled = true }: { enabled?: boolean } = {}) {
  const { api } = useAuth();
  return useQuery({ queryKey: liveKeys.live, queryFn: () => unwrap(api.GET("/v1/live")), enabled });
}

export function useAcceptLiveRules() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: string) => unwrap(api.PUT("/v1/live/rules", { body: { version } })),
    onSuccess: (live) => qc.setQueryData(liveKeys.live, live),
  });
}

/** Live's LGBTQ+ space (D161). The answer is Live at a glance; a refusal refetches it. */
export function useLiveSettings() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lgbtqOnly: boolean) => unwrap(api.PUT("/v1/live/settings", { body: { lgbtq_only: lgbtqOnly } })),
    onSuccess: (live) => qc.setQueryData(liveKeys.live, live),
    onError: () => qc.invalidateQueries({ queryKey: liveKeys.live }),
  });
}

export function usePlan() {
  const { api } = useAuth();
  return useQuery({ queryKey: liveKeys.plan, queryFn: () => unwrap(api.GET("/v1/plan")), staleTime: 10 * 60_000 });
}

/** `enabled: false` never asks (a build without ads has no use for it outside the plan screen). */
export function useSubscription({ enabled = true }: { enabled?: boolean } = {}) {
  const { api } = useAuth();
  return useQuery({ queryKey: liveKeys.subscription, queryFn: () => unwrap(api.GET("/v1/me/subscription")), enabled });
}

/** The pass payment in progress (D127): while it's being checked, look again every 30 seconds. */
export function usePlusPayment(enabled: boolean) {
  const { api } = useAuth();
  return useQuery({
    queryKey: liveKeys.plusPayment,
    queryFn: () => unwrap(api.GET("/v1/me/plus-payment")),
    enabled,
    refetchInterval: (query) => (query.state.data?.status === "submitted" ? 30_000 : false),
  });
}

function usePlusPaymentChanged() {
  const qc = useQueryClient();
  return (payment: PlusPaymentOut) => {
    qc.setQueryData(liveKeys.plusPayment, payment);
    void qc.invalidateQueries({ queryKey: liveKeys.subscription });
    void qc.invalidateQueries({ queryKey: liveKeys.live });
  };
}

export function useStartPlusPayment() {
  const { api } = useAuth();
  const changed = usePlusPaymentChanged();
  return useMutation({ mutationFn: () => unwrap(api.POST("/v1/me/plus-payment")), onSuccess: changed });
}

export function useSendReference() {
  const { api } = useAuth();
  const changed = usePlusPaymentChanged();
  return useMutation({
    mutationFn: ({ id, utr }: { id: string; utr: string }) =>
      unwrap(api.PUT("/v1/me/plus-payment/{payment_id}/reference", { params: { path: { payment_id: id } }, body: { utr } })),
    onSuccess: changed,
  });
}

export function useCheckout() {
  const { api } = useAuth();
  return useMutation({ mutationFn: () => unwrap(api.POST("/v1/me/subscription")) });
}

export function useStopRenewing() {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/v1/me/subscription/cancel")),
    onSuccess: (sub) => {
      qc.setQueryData(liveKeys.subscription, sub);
      void qc.invalidateQueries({ queryKey: liveKeys.live });
    },
  });
}

/** The session's view of the API (calls/session.ts). */
export function liveApi(api: Api): LiveApi {
  const path = (id: string) => ({ params: { path: { call_id: id } } });
  return {
    queue: (clientId) => unwrap(api.POST("/v1/live/queue", { body: { client_id: clientId } })),
    leave: async () => {
      await unwrap(api.DELETE("/v1/live/queue"));
    },
    call: (id) => unwrap(api.GET("/v1/calls/{call_id}", path(id))),
    ice: (id) => unwrap(api.POST("/v1/calls/{call_id}/ice", path(id))),
    offer: (id, sdp) => unwrap(api.PUT("/v1/calls/{call_id}/offer", { ...path(id), body: { sdp } })),
    answer: (id, sdp) => unwrap(api.PUT("/v1/calls/{call_id}/answer", { ...path(id), body: { sdp } })),
    connected: (id) => unwrap(api.POST("/v1/calls/{call_id}/connected", path(id))),
    end: (id, reason) => unwrap(api.POST("/v1/calls/{call_id}/end", { ...path(id), body: { reason } })),
  };
}
