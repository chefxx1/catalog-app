import React, { useState, useEffect, useRef } from "react";
import { Icon, InputField, PasswordStrengthBar } from "../components/shared";
import { signIn as apiSignIn, signUp as apiSignUp, googleSignIn, getInviteInfo, acceptInvite, forgotPassword, resetPassword } from "../api";
import ShaderBackground from "../components/ShaderBackground";

// ============================================================
const AuthPage = ({ onLogin, dark }) => {
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset')) return "reset";
    if (params.get('invite')) return "invite";
    return "signin";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Sign In
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [remember, setRemember] = useState(false);

  // Sign Up
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suStore, setSuStore] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Forgot
  const [forgotEmail, setForgotEmail] = useState("");

  // Invite
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'));
  const [inviteInfo, setInviteInfo] = useState(null);
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteConfirm, setInviteConfirm] = useState("");
  const [inviteLoading, setInviteLoading] = useState(!!new URLSearchParams(window.location.search).get('invite'));

  useEffect(() => {
    if (inviteToken) {
      getInviteInfo(inviteToken).then(info => {
        setInviteInfo(info);
        setInviteLoading(false);
      }).catch(err => {
        setError(err.message);
        setInviteLoading(false);
      });
    }
  }, [inviteToken]);

  const googleBtnRef = useRef(null);

  const clear = () => { setError(""); setSuccess(""); };
  const switchMode = (m) => { clear(); setMode(m); };

  // Initialize Google Sign-In button (always works, no cooldown)
  useEffect(() => {
    if (mode !== "signin" || !googleBtnRef.current) return;
    let interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        interval = null;
        window.google.accounts.id.initialize({
          client_id: '1000676280585-tkh1mrc4ldc9atpaqr5vsg89vqoe2ahg.apps.googleusercontent.com',
          callback: async (response) => {
            clear(); setLoading(true);
            try {
              const data = await googleSignIn(response.credential);
              setLoading(false);
              onLogin({ id: data.user.id, email: data.user.email, name: data.user.name, role: data.user.role, store_id: data.user.store_id, store: data.user.store_name });
            } catch (err) { setLoading(false); setError(err.message); }
          },
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          width: googleBtnRef.current.offsetWidth,
          text: "continue_with",
          shape: "pill",
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [mode]);

  // ── SIGN IN ──
  const handleSignIn = async () => {
    clear();
    if (!siEmail.trim()) return setError("Please enter your email address.");
    if (!siPassword) return setError("Please enter your password.");
    setLoading(true);

    try {
      const data = await apiSignIn(siEmail, siPassword);
      setLoading(false);
      onLogin({ id: data.user.id, email: data.user.email, name: data.user.name, role: data.user.role, store_id: data.user.store_id, store: data.user.store_name });
    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  };

  // ── SIGN UP ──
  const handleSignUp = async () => {
    clear();
    if (!suName.trim()) return setError("Please enter your full name.");
    if (!suEmail.trim()) return setError("Please enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suEmail)) return setError("Please enter a valid email address.");
    if (!suPassword) return setError("Please choose a password.");
    if (suPassword.length < 8) return setError("Password must be at least 8 characters.");
    if (suPassword !== suConfirm) return setError("Passwords do not match.");
    if (!agreedTerms) return setError("Please agree to the Terms of Service.");
    setLoading(true);

    try {
      const data = await apiSignUp(suName, suEmail, suPassword, suStore || "My Store");
      setLoading(false);
      onLogin({ id: data.user.id, email: data.user.email, name: data.user.name, role: data.user.role, store_id: data.user.store_id, store: data.user.store_name });
    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  };

  // ── ACCEPT INVITE ──
  const handleAcceptInvite = async () => {
    clear();
    if (!inviteName.trim()) return setError("Please enter your full name.");
    if (!invitePassword) return setError("Please choose a password.");
    if (invitePassword.length < 8) return setError("Password must be at least 8 characters.");
    if (invitePassword !== inviteConfirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const data = await acceptInvite(inviteToken, inviteName, invitePassword);
      setLoading(false);
      // Clean the URL
      window.history.replaceState({}, '', window.location.pathname);
      onLogin({ id: data.user.id, email: data.user.email, name: data.user.name, role: data.user.role, store_id: data.user.store_id, store: data.user.store_name });
    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  };

  // ── FORGOT PASSWORD ──
  const handleForgot = async () => {
    clear();
    if (!forgotEmail.trim()) return setError("Please enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) return setError("Please enter a valid email.");
    setLoading(true);
    try {
      await forgotPassword(forgotEmail.trim());
      setSuccess(`If an account exists for ${forgotEmail}, a reset link has been sent. Check your inbox.`);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // ── RESET PASSWORD ──
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset'));
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const handleReset = async () => {
    clear();
    if (!newPass || newPass.length < 8) return setError("Password must be at least 8 characters.");
    if (newPass !== confirmPass) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await resetPassword(resetToken, newPass);
      setSuccess("Password reset successfully! You can now sign in.");
      window.history.replaceState({}, '', window.location.pathname);
      setResetToken(null);
      setTimeout(() => switchMode("signin"), 2000);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // ── SHARED COMPONENTS ──
  const LoadingDots = () => (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "white", animation: "bounceDot 1.4s infinite ease-in-out", animationDelay: `${-0.32 + i * 0.16}s` }} />
      ))}
    </div>
  );

  const ErrorBanner = () => error ? (
    <div className="animate-fadeIn" style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 13, color: "#FCA5A5", display: "flex", gap: 8, alignItems: "flex-start" }}>
      <Icon name="warning" size={14} color="#EF4444" />{error}
    </div>
  ) : null;


  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", background: "var(--bg)", position: "relative", overflow: "hidden" }}>
      <ShaderBackground />

      <div style={{ width: "100%", maxWidth: 460, position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <div style={{ position: "relative", width: 64, height: 64 }}>
              {/* Animated glow ring */}
              <div style={{ position: "absolute", inset: -6, borderRadius: 22, background: "conic-gradient(from 0deg, #2563EB, #7C3AED, #10B981, #2563EB)", opacity: 0.5, filter: "blur(12px)", animation: "logoSpin 6s linear infinite" }} />
              <div style={{ position: "absolute", inset: -2, borderRadius: 20, background: "conic-gradient(from 0deg, #2563EB, #7C3AED, #10B981, #2563EB)", opacity: 0.7, animation: "logoSpin 6s linear infinite" }} />
              {/* Inner icon */}
              <div style={{ position: "relative", width: 64, height: 64, borderRadius: 18, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(20px)" }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke="url(#logoGrad)" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M12 22V12" stroke="url(#logoGrad)" strokeWidth="1.5" />
                  <path d="M2 7l10 5 10-5" stroke="url(#logoGrad)" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="2.5" fill="url(#logoGrad)" opacity="0.9" />
                  <circle cx="12" cy="12" r="2.5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
                  <defs>
                    <linearGradient id="logoGrad" x1="2" y1="2" x2="22" y2="22">
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="50%" stopColor="#8B5CF6" />
                      <stop offset="100%" stopColor="#10B981" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.95)" }}>Catalog</span>
            <span style={{ background: "linear-gradient(135deg, #3B82F6, #8B5CF6, #10B981)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>AI</span>
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Product Data Intelligence</p>
        </div>

        {/* ═══════════ SIGN IN ═══════════ */}
        {mode === "signin" && (
          <div className="card animate-fadeIn" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18, background: "rgba(9,9,11,0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Welcome back</h2>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Sign in to your merchant account</p>
            </div>

            <ErrorBanner />

            <InputField label="Email address" type="email" placeholder="you@example.com" icon="mail"
              value={siEmail} onChange={e => { setSiEmail(e.target.value); clear(); }}
              onKeyDown={e => e.key === "Enter" && handleSignIn()} />

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Password</label>
                <button onClick={() => switchMode("forgot")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#3B82F6", fontFamily: "'Sora',sans-serif", fontWeight: 600 }}>Forgot password?</button>
              </div>
              <div style={{ position: "relative" }}>
                <input className="input" type={showPassword ? "text" : "password"} placeholder="Enter your password"
                  value={siPassword} onChange={e => { setSiPassword(e.target.value); clear(); }}
                  onKeyDown={e => e.key === "Enter" && handleSignIn()} style={{ paddingRight: 44 }} />
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}
                  onClick={() => setShowPassword(p => !p)}>
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </div>
              </div>
            </div>

            {/* Remember me */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div onClick={() => setRemember(r => !r)} style={{
                width: 16, height: 16, borderRadius: 4, cursor: "pointer", flexShrink: 0,
                background: remember ? "#2563EB" : "transparent",
                border: `2px solid ${remember ? "#2563EB" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s"
              }}>{remember && <Icon name="check" size={10} color="white" />}</div>
              <span style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }} onClick={() => setRemember(r => !r)}>Remember me for 30 days</span>
            </div>

            <button className="btn" style={{ justifyContent: "center", padding: "13px 0", fontSize: 14, width: "100%", background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", border: "none" }}
              onClick={handleSignIn} disabled={loading}>
              {loading ? <LoadingDots /> : <><Icon name="zap" size={15} /> Sign In</>}
            </button>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {/* Google Sign-In — rendered by Google Identity Services */}
            <div ref={googleBtnRef} style={{ width: "100%", display: "flex", justifyContent: "center" }} />

            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>
              Don't have an account?{" "}
              <button onClick={() => switchMode("signup")} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 13 }}>Sign up</button>
            </p>
          </div>
        )}

        {/* ═══════════ SIGN UP ═══════════ */}
        {mode === "signup" && (
          <div className="card animate-fadeIn" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16, background: "rgba(9,9,11,0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Create your account</h2>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Start cataloging smarter in minutes</p>
            </div>

            <ErrorBanner />

            {/* Name + Store side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <InputField label="Full name" placeholder="Jane Smith" icon="user"
                value={suName} onChange={e => { setSuName(e.target.value); clear(); }} />
              <InputField label="Store name" placeholder="My Store" icon="store"
                value={suStore} onChange={e => { setSuStore(e.target.value); clear(); }} />
            </div>

            <InputField label="Email address" type="email" placeholder="you@example.com" icon="mail"
              value={suEmail} onChange={e => { setSuEmail(e.target.value); clear(); }} />

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Password</label>
              <div style={{ position: "relative" }}>
                <input className="input" type={showPassword ? "text" : "password"} placeholder="Min. 8 characters"
                  value={suPassword} onChange={e => { setSuPassword(e.target.value); clear(); }} style={{ paddingRight: 44 }} />
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}
                  onClick={() => setShowPassword(p => !p)}>
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </div>
              </div>
              <PasswordStrengthBar password={suPassword} />
            </div>

            {/* Confirm */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Confirm password</label>
              <div style={{ position: "relative" }}>
                <input className="input" type={showConfirmPassword ? "text" : "password"} placeholder="Re-enter password"
                  value={suConfirm} onChange={e => { setSuConfirm(e.target.value); clear(); }}
                  onKeyDown={e => e.key === "Enter" && handleSignUp()}
                  style={{
                    paddingRight: 44,
                    borderColor: suConfirm && suPassword !== suConfirm ? "#EF4444" : suConfirm && suPassword === suConfirm ? "#10B981" : undefined
                  }} />
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "var(--text-dim)" }}
                  onClick={() => setShowConfirmPassword(p => !p)}>
                  <Icon name={showConfirmPassword ? "eyeOff" : "eye"} size={16} />
                </div>
              </div>
              {suConfirm && suPassword !== suConfirm && <p style={{ fontSize: 11, color: "#EF4444" }}>Passwords don't match</p>}
              {suConfirm && suPassword === suConfirm && <p style={{ fontSize: 11, color: "#10B981", display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={11} color="#10B981" /> Passwords match</p>}
            </div>

            {/* Terms */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div onClick={() => setAgreedTerms(v => !v)} style={{
                width: 18, height: 18, borderRadius: 4, cursor: "pointer", flexShrink: 0, marginTop: 1,
                background: agreedTerms ? "#2563EB" : "transparent",
                border: `2px solid ${agreedTerms ? "#2563EB" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s"
              }}>{agreedTerms && <Icon name="check" size={11} color="white" />}</div>
              <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, cursor: "pointer" }} onClick={() => setAgreedTerms(v => !v)}>
                I agree to the <span style={{ color: "#3B82F6", fontWeight: 600 }}>Terms of Service</span> and <span style={{ color: "#3B82F6", fontWeight: 600 }}>Privacy Policy</span>
              </span>
            </div>

            <button className="btn" style={{ justifyContent: "center", padding: "13px 0", fontSize: 14, width: "100%", background: "linear-gradient(135deg, #7C3AED, #10B981)", color: "white", border: "none" }}
              onClick={handleSignUp} disabled={loading}>
              {loading ? <LoadingDots /> : <><Icon name="sparkle" size={15} /> Create Account</>}
            </button>

            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-dim)" }}>
              Already have an account?{" "}
              <button onClick={() => switchMode("signin")} style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 13 }}>Sign in</button>
            </p>
          </div>
        )}

        {/* ═══════════ ACCEPT INVITATION ═══════════ */}
        {mode === "invite" && inviteToken && (
          <div className="card animate-fadeIn" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18, background: "rgba(9,9,11,0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {inviteLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><LoadingDots /></div>
            ) : !inviteInfo ? (
              <div style={{ textAlign: "center", padding: 20 }}>
                <Icon name="alert" size={36} color="#EF4444" />
                <p style={{ fontSize: 14, color: "#EF4444", fontWeight: 600, marginTop: 12 }}>Invalid or expired invitation</p>
                <button onClick={() => { window.history.replaceState({}, '', window.location.pathname); switchMode("signin"); }} className="btn btn-ghost" style={{ marginTop: 14, width: "100%", justifyContent: "center", fontSize: 13 }}>Go to Sign In</button>
              </div>
            ) : (
              <>
                <div>
                  <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Join {inviteInfo.store_name}</h2>
                  <p style={{ fontSize: 13, color: "var(--text-dim)" }}>
                    <strong style={{ color: "var(--text)" }}>{inviteInfo.inviter_name}</strong> invited you to join as <span style={{
                      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: inviteInfo.role === "Editor" ? "#10B98118" : "#94A3B818",
                      color: inviteInfo.role === "Editor" ? "#10B981" : "#94A3B8"
                    }}>{inviteInfo.role}</span>
                  </p>
                </div>
                <ErrorBanner />
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)" }}>
                  <p style={{ fontSize: 12, color: "var(--text-dim)" }}>Email</p>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{inviteInfo.email}</p>
                </div>
                <InputField label="Full name" placeholder="Your name" icon="user"
                  value={inviteName} onChange={e => { setInviteName(e.target.value); clear(); }} />
                <InputField label="Password" type={showPassword ? "text" : "password"} placeholder="Min. 8 characters" icon="key"
                  value={invitePassword} onChange={e => { setInvitePassword(e.target.value); clear(); }}
                  rightEl={<span onClick={() => setShowPassword(p => !p)}><Icon name={showPassword ? "eyeOff" : "eye"} size={16} /></span>} />
                <PasswordStrengthBar password={invitePassword} />
                <InputField label="Confirm password" type={showConfirmPassword ? "text" : "password"} placeholder="Re-enter password" icon="key"
                  value={inviteConfirm} onChange={e => { setInviteConfirm(e.target.value); clear(); }}
                  onKeyDown={e => e.key === "Enter" && handleAcceptInvite()}
                  rightEl={<span onClick={() => setShowConfirmPassword(p => !p)}><Icon name={showConfirmPassword ? "eyeOff" : "eye"} size={16} /></span>} />
                {inviteConfirm && invitePassword !== inviteConfirm && <p style={{ fontSize: 11, color: "#EF4444" }}>Passwords don't match</p>}
                {inviteConfirm && invitePassword === inviteConfirm && inviteConfirm && <p style={{ fontSize: 11, color: "#10B981", display: "flex", alignItems: "center", gap: 4 }}><Icon name="check" size={11} color="#10B981" /> Passwords match</p>}
                <button className="btn btn-success" style={{ justifyContent: "center", padding: "13px 0", fontSize: 14, width: "100%" }}
                  onClick={handleAcceptInvite} disabled={loading}>
                  {loading ? <LoadingDots /> : "Create Account & Join"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ═══════════ RESET PASSWORD (from email link) ═══════════ */}
        {(mode === "reset" || resetToken) && (
          <div className="card animate-fadeIn" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18, background: "rgba(9,9,11,0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Set new password</h2>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Choose a new password for your account</p>
            </div>
            <ErrorBanner />
            {success ? (
              <div style={{ padding: 20, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, textAlign: "center" }}>
                <div style={{ marginBottom: 10 }}><Icon name="check" size={36} color="#10B981" /></div>
                <p style={{ fontSize: 13, color: "#34D399", fontWeight: 600 }}>{success}</p>
                <button onClick={() => switchMode("signin")} className="btn btn-ghost" style={{ marginTop: 14, width: "100%", justifyContent: "center", fontSize: 13 }}>Sign in now</button>
              </div>
            ) : (
              <>
                <InputField label="New password" type="password" placeholder="Min 8 characters" icon="key"
                  value={newPass} onChange={e => { setNewPass(e.target.value); clear(); }} />
                <InputField label="Confirm password" type="password" placeholder="Re-enter password" icon="key"
                  value={confirmPass} onChange={e => { setConfirmPass(e.target.value); clear(); }}
                  onKeyDown={e => e.key === "Enter" && handleReset()} />
                <PasswordStrengthBar password={newPass} />
                <button className="btn btn-primary" style={{ justifyContent: "center", padding: "13px 0", fontSize: 14, width: "100%" }}
                  onClick={handleReset} disabled={loading}>
                  {loading ? <LoadingDots /> : "Reset Password"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ═══════════ FORGOT PASSWORD ═══════════ */}
        {mode === "forgot" && !resetToken && (
          <div className="card animate-fadeIn" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18, background: "rgba(9,9,11,0.7)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <button onClick={() => switchMode("signin")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontFamily: "'Sora',sans-serif", fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: 0 }}>
                <Icon name="arrowLeft" size={14} /> Back to sign in
              </button>
              <h2 style={{ fontSize: 21, fontWeight: 800, marginBottom: 3 }}>Reset your password</h2>
              <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Enter your email and we'll send a reset link</p>
            </div>

            <ErrorBanner />

            {success ? (
              <div style={{ padding: 20, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, textAlign: "center" }}>
                <div style={{ marginBottom: 10 }}><Icon name="mail" size={36} color="#10B981" /></div>
                <p style={{ fontSize: 13, color: "#34D399", fontWeight: 600, marginBottom: 4 }}>Check your inbox!</p>
                <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>{success}</p>
                <button onClick={() => switchMode("signin")} className="btn btn-ghost" style={{ marginTop: 14, width: "100%", justifyContent: "center", fontSize: 13 }}>Return to sign in</button>
              </div>
            ) : (
              <>
                <InputField label="Email address" type="email" placeholder="you@example.com" icon="mail"
                  value={forgotEmail} onChange={e => { setForgotEmail(e.target.value); clear(); }}
                  onKeyDown={e => e.key === "Enter" && handleForgot()} />
                <button className="btn btn-primary" style={{ justifyContent: "center", padding: "13px 0", fontSize: 14, width: "100%" }}
                  onClick={handleForgot} disabled={loading}>
                  {loading ? <LoadingDots /> : "Send Reset Link"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Feature pills */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { icon: "shield", text: "256-bit encryption", color: "#3B82F6" },
            { icon: "zap", text: "5 data sources", color: "#F59E0B" },
            { icon: "sparkle", text: "AI-powered", color: "#10B981" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, backdropFilter: "blur(10px)" }}>
              <Icon name={f.icon} size={11} color={f.color} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{f.text}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default AuthPage;
