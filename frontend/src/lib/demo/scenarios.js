// Scripted Demo-mode turns. States mirror Hermes turn/tool lifecycle; timings are simulated.
import { SLACK_SUMMARY } from "./sampleData";

const person = (name, initials, color, role) => ({ name, initials, color, role });

const draft = (id, channel, title, recipients, body, extra = {}) => ({
  id, channel, title, recipients, body, versions: [body], version: 1,
  status: "draft", approvedVersion: null, error: null, attachments: [], ...extra,
});

export const ATTENTION_DRAFTS = [
  draft("dr-api", "slack", "Message the API team", ["#api-team"],
    "Hi team,\nThe payments API for the new checkout flow isn't ready yet, so QA is blocked. Could you share an ETA, or tell us what's needed to unblock testing?"),
  draft("dr-qa", "email", "Book a QA sync", ["qa-leads@company.test"],
    "Hi all,\nCan we hold a 20-minute sync tomorrow to agree on a test plan while the payments API is pending?"),
  draft("dr-bug", "github", "File a bug", ["acme/web · new issue"],
    "Staging build failing on deploy\n\nThe staging pipeline failed twice today at the migrate step. Logs attached in #eng. Needs triage before Thursday's release."),
  draft("dr-release", "slack", "Ask in #release", ["#release"],
    "Quick check: should we hold today's staging deploy until the migrate step is fixed?"),
  draft("dr-sprint", "slack", "Clarify sprint goals", ["#product"],
    "Hi all,\nFor Sprint 14 let's focus on checkout v2 first, then the onboarding copy. I'll post the full priority list by noon."),
  draft("dr-elena", "email", "Reply", ["elena.ortiz@company.test"],
    "Hi Elena,\nThanks for raising this. I'll confirm Sprint 14 priorities by noon today.", { failOnce: true }),
  draft("dr-jonah", "email", "Reply", ["jonah.kim@company.test"],
    "Hi Jonah,\nI'll review the onboarding copy doc this afternoon and leave comments inline."),
  draft("dr-ana", "slack", "Say thanks", ["@ana.silva"], "These photos are great, thanks for sharing!"),
];

export const ATTENTION_ROWS = [
  { id: "r1", priority: "high", source: "slack", person: person("Priya Raman", "PR", "#2563EB", "Payments"),
    summary: "The payments API for checkout isn't ready, so QA can't start testing.",
    actions: [{ label: "Message the API team", draftId: "dr-api", primary: true }, { label: "Book a QA sync", draftId: "dr-qa" }] },
  { id: "r2", priority: "high", source: "github", person: person("Marcus Lee", "ML", "#0EA5E9", "Platform"),
    summary: "Staging build failed twice today; unclear whether to file a bug or wait.",
    actions: [{ label: "File a bug", draftId: "dr-bug", primary: true }, { label: "Ask in #release", draftId: "dr-release" }] },
  { id: "r3", priority: "medium", source: "slack", person: person("Elena Ortiz", "EO", "#7C3AED", "Product"),
    summary: "Sprint 14 goals are unclear and the team is asking what to focus on next.",
    actions: [{ label: "Clarify sprint goals", draftId: "dr-sprint", primary: true }, { label: "Reply", draftId: "dr-elena" }] },
  { id: "r4", priority: "medium", source: "email", person: person("Jonah Kim", "JK", "#059669", "Content"),
    summary: "Waiting on your review of the onboarding copy doc.",
    actions: [{ label: "Reply", draftId: "dr-jonah", primary: true }] },
  { id: "r5", priority: "low", source: "slack", person: person("Ana Silva", "AS", "#DB2777", "Ops"),
    summary: "Shared photos from the Q3 offsite.",
    actions: [{ label: "Say thanks", draftId: "dr-ana", primary: true }] },
];

const PATCH_DIFF = `--- a/src/auth/session.py
+++ b/src/auth/session.py
@@ -18,9 +18,11 @@ def is_expired(session):
-    return session.created_at + TTL < datetime.now()
+    now = datetime.now(timezone.utc)
+    return session.created_at + TTL <= now
 
 def refresh(session):
-    session.created_at = datetime.now()
+    session.created_at = datetime.now(timezone.utc)
+    session.refreshed = True
     return session`;

async function attention(ctx) {
  await ctx.task("slack", "Scanning Slack mentions", "3 channels, 14 mentions");
  await ctx.task("email", "Checking inbox", "9 unread, 2 flagged");
  await ctx.task("github", "Checking open pull requests", "4 open, 1 failing check");
  const scoped = (id) => `${ctx.sid}:${id}`;
  ATTENTION_DRAFTS.forEach((d) => ctx.addDraft({ ...d, id: scoped(d.id), baseId: d.id }));
  await ctx.say("Here's what needs your attention, grouped by priority. Pick an action to review its draft before anything is sent.");
  ctx.add({ kind: "attention", rows: ATTENTION_ROWS.map((r) => ({ ...r, actions: r.actions.map((a) => ({ ...a, baseId: a.draftId, draftId: scoped(a.draftId) })) })) });
}

async function slack(ctx) {
  await ctx.task("slack", "Reading #eng, #product, #design", "42 messages across 3 channels");
  await ctx.say("Here's your Slack summary for the last 24 hours.");
  ctx.add({ kind: "integration", summary: SLACK_SUMMARY });
}

async function pdf(ctx) {
  await ctx.task("web_search", "Searching sources on consensus", "6 sources read");
  await ctx.say("I've drafted the study notes. Saving the file needs your approval.");
  const saved = await ctx.approvalTask("write_file", "Saving consensus-notes.pdf", {
    title: "Save study notes as PDF", risk: "low",
    target: "~/Documents/study/consensus-notes.pdf",
    consequences: "Creates one new file. No existing file is overwritten.",
    content: "Study Notes – Distributed Consensus\n1. Why consensus matters\n2. Raft in three ideas\n3. Paxos vs Raft\n4. Review questions",
  });
  if (saved === null) return ctx.say("Okay, I didn't write anything.");
  ctx.add({ kind: "file", fileId: "file-study" });
  await ctx.say("Saved. Open the preview to check the layout.");
}

async function code(ctx) {
  await ctx.task("read_file", "Reading src/auth/session.py", "62 lines");
  await ctx.say("Session expiry compares a naive timestamp with an aware one. Here's a patch — it changes one file, so I need your approval.");
  const applied = await ctx.approvalTask("patch", "Applying patch to src/auth/session.py", {
    title: "Apply patch to src/auth/session.py", risk: "medium", mono: true,
    target: "acme/web · src/auth/session.py",
    consequences: "Modifies 1 file in your working tree. Not committed or pushed.",
    content: PATCH_DIFF,
  });
  if (applied === null) return ctx.say("Understood, the file is unchanged.");
  ctx.add({ kind: "code", title: "src/auth/session.py", diff: applied });
  await ctx.task("terminal", "Running pytest tests/auth", "2 failed, 38 passed", {
    fail: true, output: "FAILED tests/auth/test_refresh.py::test_refresh_flag - KeyError: 'refreshed'\nFAILED tests/auth/test_refresh.py::test_serialize - TypeError: can't compare offset-naive and offset-aware datetimes",
  });
  await ctx.say("The patch is applied but 2 tests still fail: the serializer doesn't know the new `refreshed` field yet. I can update the serializer next.");
}

async function fallback(ctx) {
  await ctx.say("This is Demo mode, so I can only play the sample scenarios: your attention summary, a Slack summary, a study PDF, or a code review. Connect your Hermes server to get real answers.");
}

const ROUTES = [
  [/attention|priorit|inbox|today/i, attention],
  [/slack|summar/i, slack],
  [/pdf|study|notes/i, pdf],
  [/code|patch|auth|review|bug/i, code],
];

export const pickScenario = (text) => (ROUTES.find(([re]) => re.test(text)) || [null, fallback])[1];
