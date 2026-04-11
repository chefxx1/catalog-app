import React, { useState, useEffect } from "react";
import { changePassword as apiChangePassword, updateProfile as apiUpdateProfile, getSettings as apiGetSettings, updateSettings as apiUpdateSettings, deleteAllData, deleteAccount, shopifySync, setToken } from "../api";
import { Icon, ToggleSwitch, ConfirmDialog, InputField, PasswordStrengthBar } from "../components/shared";
import { toast } from "../components/Toast";
import TeamManagement from "./TeamManagement";

const Settings = ({ user, onUserUpdate }) => {
  const isAdmin = user.role === "Admin";
  const isEditorOrAdmin = user.role === "Admin" || user.role === "Editor";

  // Profile
  const [profileName, setProfileName] = useState(user.name || "");
  const [profileEmail, setProfileEmail] = useState(user.email || "");
  const [profileStore, setProfileStore] = useState(user.store || "");
  const [profileSaved, setProfileSaved] = useState(false);

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

  // API Keys
  const [openaiKey, setOpenaiKey] = useState("");
  const [amazonKey, setAmazonKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAmazon, setShowAmazon] = useState(false);
  const [showGoogle, setShowGoogle] = useState(false);
  const [apiSaved, setApiSaved] = useState(false);

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
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

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
      setSettingsLoaded(true);
    }).catch(() => { setSettingsLoaded(true); toast.warning("Could not load settings"); });
  }, []);

  const handleProfileSave = async () => {
    setProfileError("");
    try {
      const data = await apiUpdateProfile({ name: profileName, email: profileEmail, store_name: profileStore });
      if (onUserUpdate && data.user) onUserUpdate({ id: data.user.id, email: data.user.email, name: data.user.name, role: data.user.role, store_id: data.user.store_id, store: data.user.store_name });
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
    } catch (err) { toast.error("Failed to save settings"); }
  };

  const handleApiSave = () => { setApiSaved(true); setTimeout(() => setApiSaved(false), 2000); };

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── PROFILE ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#2563EB,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "white", flexShrink: 0 }}>
            {(profileName || "U")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{profileName || "User"}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{profileEmail}</div>
          </div>
          <span className="badge badge-primary">{user.role}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <InputField label="Full name" placeholder="Your name" icon="user" value={profileName} onChange={e => setProfileName(e.target.value)} />
          <InputField label="Email address" type="email" placeholder="you@example.com" icon="mail" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
        </div>
        {isAdmin && <div style={{ marginTop: 14 }}><InputField label="Store name" placeholder="My Store" icon="store" value={profileStore} onChange={e => setProfileStore(e.target.value)} /></div>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleProfileSave}><Icon name="check" size={14} /> Save Profile</button>
          {profileSaved && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} color="#10B981" /> Saved</span>}
          {profileError && <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>{profileError}</span>}
        </div>
      </div>

      {/* ── SECURITY ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <Icon name="shield" size={18} color="#8B5CF6" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Security</span>
        </div>
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
              {confirmPassword && newPassword === confirmPassword && confirmPassword && <p style={{ fontSize: 11, color: "#10B981", display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}><Icon name="check" size={11} color="#10B981" /> Match</p>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handlePasswordChange} disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}><Icon name="check" size={14} /> Update Password</button>
          {passwordChanged && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} color="#10B981" /> Updated</span>}
          {passwordError && <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>{passwordError}</span>}
        </div>
      </div>

      {/* ── TEAM MANAGEMENT ── */}
      {isAdmin && <TeamManagement currentUserId={user.id} />}

      {/* ── STORE PREFERENCES (merged: Store + API + Notifications) ── */}
      {isAdmin && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Icon name="store" size={18} color="#10B981" />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Store Preferences</span>
          </div>

          {/* Store defaults */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Default Currency</label>
              <select className="input" value={currency} onChange={e => setCurrency(e.target.value)} style={{ maxWidth: 200 }}>
                {["USD", "EUR", "GBP", "CAD", "AUD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Default Export Format</label>
              <div style={{ display: "flex", gap: 8, maxWidth: 320 }}>
                {["CSV", "JSON", "XML"].map(f => (
                  <div key={f} onClick={() => setExportFormat(f)} style={{
                    flex: 1, padding: "8px 6px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                    border: `1.5px solid ${exportFormat === f ? "#3B82F6" : "var(--border)"}`,
                    background: exportFormat === f ? "rgba(37,99,235,0.1)" : "transparent", transition: "all 0.2s"
                  }}>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: exportFormat === f ? "#3B82F6" : "var(--text-dim)" }}>{f}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Default Platform</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {[{ n: "Shopify", c: "#96BF48" }, { n: "WooCommerce", c: "#9B5C8F" }, { n: "Magento", c: "#F46F25" }, { n: "BigCommerce", c: "#121118" }].map(p => (
                  <div key={p.n} onClick={() => setPlatform(p.n)} style={{
                    padding: "8px 6px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                    border: `1.5px solid ${platform === p.n ? p.c : "var(--border)"}`,
                    background: platform === p.n ? p.c + "14" : "transparent", transition: "all 0.2s"
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.c, margin: "0 auto 5px" }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: platform === p.n ? p.c : "var(--text-dim)" }}>{p.n}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, paddingBottom: 20, borderBottom: "1px solid var(--border-light)" }}>
            <button className="btn btn-primary" onClick={handleSettingsSave}><Icon name="check" size={14} /> Save Settings</button>
            {settingsSaved && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} color="#10B981" /> Saved</span>}
          </div>

          {/* API Keys */}
          <div style={{ paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <Icon name="key" size={16} color="#F59E0B" />
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-sec)" }}>API Keys</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <InputField label="OpenAI API Key" type={showOpenai ? "text" : "password"} placeholder="sk-..." icon="key"
                value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} hint="platform.openai.com/api-keys"
                rightEl={<span onClick={() => setShowOpenai(p => !p)}><Icon name={showOpenai ? "eyeOff" : "eye"} size={16} /></span>} />
              <InputField label="Amazon Product API Key" type={showAmazon ? "text" : "password"} placeholder="Enter API key" icon="key"
                value={amazonKey} onChange={e => setAmazonKey(e.target.value)} hint="Amazon Product Advertising API"
                rightEl={<span onClick={() => setShowAmazon(p => !p)}><Icon name={showAmazon ? "eyeOff" : "eye"} size={16} /></span>} />
              <InputField label="Google Custom Search API Key" type={showGoogle ? "text" : "password"} placeholder="Enter API key" icon="key"
                value={googleKey} onChange={e => setGoogleKey(e.target.value)} hint="console.cloud.google.com/apis"
                rightEl={<span onClick={() => setShowGoogle(p => !p)}><Icon name={showGoogle ? "eyeOff" : "eye"} size={16} /></span>} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, paddingBottom: 20, borderBottom: "1px solid var(--border-light)" }}>
              <button className="btn btn-primary" onClick={handleApiSave}><Icon name="check" size={14} /> Save Keys</button>
              {apiSaved && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={12} color="#10B981" /> Saved</span>}
            </div>
          </div>

          {/* Notifications */}
          <div style={{ paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Icon name="bell" size={16} color="#6366F1" />
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-sec)" }}>Notifications</span>
            </div>
            {[
              { label: "Export completion emails", desc: "When a product export finishes", value: notifExport, toggle: () => setNotifExport(v => !v) },
              { label: "Weekly analytics report", desc: "Summary of catalog activity", value: notifWeekly, toggle: () => setNotifWeekly(v => !v) },
              { label: "New data source alerts", desc: "When new data sources are available", value: notifNewSource, toggle: () => setNotifNewSource(v => !v) },
              { label: "Price conflict alerts", desc: "When price conflicts are detected", value: notifPriceConflict, toggle: () => setNotifPriceConflict(v => !v) },
            ].map((item, i, arr) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border-light)" : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{item.desc}</div>
                </div>
                <ToggleSwitch enabled={item.value} onToggle={item.toggle} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INTEGRATIONS ── */}
      {isAdmin && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <Icon name="upload" size={18} color="#F59E0B" />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Integrations</span>
          </div>

          {/* Shopify Sync */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Shopify Live Sync</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, marginBottom: 10 }}>Push published products directly to your Shopify store</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <input className="input" placeholder="your-store.myshopify.com" style={{ flex: 1, fontSize: 12, padding: "7px 10px" }} id="shopify-domain" />
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input className="input" placeholder="Client ID" style={{ flex: 1, fontSize: 12, padding: "7px 10px" }} id="shopify-client-id" />
              <input className="input" type="password" placeholder="Client Secret" style={{ flex: 1, fontSize: 12, padding: "7px 10px" }} id="shopify-client-secret" />
            </div>
            <button className="btn btn-primary" style={{ fontSize: 11, padding: "6px 14px" }} onClick={async () => {
              const domain = document.getElementById("shopify-domain").value.trim();
              const clientId = document.getElementById("shopify-client-id").value.trim();
              const clientSecret = document.getElementById("shopify-client-secret").value.trim();
              if (!domain || !clientId || !clientSecret) { toast.warning("Enter Shopify domain, Client ID, and Client Secret"); return; }
              try {
                const r = await shopifySync(domain, clientId, clientSecret);
                const parts = [`${r.synced} synced`];
                if (r.skipped > 0) parts.push(`${r.skipped} already on Shopify`);
                if (r.failed > 0) parts.push(`${r.failed} failed`);
                if (r.synced > 0) toast.success(`Shopify sync: ${parts.join(", ")}`);
                else toast.info(`Shopify sync: ${parts.join(", ")}`);
              } catch (err) { toast.error("Shopify sync: " + err.message); }
            }}><Icon name="upload" size={12} /> Sync to Shopify</button>
          </div>
        </div>
      )}

      {/* ── DANGER ZONE ── */}
      {isAdmin && (
        <div style={{ padding: "20px 24px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="warning" size={16} color="#EF4444" />
              <span style={{ fontWeight: 700, fontSize: 14, color: "#EF4444" }}>Danger Zone</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "#EF4444", fontSize: 12, padding: "6px 14px" }}
                onClick={() => setShowDeleteData(true)}>
                Delete Data
              </button>
              <button className="btn" style={{ background: "#EF4444", color: "white", fontSize: 12, padding: "6px 14px" }}
                onClick={() => setShowDeleteAccount(true)}>
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteData && <ConfirmDialog title="Delete All Catalog Data" message="This will permanently delete all your products, catalog entries, export history, and analytics data. This action cannot be undone."
        confirmLabel="Delete All Data" confirmColor="#EF4444" onCancel={() => setShowDeleteData(false)} onConfirm={async () => {
          try { await deleteAllData(); toast.success("All data deleted"); setShowDeleteData(false); } catch (err) { toast.error(err.message); }
        }} />}
      {showDeleteAccount && <ConfirmDialog title="Delete Account" message="This will permanently delete your account and all associated data. You will be logged out immediately. This action cannot be undone."
        confirmLabel="Delete My Account" confirmColor="#EF4444" onCancel={() => setShowDeleteAccount(false)} onConfirm={async () => {
          try { await deleteAccount(); setToken(null); if (onUserUpdate) onUserUpdate(null); toast.success("Account deleted"); } catch (err) { toast.error(err.message); }
        }} />}
    </div>
  );
};

export default Settings;
