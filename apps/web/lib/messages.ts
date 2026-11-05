/** The console's own words for API error codes (server text is not shown). */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "The email or password is not correct.",
  rate_limited: "Too many attempts. Wait a little and try again.",
  rate_limit_unavailable: "Sign-in is briefly unavailable. Try again shortly.",
  challenge_invalid: "This sign-in has expired. Start again with your password.",
  enrollment_invalid: "That enrolment token isn't valid. Ask another admin for a new one.",
  already_enrolled: "An authenticator is already set up. Enter a code from it.",
  code_invalid: "That code didn't work. Check the time on your phone, or use a recovery code.",
  staff_only: "This needs a staff account.",
  admin_only: "Only an admin can do that.",
  own_case: "You can't handle a report about yourself.",
  own_account: "Ask another admin to do this for your account.",
  already_resolved: "This report has already been resolved.",
  nothing_to_remove: "There's nothing to remove for this report.",
  not_restricted: "That account isn't suspended or banned.",
  not_found: "That doesn't exist, or you can't see it.",
  network_error: "The API can't be reached. Try again shortly.",
};

export function messageFor(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Try again.";
}
