import React, { useState, useEffect } from "react";
import { getTeamUsers, updateUserRole, removeTeamUser, sendInvite, getPendingInvites, revokeInvite } from "../api";
import { Icon, LoadingDots, ConfirmDialog } from "../components/shared";
import { toast } from "../components/Toast";

const TeamManagement = ({ currentUserId }) => {
  const [teamUsers, setTeamUsers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [showRemoveDialog, setShowRemoveDialog] = useState(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState("Editor");
  const [invSending, setInvSending] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);

  useEffect(() => {
    getTeamUsers().then(d => { setTeamUsers(d.users || []); setTeamLoading(false); }).catch(() => { setTeamLoading(false); toast.error("Failed to load team members"); });
    getPendingInvites().then(d => setPendingInvites((d.invites || []).filter(i => !i.accepted))).catch(() => { toast.warning("Could not load pending invites"); });
  }, []);

  const handleSendInvite = async () => {
    if (!invEmail.trim()) return toast.error("Enter an email address");
    setInvSending(true);
    try {
      await sendInvite(invEmail.trim(), invRole);
      toast.success("Invitation sent!");
      setInvEmail(""); setShowInviteForm(false);
      getPendingInvites().then(d => setPendingInvites((d.invites || []).filter(i => !i.accepted))).catch(() => { toast.warning("Could not refresh invites list"); });
    } catch (err) { toast.error(err.message); }
    setInvSending(false);
  };

  const handleRevokeInvite = async (id) => {
    try {
      await revokeInvite(id);
      setPendingInvites(prev => prev.filter(i => i.id !== id));
      toast.success("Invitation revoked");
    } catch (err) { toast.error(err.message); }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      setTeamUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast.success("Role updated");
    } catch (err) { toast.error(err.message); }
  };

  const handleRemove = async (userId) => {
    try {
      await removeTeamUser(userId);
      setTeamUsers(prev => prev.filter(u => u.id !== userId));
      setShowRemoveDialog(null);
      toast.success("User removed");
    } catch (err) { toast.error(err.message); }
  };

  const roleBadge = (role) => {
    const colors = { Admin: "#3B82F6", Editor: "#10B981", Viewer: "#94A3B8" };
    return { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: (colors[role] || "#94A3B8") + "18", color: colors[role] || "#94A3B8" };
  };

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="users" size={20} color="#F59E0B" />
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 16 }}>Team Management</h3>
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>Manage users and their roles</p>
          </div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => setShowInviteForm(p => !p)}>
          <Icon name="mail" size={13} /> Invite Member
        </button>
      </div>

      {showInviteForm && (
        <div style={{ marginBottom: 20, padding: 16, borderRadius: 10, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Send Invitation</div>
          <input type="email" placeholder="Email address" value={invEmail} onChange={e => setInvEmail(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: 13, outline: "none" }} />
          <div style={{ display: "flex", gap: 8 }}>
            {["Editor", "Viewer"].map(r => (
              <div key={r} onClick={() => setInvRole(r)} style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer", textAlign: "center", fontSize: 12, fontWeight: 600,
                border: `2px solid ${invRole === r ? (r === "Editor" ? "#10B981" : "#94A3B8") : "var(--border)"}`,
                background: invRole === r ? (r === "Editor" ? "#10B98112" : "#94A3B812") : "transparent",
                color: invRole === r ? (r === "Editor" ? "#10B981" : "#94A3B8") : "var(--text-dim)",
                transition: "all 0.2s"
              }}>{r}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 12 }} onClick={() => setShowInviteForm(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center", fontSize: 12 }} onClick={handleSendInvite} disabled={invSending}>
              {invSending ? <LoadingDots /> : "Send Invite"}
            </button>
          </div>
        </div>
      )}

      {teamLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><LoadingDots /></div>
      ) : teamUsers.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>No team members found.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {teamUsers.map((member, i) => {
            const isMe = member.id === currentUserId;
            return (
              <div key={member.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0",
                borderBottom: i < teamUsers.length - 1 ? "1px solid var(--border-light)" : "none"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#2563EB,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white", flexShrink: 0 }}>
                    {(member.name || "U")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                      {member.name}
                      {isMe && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(139,92,246,0.15)", color: "#8B5CF6" }}>You</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{member.email}</div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>Joined {new Date(member.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isMe ? (
                    <span style={roleBadge(member.role)}>{member.role}</span>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 4 }}>
                        {["Admin", "Editor", "Viewer"].map(r => (
                          <div key={r} onClick={() => handleRoleChange(member.id, r)} style={{
                            padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600,
                            background: member.role === r ? (r === "Admin" ? "#3B82F618" : r === "Editor" ? "#10B98118" : "#94A3B818") : "transparent",
                            color: member.role === r ? (r === "Admin" ? "#3B82F6" : r === "Editor" ? "#10B981" : "#94A3B8") : "var(--text-dim)",
                            border: `1px solid ${member.role === r ? (r === "Admin" ? "#3B82F640" : r === "Editor" ? "#10B98140" : "#94A3B840") : "var(--border)"}`,
                            transition: "all 0.2s"
                          }}>{r}</div>
                        ))}
                      </div>
                      <button onClick={() => setShowRemoveDialog(member)} style={{
                        background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6,
                        padding: "4px 8px", cursor: "pointer", color: "#EF4444", display: "flex", alignItems: "center"
                      }}><Icon name="trash" size={13} color="#EF4444" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--text-dim)" }}>Pending Invitations</div>
          {pendingInvites.map(inv => (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border-light)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{inv.email}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {inv.role} — expires {new Date(inv.expires_at).toLocaleDateString()}
                </div>
              </div>
              <button onClick={() => handleRevokeInvite(inv.id)} style={{
                background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer", color: "#EF4444", fontSize: 11, fontWeight: 600
              }}>Revoke</button>
            </div>
          ))}
        </div>
      )}

      {showRemoveDialog && <ConfirmDialog
        title={`Remove ${showRemoveDialog.name}?`}
        message={`This will permanently delete ${showRemoveDialog.name}'s account and all their data (catalog, exports, brand voices, etc). This cannot be undone.`}
        confirmLabel="Remove User" confirmColor="#EF4444"
        onCancel={() => setShowRemoveDialog(null)}
        onConfirm={() => handleRemove(showRemoveDialog.id)}
      />}
    </div>
  );
};

export default TeamManagement;
