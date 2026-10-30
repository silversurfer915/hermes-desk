import { useWorkspace } from "@/state/workspace";

const shorter = (body) => {
  const [first, ...rest] = body.split("\n");
  const sentence = rest.join(" ").split(/(?<=[.?!])\s/)[0] || "";
  return rest.length ? `${first}\n${sentence}` : body.split(/(?<=[.?!])\s/)[0];
};
const warmer = (body) => `${body.replace(/\s*Thanks!?$/, "")}\nThanks!`;

export function useDraft(id) {
  const { state, dispatch } = useWorkspace();
  const d = state.drafts[id];
  const patch = (p) => dispatch({ type: "DRAFT", id, patch: p });
  const locked = d && (d.status === "sending" || d.status === "sent");

  return {
    d,
    locked,
    edit(body) {
      if (locked) return;
      const versions = [...d.versions];
      versions[d.version - 1] = body;
      patch({ body, versions, status: "draft", approvedVersion: null, error: null, invalidated: d.status === "failed" });
    },
    setRecipients(recipients) { if (!locked) patch({ recipients, status: "draft", approvedVersion: null, error: null }); },
    pickVersion(n) { if (!locked) patch({ version: n, body: d.versions[n - 1], status: "draft", approvedVersion: null }); },
    toggleAttach() {
      if (locked) return;
      const name = "consensus-notes.pdf (sample)";
      patch({ attachments: d.attachments.includes(name) ? [] : [name], approvedVersion: null });
    },
    rewrite(instruction) {
      if (locked || d.rewriting) return;
      patch({ rewriting: true, lastInstruction: instruction || null });
      setTimeout(() => {
        const variant = (d.versions.length % 2 ? shorter : warmer)(d.body);
        let body = variant === d.body ? warmer(d.body) : variant;
        if (body === d.body) body = `${d.body}\nLet me know if that works.`;
        const versions = [...d.versions, body];
        patch({ rewriting: false, versions, version: versions.length, body, status: "draft", approvedVersion: null });
      }, 1100);
    },
    send() {
      if (locked || !d.recipients.length || !d.body.trim()) return;
      patch({ status: "sending", approvedVersion: d.version, invalidated: false, error: null });
      setTimeout(() => {
        if (d.failOnce && !d.failedBefore) patch({ status: "failed", failedBefore: true, error: "Simulated delivery failure (demo). Nothing was sent." });
        else patch({ status: "sent", sentAt: Date.now() });
      }, 1400);
    },
  };
}
