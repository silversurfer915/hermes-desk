import { useCallback, useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import { api, useLive } from "@/state/live";

const botName = (bot) => bot.display_name || bot.name || "Hermes bot";
const entryText = (entry) => entry?.text || entry?.content || entry?.message || entry?.payload?.text || "";

export const BotPanel = () => {
  const { rpc, liveStatus } = useLive();
  const [state, setState] = useState({ loading: true, profiles: [], routines: [], capabilities: null, rooms: [], profile: "default", error: null });
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [log, setLog] = useState([]);
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canSend = !!state.capabilities?.methods?.includes("groups.send");

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await api("/bots");
      let capabilities = null;
      let rooms = [];
      if (liveStatus === "live") {
        const profile = data.active?.current || data.active?.active || "default";
        capabilities = await rpc("groups.capabilities", { profile });
        if (capabilities.driver && capabilities.methods?.includes("groups.list")) {
          const listed = await rpc("groups.list", { profile });
          rooms = listed.rooms || listed.groups || [];
        }
      }
      setState({ loading: false, profiles: data.profiles || [], routines: data.routines || [], capabilities, rooms, profile: data.active?.current || data.active?.active || "default", error: null });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, capabilities: null, error: error.message }));
    }
  }, [liveStatus, rpc]);
  useEffect(() => { load(); }, [load]);

  const openRoom = async (room) => {
    setSelectedRoom(room);
    setBusy(true);
    try {
      const result = await rpc("groups.log", { room_id: room.room_id || room.id, limit: 100, profile: state.profile });
      setLog(result.entries || result.events || result.log || []);
    } catch (error) { setState((current) => ({ ...current, error: error.message })); } finally { setBusy(false); }
  };

  const createRoom = async (event) => {
    event.preventDefault();
    if (!roomName.trim() || members.length < 2) return;
    setBusy(true);
    try {
      await rpc("groups.create", {
        room_id: crypto.randomUUID(),
        name: roomName.trim(),
        members: members.map((profile) => ({ member_id: `member-${profile}`, profile, handle: profile })),
        profile: state.profile,
      });
      setCreating(false);
      setRoomName("");
      setMembers([]);
      await load();
    } catch (error) { setState((current) => ({ ...current, error: error.message })); } finally { setBusy(false); }
  };

  const send = async (event) => {
    event.preventDefault();
    if (!message.trim() || !selectedRoom || !canSend) return;
    setBusy(true);
    try {
      await rpc("groups.send", {
        room_id: selectedRoom.room_id || selectedRoom.id,
        event_id: crypto.randomUUID(),
        payload: { thread_id: crypto.randomUUID(), text: message.trim() },
        profile: state.profile,
      });
      setMessage("");
      await openRoom(selectedRoom);
    } catch (error) { setState((current) => ({ ...current, error: error.message })); } finally { setBusy(false); }
  };

  if (state.loading) return <p className="py-8 text-center text-sm text-slate-500">Loading your Hermes bot roster…</p>;
  const groupsSupported = !!state.capabilities?.driver;
  const seatable = state.capabilities?.seatable_profiles || state.profiles.map((profile) => profile.name);
  return (
    <div data-testid="bot-panel" className="scroll-soft flex-1 space-y-5 overflow-y-auto pb-2">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-heading text-[15px] font-medium text-slate-900">Profiles as bots</h3>
          <span className="text-[11px] text-slate-500">{state.profiles.length} on Hermes</span>
        </div>
        <div className="space-y-2">
          {state.profiles.map((bot) => (
            <div key={bot.name} className="glass-row flex items-center gap-3 rounded-2xl p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-heading text-[13px] font-semibold text-blue-800">{botName(bot).slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-slate-900">{botName(bot)}</p><p className="truncate text-[11px] text-slate-500">{bot.description || `@${bot.name}`}</p></div>
              <span className="text-[11px] text-slate-500">{state.routines.filter((job) => (job.profile || "default") === bot.name).length} routines</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-heading text-[15px] font-medium text-slate-900">Group rooms</h3>
          {groupsSupported && state.capabilities.methods?.includes("groups.create") && <button onClick={() => setCreating((value) => !value)} className="focus-ring glass-chip flex min-h-11 items-center gap-1 rounded-xl px-3 text-[12px] font-medium"><Plus size={14} /> New room</button>}
        </div>
        {!groupsSupported ? (
          <p className="glass-row rounded-2xl p-4 text-[12px] leading-relaxed text-slate-600">{liveStatus !== "live" ? "Return to the visible live connection to check group-room support." : state.error || "This Hermes gateway did not advertise its hosted group driver. No group controls are enabled."}</p>
        ) : (
          <div className="space-y-2">
            {state.rooms.map((room) => (
              <button key={room.room_id || room.id} onClick={() => openRoom(room)} className={`focus-ring block min-h-11 w-full rounded-2xl p-3 text-left ${selectedRoom?.room_id === room.room_id ? "bg-white/90" : "glass-row"}`}>
                <p className="text-[13px] font-medium text-slate-900">{room.name || "Hermes group"}</p>
                <p className="text-[11px] text-slate-500">{(room.members || []).map((member) => member.handle || member.profile).join(", ")}</p>
              </button>
            ))}
            {!state.rooms.length && <p className="text-[12px] text-slate-500">No hosted group rooms yet.</p>}
            {!canSend && <p data-testid="group-send-unsupported" className="glass-row rounded-2xl p-3 text-[12px] leading-relaxed text-slate-600">Sending messages to group rooms is not supported by this Hermes server version. Rooms here are view-only.</p>}
          </div>
        )}
      </section>

      {creating && groupsSupported && (
        <form onSubmit={createRoom} className="glass-row space-y-3 rounded-2xl p-4">
          <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Room name" className="glass-inset focus-ring min-h-11 w-full rounded-xl px-3 text-[13px] outline-none" />
          <div className="space-y-1">
            {seatable.map((name) => <label key={name} className="flex min-h-11 items-center gap-2 text-[13px]"><input type="checkbox" checked={members.includes(name)} onChange={(event) => setMembers((current) => event.target.checked ? [...current, name] : current.filter((item) => item !== name))} />{name}</label>)}
          </div>
          <button disabled={busy || members.length < 2 || !roomName.trim()} className="focus-ring min-h-11 w-full rounded-xl bg-blue-600 text-[13px] font-medium text-white disabled:opacity-40">Create with Hermes</button>
        </form>
      )}

      {selectedRoom && groupsSupported && (
        <section className="glass-row rounded-2xl p-4">
          <h3 className="font-medium text-slate-900">{selectedRoom.name}</h3>
          <div className="my-3 max-h-64 space-y-2 overflow-y-auto">
            {log.map((entry, index) => <div key={entry.id || entry.event_id || entry.seq || index} className="rounded-xl bg-white/60 p-2 text-[12px]"><span className="mr-2 font-medium">{entry.actor?.handle || entry.actor?.id || entry.profile || entry.role || "Hermes"}</span><span className="whitespace-pre-wrap">{entryText(entry) || entry.kind}</span></div>)}
            {!log.length && <p className="text-[12px] text-slate-500">{busy ? "Loading room…" : "No room messages yet."}</p>}
          </div>
          {canSend && (
            <form onSubmit={send} className="flex gap-2">
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message this Hermes room" className="glass-inset focus-ring min-h-11 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none" />
              <button disabled={busy || !message.trim()} aria-label="Send to group" className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40"><Send size={15} /></button>
            </form>
          )}
        </section>
      )}
      {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{state.error}</p>}
    </div>
  );
};
