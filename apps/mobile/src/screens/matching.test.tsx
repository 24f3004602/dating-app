import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { t } from "@/i18n/en";
import { color } from "@/theme/tokens";
import { DecisionBar, LikesScreen, MatchesScreen } from "@/screens/matching";
import { fakeApi, problem } from "@/test/fakeApi";
import { renderWithApp } from "@/test/render";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
beforeEach(() => jest.clearAllMocks());

const decided = (kind: string, match: unknown = null, left = 9) => ({
  status: 201,
  body: { target_id: "u2", kind, decided_at: "2026-11-04T09:00:00Z", match, likes_left_today: left },
});
const brief = { user_id: "u2", display_name: "Aarav", age: 29, photo: null };

test("a like sends the note and reports the likes left", async () => {
  const { api, calls } = fakeApi({ "POST /v1/interactions": () => decided("like") });
  await renderWithApp(<DecisionBar targetId="u2" />, api);
  await fireEvent.changeText(screen.getByLabelText(t.decide.note), "  Love that festival answer ");
  await fireEvent.press(screen.getByRole("button", { name: t.decide.like }));
  expect(await screen.findByText("Liked. 9 likes left today.")).toBeTruthy();
  expect(calls[0]?.body).toEqual({ target_id: "u2", kind: "like", comment: "Love that festival answer" });
});

test("a pass carries no note", async () => {
  const { api, calls } = fakeApi({ "POST /v1/interactions": () => decided("pass") });
  await renderWithApp(<DecisionBar targetId="u2" />, api);
  await fireEvent.changeText(screen.getByLabelText(t.decide.note), "ignored");
  await fireEvent.press(screen.getByRole("button", { name: t.decide.pass }));
  expect(await screen.findByText(t.decide.passed)).toBeTruthy();
  expect(calls[0]?.body).toEqual({ target_id: "u2", kind: "pass" });
});

test("a mutual like shows the match and leads to the matches list", async () => {
  const { api } = fakeApi({
    "POST /v1/interactions": () => decided("like", { id: "m1", matched_at: "2026-11-04T09:00:00Z", person: brief }),
  });
  await renderWithApp(<DecisionBar targetId="u2" />, api);
  await fireEvent.press(screen.getByRole("button", { name: t.decide.like }));
  expect(await screen.findByText(t.decide.match)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: t.decide.toMatches }));
  expect(mockRouter.push).toHaveBeenCalledWith("/matches");
});

test.each([
  ["like_limit", t.errors.like_limit],
  ["already_decided", t.errors.already_decided],
])("%s gets the app's own message", async (code, message) => {
  const { api } = fakeApi({ "POST /v1/interactions": () => problem(code === "like_limit" ? 429 : 409, code) });
  await renderWithApp(<DecisionBar targetId="u2" />, api);
  await fireEvent.press(screen.getByRole("button", { name: t.decide.like }));
  expect(await screen.findByText(message)).toBeTruthy();
});

test("likes received show the note and open the person", async () => {
  const person = {
    user_id: "u3", display_name: "Kiara", age: 26, gender: "woman", intent: "long_term", bio: null,
    area: { id: "delhi.saket", city: "Delhi", name: "Saket" }, prompts: [], photos: [],
  };  // prettier-ignore
  const { api } = fakeApi({
    "GET /v1/likes/received": () => ({
      status: 200,
      body: [{ liked_at: "2026-11-04T08:00:00Z", comment: "Hi!", about: { photo_id: null, prompt_key: "festival", prompt_text: "The festival I look forward to all year" }, person }],
    }),
  });
  await renderWithApp(<LikesScreen />, api);
  expect(await screen.findByText("Kiara, 26")).toBeTruthy();
  // The name on a graphite plate, as on Today (stage 20e).
  expect(StyleSheet.flatten(screen.getByText("Kiara, 26").props.style).color).toBe(color.onSign);
  expect(screen.getByText("Their note: Hi!")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: /Kiara, 26/ }));
  expect(mockRouter.push).toHaveBeenCalledWith("/person/u3");
});

test("matches: empty state, then a list", async () => {
  let list: unknown[] = [];
  const { api } = fakeApi({ "GET /v1/matches": () => ({ status: 200, body: list }) });
  await renderWithApp(<MatchesScreen />, api);
  expect(await screen.findByText(t.matches.empty)).toBeTruthy();
  await screen.unmount();
  list = [{ id: "m1", matched_at: "2024-11-04T09:00:00Z", person: brief }];
  await renderWithApp(<MatchesScreen />, api);
  await waitFor(() => expect(screen.getByText("Aarav, 29")).toBeTruthy());
  expect(StyleSheet.flatten(screen.getByText("Aarav, 29").props.style).color).toBe(color.onSign); // the plate
  expect(screen.getByText("Matched 4 Nov 2024")).toBeTruthy(); // a day, with its year because it isn't this year
});

test("matches show the last message, unread and your turn, and open the chat", async () => {
  const item = (id: string, extra: object) => ({
    id, matched_at: "2024-11-04T19:00:00Z", unread: 0, your_turn: false, last_message: null, person: brief, ...extra,
  }); // prettier-ignore
  const { api } = fakeApi({
    "GET /v1/matches": () => ({
      status: 200,
      body: [
        item("m1", { unread: 2, your_turn: true, last_message: { n: 3, from_me: false, preview: "Free on Sunday?", sent_at: "2026-11-05T09:00:00Z" } }),
        item("m2", { last_message: { n: 1, from_me: true, preview: "Hi!", sent_at: "2026-11-05T08:00:00Z" } }),
        item("m3", {}),
      ],
    }),
  });
  await renderWithApp(<MatchesScreen />, api);
  expect(await screen.findByText("Free on Sunday?")).toBeTruthy();
  expect(screen.getByText("2 new")).toBeTruthy(); // badges; the card's name says it all (below)
  expect(screen.getByText(t.matches.yourTurn)).toBeTruthy();
  expect(screen.getByText("You: Hi!")).toBeTruthy();
  expect(screen.getByText("Matched 5 Nov 2024")).toBeTruthy(); // 19:00 UTC is the next day in India
  expect(screen.getByText(/^Waiting for your reply: 1\. /)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Chat with Aarav, 29. 2 new. Your turn" }));
  expect(mockRouter.push).toHaveBeenCalledWith("/chat/m1");
});

test("the your-turn cap gets the app's own message", async () => {
  const { api } = fakeApi({ "POST /v1/interactions": () => problem(409, "your_turn_limit", { waiting: 5 }) });
  await renderWithApp(<DecisionBar targetId="u2" />, api);
  await fireEvent.press(screen.getByRole("button", { name: t.decide.like }));
  expect(await screen.findByText(t.errors.your_turn_limit)).toBeTruthy();
});
