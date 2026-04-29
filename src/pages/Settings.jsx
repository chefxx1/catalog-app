import React, { useState, useEffect, useRef } from "react";
import { changePassword as apiChangePassword, updateProfile as apiUpdateProfile, getSettings as apiGetSettings, updateSettings as apiUpdateSettings, deleteAllData, deleteAccount, shopifySync, setToken } from "../api";
import { Icon, ToggleSwitch, ConfirmDialog, InputField, PasswordStrengthBar } from "../components/shared";
import { toast } from "../components/Toast";
import TeamManagement from "./TeamManagement";

// ── Section header (used inside each panel) ──
const SectionHeader = ({ icon, title, subtitle, color }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
    <div style={{
      width: 38, height: 38, borderRadius: 11,
      background: `linear-gradient(135deg, ${color}26, ${color}10)`,
      border: `1px solid ${color}33`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <Icon name={icon} size={17} color={color} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <h3 style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em", margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  </div>
);

// ── Section panel wrapper ──
const Section = ({ id, children, accent }) => (
  <div id={id} style={{
    position: "relative",
    padding: 22,
    borderRadius: 14,
    background: "color-mix(in oklab, var(--card-bg) 82%, transparent)",
    border: "1px solid var(--border-light)",
    backdropFilter: "blur(10px)",
    overflow: "hidden",
    scrollMarginTop: 16,
  }}>
    {accent && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent, opacity: 0.85 }} />}
    {children}
  </div>
);

const Settings = ({ user, onUserUpdate }) => {
  const isAdmin = user.role === "Admin";

  // Profile
  const [profileName, setProfileName] = useState(user.name || "");
  const [profileEmail, setProfileEmail] = useState(user.email || "");
  const [profileStore, setProfileStore] = useState(user.store_name || "");
  const [profileSaved, setProfileSaved] = useState(false);

  // Shopify integration form
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyClientId, setShopifyClientId] = useState("");
  const [shopifyClientSecret, setShopifyClientSecret] = useState("");
  const [shopifySyncing, setShopifySyncing] = useState(false);

  // Delete-account typed confirmation
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState("");

  // Change Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // Store Settings
  const [currency, setCurrency] = useState("USD");
  const [exportFormat, setExportFormat] = useState("CSV");
  const [platform, setPlatform] = useState("Shopify");

  // Notifications
  const [notifExport, setNotifExport] = useState(true);
  const [notifWeekly, setNotifWeekly] = useState(true);
  const [notifNewSource, setNotifNewSource] = useState(false);
  const [notifPriceConflict, setNotifPriceConflict] = useState(true);

  // Danger Zone
  const [showDeleteData, setShowDeleteData] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [activeSection, setActiveSection] = useState("profile");
  const containerRef = useRef(null);

  // Load settings on mount
  useEffect(() => {
    apiGetSettings().then(s => {
      if (s.currency) setCurrency(s.currency);
      if (s.export_format) setExportFormat(s.export_format);
      if (s.default_platform) setPlatform(s.default_platform);
      if (s.notif_export !== undefined) setNotifExport(!!s.notif_export);
      if (s.notif_weekly !== undefined) setNotifWeekly(!!s.notif_weekly);
      if (s.notif_new_source !== undefined) setNotifNewSource(!!s.notif_new_source);
      if (s.notif_price_conflict !== undefined) setNotifPriceConflict(!!s.notif_price_conflict);
    }).catch(() => { toast.warning("Could not load settings"); });
  }, []);

  // Sidebar nav items
  const navItems = [
    { id: "profile", label: "Profile", icon: "user", color: "#3B82F6" },
    { id: "security", label: "Security", icon: "shield", color: "#8B5CF6" },
    ...(isAdmin ? [{ id: "team", label: "Team", icon: "users", color: "#F59E0B" }] : []),
    ...(isAdmin ? [{ id: "preferences", label: "Preferences", icon: "store", color: "#10B981" }] : []),
    ...(isAdmin ? [{ id: "notifications", label: "Notifications", icon: "bell", color: "#6366F1" }] : []),
    ...(isAdmin ? [{ id: "integrations", label: "Integrations", icon: "upload", color: "#F97316" }] : []),
    ...(isAdmin ? [{ id: "danger", label: "Danger Zone", icon: "warning", color: "#EF4444" }] : []),
  ];

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  };

  // Track which section is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    navItems.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleProfileSave = async () => {
    setProfileError("");
    try {
      const data = await apiUpdateProfile({ name: profileName, email: profileEmail, store_name: profileStore });
      if (onUserUpdate && data.user) onUserUpdate({ id: data.user.id, email: data.user.email, name: data.user.name, role: data.user.role, store_id: data.user.store_id, store_name: data.user.store_name });
      setProfileSaved(true); toast.success("Profile updated"); setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) { setProfileError(err.message); toast.error(err.message); }
  };

  const handlePasswordChange = async () => {
    setPasswordError("");
    try {
      await apiChangePassword(currentPassword, newPassword);
      setPasswordChanged(true); setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast.success("Password changed successfully");
      setTimeout(() => setPasswordChanged(false), 2000);
    } catch (err) { setPasswordError(err.message); toast.error(err.message); }
  };

  const handleSettingsSave = async () => {
    try {
      await apiUpdateSettings({ currency, export_format: exportFormat, default_platform: platform, notif_export: notifExport, notif_weekly: notifWeekly, notif_new_source: notifNewSource, notif_price_conflict: notifPriceConflict });
      setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2000);
      toast.success("Settings saved");
    } catch { toast.error("Failed to save settings"); }
  };

  return (
    <div className="animate-fadeIn" ref={containerRef} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, maxWidth: 1100, margin: "0 auto", alignItems: "start" }}>

      {/* ── SIDEBAR NAV ── */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-dim)", letterSpacing: "0.14em", marginBottom: 10, padding: "0 10px" }}>SETTINGS</div>
        {navItems.map(item => {
          const isActive = activeSection === item.id;
          return (
            <button key={item.id} type="button" onClick={() => scrollToSection(item.id)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 11px", borderRadius: 9, border: "none",
              background: isActive ? `linear-gradient(135deg, ${item.color}1f, ${item.color}0c)` : "transparent",
              color: isActive ? item.color : "var(--text-muted)",
              fontSize: 13, fontWeight: isActive ? 700 : 500,
              cursor: "pointer", textAlign: "left", fontFamily: "'Sora',sans-serif",
              transition: "all 0.15s",
              borderLeft: `2px solid ${isActive ? item.color : "transparent"}`,
              paddingLeft: 13,
            }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "var(--hover-bg)"; e.currentTarget.style.color = "var(--text)"; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; } }}>
              <Icon name={item.icon} size={14} color={isActive ? item.color : "var(--text-dim)"} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* ── MAIN CONTENT ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

        {/* ── PROFILE ── */}
        <Section id="profile" accent="linear-gradient(180deg,#3B82F6,#8B5CF6)">
          <SectionHeader icon="user" title="Profile" subtitle="Your name, email, and how you appear to your team." color="#3B82F6" />

          {/* Profile hero */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", borderRadius: 12, background: "color-mix(in oklab, var(--surface) 50%, transparent)", border: "1px solid var(--border-light)", marginBottom: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: "linear-gradient(135deg,#2563EB,#8B5CF6,#EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 800, color: "white", flexShrink: 0,
              boxShadow: "0 4px 14px rgba(139,92,246,0.32)",
              fontFamily: "'Sora',sans-serif",
            }}>
              {(profileName || "U")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{profileName || "User"}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{profileEmail}</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px", borderRadius: 999, background: "rgba(59,130,246,0.12)", color: "#3B82F6", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
              <Icon name="shield" size={11} color="#3B82F6" /> {user.role.toUpperCase()}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <InputField label="Full name" placeholder="Your name" icon="user" value={profileName} onChange={e => setProfileName(e.target.value)} />
            <InputField label="Email address" type="email" placeholder="you@example.com" icon="mail" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
          </div>
          {isAdmin && <div style={{ marginTop: 14 }}><InputField label="Store name" placeholder="My Store" icon="store" value={profileStore} onChange={e => setProfileStore(e.target.value)} /></div>}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            <button className="btn btn-primary" onClick={handleProfileSave}><Icon name="check" size={14} /> Save Profile</button>
            {profileSaved && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} color="#10B981" /> Saved</span>}
            {profileError && <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>{profileError}</span>}
          </div>
        </Section>

        {/* ── SECURITY ── */}
        <Section id="security" accent="linear-gradient(180deg,#8B5CF6,#EC4899)">
          <SectionHeader icon="shield" title="Security" subtitle="Update your password regularly. Use 12+ characters with mixed case, numbers, and symbols." color="#8B5CF6" />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <InputField label="Current password" type={showCurrentPwd ? "text" : "password"} placeholder="Enter current password"
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              rightEl={<span onClick={() => setShowCurrentPwd(p => !p)}><Icon name={showCurrentPwd ? "eyeOff" : "eye"} size={16} /></span>} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <InputField label="New password" type={showNewPwd ? "text" : "password"} placeholder="Min. 8 characters"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  rightEl={<span onClick={() => setShowNewPwd(p => !p)}><Icon name={showNewPwd ? "eyeOff" : "eye"} size={16} /></span>} />
                <div style={{ marginTop: 6 }}><PasswordStrengthBar password={newPassword} /></div>
              </div>
              <div>
                <InputField label="Confirm password" type={showConfirmPwd ? "text" : "password"} placeholder="Re-enter password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  rightEl={<span onClick={() => setShowConfirmPwd(p => !p)}><Icon name={showConfirmPwd ? "eyeOff" : "eye"} size={16} /></span>} />
                {confirmPassword && newPassword !== confirmPassword && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 6 }}>Passwords don't match</p>}
                {confirmPassword && newPassword === confirmPassword && <p style={{ fontSize: 11, color: "#10B981", display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}><Icon name="check" size={11} color="#10B981" /> Match</p>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
            <button className="btn btn-primary" onClick={handlePasswordChange} disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}><Icon name="check" size={14} /> Update Password</button>
            {passwordChanged && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} color="#10B981" /> Updated</span>}
            {passwordError && <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>{passwordError}</span>}
          </div>
        </Section>

        {/* ── TEAM MANAGEMENT ── */}
        {isAdmin && (
          <Section id="team" accent="linear-gradient(180deg,#F59E0B,#EF4444)">
            <SectionHeader icon="users" title="Team Management" subtitle="Invite teammates and manage their access to your store." color="#F59E0B" />
            <TeamManagement currentUserId={user.id} />
          </Section>
        )}

        {/* ── STORE PREFERENCES ── */}
        {isAdmin && (
          <Section id="preferences" accent="linear-gradient(180deg,#10B981,#3B82F6)">
            <SectionHeader icon="store" title="Store Preferences" subtitle="Defaults applied across catalog exports and price formatting." color="#10B981" />

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Default Currency</label>
                <select className="input" value={currency} onChange={e => setCurrency(e.target.value)} style={{ maxWidth: 220 }}>
                  {["USD", "EUR", "GBP", "CAD", "AUD"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Default Export Format</label>
                <div style={{ display: "flex", gap: 8, maxWidth: 360 }}>
                  {["CSV", "JSON", "XML"].map(f => (
                    <div key={f} onClick={() => setExportFormat(f)} style={{
                      flex: 1, padding: "10px 6px", borderRadius: 9, cursor: "pointer", textAlign: "center",
                      border: `1.5px solid ${exportFormat === f ? "#3B82F6" : "var(--border)"}`,
                      background: exportFormat === f ? "rgba(59,130,246,0.1)" : "transparent",
                      transition: "all 0.18s",
                      boxShadow: exportFormat === f ? "0 3px 12px rgba(59,130,246,0.2)" : "none",
                    }}>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: exportFormat === f ? "#3B82F6" : "var(--text-dim)" }}>{f}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Default Platform</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {[{ n: "Shopify", c: "#96BF48" }, { n: "WooCommerce", c: "#9B5C8F" }, { n: "Magento", c: "#F46F25" }, { n: "BigCommerce", c: "#121118" }].map(p => (
                    <div key={p.n} onClick={() => setPlatform(p.n)} style={{
                      padding: "10px 6px", borderRadius: 9, cursor: "pointer", textAlign: "center",
                      border: `1.5px solid ${platform === p.n ? p.c : "var(--border)"}`,
                      background: platform === p.n ? p.c + "14" : "transparent",
                      transition: "all 0.18s",
                      boxShadow: platform === p.n ? `0 3px 12px ${p.c}44` : "none",
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.c, margin: "0 auto 6px", boxShadow: `0 0 6px ${p.c}aa` }} />
                      <div style={{ fontSize: 11, fontWeight: 700, color: platform === p.n ? p.c : "var(--text-dim)" }}>{p.n}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
              <button className="btn btn-primary" onClick={handleSettingsSave}><Icon name="check" size={14} /> Save Preferences</button>
              {settingsSaved && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} color="#10B981" /> Saved</span>}
            </div>
          </Section>
        )}

        {/* ── NOTIFICATIONS ── */}
        {isAdmin && (
          <Section id="notifications" accent="linear-gradient(180deg,#6366F1,#8B5CF6)">
            <SectionHeader icon="bell" title="Notifications" subtitle="Choose which emails to receive about catalog activity." color="#6366F1" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { label: "Export completion emails", desc: "When a product export finishes", value: notifExport, toggle: () => setNotifExport(v => !v) },
                { label: "Weekly analytics report", desc: "Summary of catalog activity", value: notifWeekly, toggle: () => setNotifWeekly(v => !v) },
                { label: "New data source alerts", desc: "When new data sources are available", value: notifNewSource, toggle: () => setNotifNewSource(v => !v) },
                { label: "Price conflict alerts", desc: "When price conflicts are detected", value: notifPriceConflict, toggle: () => setNotifPriceConflict(v => !v) },
              ].map((item, i, arr) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                  <div style={{ flex: 1, paddingRight: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>{item.desc}</div>
                  </div>
                  <ToggleSwitch enabled={item.value} onToggle={item.toggle} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11.5, padding: "5px 12px" }} onClick={handleSettingsSave}><Icon name="check" size={11} /> Save Notifications</button>
            </div>
          </Section>
        )}

        {/* ── INTEGRATIONS ── */}
        {isAdmin && (
          <Section id="integrations" accent="linear-gradient(180deg,#F97316,#EF4444)">
            <SectionHeader icon="upload" title="Integrations" subtitle="Connect external storefronts and sync your catalog automatically." color="#F97316" />

            {/* Shopify card */}
            <div style={{ position: "relative", padding: "16px 18px", borderRadius: 12, background: "color-mix(in oklab, var(--surface) 50%, transparent)", border: "1px solid var(--border-light)", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#96BF48" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#96BF48,#7AB55C)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "white", boxShadow: "0 2px 8px rgba(150,191,72,0.4)" }}>S</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>Shopify Live Sync</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 1 }}>Push published products directly to your Shopify store</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input className="input" placeholder="your-store.myshopify.com" style={{ fontSize: 12.5, padding: "8px 12px" }}
                  value={shopifyDomain} onChange={e => setShopifyDomain(e.target.value)} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" placeholder="Client ID" style={{ flex: 1, fontSize: 12.5, padding: "8px 12px" }}
                    value={shopifyClientId} onChange={e => setShopifyClientId(e.target.value)} />
                  <input className="input" type="password" placeholder="Client Secret" style={{ flex: 1, fontSize: 12.5, padding: "8px 12px" }}
                    value={shopifyClientSecret} onChange={e => setShopifyClientSecret(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" style={{ marginTop: 12, fontSize: 12, padding: "7px 16px" }} disabled={shopifySyncing} onClick={async () => {
                const domain = shopifyDomain.trim();
                const clientId = shopifyClientId.trim();
                const clientSecret = shopifyClientSecret.trim();
                if (!domain || !clientId || !clientSecret) { toast.warning("Enter Shopify domain, Client ID, and Client Secret"); return; }
                setShopifySyncing(true);
                try {
                  const r = await shopifySync(domain, clientId, clientSecret);
                  const parts = [`${r.synced} synced`];
                  if (r.skipped > 0) parts.push(`${r.skipped} already on Shopify`);
                  if (r.failed > 0) parts.push(`${r.failed} failed`);
                  if (r.synced > 0) toast.success(`Shopify sync: ${parts.join(", ")}`);
                  else toast.info(`Shopify sync: ${parts.join(", ")}`);
                } catch (err) { toast.error("Shopify sync: " + err.message); }
                finally { setShopifySyncing(false); }
              }}><Icon name="upload" size={12} /> {shopifySyncing ? "Syncing..." : "Sync to Shopify"}</button>
            </div>
          </Section>
        )}

        {/* ── DANGER ZONE ── */}
        {isAdmin && (
          <div id="danger" style={{
            position: "relative",
            padding: 22, borderRadius: 14,
            border: "1px solid rgba(239,68,68,0.3)",
            background: "linear-gradient(135deg, rgba(239,68,68,0.05), rgba(239,68,68,0.02))",
            scrollMarginTop: 16,
          }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#EF4444" }} />
            <SectionHeader icon="warning" title="Danger Zone" subtitle="Irreversible actions. Data deletion cannot be undone." color="#EF4444" />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.18)", background: "rgba(239,68,68,0.04)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Delete all catalog data</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>Wipes products, exports, search history, and analytics. Account stays.</div>
                </div>
                <button className="btn" style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "#EF4444", fontSize: 12, padding: "6px 14px", flexShrink: 0 }}
                  onClick={() => setShowDeleteData(true)}>
                  Delete Data
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Delete account</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>Permanently deletes your account, store, and all team members.</div>
                </div>
                <button className="btn" style={{ background: "#EF4444", color: "white", fontSize: 12, padding: "6px 14px", flexShrink: 0, boxShadow: "0 3px 10px rgba(239,68,68,0.32)" }}
                  onClick={() => setShowDeleteAccount(true)}>
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showDeleteData && <ConfirmDialog title="Delete All Catalog Data" message="This will permanently delete all your products, catalog entries, export history, and analytics data. This action cannot be undone."
        confirmLabel="Delete All Data" confirmColor="#EF4444" onCancel={() => setShowDeleteData(false)} onConfirm={async () => {
          try { await deleteAllData(); toast.success("All data deleted"); setShowDeleteData(false); } catch (err) { toast.error(err.message); }
        }} />}
      {showDeleteAccount && (
        <div className="modal-modern-overlay" onClick={() => { setShowDeleteAccount(false); setDeleteAccountConfirmText(""); }}>
          <div className="modal-modern-card size-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-modern-blobs" />
            <div className="modal-modern-header">
              <div>
                <h3 style={{ color: "#EF4444" }}>Delete Account</h3>
                <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>This will permanently delete your account and all associated data. You will be logged out immediately. This action cannot be undone.</p>
              </div>
            </div>
            <div className="modal-modern-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                To confirm, type <strong style={{ color: "#EF4444" }}>{user.email}</strong> below.
              </p>
              <input className="input" autoFocus placeholder={user.email}
                value={deleteAccountConfirmText} onChange={e => setDeleteAccountConfirmText(e.target.value)} />
            </div>
            <div className="modal-modern-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => { setShowDeleteAccount(false); setDeleteAccountConfirmText(""); }}>Cancel</button>
              <button className="btn" style={{ background: "#EF4444", color: "white", opacity: deleteAccountConfirmText === user.email ? 1 : 0.4 }}
                disabled={deleteAccountConfirmText !== user.email}
                onClick={async () => {
                  try { await deleteAccount(); setToken(null); if (onUserUpdate) onUserUpdate(null); toast.success("Account deleted"); }
                  catch (err) { toast.error(err.message); }
                }}>
                Delete My Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
