/**
 * Live (stage 23, D123): random one-to-one video calls with people whose preferences
 * match yours. The first calls are free for a minute each; then the plan.
 *
 * The stage follows the Two Lines Rule: your camera sits in a teal frame, theirs above
 * a marigold rail, and their name is on a graphite plate. Their video stays covered
 * until you choose to see it (the sound plays). End and Report are crimson: they end
 * the call, and a report ends it before the form opens.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { Children, type ReactNode, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ApiError } from "@/api/client";
import { useDecide } from "@/api/hooks";
import { liveApi, liveKeys, useAcceptLiveRules, useLive, type LiveOut } from "@/api/live";
import { messageFor } from "@/api/messages";
import { useAuth } from "@/auth/AuthProvider";
import { rtcSupported } from "@/calls/rtc";
import type { CallOut, LiveRtc } from "@/calls/session";
import { platformRtc, useLiveSession } from "@/calls/useLiveSession";
import { VideoView } from "@/calls/VideoView";
import { BRAND } from "@/config";
import { fill, t } from "@/i18n/en";
import { color, font, radius, space, type } from "@/theme/tokens";
import { Body, Button, Caption, Heading, Loading, Notice, Plate, Screen, Title } from "@/ui/primitives";

export const planName = () => fill(t.plan.name, { brand: BRAND });

/** "0:42" */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function problemText(code: string): string {
  const known = (t.live.problems as Record<string, string>)[code];
  return fill(known ?? t.live.problems.unknown, { plan: planName() });
}

/** Buttons side by side, each an equal share of the row. */
function Cells({ children }: { children: ReactNode }) {
  return (
    <View style={styles.cells}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={styles.cell}>
          {child}
        </View>
      ))}
    </View>
  );
}

function Countdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  // A plain sign, not a Badge: a Badge fades in whenever its words change, and the time
  // changes every second (badges never pulse).
  return (
    <View style={styles.clock}>
      <Text style={styles.clockText}>{fill(t.live.timeLeft, { time: clock(endsAt - now) })}</Text>
    </View>
  );
}

/** What you have: free calls left, or the plan. */
function Allowance({ live }: { live: LiveOut }) {
  if (live.plan) {
    return <Body>{fill(t.live.planActive, { plan: planName(), minutes: Math.round(live.plan_call_seconds / 60) })}</Body>;
  }
  if (live.free_calls_left > 0) {
    return <Body>{fill(t.live.freeLeft, { n: live.free_calls_left, total: live.free_calls })}</Body>;
  }
  return <Body>{fill(t.live.freeNone, { total: live.free_calls })}</Body>;
}

/** Before a call: what Live is, the rules, and Start (or what stands in the way). */
function Lobby({ live, problem, onStart }: { live: LiveOut; problem: string | null; onStart: () => void }) {
  const router = useRouter();
  const accept = useAcceptLiveRules();
  const { api } = useAuth();
  const qc = useQueryClient();
  const [ending, setEnding] = useState(false);
  const ready = live.ready;
  const shown = problem ?? (ready !== "ok" && ready !== "rules" ? `live_${ready}` : null);
  // A call left open (the page was reloaded mid-call, or another device has it): end it here.
  const endOpenCall = async (call: CallOut) => {
    setEnding(true);
    await liveApi(api).end(call.id, "hangup").catch(() => undefined);
    setEnding(false);
    await qc.invalidateQueries({ queryKey: liveKeys.live });
  };

  return (
    <>
      <Body muted>{t.live.intro}</Body>
      <Allowance live={live} />
      {shown ? <Notice kind={shown.startsWith("camera") || shown === "no_camera" ? "error" : "info"}>{problemText(shown)}</Notice> : null}
      {live.call ? (
        <>
          <Notice kind="info">{t.live.problems.other_device}</Notice>
          <Button label={t.live.end} variant="danger" busy={ending} onPress={() => void endOpenCall(live.call as CallOut)} />
        </>
      ) : null}
      {ready === "profile_incomplete" ? <Button label={t.live.toPhotos} variant="secondary" onPress={() => router.push("/photos")} /> : null}
      {ready === "paused" ? <Button label={t.live.toPrivacy} variant="secondary" onPress={() => router.push("/privacy")} /> : null}
      {ready === "no_calls_left" || problem === "live_no_calls_left" ? (
        <Button label={fill(t.live.seePlan, { plan: planName() })} onPress={() => router.push("/plan")} />
      ) : null}
      {ready === "rules" ? (
        <View style={styles.rules}>
          <Heading>{t.live.rulesTitle}</Heading>
          {t.live.rules.map((rule, i) => (
            <Body key={rule}>{`${i + 1}. ${rule}`}</Body>
          ))}
          {accept.error ? <Notice kind="error">{messageFor(accept.error)}</Notice> : null}
          <Button label={t.live.agree} busy={accept.isPending} onPress={() => accept.mutate(live.rules_version)} />
        </View>
      ) : null}
      {ready === "ok" && !live.call ? (
        <>
          <Button label={t.live.start} onPress={onStart} />
          <Caption>{t.live.startHint}</Caption>
        </>
      ) : null}
      {live.plan === false && ready === "ok" ? (
        <Button label={fill(t.live.seePlan, { plan: planName() })} variant="secondary" onPress={() => router.push("/plan")} />
      ) : null}
      <Caption>{t.live.relayNote}</Caption>
    </>
  );
}

/** The call itself: their video (covered until shown), your camera, the time and the controls. */
function Stage({ rtc }: { rtc?: LiveRtc }) {
  const router = useRouter();
  const live = useLive();
  const { state, session } = useLiveSession(rtc);
  const decide = useDecide();
  const [shown, setShown] = useState(false);
  const call = state.call;
  const peer = call?.peer ?? null;
  const name = peer?.display_name ?? "";

  // Leaving Live (another tab, the report form) ends the call and turns the camera off.
  useFocusEffect(useCallback(() => () => session.stop(), [session]));
  // A new call starts covered.
  const resetLike = decide.reset;
  useEffect(() => {
    setShown(false);
    resetLike();
  }, [call?.id, resetLike]);

  if (!live.data) {
    return live.isError ? <Notice kind="error">{messageFor(live.error)}</Notice> : <Loading label={t.common.loading} />;
  }
  const { phase } = state;

  if (phase === "idle") {
    return <Lobby live={live.data} problem={state.problem} onStart={() => void session.start()} />;
  }

  const report = async () => {
    if (!call || !peer) return;
    await session.hangUp("report");
    router.push({ pathname: "/report/[id]", params: { id: peer.user_id, name, call: call.id } });
  };
  const like = () => {
    if (peer) decide.mutate({ target_id: peer.user_id, kind: "like" });
  };
  const connected = !!call?.connected_at;

  const upsell = phase === "ended" && call?.end_reason === "limit" && call.free && live.data.plan === false;
  const likeShown = connected && !!peer && !decide.isSuccess;

  return (
    <>
      <View style={styles.stage} role="group" aria-label={t.live.stage}>
        <View style={styles.remote}>
          {phase === "connecting" || phase === "live" ? (
            <VideoView stream={state.remote} label={fill(t.live.them, { name })} />
          ) : null}
          {(phase === "connecting" || phase === "live") && !shown ? (
            <View style={styles.cover}>
              <Text style={styles.coverText}>{fill(t.live.hidden, { name })}</Text>
              <Button label={t.live.show} hint={t.live.showHint} onPress={() => setShown(true)} />
            </View>
          ) : null}
          {phase === "camera" || phase === "searching" ? (
            <View style={styles.cover}>
              <ActivityIndicator color={color.onSign} aria-hidden />
              <Text style={styles.coverText}>{phase === "camera" ? t.live.camera : t.live.searching}</Text>
            </View>
          ) : null}
          {phase === "ended" ? (
            <View style={styles.cover}>
              <Text style={styles.coverText}>{call?.end_reason === "limit" ? `${t.live.timeUp} ` : ""}{fill(t.live.ended, { name })}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rail} />
        <View style={styles.mine}>
          <VideoView stream={state.camera} label={t.live.you} mirror muted />
        </View>
        {/* Their name and the time left ride on the picture, like a station's name sign. */}
        {peer && (phase === "connecting" || phase === "live" || phase === "ended") ? (
          <View style={styles.tag}>
            <Plate>{`${name}, ${peer.age}`}</Plate>
          </View>
        ) : null}
        {phase === "live" && state.endsAt ? (
          <View style={styles.timer}>
            <Countdown endsAt={state.endsAt} />
          </View>
        ) : null}
      </View>

      {phase === "searching" ? <Caption>{t.live.searchingHint}</Caption> : null}
      {phase === "connecting" ? <Body muted>{fill(t.live.connecting, { name })}</Body> : null}
      {state.problem ? <Notice kind="info">{problemText(state.problem)}</Notice> : null}

      {/* In a call, End and Report sit in the first row: never below the fold. */}
      {phase === "connecting" || phase === "live" ? (
        <Cells>
          <Button label={t.live.next} variant="secondary" onPress={() => void session.next()} />
          <Button label={t.live.end} variant="danger" onPress={() => void session.hangUp("hangup")} />
          <Button label={t.live.report} variant="danger" accessibleName={`${t.live.report} ${name}`} onPress={() => void report()} />
        </Cells>
      ) : null}
      {state.camera && phase !== "ended" ? (
        <>
          <Cells>
            <Button label={state.micOn ? t.live.mute : t.live.unmute} variant="secondary" onPress={() => session.setMic(!state.micOn)} />
            <Button label={state.cameraOn ? t.live.cameraOff : t.live.cameraOn} variant="secondary" onPress={() => session.setCamera(!state.cameraOn)} />
          </Cells>
          {!state.micOn ? <Caption>{t.live.yourMicOff}</Caption> : null}
          {!state.cameraOn ? <Caption>{t.live.yourCameraOff}</Caption> : null}
        </>
      ) : null}
      {phase === "camera" || phase === "searching" ? (
        <Button label={t.live.stop} variant="secondary" onPress={() => session.stop()} />
      ) : null}

      {/* After a call, one main action: Like when it connected, else the next person. */}
      {phase === "ended" ? (
        <View style={styles.controls}>
          {likeShown ? (
            <Button label={fill(t.live.like, { name })} hint={fill(t.live.likeHint, { name })} busy={decide.isPending} onPress={like} />
          ) : null}
          {decide.isSuccess ? (
            decide.data.match ? (
              <>
                <Notice kind="success">{fill(t.live.match, { name })}</Notice>
                <Button label={t.live.toMatches} onPress={() => router.push("/matches")} />
              </>
            ) : (
              <Notice kind="success">{fill(t.live.liked, { name })}</Notice>
            )
          ) : null}
          {decide.error ? <Notice kind="error">{decide.error instanceof ApiError ? messageFor(decide.error) : t.common.unknownError}</Notice> : null}
          {upsell ? (
            <>
              <Notice kind="info">{fill(t.live.longer, { plan: planName(), minutes: Math.round(live.data.plan_call_seconds / 60) })}</Notice>
              <Button label={fill(t.live.seePlan, { plan: planName() })} variant="secondary" onPress={() => router.push("/plan")} />
            </>
          ) : null}
          <Cells>
            <Button
              label={t.live.nextPerson}
              variant={likeShown || decide.data?.match ? "secondary" : "primary"}
              onPress={() => void session.next()}
            />
            <Button label={t.live.done} variant="secondary" onPress={() => session.stop()} />
          </Cells>
          {peer ? <Button label={t.live.report} variant="danger" accessibleName={`${t.live.report} ${name}`} onPress={() => void report()} /> : null}
        </View>
      ) : null}
    </>
  );
}

export function LiveScreen({ rtc }: { rtc?: LiveRtc } = {}) {
  const supported = rtc !== undefined || rtcSupported();
  return (
    <Screen>
      <Title>{t.live.title}</Title>
      {supported ? (
        <Stage rtc={rtc ?? platformRtc} />
      ) : (
        <>
          <Body muted>{t.live.intro}</Body>
          <Notice kind="info">{t.live.webOnly}</Notice>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rules: { gap: space.md },
  // The call: 3:4, graphite, their video over a marigold rail (their line), yours in a teal frame (yours).
  // 4:5, the shape photos are kept in (D105).
  stage: { width: "100%", aspectRatio: 4 / 5, backgroundColor: color.sign, overflow: "hidden" },
  tag: { position: "absolute", top: space.md, left: space.md, maxWidth: "65%" },
  timer: { position: "absolute", top: space.md, right: space.md },
  clock: { backgroundColor: color.highlight, borderRadius: radius.plate, paddingHorizontal: space.sm, paddingVertical: space.xs / 2 },
  clockText: { ...type.caption, fontFamily: font.textSemibold, color: color.text },
  remote: { flex: 1 },
  rail: { height: 6, backgroundColor: color.highlight },
  cover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.sign,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xl,
  },
  coverText: { ...type.body, color: color.onSign, textAlign: "center" },
  mine: {
    position: "absolute",
    right: space.md,
    bottom: space.md + 6,
    width: "30%",
    aspectRatio: 3 / 4,
    borderWidth: 3,
    borderColor: color.accent,
    backgroundColor: color.sign,
    overflow: "hidden",
  },
  controls: { gap: space.md },
  cells: { flexDirection: "row", gap: space.md },
  cell: { flex: 1 },
});
