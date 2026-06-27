import { useState, useEffect } from "react";
import { Plus, Check, Clock, ChevronRight, Users, Calendar, X, ArrowLeft } from "lucide-react";
import { supabase } from "./supabaseClient";

// ---------- Helpers ----------
function formatNaira(n) {
  return "₦" + Number(n).toLocaleString("en-NG");
}

function addInterval(date, frequency, n = 1) {
  const d = new Date(date);
  if (frequency === "weekly") d.setDate(d.getDate() + 7 * n);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14 * n);
  else d.setMonth(d.getMonth() + n);
  return d;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------- Auth screen ----------
function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter both email and password.");
      return;
    }
    setError("");
    setLoading(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    onAuthed();
  }

  return (
    <div style={styles.page}>
      <GlobalStyles />
      <div style={{ ...styles.empty, marginTop: 60 }}>
        <div style={styles.emptyStamp}>AJO</div>
        <h1 style={{ ...styles.h1, marginBottom: 20 }}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <div style={{ textAlign: "left", width: "100%" }}>
          <Field label="Email">
            <input
              style={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Password">
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        {error && <div style={styles.errorText}>{error}</div>}
        <button style={styles.primaryBtn} onClick={submit} disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
        <button
          style={{ ...styles.deleteLink, color: "#cfcde0" }}
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

// ---------- Main App ----------
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out
  const [circles, setCircles] = useState([]);
  const [activeCircleId, setActiveCircleId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const activeCircle = circles.find((c) => c.id === activeCircleId);

  // ---------- Auth session handling ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setCircles([]);
    setActiveCircleId(null);
  }

  // ---------- Data loading ----------
  async function loadCircles() {
    setLoading(true);
    setErrorMsg("");
    const { data: circlesData, error: circlesError } = await supabase
      .from("circles")
      .select("*")
      .order("id", { ascending: true });

    if (circlesError) {
      console.error("Load circles error:", circlesError);
      setErrorMsg("Couldn't load your circles. Check your connection and try again.");
      setLoading(false);
      return;
    }

    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("*")
      .order("turn_order", { ascending: true });

    if (membersError) {
      console.error("Load members error:", membersError);
      setErrorMsg("Couldn't load member data. Check your connection and try again.");
      setLoading(false);
      return;
    }

    const { data: historyData, error: historyError } = await supabase
      .from("contributions")
      .select("*")
      .order("round_number", { ascending: false });

    if (historyError) {
      console.error("Load history error:", historyError);
    }

    const merged = (circlesData || []).map((c) => ({
      ...c,
      members: (membersData || []).filter((m) => m.circle_id === c.id),
      history: (historyData || []).filter((h) => h.circle_id === c.id),
    }));

    setCircles(merged);
    setLoading(false);
  }

  useEffect(() => {
    if (session) {
      loadCircles();
    }
  }, [session]);

  // ---------- Mutations ----------
  async function createCircle(data) {
    const { error } = await supabase.from("circles").insert({
      name: data.name,
      amount: Number(data.amount),
      frequency: data.frequency,
      start_date: data.startDate,
      current_round: 0,
      owner_id: session.user.id,
    });
    if (error) {
      console.error("Create circle error:", error);
      setErrorMsg(`Couldn't create the circle. Details: ${error.message || JSON.stringify(error)}`);
      return;
    }
    setShowCreate(false);
    await loadCircles();
  }

  async function addMember(circleId, name, phone) {
    const circle = circles.find((c) => c.id === circleId);
    const nextOrder = circle ? circle.members.length : 0;
    const { error } = await supabase.from("members").insert({
      circle_id: circleId,
      name,
      phone,
      turn_order: nextOrder,
      paid_this_round: false,
    });
    if (error) {
      console.error("Add member error:", error);
      setErrorMsg("Couldn't add the member. Please try again.");
      return;
    }
    setShowAddMember(false);
    await loadCircles();
  }

  async function removeMember(memberId) {
    const { error } = await supabase.from("members").delete().eq("id", memberId);
    if (error) {
      console.error("Remove member error:", error);
      setErrorMsg("Couldn't remove that member. Please try again.");
      return;
    }
    await loadCircles();
  }

  async function togglePaid(member) {
    const { error } = await supabase
      .from("members")
      .update({ paid_this_round: !member.paid_this_round })
      .eq("id", member.id);
    if (error) {
      console.error("Toggle paid error:", error);
      setErrorMsg("Couldn't update that. Please try again.");
      return;
    }
    await loadCircles();
  }

  async function advanceRound(circle) {
    const total = circle.members.length;
    if (total === 0) return;
    const recipientIdx = circle.current_round % total;
    const recipient = circle.members[recipientIdx];
    const paidCount = circle.members.filter((m) => m.paid_this_round).length;

    const { error: historyError } = await supabase.from("contributions").insert({
      circle_id: circle.id,
      round_number: circle.current_round + 1,
      recipient_name: recipient?.name || "—",
      paid_count: paidCount,
      total_members: total,
      payout_date: new Date().toISOString(),
    });
    if (historyError) {
      console.error("Advance round (history) error:", historyError);
      setErrorMsg("Couldn't record this round. Please try again.");
      return;
    }

    const { error: circleError } = await supabase
      .from("circles")
      .update({ current_round: circle.current_round + 1 })
      .eq("id", circle.id);
    if (circleError) {
      console.error("Advance round (circle) error:", circleError);
      setErrorMsg("Round was logged, but updating the circle failed. Please refresh.");
      return;
    }

    // Reset everyone's paid status for the new round
    for (const m of circle.members) {
      await supabase.from("members").update({ paid_this_round: false }).eq("id", m.id);
    }

    await loadCircles();
  }

  async function deleteCircle(circleId) {
    await supabase.from("contributions").delete().eq("circle_id", circleId);
    await supabase.from("members").delete().eq("circle_id", circleId);
    const { error } = await supabase.from("circles").delete().eq("id", circleId);
    if (error) {
      console.error("Delete circle error:", error);
      setErrorMsg("Couldn't delete the circle. Please try again.");
      return;
    }
    setActiveCircleId(null);
    await loadCircles();
  }

  // ---------- Render ----------
  if (session === undefined) {
    return (
      <div style={styles.page}>
        <GlobalStyles />
        <div style={styles.loadingWrap}>Checking your session…</div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onAuthed={() => {}} />;
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <GlobalStyles />
        <div style={styles.loadingWrap}>Loading your circles…</div>
      </div>
    );
  }

  if (activeCircle) {
    return (
      <CircleDetail
        circle={activeCircle}
        onBack={() => setActiveCircleId(null)}
        onAddMember={() => setShowAddMember(true)}
        onTogglePaid={togglePaid}
        onRemoveMember={removeMember}
        onAdvanceRound={() => advanceRound(activeCircle)}
        onDeleteCircle={() => deleteCircle(activeCircle.id)}
        showAddMember={showAddMember}
        setShowAddMember={setShowAddMember}
        onSubmitMember={(name, phone) => addMember(activeCircle.id, name, phone)}
        errorMsg={errorMsg}
      />
    );
  }

  return (
    <div style={styles.page}>
      <GlobalStyles />
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>YOUR CIRCLES</div>
          <h1 style={styles.h1}>Ajo Ledger</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.newBtn} onClick={() => setShowCreate(true)}>
            <Plus size={18} strokeWidth={2.5} />
            New circle
          </button>
          <button style={{ ...styles.secondaryBtn, flex: "none", width: "auto" }} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {errorMsg && <div style={styles.saveWarning}>{errorMsg}</div>}

      {circles.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div style={styles.groupGrid}>
          {circles.map((c) => (
            <CircleCard key={c.id} circle={c} onOpen={() => setActiveCircleId(c.id)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCircleModal onClose={() => setShowCreate(false)} onCreate={createCircle} />
      )}
    </div>
  );
}

// ---------- Empty state ----------
function EmptyState({ onCreate }) {
  return (
    <div style={styles.empty}>
      <div style={styles.emptyStamp}>AJO</div>
      <p style={styles.emptyText}>
        No circles yet. Start one to track contributions, turns, and payout dates —
        no more chasing people in the group chat.
      </p>
      <button style={styles.newBtn} onClick={onCreate}>
        <Plus size={18} strokeWidth={2.5} />
        Start your first circle
      </button>
    </div>
  );
}

// ---------- Circle card on dashboard ----------
function CircleCard({ circle, onOpen }) {
  const paidCount = circle.members.filter((m) => m.paid_this_round).length;
  const total = circle.members.length;
  const recipient = total > 0 ? circle.members[circle.current_round % total] : null;
  const nextDate = addInterval(circle.start_date, circle.frequency, circle.current_round);

  return (
    <button style={styles.groupCard} onClick={onOpen}>
      <div style={styles.cardTopRow}>
        <span style={styles.cardName}>{circle.name}</span>
        <ChevronRight size={18} color="#8b8aa8" />
      </div>
      <div style={styles.cardAmount}>{formatNaira(circle.amount)}</div>
      <div style={styles.cardMeta}>
        <Users size={13} />
        <span>{total} member{total !== 1 ? "s" : ""}</span>
        <span style={styles.dot} />
        <span style={{ textTransform: "capitalize" }}>{circle.frequency}</span>
      </div>
      {total > 0 && (
        <div style={styles.cardFooter}>
          <div style={styles.cardFooterRow}>
            <Calendar size={13} />
            <span>Next payout {formatDate(nextDate)} → {recipient?.name}</span>
          </div>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${total ? (paidCount / total) * 100 : 0}%`,
              }}
            />
          </div>
          <div style={styles.progressLabel}>
            {paidCount}/{total} paid this round
          </div>
        </div>
      )}
    </button>
  );
}

// ---------- Create circle modal ----------
function CreateCircleModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return setError("Give your circle a name.");
    if (!amount || Number(amount) <= 0) return setError("Enter a contribution amount.");
    setError("");
    setSubmitting(true);
    await onCreate({ name: name.trim(), amount, frequency, startDate });
    setSubmitting(false);
  }

  return (
    <Modal onClose={onClose} title="Start a new circle">
      <Field label="Circle name">
        <input
          style={styles.input}
          placeholder="e.g. Market Women Ajo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Contribution per round">
        <div style={styles.amountWrap}>
          <span style={styles.nairaPrefix}>₦</span>
          <input
            style={{ ...styles.input, paddingLeft: 28 }}
            placeholder="10,000"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </Field>
      <Field label="How often">
        <div style={styles.segmentRow}>
          {["weekly", "biweekly", "monthly"].map((f) => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              style={{
                ...styles.segment,
                ...(frequency === f ? styles.segmentActive : {}),
              }}
            >
              {f === "biweekly" ? "Every 2 weeks" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </Field>
      <Field label="First round starts">
        <input
          style={styles.input}
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </Field>
      {error && <div style={styles.errorText}>{error}</div>}
      <button style={styles.primaryBtn} onClick={submit} disabled={submitting}>
        {submitting ? "Creating…" : "Create circle"}
      </button>
    </Modal>
  );
}

// ---------- Add member modal ----------
function AddMemberModal({ onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return setError("Enter a name.");
    setError("");
    setSubmitting(true);
    await onSubmit(name.trim(), phone.trim());
    setSubmitting(false);
  }

  return (
    <Modal onClose={onClose} title="Add a member">
      <Field label="Full name">
        <input
          style={styles.input}
          placeholder="e.g. Amaka Obi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Phone number (optional)">
        <input
          style={styles.input}
          placeholder="080..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      {error && <div style={styles.errorText}>{error}</div>}
      <button style={styles.primaryBtn} onClick={submit} disabled={submitting}>
        {submitting ? "Adding…" : "Add to circle"}
      </button>
    </Modal>
  );
}

// ---------- Circle detail screen ----------
function CircleDetail({
  circle,
  onBack,
  onAddMember,
  onTogglePaid,
  onRemoveMember,
  onAdvanceRound,
  onDeleteCircle,
  showAddMember,
  setShowAddMember,
  onSubmitMember,
  errorMsg,
}) {
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const total = circle.members.length;
  const paidCount = circle.members.filter((m) => m.paid_this_round).length;
  const recipientIdx = total > 0 ? circle.current_round % total : -1;
  const recipient = total > 0 ? circle.members[recipientIdx] : null;
  const nextDate = addInterval(circle.start_date, circle.frequency, circle.current_round);
  const allPaid = total > 0 && paidCount === total;

  return (
    <div style={styles.page}>
      <GlobalStyles />
      <button style={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={16} />
        All circles
      </button>

      {errorMsg && <div style={styles.saveWarning}>{errorMsg}</div>}

      <div style={styles.detailHeaderRow}>
        <div>
          <div style={styles.eyebrow}>ROUND {circle.current_round + 1}</div>
          <h1 style={styles.h1}>{circle.name}</h1>
          <div style={styles.detailSub}>
            {formatNaira(circle.amount)} · <span style={{ textTransform: "capitalize" }}>{circle.frequency}</span>
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyStamp}>AJO</div>
          <p style={styles.emptyText}>
            No members yet. Add everyone in the circle to set the rotation order —
            the order you add them is the order they get paid out.
          </p>
          <button style={styles.newBtn} onClick={onAddMember}>
            <Plus size={18} strokeWidth={2.5} />
            Add first member
          </button>
        </div>
      ) : (
        <>
          <div style={styles.payoutBanner}>
            <div>
              <div style={styles.payoutLabel}>This round's payout goes to</div>
              <div style={styles.payoutName}>{recipient?.name}</div>
              <div style={styles.payoutDate}>
                <Calendar size={13} /> {formatDate(nextDate)}
              </div>
            </div>
            <div style={styles.payoutAmountWrap}>
              <div style={styles.payoutAmount}>{formatNaira(circle.amount * total)}</div>
              <div style={styles.payoutAmountLabel}>total pot</div>
            </div>
          </div>

          <div style={styles.sectionRow}>
            <h2 style={styles.h2}>Rotation & contributions</h2>
            <button style={styles.smallAddBtn} onClick={onAddMember}>
              <Plus size={14} />
              Add member
            </button>
          </div>

          <div style={styles.memberList}>
            {circle.members.map((m, idx) => (
              <MemberRow
                key={m.id}
                member={m}
                isRecipient={idx === recipientIdx}
                turnNumber={idx + 1}
                onTogglePaid={() => onTogglePaid(m)}
                onRemove={() => onRemoveMember(m.id)}
              />
            ))}
          </div>

          <div style={styles.roundFooter}>
            <div style={styles.progressLabel}>
              {paidCount}/{total} paid this round
            </div>
            <button
              style={{
                ...styles.primaryBtn,
                opacity: allPaid ? 1 : 0.5,
                cursor: allPaid ? "pointer" : "not-allowed",
              }}
              disabled={!allPaid}
              onClick={() => setConfirmAdvance(true)}
            >
              Mark payout sent & start next round
            </button>
          </div>

          {circle.history.length > 0 && (
            <>
              <h2 style={styles.h2}>Past rounds</h2>
              <div style={styles.historyList}>
                {circle.history.map((h) => (
                  <div key={h.id} style={styles.historyRow}>
                    <div style={styles.historyRoundBadge}>R{h.round_number}</div>
                    <div style={styles.historyInfo}>
                      <div style={styles.historyName}>{h.recipient_name}</div>
                      <div style={styles.historyDate}>{formatDate(h.payout_date)}</div>
                    </div>
                    <div style={styles.historyPaid}>
                      {h.paid_count}/{h.total_members} paid
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <button style={styles.deleteLink} onClick={() => setConfirmDelete(true)}>
        Delete this circle
      </button>

      {showAddMember && (
        <AddMemberModal onClose={() => setShowAddMember(false)} onSubmit={onSubmitMember} />
      )}

      {confirmAdvance && (
        <Modal onClose={() => setConfirmAdvance(false)} title="Start next round?">
          <p style={styles.confirmText}>
            This records {recipient?.name} as paid out for round {circle.current_round + 1} and
            resets contribution checkmarks for everyone. This can't be undone.
          </p>
          <div style={styles.confirmRow}>
            <button style={styles.secondaryBtn} onClick={() => setConfirmAdvance(false)}>
              Cancel
            </button>
            <button
              style={styles.primaryBtn}
              onClick={() => {
                onAdvanceRound();
                setConfirmAdvance(false);
              }}
            >
              Confirm & advance
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)} title="Delete this circle?">
          <p style={styles.confirmText}>
            This removes {circle.name} and its full history. This can't be undone.
          </p>
          <div style={styles.confirmRow}>
            <button style={styles.secondaryBtn} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button style={styles.dangerBtn} onClick={onDeleteCircle}>
              Delete circle
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Member row ----------
function MemberRow({ member, isRecipient, turnNumber, onTogglePaid, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <div style={{ ...styles.memberRow, ...(isRecipient ? styles.memberRowActive : {}) }}>
      <div style={styles.turnBadge}>{turnNumber}</div>
      <div style={styles.memberInfo}>
        <div style={styles.memberName}>
          {member.name}
          {isRecipient && <span style={styles.recipientTag}>collecting</span>}
        </div>
        {member.phone && <div style={styles.memberPhone}>{member.phone}</div>}
      </div>
      <button
        style={{
          ...styles.paidToggle,
          ...(member.paid_this_round ? styles.paidToggleActive : {}),
        }}
        onClick={onTogglePaid}
      >
        {member.paid_this_round ? <Check size={14} strokeWidth={3} /> : <Clock size={14} />}
        {member.paid_this_round ? "Paid" : "Pending"}
      </button>
      {!confirmRemove ? (
        <button style={styles.removeX} onClick={() => setConfirmRemove(true)} aria-label="Remove member">
          <X size={14} />
        </button>
      ) : (
        <div style={styles.removeConfirm}>
          <button style={styles.removeConfirmYes} onClick={onRemove}>Remove</button>
          <button style={styles.removeConfirmNo} onClick={() => setConfirmRemove(false)}>Keep</button>
        </div>
      )}
    </div>
  );
}

// ---------- Shared bits ----------
function Modal({ title, children, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{title}</h3>
          <button style={styles.modalClose} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; }
      input:focus, button:focus-visible {
        outline: 2px solid #D4A24C;
        outline-offset: 2px;
      }
      button { font-family: inherit; }
      @media (prefers-reduced-motion: reduce) {
        * { transition: none !important; animation: none !important; }
      }
    `}</style>
  );
}

// ---------- Styles ----------
const FONT_DISPLAY = "'Fraunces', Georgia, serif";
const FONT_BODY = "'Inter', -apple-system, sans-serif";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#1B1A2E",
    color: "#F0E6D6",
    fontFamily: FONT_BODY,
    padding: "28px 20px 60px",
    maxWidth: 640,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 28,
    gap: 12,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: "0.12em",
    color: "#D4A24C",
    fontWeight: 600,
    marginBottom: 6,
  },
  h1: {
    fontFamily: FONT_DISPLAY,
    fontSize: 28,
    fontWeight: 600,
    margin: 0,
    color: "#F0E6D6",
    lineHeight: 1.1,
  },
  h2: {
    fontFamily: FONT_DISPLAY,
    fontSize: 17,
    fontWeight: 600,
    margin: "28px 0 12px",
    color: "#F0E6D6",
  },
  newBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#D4A24C",
    color: "#1B1A2E",
    border: "none",
    borderRadius: 10,
    padding: "11px 16px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  groupGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  groupCard: {
    background: "#23223C",
    border: "1px solid #34334F",
    borderRadius: 14,
    padding: "18px 18px 16px",
    textAlign: "left",
    cursor: "pointer",
    color: "#F0E6D6",
    fontFamily: "inherit",
    transition: "transform 0.15s ease, border-color 0.15s ease",
    width: "100%",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    fontWeight: 600,
  },
  cardAmount: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    color: "#D4A24C",
    marginTop: 4,
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "#9b9ab5",
    marginTop: 8,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: "#9b9ab5",
  },
  cardFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px dashed #34334F",
  },
  cardFooterRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "#cfcde0",
    marginBottom: 8,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    background: "#34334F",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#7A9B7E",
    borderRadius: 3,
    transition: "width 0.2s ease",
  },
  progressLabel: {
    fontSize: 11.5,
    color: "#9b9ab5",
    marginTop: 6,
  },
  empty: {
    textAlign: "center",
    padding: "48px 20px",
    border: "1px dashed #34334F",
    borderRadius: 16,
  },
  emptyStamp: {
    display: "inline-block",
    fontFamily: FONT_DISPLAY,
    fontSize: 13,
    letterSpacing: "0.15em",
    color: "#1B1A2E",
    background: "#D4A24C",
    padding: "6px 14px",
    borderRadius: 4,
    transform: "rotate(-3deg)",
    marginBottom: 18,
    fontWeight: 700,
  },
  emptyText: {
    color: "#b8b6cc",
    fontSize: 14.5,
    lineHeight: 1.6,
    maxWidth: 380,
    margin: "0 auto 24px",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    color: "#9b9ab5",
    fontSize: 13.5,
    cursor: "pointer",
    padding: 0,
    marginBottom: 20,
    fontFamily: "inherit",
  },
  detailHeaderRow: {
    marginBottom: 24,
  },
  detailSub: {
    fontSize: 14,
    color: "#b8b6cc",
    marginTop: 6,
  },
  payoutBanner: {
    background: "linear-gradient(135deg, #2C2A4A, #23223C)",
    border: "1px solid #D4A24C44",
    borderRadius: 16,
    padding: "20px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 8,
  },
  payoutLabel: {
    fontSize: 11.5,
    color: "#9b9ab5",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  payoutName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    color: "#F0E6D6",
    margin: "4px 0 8px",
  },
  payoutDate: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#cfcde0",
  },
  payoutAmountWrap: {
    textAlign: "right",
  },
  payoutAmount: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    color: "#D4A24C",
  },
  payoutAmountLabel: {
    fontSize: 11,
    color: "#9b9ab5",
    marginTop: 2,
  },
  sectionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 28,
  },
  smallAddBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "1px solid #34334F",
    color: "#D4A24C",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  memberList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 12,
  },
  memberRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#23223C",
    border: "1px solid #34334F",
    borderRadius: 12,
    padding: "12px 14px",
  },
  memberRowActive: {
    borderColor: "#D4A24C88",
    background: "#2A2748",
  },
  turnBadge: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#34334F",
    color: "#cfcde0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: 14.5,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  recipientTag: {
    fontSize: 10,
    background: "#D4A24C",
    color: "#1B1A2E",
    padding: "2px 7px",
    borderRadius: 5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  memberPhone: {
    fontSize: 12,
    color: "#9b9ab5",
    marginTop: 2,
  },
  paidToggle: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: "1px solid #34334F",
    background: "transparent",
    color: "#9b9ab5",
    borderRadius: 8,
    padding: "7px 11px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  paidToggleActive: {
    background: "#7A9B7E",
    color: "#16271a",
    border: "1px solid #7A9B7E",
  },
  removeX: {
    background: "none",
    border: "none",
    color: "#6f6e88",
    cursor: "pointer",
    padding: 4,
    flexShrink: 0,
  },
  removeConfirm: {
    display: "flex",
    gap: 4,
    flexShrink: 0,
  },
  removeConfirmYes: {
    fontSize: 11,
    background: "#C9684D",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
    fontWeight: 600,
  },
  removeConfirmNo: {
    fontSize: 11,
    background: "none",
    color: "#9b9ab5",
    border: "1px solid #34334F",
    borderRadius: 6,
    padding: "5px 8px",
    cursor: "pointer",
  },
  roundFooter: {
    marginTop: 18,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "flex-start",
  },
  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  historyRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    background: "#23223C",
    border: "1px solid #2c2b47",
    borderRadius: 10,
  },
  historyRoundBadge: {
    fontFamily: FONT_DISPLAY,
    fontSize: 12,
    color: "#D4A24C",
    border: "1px solid #D4A24C55",
    borderRadius: 6,
    padding: "3px 7px",
    flexShrink: 0,
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    fontSize: 13.5,
    fontWeight: 600,
  },
  historyDate: {
    fontSize: 11.5,
    color: "#9b9ab5",
    marginTop: 1,
  },
  historyPaid: {
    fontSize: 11.5,
    color: "#9b9ab5",
    flexShrink: 0,
  },
  deleteLink: {
    display: "block",
    margin: "40px auto 0",
    background: "none",
    border: "none",
    color: "#8b7565",
    fontSize: 12.5,
    cursor: "pointer",
    textDecoration: "underline",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(10,9,20,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50,
  },
  modal: {
    background: "#23223C",
    border: "1px solid #34334F",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    maxHeight: "90vh",
    overflowY: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  modalTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 18,
    margin: 0,
    color: "#F0E6D6",
  },
  modalClose: {
    background: "none",
    border: "none",
    color: "#9b9ab5",
    cursor: "pointer",
    padding: 4,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    display: "block",
    fontSize: 12.5,
    color: "#9b9ab5",
    marginBottom: 6,
    fontWeight: 600,
  },
  input: {
    width: "100%",
    background: "#1B1A2E",
    border: "1px solid #34334F",
    borderRadius: 9,
    padding: "11px 12px",
    color: "#F0E6D6",
    fontSize: 14.5,
    fontFamily: "inherit",
  },
  amountWrap: {
    position: "relative",
  },
  nairaPrefix: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#9b9ab5",
    fontSize: 14.5,
  },
  segmentRow: {
    display: "flex",
    gap: 6,
  },
  segment: {
    flex: 1,
    background: "#1B1A2E",
    border: "1px solid #34334F",
    borderRadius: 8,
    padding: "9px 6px",
    color: "#9b9ab5",
    fontSize: 12.5,
    cursor: "pointer",
    fontWeight: 600,
  },
  segmentActive: {
    background: "#D4A24C",
    color: "#1B1A2E",
    borderColor: "#D4A24C",
  },
  errorText: {
    color: "#C9684D",
    fontSize: 12.5,
    marginBottom: 12,
  },
  confirmText: {
    fontSize: 13.5,
    color: "#cfcde0",
    lineHeight: 1.6,
    marginBottom: 20,
  },
  confirmRow: {
    display: "flex",
    gap: 10,
  },
  primaryBtn: {
    background: "#D4A24C",
    color: "#1B1A2E",
    border: "none",
    borderRadius: 10,
    padding: "12px 18px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    width: "100%",
  },
  secondaryBtn: {
    background: "none",
    border: "1px solid #34334F",
    color: "#cfcde0",
    borderRadius: 10,
    padding: "12px 18px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    flex: 1,
  },
  dangerBtn: {
    background: "#C9684D",
    border: "none",
    color: "#fff",
    borderRadius: 10,
    padding: "12px 18px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    flex: 1,
  },
  loadingWrap: {
    textAlign: "center",
    padding: "80px 20px",
    color: "#9b9ab5",
    fontSize: 14,
  },
  saveWarning: {
    background: "#C9684D22",
    border: "1px solid #C9684D55",
    color: "#e3a896",
    fontSize: 12.5,
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 18,
    lineHeight: 1.5,
  },
};
