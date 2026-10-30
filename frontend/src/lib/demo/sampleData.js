// SAMPLE DATA ONLY — used in Demo mode. Nothing here comes from a live Hermes agent.
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

export const DEMO_USER = { name: "Sam", initials: "SM" };

export const SUGGESTIONS = [
  { id: "attention", label: "What needs my attention?", icon: "inbox" },
  { id: "slack", label: "Summarise my Slack", icon: "slack" },
  { id: "pdf", label: "Turn my notes into a study PDF", icon: "file" },
  { id: "code", label: "Review the auth patch", icon: "code" },
];

export const FILES = {
  "file-study": {
    id: "file-study",
    name: "consensus-notes.pdf",
    kind: "pdf",
    url: "/demo/study-notes-sample.pdf",
    size: "2 KB",
    path: "~/Documents/study/consensus-notes.pdf",
  },
};

const t = (id, tool, label, detail, extra = {}) => ({
  id, kind: "task", tool, label, status: "completed", detail, ...extra,
});
const u = (id, text) => ({ id, kind: "user", text });
const a = (id, text) => ({ id, kind: "agent", text });

export const HISTORY = [
  {
    id: "s-week", title: "Plan my week", updatedAt: hoursAgo(2),
    items: [
      u("w1", "Plan my week around the launch."),
      t("w2", "calendar", "Reading calendar", "18 events, 3 conflicts on Wednesday"),
      a("w3", "Your week is heavy on Wednesday. I suggest moving the design review to Thursday 10:00 and keeping Friday afternoon free for launch prep."),
    ],
  },
  {
    id: "s-design", title: "Summarise #design feedback", updatedAt: hoursAgo(5),
    items: [
      u("d1", "Summarise the feedback in #design from this week."),
      t("d2", "slack", "Reading #design", "42 messages, 6 threads"),
      a("d3", "Three themes came up: the onboarding illustrations feel too busy, people want a darker empty-state, and the pricing table needs a mobile layout."),
    ],
  },
  {
    id: "s-study", title: "Consensus study notes", updatedAt: hoursAgo(27),
    items: [
      u("st1", "Turn my distributed systems notes into a study PDF."),
      t("st2", "web_search", "Searching sources", "6 sources read"),
      t("st3", "write_file", "Saving consensus-notes.pdf", "Approved by you, 1 file written"),
      { id: "st4", kind: "file", fileId: "file-study" },
      a("st5", "Saved. The PDF has four sections and three review questions at the end."),
    ],
  },
  {
    id: "s-flaky", title: "Fix flaky login test", updatedAt: hoursAgo(31),
    items: [
      u("f1", "The login test fails randomly in CI. Can you look?"),
      t("f2", "terminal", "Running pytest tests/auth -x", "Failed once in 5 runs", { status: "failed", output: "FAILED tests/auth/test_login.py::test_session_expiry - AssertionError: 401 != 200" }),
      a("f3", "The test depends on wall-clock time. Freezing the clock in the fixture should make it deterministic."),
    ],
  },
  {
    id: "s-launch", title: "Draft launch update", updatedAt: hoursAgo(72),
    items: [
      u("l1", "Draft a short launch update for the team."),
      a("l2", "Here's a draft: \"Checkout v2 ships Thursday. QA sign-off is due Wednesday EOD; please flag blockers in #release.\""),
    ],
  },
  {
    id: "s-vector", title: "Compare vector databases", updatedAt: hoursAgo(100),
    items: [
      u("v1", "Compare pgvector and a dedicated vector DB for our scale."),
      t("v2", "web_search", "Searching benchmarks", "9 sources read"),
      a("v3", "At under 10M vectors, pgvector keeps operations simpler. A dedicated store pays off once you need filtering at high QPS."),
    ],
  },
  {
    id: "s-onboard", title: "Onboarding checklist", updatedAt: hoursAgo(260),
    items: [
      u("o1", "Make an onboarding checklist for new engineers."),
      a("o2", "Week one: laptop setup, repo access, first PR. Week two: on-call shadow, architecture walkthrough."),
    ],
  },
];

export const INTEGRATIONS = [
  { id: "slack", name: "Slack", status: "connected", detail: "3 channels watched · 14 new mentions" },
  { id: "email", name: "Email", status: "connected", detail: "9 unread · 2 flagged" },
  { id: "github", name: "GitHub", status: "connected", detail: "4 open PRs · 1 failing check" },
  { id: "telegram", name: "Telegram", status: "not_configured", detail: "Needs a bot token in Hermes" },
];

export const SLACK_SUMMARY = {
  service: "slack",
  title: "Slack · last 24 hours",
  channels: [
    { name: "#eng", count: 23, highlight: "Staging deploy failed twice; Marcus is investigating." },
    { name: "#product", count: 11, highlight: "Sprint 14 goals still open — Elena asked for a decision." },
    { name: "#design", count: 8, highlight: "New empty-state mockups posted for review." },
  ],
};
