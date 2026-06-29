/**
 * Xero Month End Closer — single-file React app.
 *
 * Step state machine (App.step):
 *   0 Connect  — OAuth link to Xero
 *   1 Learn    — fetch Xero data, build org profile with AI
 *   2 Setup    — pick month/year, generate AI checklist
 *   3 Review   — upload CSV, categorise, handle bills/journals/reports
 *   4 Push     — post bank transactions to Xero as Spend/Receive Money
 *   5 Done     — completion confirmation
 *
 * Amount convention: `amount` is always stored as Math.abs(). Direction is
 * encoded by `type`: ACCPAY = money out (expense), ACCREC = money in (receipt).
 */
import React, { useState, useEffect, useRef } from 'react';

const RAW_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '');
const IS_NGROK_API = /ngrok-free\.app$/i.test(API_BASE_URL);

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function apiFetch(path, options) {
  const headers = new Headers(options?.headers || {});
  if (IS_NGROK_API) {
    headers.set('ngrok-skip-browser-warning', '1');
  }
  return fetch(apiUrl(path), { ...options, headers });
}

function extractErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return error.message || error.error || '';
}

function getUserFacingErrorMessage(error, fallback = 'Something took a little longer than expected. Please try again in a moment.') {
  const rawMessage = extractErrorMessage(error);
  const message = String(rawMessage || '').trim();

  if (/status code 429|too many requests|rate limit/i.test(message)) {
    return 'Things are a little busy right now. Please wait a moment and try again.';
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'We could not reach the service just now. Please check the connection and try again.';
  }
  if (!message) return fallback;
  return message;
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)', fontFamily: "'Inter', sans-serif" },
  header: { background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 8px rgba(0,0,0,0.04)' },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoIcon: { width: 36, height: 36, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15 },
  logoText: { fontSize: 17, fontWeight: 700, color: '#1e1b4b' },
  main: { maxWidth: 920, margin: '0 auto', padding: '36px 24px 60px' },
  card: { background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 24px rgba(99,102,241,0.05)', marginBottom: 20 },
  h1: { fontSize: 26, fontWeight: 700, color: '#1e1b4b', margin: '0 0 8px' },
  h2: { fontSize: 20, fontWeight: 700, color: '#1e1b4b', margin: '0 0 14px' },
  h3: { fontSize: 15, fontWeight: 600, color: '#374151', margin: '0 0 10px' },
  p:  { fontSize: 14, color: '#6b7280', margin: '0 0 8px', lineHeight: 1.65 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, lineHeight: 1 },
  btnPrimary:   { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' },
  btnSecondary: { background: '#f3f4f6', color: '#374151' },
  btnDanger:    { background: '#fef2f2', color: '#dc2626' },
  btnSuccess:   { background: '#f0fdf4', color: '#16a34a' },
  btnGreen:     { background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff' },
  input:  { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' },
  select: { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, background: '#fff', fontFamily: 'inherit', cursor: 'pointer' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 },
  pillBlue:   { background: '#eff6ff', color: '#1d4ed8' },
  pillGreen:  { background: '#f0fdf4', color: '#16a34a' },
  pillRed:    { background: '#fef2f2', color: '#dc2626' },
  pillYellow: { background: '#fefce8', color: '#ca8a04' },
  pillPurple: { background: '#f5f3ff', color: '#7c3aed' },
  pillGray:   { background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb' },
  divider: { border: 'none', borderTop: '1px solid #f3f4f6', margin: '20px 0' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 },
  alert:       { padding: '12px 16px', borderRadius: 10, fontSize: 14, marginBottom: 16, lineHeight: 1.5 },
  alertRed:    { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
  alertGreen:  { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
  alertBlue:   { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  alertYellow: { background: '#fefce8', color: '#92400e', border: '1px solid #fde68a' },
  label: { fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 5, display: 'block', letterSpacing: '0.02em', textTransform: 'uppercase' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
  statCard: { background: '#f8faff', borderRadius: 12, padding: '18px 20px', textAlign: 'center', border: '1px solid #e5e7eb' },
  statNum: { fontSize: 28, fontWeight: 700, color: '#6366f1' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 3 },
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
// Maps checklist step categories to icons/pill colours. Categories are the
// fixed skeleton types the AI may return (see backend/services/ai.js generateChecklist).
const CAT_ICONS  = { bank: '🏦', payables: '📤', receivables: '📥', journals: '📓', reports: '📊', reconcile: '✅', review: '👁' };
const CAT_COLORS = {
  bank: S.pillBlue, bank_upload: S.pillBlue,
  payables: S.pillRed, approve_bills: S.pillRed,
  receivables: S.pillGreen,
  journals: S.pillPurple, depreciation: S.pillPurple, accruals: S.pillPurple,
  recurring_bills: S.pillYellow,
  duplicates: S.pillRed,
  reports: S.pillGray, reconcile: S.pillYellow, review: S.pillGray,
  other: S.pillGray
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Spinner({ size = 20, color = '#6366f1' }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${color}33`, borderTop: `2px solid ${color}`, borderRadius: '50%' }} className="spinning" />
  );
}

// `animated` uses the CSS class "progress-animated" (defined in index.css) which
// plays a shimmer keyframe — used during long-running AI/fetch operations.
function ProgressBar({ pct, animated = false, height = 8 }) {
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 99, height, overflow: 'hidden' }}>
      {animated
        ? <div className="progress-animated" style={{ width: `${pct || 0}%` }} />
        : <div style={{ height: '100%', width: `${pct || 0}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 99, transition: 'width 0.4s ease' }} />
      }
    </div>
  );
}

function TenantSwitcher({ tenants, tenantId, onChange, disabled = false }) {
  const activeTenant = tenants.find(t => t.tenant_id === tenantId);
  const tenantCount = tenants.length;

  return (
    <div className="tenant-switcher">
      <div className="tenant-switcher-copy">
        {/* <div className="tenant-switcher-eyebrow">Connected Xero org</div> */}
        <div className="tenant-switcher-title">
          {tenantCount > 1 ? 'Switch organisation' : (activeTenant?.tenant_name || 'Select organisation')}
        </div>
        <div className="tenant-switcher-meta">
          
        </div>
      </div>
      <div className="tenant-switcher-select-wrap">
        <select
          value={tenantId || ''}
          onChange={onChange}
          disabled={disabled}
          className="tenant-switcher-select"
          aria-label="Select connected Xero organisation"
        >
          {tenants.map(t => (
            <option key={t.tenant_id} value={t.tenant_id}>
              {t.tenant_name}
            </option>
          ))}
        </select>
        <span className="tenant-switcher-chevron" aria-hidden="true">▾</span>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep]               = useState(0);
  const [tenants, setTenants]         = useState([]);
  const [tenant, setTenant]           = useState(null);
  const [profile, setProfile]         = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [session, setSession]         = useState(null);
  const [closeMonth, setCloseMonth]   = useState('');
  const [closeYear, setCloseYear]     = useState('');
  const [checklist, setChecklist]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [pushBankId, setPushBankId]   = useState('');
  // Flag passed to ReviewStep when returning from PushStep (step 4 → 3).
  // ReviewStep reads this on mount (via ref) to restore checklist tab + banner.
  const [returnFromPush, setReturnFromPush] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [learnedAt, setLearnedAt]     = useState(null);
  const [switchingTenant, setSwitchingTenant] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('xero_connected')) {
      window.history.replaceState({}, '', '/');
      loadTenants();
    } else if (params.get('xero_error')) {
      setError(getUserFacingErrorMessage('Xero error: ' + params.get('xero_error')));
      window.history.replaceState({}, '', '/');
    } else {
      loadTenants();
    }
  }, []);

  async function loadTenantContext(nextTenant) {
    setSwitchingTenant(true);
    setTenant(nextTenant);
    setProfile(null);
    setBankAccounts([]);
    setLearnedAt(null);
    setSession(null);
    setChecklist([]);
    setTransactions([]);
    setPushBankId('');
    setCloseMonth('');
    setCloseYear('');
    setReturnFromPush(false);
    setError('');

    try {
      const lr = await apiFetch(`/learn/${nextTenant.tenant_id}`);
      const ld = await lr.json();
      if (ld.learned) {
        setProfile(ld.profile);
        setBankAccounts(ld.bankAccounts || []);
        setLearnedAt(ld.learnedAt);
      }
      setStep(1);
    } finally {
      setSwitchingTenant(false);
    }
  }

  async function loadTenants() {
    try {
      const r = await apiFetch('/auth/tenants');
      const tenantRows = await r.json();
      setTenants(tenantRows);
      if (tenantRows.length) {
        await loadTenantContext(tenantRows[0]);
      }
    } catch (e) { /* not yet connected */ }
  }

  async function handleTenantChange(event) {
    const nextTenant = tenants.find(t => t.tenant_id === event.target.value);
    if (!nextTenant || nextTenant.tenant_id === tenant?.tenant_id) return;

    try {
      await loadTenantContext(nextTenant);
    } catch (e) {
      setError(getUserFacingErrorMessage(e));
    }
  }

  async function connectXero() {
    setLoading(true); setError('');
    try {
      const r = await apiFetch('/auth/xero');
      const { url } = await r.json();
      window.location.href = url;
    } catch (e) { setError(getUserFacingErrorMessage(e)); setLoading(false); }
  }

  async function disconnect() {
    if (!tenant) return;
    await apiFetch(`/auth/disconnect/${tenant.tenant_id}`, { method: 'DELETE' });
    setTenants([]); setTenant(null); setProfile(null); setStep(0);
    setSession(null); setTransactions([]); setChecklist([]);
  }

  const stepLabels = ['Connect', 'Learn', 'Setup', 'Review', 'Push', 'Done'];

  return (
    <div style={S.page}>
      {/* ─── Header ─── */}
      <header style={S.header} className="header-pad">
        <div style={S.logo}>
          <div style={S.logoIcon}>ME</div>
          <span style={S.logoText}>Xero Month End Closer</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {tenant && (
  <button
    onClick={disconnect}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: '8px 14px',
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1,
      color: '#dc2626',
      background: 'linear-gradient(180deg, #ffffff 0%, #fff7f7 100%)',
      border: '1px solid #fecaca',
      borderRadius: 10,
      boxShadow: '0 6px 14px rgba(220, 38, 38, 0.08)',
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'linear-gradient(180deg, #fef2f2 0%, #fee2e2 100%)';
      e.currentTarget.style.borderColor = '#fca5a5';
      e.currentTarget.style.transform = 'translateY(-1px)';
      e.currentTarget.style.boxShadow = '0 10px 20px rgba(220, 38, 38, 0.14)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'linear-gradient(180deg, #ffffff 0%, #fff7f7 100%)';
      e.currentTarget.style.borderColor = '#fecaca';
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 6px 14px rgba(220, 38, 38, 0.08)';
    }}
  >
    <span style={{ fontSize: 13 }}>⛔</span>
    Disconnect
  </button>
)}
        </div>
      </header>

      <main style={S.main} className="main-pad">
        {error && (
          <div style={{ ...S.alert, ...S.alertRed }} className="fade-in">⚠ {error}</div>
        )}

        {tenant && (
          <div className="tenant-bar fade-in">
            <div className="tenant-bar-badge">
              <span className="tenant-bar-dot" />
              Connected to Xero
            </div>
            <TenantSwitcher
              tenants={tenants}
              tenantId={tenant.tenant_id}
              onChange={handleTenantChange}
              disabled={switchingTenant}
            />
            {switchingTenant && (
              <div className="tenant-bar-status">
                <Spinner size={14} color="#1d4ed8" /> Switching organisation…
              </div>
            )}
          </div>
        )}

        {/* ─── Step Progress Bar ─── */}
        {step > 0 && (
          <div style={{ ...S.card, padding: '18px 28px', marginBottom: 28 }} className="fade-in">
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              {/* background track */}
              <div style={{ position: 'absolute', top: 17, left: '5%', right: '5%', height: 2, background: '#e5e7eb', zIndex: 0 }} />
              {/* active track */}
              <div style={{ position: 'absolute', top: 17, left: '5%', height: 2, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', zIndex: 1, width: `${Math.max(0, (step / (stepLabels.length - 1)) * 90)}%`, transition: 'width 0.4s ease' }} />
              {stepLabels.map((label, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: i < step ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : i === step ? '#ede9fe' : '#f9fafb',
                    border: `2px solid ${i <= step ? '#6366f1' : '#e5e7eb'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    color: i < step ? '#fff' : i === step ? '#6366f1' : '#9ca3af',
                    transition: 'all 0.3s ease',
                    boxShadow: i === step ? '0 0 0 4px rgba(99,102,241,0.15)' : 'none',
                  }}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <div className="step-label-text" style={{ fontSize: 11, fontWeight: i === step ? 700 : 400, color: i <= step ? '#6366f1' : '#9ca3af', marginTop: 6, whiteSpace: 'nowrap' }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 0 && <ConnectStep onConnect={connectXero} loading={loading} />}
        {step === 1 && <LearnStep tenant={tenant} cachedProfile={profile} cachedLearnedAt={learnedAt} onLearned={(p, ba, la) => { setProfile(p); setBankAccounts(ba); setLearnedAt(la); setStep(2); }} onProceed={() => setStep(2)} />}
        {step === 2 && <SetupStep tenant={tenant} profile={profile} learnedAt={learnedAt} onSession={(s, c, m, y) => { setSession(s); setChecklist(c); setCloseMonth(m); setCloseYear(y); setStep(3); }} onRelearn={() => setStep(1)} />}
        {step === 3 && <ReviewStep session={session} checklist={checklist} profile={profile} bankAccounts={bankAccounts} tenant={tenant} transactions={transactions} setTransactions={setTransactions} closeMonth={closeMonth} closeYear={closeYear} onProceed={(bankId) => { setPushBankId(bankId || ''); setStep(4); }} onComplete={async () => { if (session?.id) { try { await apiFetch(`/close/session/${session.id}/complete`, { method: 'POST' }); } catch {} } setStep(5); }} returnFromPush={returnFromPush} onReturnAck={() => setReturnFromPush(false)} />}
        {step === 4 && <PushStep session={session} transactions={transactions} bankAccounts={bankAccounts} initialBankId={pushBankId} onDone={() => { setReturnFromPush(true); setStep(3); }} />}
        {step === 5 && <DoneStep session={session} onNewMonth={() => { setSession(null); setChecklist([]); setTransactions([]); setStep(2); }} />}
      </main>
    </div>
  );
}

// ─── Step 0: Connect ──────────────────────────────────────────────────────────
function ConnectStep({ onConnect, loading }) {
  return (
    <div style={{ ...S.card, maxWidth: 480, margin: '48px auto', textAlign: 'center', padding: '48px 40px' }} className="fade-in">
      <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 32 }}>
        📅
      </div>
      <h1 style={{ ...S.h1, textAlign: 'center', marginBottom: 10 }}>Xero Month End Closer</h1>
      <p style={{ ...S.p, textAlign: 'center', marginBottom: 32, fontSize: 15 }}>
        Connect your Xero organisation to get a personalised, AI-guided month-end close.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', marginBottom: 32, background: '#f8faff', padding: '18px 20px', borderRadius: 12, border: '1px solid #e0e7ff' }}>
        {[
          ['📡', 'Step 1', 'Connect your Xero organisation securely via OAuth'],
          ['🧠', 'Step 2', 'AI learns your chart of accounts, suppliers & patterns'],
          ['📋', 'Step 3', 'Follow a personalised checklist & upload bank statements'],
          ['✅', 'Step 4', 'Push bills + bank reconciliation back to Xero automatically'],
        ].map(([icon, label, desc]) => (
          <div key={label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, lineHeight: '22px', flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>{label}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn-primary"
        style={{ ...S.btn, ...S.btnPrimary, width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: 15 }}
        onClick={onConnect}
        disabled={loading}
      >
        {loading ? <><Spinner size={18} color="#fff" /> Redirecting…</> : '🔗 Connect to Xero'}
      </button>
    </div>
  );
}

// ─── Step 1: Learn ────────────────────────────────────────────────────────────
function LearnStep({ tenant, cachedProfile, cachedLearnedAt, onLearned, onProceed }) {
  const [stage, setStage]           = useState(cachedProfile ? 'already_learned' : 'permission');
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError]           = useState('');
  const [months, setMonths]         = useState(6); // 3 | 6 | 9

  const progressSteps = [
    'Connecting to Xero…',
    'Fetching chart of accounts…',
    `Reading ${months} months of bank transactions…`,
    'Fetching bills, invoices & journals…',
    'AI is analysing your close patterns…',
    'Finalising org profile…',
  ];

  async function startLearn() {
    setStage('learning');
    const stepTimer = setInterval(() => {
      setProgressStep(p => Math.min(p + 1, progressSteps.length - 2));
    }, 2800);
    try {
      const r = await apiFetch(`/learn/${tenant.tenant_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months })
      });
      const data = await r.json();
      clearInterval(stepTimer);
      if (!r.ok) throw new Error(getUserFacingErrorMessage(data?.error));
      setProgressStep(progressSteps.length - 1);
      await new Promise(res => setTimeout(res, 600));
      onLearned(data.profile, data.bankAccounts || [], Date.now());
    } catch (e) {
      clearInterval(stepTimer);
      setError(getUserFacingErrorMessage(e));
      setStage('already_learned');
      setProgressStep(0);
    }
  }

  // Month selector pill group
  const MonthPicker = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Look back:</span>
      {[3, 6, 9].map(m => (
        <button key={m}
          onClick={() => setMonths(m)}
          style={{
            ...S.btn, padding: '4px 12px', fontSize: 12, borderRadius: 8,
            background: months === m ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#f3f4f6',
            color: months === m ? '#fff' : '#374151',
            fontWeight: months === m ? 700 : 500,
            border: 'none', cursor: 'pointer',
          }}>
          {m}mo
        </button>
      ))}
    </div>
  );

  if (stage === 'already_learned') return (
    <div style={{ ...S.card, maxWidth: 580, margin: '0 auto' }} className="fade-in">
      <div style={{ fontSize: 38, marginBottom: 14 }}>🧠</div>
      <h2 style={S.h2}>Books Already Learned</h2>

      {/* Last analysed banner — Re-learn inline */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
        <span style={{ fontSize: 14, color: '#15803d' }}>
          ✓ <strong>{tenant?.tenant_name}</strong> last analysed{' '}
          <strong>{cachedLearnedAt ? new Date(cachedLearnedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'previously'}</strong>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <MonthPicker />
          <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '5px 14px', fontSize: 13 }}
            onClick={startLearn}>
            🔄 Re-learn
          </button>
        </div>
      </div>

      <p style={{ ...S.p, fontSize: 14, marginBottom: 20 }}>
        Your AI profile is up to date. Proceed to set up your close, or re-learn to pick up recent changes.
      </p>

      {/* Clickable stat cards with full detail */}
      {cachedProfile && <ProfileStatCards profile={cachedProfile} />}

      <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '13px 28px', fontSize: 15 }} onClick={onProceed}>
        Proceed to Month-End Setup →
      </button>
      {error && <div style={{ ...S.alert, ...S.alertRed, marginTop: 16 }}>{error}</div>}
    </div>
  );

  if (stage === 'permission') return (
    <div style={{ ...S.card, maxWidth: 580, margin: '0 auto' }} className="fade-in">
      <div style={{ fontSize: 38, marginBottom: 14 }}>🧠</div>
      <h2 style={S.h2}>Permission to Learn from Your Books</h2>
      <p style={{ ...S.p, fontSize: 15, marginBottom: 20 }}>
        To create a personalised close process for <strong>{tenant?.tenant_name}</strong>, we need to read your Xero data.
      </p>
      <div style={{ marginBottom: 20, border: '1px solid #f3f4f6', borderRadius: 10, overflow: 'hidden' }}>
        {[
          ['📊', 'Chart of accounts', 'To understand your account structure'],
          ['💳', 'Last 6 months of bank transactions', 'To learn income & expense patterns'],
          ['📄', 'Bills and invoices', 'To understand your supplier & customer base'],
          ['📓', 'Manual journals', 'To identify recurring accruals and adjustments'],
        ].map(([icon, title, sub], i, arr) => (
          <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 16px', background: i % 2 === 0 ? '#fafbff' : '#fff', borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e1b4b' }}>{title}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{sub}</div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#6366f1', fontWeight: 700, fontSize: 14 }}>✓</span>
          </div>
        ))}
      </div>
      <div style={{ ...S.alert, ...S.alertBlue, marginBottom: 20, fontSize: 13 }}>
        🔒 All data stays on your machine. Nothing is stored in the cloud or shared with third parties.
      </div>

      {/* Look-back period selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>How far back should we look?</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>More history = better AI patterns, but takes slightly longer</div>
        </div>
        <MonthPicker />
      </div>

      {error && <div style={{ ...S.alert, ...S.alertRed }}>{error}</div>}
      <button
        className="btn-primary"
        style={{ ...S.btn, ...S.btnPrimary, width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: 15 }}
        onClick={startLearn}
      >
        ✅ I Give Permission — Start Learning ({months} months)
      </button>
    </div>
  );

  return (
    <div style={{ ...S.card, maxWidth: 500, margin: '0 auto', textAlign: 'center', padding: '48px 40px' }} className="fade-in">
      <div style={{ fontSize: 52, marginBottom: 20 }} className="spinning">⚙️</div>
      <h2 style={{ ...S.h2, textAlign: 'center', marginBottom: 6 }}>Learning Your Books…</h2>
      <p style={{ ...S.p, textAlign: 'center', marginBottom: 28, minHeight: 22 }}>
        {progressSteps[progressStep]}
      </p>
      <ProgressBar animated pct={((progressStep + 1) / progressSteps.length) * 100} height={8} />
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {progressSteps.slice(0, progressStep + 1).map((s, i) => (
          <div key={i} style={{ fontSize: 12, color: i === progressStep ? '#6366f1' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <span>{i < progressStep ? '✓' : <Spinner size={10} color="#6366f1" />}</span> {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Profile Stat Cards ───────────────────────────────────────────────────────
function ProfileStatCards({ profile }) {
  const [open, setOpen] = useState(null);
  const toggle = key => setOpen(prev => prev === key ? null : key);

  const cards = [
    {
      key: 'suppliers', num: profile.topSuppliers?.length || 0, label: 'Known Suppliers', icon: '🏢', color: '#6366f1', bg: '#f5f3ff',
      content: (profile.topSuppliers || []).map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
          <span style={{ color: '#6366f1', fontWeight: 700, flexShrink: 0, width: 20 }}>{i + 1}.</span>
          <span style={{ color: '#374151' }}>{s}</span>
        </div>
      ))
    },
    {
      key: 'customers', num: profile.topCustomers?.length || 0, label: 'Known Customers', icon: '👥', color: '#0891b2', bg: '#ecfeff',
      content: (profile.topCustomers || []).length > 0
        ? (profile.topCustomers || []).map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
              <span style={{ color: '#0891b2', fontWeight: 700, flexShrink: 0, width: 20 }}>{i + 1}.</span>
              <span style={{ color: '#374151' }}>{c}</span>
            </div>
          ))
        : [<div key="none" style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>No customers identified — this org may not have ACCREC invoices in the period.</div>]
    },
    {
      key: 'accounts', num: profile.commonExpenseAccounts?.length || 0, label: 'Expense Accounts', icon: '📒', color: '#7c3aed', bg: '#f5f3ff',
      content: (profile.commonExpenseAccounts || []).map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
          <span style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 5, padding: '1px 7px', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{a.code}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#1e1b4b' }}>{a.name}</div>
            {a.typical_payees?.length > 0 && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{a.typical_payees.slice(0, 4).join(' · ')}</div>}
          </div>
        </div>
      ))
    },
    {
      key: 'tasks', num: profile.regularMonthEndTasks?.length || 0, label: 'Close Tasks', icon: '✅', color: '#059669', bg: '#f0fdf4',
      content: (profile.regularMonthEndTasks || []).map((t, i) => {
        const pc = t.priority === 'high' ? { bg: '#fef2f2', text: '#dc2626' } : t.priority === 'medium' ? { bg: '#fefce8', text: '#ca8a04' } : { bg: '#f9fafb', text: '#6b7280' };
        return (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
            <span style={{ background: pc.bg, color: pc.text, borderRadius: 5, padding: '1px 7px', fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>{t.priority}</span>
            <div>
              <div style={{ fontWeight: 600, color: '#1e1b4b' }}>{t.task}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 1.5 }}>{t.detail}</div>
            </div>
          </div>
        );
      })
    }
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="grid4-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        {cards.map(c => (
          <div key={c.key} className="stat-card-click"
            onClick={() => toggle(c.key)}
            style={{
              background: open === c.key ? c.bg : '#f8faff',
              border: `1px solid ${open === c.key ? c.color + '55' : '#e5e7eb'}`,
              borderRadius: 12, padding: '16px 20px', textAlign: 'center',
              userSelect: 'none',
            }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{c.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: c.color }}>{c.num}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{c.label}</div>
            <div style={{ fontSize: 11, color: c.color, marginTop: 8, fontWeight: 500 }}>
              {open === c.key ? '▲ Collapse' : '▼ Click to view'}
            </div>
          </div>
        ))}
      </div>

      {cards.map(c => open === c.key && (
        <div key={c.key} style={{ border: `1px solid ${c.color}33`, borderRadius: 12, marginTop: 8, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }} className="fade-in">
          <div style={{ background: c.bg, padding: '10px 16px', borderBottom: `1px solid ${c.color}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.icon} {c.label}</span>
            <button className="btn-secondary" onClick={e => { e.stopPropagation(); setOpen(null); }} style={{ ...S.btn, ...S.btnSecondary, padding: '4px 12px', fontSize: 12 }}>✕ Close</button>
          </div>
          <div style={{ padding: '4px 16px 12px', maxHeight: 320, overflowY: 'auto' }}>
            {c.content}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insights }) {
  if (!insights) return null;
  if (typeof insights === 'string') return (
    <div style={{ ...S.alert, ...S.alertBlue, marginBottom: 20 }}>
      💡 <strong>AI Insight:</strong> {insights}
    </div>
  );
  const { businessSummary, keyRisks = [], watchItems = [], missingControls = [] } = insights;
  return (
    <div style={{ border: '1px solid #c7d2fe', borderRadius: 14, overflow: 'hidden', marginBottom: 24, boxShadow: '0 2px 12px rgba(99,102,241,0.07)' }}>
      <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🧠</span>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>AI Business Insights</span>
      </div>
      <div style={{ background: '#fafbff', padding: '14px 20px', borderBottom: '1px solid #e0e7ff' }}>
        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{businessSummary}</div>
      </div>
      <div className="insight-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#fff' }}>
        {[
          { icon: '⚠️', label: 'Key Risks',       color: '#dc2626', items: keyRisks },
          { icon: '👁',  label: 'Watch Each Month', color: '#ca8a04', items: watchItems },
          { icon: '🔧', label: 'Gaps / Controls',  color: '#7c3aed', items: missingControls },
        ].map((col, ci) => (
          <div key={ci} style={{ padding: '14px 16px', borderRight: ci < 2 ? '1px solid #f3f4f6' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>{col.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.label}</span>
            </div>
            {col.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ color: col.color, fontWeight: 700, fontSize: 11, flexShrink: 0, marginTop: 1 }}>•</span>
                <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.55 }}>{item}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Setup ────────────────────────────────────────────────────────────
function SetupStep({ tenant, profile, learnedAt, onSession, onRelearn }) {
  const curMonth = new Date().getMonth();
  const [month, setMonth] = useState(MONTHS[curMonth === 0 ? 11 : curMonth - 1]);
  const [year, setYear]   = useState(curMonth === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear());
  const [loading, setLoading]   = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError]       = useState('');
  const [stage, setStage]       = useState('pick'); // pick | configure
  const [checklist, setChecklist] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [stepToggles, setStepToggles] = useState({});

  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2];

  const genSteps = [
    'Fetching bills & journals for ' + month + ' ' + year + '…',
    'Analysing your org profile…',
    'AI is building your personalised checklist…',
    'Finalising steps…',
  ];

  async function generate() {
    setLoading(true); setError(''); setLoadingStep(0);
    const timer = setInterval(() => setLoadingStep(p => Math.min(p + 1, genSteps.length - 2)), 3000);
    try {
      const r = await apiFetch(`/close/${tenant.tenant_id}/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year })
      });
      const data = await r.json();
      clearInterval(timer);
      if (!r.ok) throw new Error(getUserFacingErrorMessage(data?.error));
      if (!data.checklist?.length) throw new Error(getUserFacingErrorMessage('AI returned 0 steps. Please try again.'));
      const normalised = data.checklist.map((c, i) => ({ ...c, id: c.id || `step_${i + 1}` }));
      const toggles = {};
      normalised.forEach(c => { toggles[c.id] = true; });
      setChecklist(normalised);
      setSessionId(data.sessionId);
      setStepToggles(toggles);
      setLoadingStep(genSteps.length - 1);
      await new Promise(r => setTimeout(r, 300));
      setStage('configure');
    } catch (e) { clearInterval(timer); setError(getUserFacingErrorMessage(e)); }
    setLoading(false);
  }

  async function beginClose() {
    const filtered = checklist.filter(c => stepToggles[c.id] !== false);
    const initialChecklistState = filtered.map(item => ({ ...item, done: false }));
    try {
      await apiFetch(`/close/session/${sessionId}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: initialChecklistState })
      });
    } catch {}
    onSession({ id: sessionId, checklistState: initialChecklistState }, filtered, month, year);
  }

  const enabledCount = checklist.filter(c => stepToggles[c.id] !== false).length;
  const skippedCount = checklist.length - enabledCount;

  // ── Configure view ──
  if (stage === 'configure') return (
    <div className="fade-in">
      <div style={{ ...S.card, paddingBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 style={{ ...S.h2, marginBottom: 4 }}>🗂 Configure Your Close Steps</h2>
            <p style={{ ...S.p, margin: 0 }}>
              AI generated <strong>{checklist.length} steps</strong> for <strong>{month} {year}</strong>. Toggle off any you want to skip.
            </p>
          </div>
          <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, fontSize: 13, flexShrink: 0 }} onClick={() => setStage('pick')}>← Back</button>
        </div>

        {/* AI disclaimer */}
        <div style={{ ...S.alert, ...S.alertYellow, marginBottom: 16, fontSize: 12 }}>
          ⚠️ <strong>AI-generated checklist.</strong> Steps and time estimates are based on your Xero data but may not be perfect — please review each step before starting.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...S.pill, ...S.pillGreen }}>{enabledCount} included</span>
          {skippedCount > 0 && <span style={{ ...S.pill, ...S.pillGray }}>{skippedCount} skipped</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '5px 12px', fontSize: 12 }}
              onClick={() => { const t = {}; checklist.forEach(c => t[c.id] = true); setStepToggles(t); }}>
              Enable All
            </button>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '5px 12px', fontSize: 12 }}
              onClick={() => { const t = {}; checklist.forEach(c => t[c.id] = false); setStepToggles(t); }}>
              Skip All
            </button>
          </div>
        </div>


        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 0, paddingBottom: 8 }}>
          {checklist.map((item, i) => {
            const enabled = stepToggles[item.id] !== false;
            return (
              <div key={item.id}
                className={enabled ? 'checklist-item' : ''}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                  border: `1px solid ${enabled ? '#e0e7ff' : '#f3f4f6'}`,
                  borderRadius: 10,
                  background: enabled ? '#fafbff' : '#fafafa',
                  opacity: enabled ? 1 : 0.5,
                  transition: 'all 0.15s', cursor: 'pointer',
                }}
                onClick={() => setStepToggles(prev => ({ ...prev, [item.id]: !enabled }))}>
                {/* Toggle switch */}
                <div style={{ width: 44, height: 24, borderRadius: 12, flexShrink: 0, background: enabled ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 3, left: enabled ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                </div>
                {/* Step number */}
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: enabled ? '#ede9fe' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: enabled ? '#7c3aed' : '#9ca3af', flexShrink: 0 }}>
                  {i + 1}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: enabled ? '#1e1b4b' : '#9ca3af' }}>
                      {CAT_ICONS[item.category] || '•'} {item.title}
                    </span>
                    <span style={{ ...S.pill, ...(CAT_COLORS[item.category] || S.pillGray), padding: '2px 8px', fontSize: 11 }}>{item.category}</span>
                    {item.requiresCsvUpload && <span style={{ ...S.pill, ...S.pillBlue, fontSize: 11 }}>📤 CSV</span>}
                    {item.requiresXeroPush  && <span style={{ ...S.pill, ...S.pillGreen, fontSize: 11 }}>⬆ Xero</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                </div>
              </div>
            );
          })}
        </div>

        {error && <div style={{ ...S.alert, ...S.alertRed, margin: '16px 0 0' }}>{error}</div>}

        {/* Sticky footer */}
        <div className="sticky-footer">
          <button
            className="btn-green"
            style={{ ...S.btn, ...S.btnGreen, padding: '13px 28px', fontSize: 15, opacity: enabledCount === 0 ? 0.4 : 1 }}
            onClick={beginClose}
            disabled={enabledCount === 0}
          >
            Begin {month} {year} Close with {enabledCount} Step{enabledCount !== 1 ? 's' : ''} →
          </button>
          {skippedCount > 0 && (
            <span style={{ fontSize: 13, color: '#9ca3af' }}>{skippedCount} step{skippedCount !== 1 ? 's' : ''} will be skipped</span>
          )}
        </div>
      </div>
    </div>
  );

  // ── Pick month view ──
  return (
    <div className="fade-in">
      <div style={S.card}>
        <h2 style={S.h2}>📅 Start Month-End Close</h2>
        <p style={{ ...S.p, marginBottom: 20 }}>
          AI has learned <strong>{profile?.orgName || tenant?.tenant_name}</strong>'s close process.
          {learnedAt && <span style={{ color: '#9ca3af', fontSize: 13 }}> · Last updated {new Date(learnedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
        </p>

        {profile?.closingInsights && <InsightCard insights={profile.closingInsights} />}

        <div style={{ marginBottom: 24 }}>
          <div className="grid2-resp" style={{ ...S.grid2, maxWidth: 380 }}>
            <div>
              <label style={S.label}>Month</label>
              <select style={S.select} value={month} onChange={e => setMonth(e.target.value)}>
                {MONTHS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Year</label>
              <select style={S.select} value={year} onChange={e => setYear(Number(e.target.value))}>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {profile && <ProfileStatCards profile={profile} />}

        {error && <div style={{ ...S.alert, ...S.alertRed }}>{error}</div>}

        {loading ? (
          <div style={{ border: '1px solid #e0e7ff', borderRadius: 12, padding: '20px 24px', background: '#fafbff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Spinner size={20} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#6366f1' }}>Preparing your close process…</span>
            </div>
            <ProgressBar animated pct={((loadingStep + 1) / genSteps.length) * 100} height={6} />
            <div style={{ marginTop: 12 }}>
              {genSteps.slice(0, loadingStep + 1).map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: i === loadingStep ? '#6366f1' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  {i < loadingStep ? <span style={{ color: '#16a34a' }}>✓</span> : <Spinner size={10} />} {s}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              style={{ ...S.btn, ...S.btnPrimary, padding: '12px 24px', fontSize: 15 }}
              onClick={generate}
            >
              🚀 Start the process of book closing for {month} {year}
            </button>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary }} onClick={onRelearn}>
              🔄 Re-learn Books
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Review ───────────────────────────────────────────────────────────
function ReviewStep({ session, checklist, _profile, bankAccounts, tenant, transactions, setTransactions, closeMonth, closeYear, onProceed, onComplete, returnFromPush, onReturnAck }) {
  const sessionId = session?.id || session;
  const [activeTab, setActiveTab]   = useState('checklist');
  const [checkItems, setCheckItems] = useState(() => {
    if (Array.isArray(session?.checklistState) && session.checklistState.length) return session.checklistState;
    return checklist.map(c => ({ ...c, done: !!c.done }));
  });
  const [uploadingByBank, setUploadingByBank] = useState({});
  const [uploadError, setUploadError] = useState('');
  const [stepBankMap, setStepBankMap] = useState({});
  const [selectedBank, setSelectedBank] = useState('');
  const [expandedTxn, setExpandedTxn]  = useState(null);
  const [accounts, setAccounts]     = useState([]);
  // activeStepId = the checklist item the user should work on right now
  const [activeStepId, setActiveStepId] = useState(() => checklist[0]?.id || null);
  const [pushJustDone, setPushJustDone] = useState(false);
  const pushCardRef = useRef();

  useEffect(() => {
    if (tenant) apiFetch(`/accounts/${tenant.tenant_id}`).then(r => r.json()).then(setAccounts).catch(() => {});
  }, [tenant]);

  // When returning from push: switch to checklist tab, find first undone step, show banner
  const returnFromPushRef = useRef(returnFromPush);
  returnFromPushRef.current = returnFromPush;
  useEffect(() => {
    if (returnFromPushRef.current) {
      setActiveTab('checklist');
      setPushJustDone(true);
      setActiveStepId(prev => {
        const firstUndone = checkItems.find(c => !c.done);
        return firstUndone?.id || prev;
      });
      onReturnAck();
    }
  }, []); // runs once on mount — returnFromPush is captured via ref

  // Advance activeStepId to next undone step whenever checkItems changes
  function advanceActiveStep(updatedItems) {
    const firstUndone = updatedItems.find(c => !c.done);
    setActiveStepId(firstUndone?.id || null);
  }

  async function persistChecklist(nextItems) {
    if (!sessionId) return;
    try {
      await apiFetch(`/close/session/${sessionId}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: nextItems })
      });
    } catch {}
  }

  function toggleItem(i) {
    setCheckItems(prev => {
      const next = prev.map((c, j) => j === i ? { ...c, done: !c.done } : c);
      advanceActiveStep(next);
      persistChecklist(next);
      return next;
    });
  }

  const doneCount = checkItems.filter(c => c.done).length;

  async function uploadCsv(file, bankAccountId) {
    if (!file) return;
    if (!bankAccountId) { setUploadError('Please select a bank account before uploading.'); return; }
    setUploadingByBank(prev => ({ ...prev, [bankAccountId]: true })); setUploadError('');
    const fd = new FormData();
    fd.append('csv', file);
    fd.append('bankAccountId', bankAccountId);
    try {
      const r = await apiFetch(`/close/session/${sessionId}/upload-csv`, { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(getUserFacingErrorMessage(data?.error));
      setTransactions(prev => {
        const others = prev.filter(t => t.bank_account_id && t.bank_account_id !== bankAccountId);
        return [...others, ...data.transactions];
      });
    } catch (e) { setUploadError(getUserFacingErrorMessage(e)); }
    setUploadingByBank(prev => ({ ...prev, [bankAccountId]: false }));
  }

  async function updateTxn(id, patch) {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    await apiFetch(`/close/transaction/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  }

  function approveAll(includeDuplicates = false) {
    transactions
      .filter(t => t.user_status === 'pending' && (includeDuplicates || !t.is_duplicate))
      .forEach(t => updateTxn(t.id, { user_status: 'approved' }));
  }

  async function resolveDuplicate(txnId, action) {
    const r = await apiFetch(`/close/transaction/${txnId}/resolve-duplicate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(getUserFacingErrorMessage(data?.error));
    // Update local state: remove duplicate flag and set status
    setTransactions(prev => prev.map(t => {
      if (t.id !== txnId) return t;
      if (action === 'reject') return { ...t, user_status: 'rejected' };
      return { ...t, is_duplicate: 0, user_status: 'approved' };
    }));
    return data;
  }

  async function attachFile(txnId, file) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await apiFetch(`/close/transaction/${txnId}/attachment`, { method: 'POST', body: fd });
    const data = await r.json();
    if (r.ok) setTransactions(prev => prev.map(t => t.id === txnId ? { ...t, attachment_filename: data.filename } : t));
    return data;
  }

  async function removeAttachment(txnId) {
    await apiFetch(`/close/transaction/${txnId}/attachment`, { method: 'DELETE' });
    setTransactions(prev => prev.map(t => t.id === txnId ? { ...t, attachment_filename: null } : t));
  }

  const approved  = transactions.filter(t => t.user_status === 'approved').length;
  const pending   = transactions.filter(t => t.user_status === 'pending').length;
  const dupes     = transactions.filter(t => t.is_duplicate).length;
  const highConf  = transactions.filter(t => (t.ai_confidence || 0) >= 0.8).length;
  const pendingNonDupe = transactions.filter(t => !t.is_duplicate && t.user_status === 'pending').length;
  const pendingDupe    = transactions.filter(t =>  t.is_duplicate && t.user_status === 'pending').length;

  return (
    <div className="fade-in">
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ ...S.h2, marginBottom: 4 }}>📋 Month-End Close Checklist</h2>
            <p style={{ ...S.p, margin: 0 }}>{doneCount} of {checkItems.length} steps complete</p>
          </div>
          <span style={{ ...S.pill, ...(doneCount === checkItems.length ? S.pillGreen : S.pillPurple) }}>
            {doneCount === checkItems.length ? '✓ All Done' : `${checkItems.length - doneCount} remaining`}
          </span>
        </div>

        <ProgressBar pct={checkItems.length ? (doneCount / checkItems.length) * 100 : 0} height={8} />
        <div style={{ marginTop: 4, marginBottom: 20, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>
          {Math.round(checkItems.length ? (doneCount / checkItems.length) * 100 : 0)}% complete
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '2px solid #f3f4f6', paddingBottom: 0 }}>
          {[
            { id: 'checklist',     label: '📋 Checklist' },
            { id: 'transactions',  label: `💳 Transactions${transactions.length ? ` (${transactions.length})` : ''}` },
          ].map(tab => (
            <button key={tab.id}
              style={{ ...S.btn, padding: '8px 18px', fontSize: 13, borderRadius: '8px 8px 0 0', marginBottom: -2,
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? '#6366f1' : '#6b7280',
                fontWeight: activeTab === tab.id ? 700 : 500,
                borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
                border: 'none', cursor: 'pointer',
              }}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'checklist' && (
          <div>
            {/* Push-return success banner */}
            {pushJustDone && (
              <div style={{ ...S.alert, ...S.alertGreen, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }} className="fade-in">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>✅ Transactions pushed to Xero!</div>
                  <div style={{ fontSize: 13 }}>Now work through the remaining checklist steps below. Tick each one off as you complete it.</div>
                </div>
                <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '5px 12px', fontSize: 12, flexShrink: 0 }} onClick={() => setPushJustDone(false)}>✕</button>
              </div>
            )}
            {/* AI disclaimer */}
            <div style={{ ...S.alert, ...S.alertYellow, fontSize: 12, marginBottom: 16 }}>
              ⚠️ <strong>AI-assisted checklist.</strong> Steps are based on your Xero data but AI can make mistakes — please review and verify each item carefully before marking it done.
            </div>

            {/* Main steps (all non-other categories) */}
            {checkItems.filter(c => c.category !== 'other').map((item, i) => {
              const globalIndex = checkItems.indexOf(item);
              const itemBank = stepBankMap[item.id] || '';
              const setItemBank = (val) => {
                setStepBankMap(prev => ({ ...prev, [item.id]: val }));
                setSelectedBank(val);
              };
              const isActive = item.id === activeStepId && !item.done;
              return (
                <ChecklistItem key={item.id} item={item} index={i}
                  onToggle={() => toggleItem(globalIndex)}
                  onUpload={item.requiresCsvUpload ? uploadCsv : null}
                  uploadingByBank={uploadingByBank}
                  uploadError={item.requiresCsvUpload ? uploadError : ''}
                  bankAccounts={bankAccounts}
                  selectedBank={itemBank}
                  onSelectBank={setItemBank}
                  duplicateTransactions={transactions.filter(t => !!t.is_duplicate)}
                  onResolveDuplicate={resolveDuplicate}
                  tenant={tenant}
                  closeMonth={closeMonth}
                  closeYear={closeYear}
                  accounts={accounts}
                  isActive={isActive}
                  transactions={transactions}
                  sessionId={session}
                />
              );
            })}

            {/* Others section */}
            {checkItems.filter(c => c.category === 'other').length > 0 && (
              <OthersSection
                items={checkItems.filter(c => c.category === 'other')}
                checkItems={checkItems}
                toggleItem={toggleItem}
                activeStepId={activeStepId}
                tenant={tenant}
                closeMonth={closeMonth}
                closeYear={closeYear}
                accounts={accounts}
                transactions={transactions}
                session={session}
                bankAccounts={bankAccounts}
                stepBankMap={stepBankMap}
                setStepBankMap={setStepBankMap}
                setSelectedBank={setSelectedBank}
                uploadCsv={uploadCsv}
                uploadError={uploadError}
                resolveDuplicate={resolveDuplicate}
              />
            )}

            {/* Completion Panel — shown once all steps are done */}
            {doneCount === checkItems.length && checkItems.length > 0 && (
              <CompletionPanel
                sessionId={sessionId}
                tenant={tenant}
                closeMonth={closeMonth}
                closeYear={closeYear}
                accounts={accounts}
                onComplete={onComplete}
                onGoBack={(category) => {
                  // Find the checklist item for this category, mark undone, set active
                  setCheckItems(prev => {
                    const idx = prev.findIndex(c => c.category === category || c.id.startsWith(category));
                    if (idx < 0) return prev;
                    const next = prev.map((c, i) => i === idx ? { ...c, done: false } : c);
                    setActiveStepId(next[idx].id);
                    persistChecklist(next);
                    return next;
                  });
                  // Scroll checklist into view
                  setTimeout(() => {
                    document.querySelector('.checklist-item')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
              />
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div>
            {transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
                <p style={{ fontSize: 15, color: '#6b7280', marginBottom: 16 }}>No transactions uploaded yet.</p>
                <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>Go to the Checklist tab, find the bank statement step, and upload your CSV.</p>
                <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary }} onClick={() => setActiveTab('checklist')}>
                  ← Go to Checklist
                </button>
              </div>
            ) : (
              <>
              <NextActionBar
                transactions={transactions}
                onGoToChecklist={() => setActiveTab('checklist')}
                onScrollToPush={() => pushCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                onApproveAll={() => approveAll(false)}
              />
              <div>
                {/* Stats row */}
                <div className="grid3-resp" style={{ ...S.grid3, marginBottom: 16 }}>
                  <div style={S.statCard}><div style={{ ...S.statNum, fontSize: 22 }}>{transactions.length}</div><div style={S.statLabel}>Total</div></div>
                  <div style={{ ...S.statCard, background: '#f0fdf4' }}><div style={{ ...S.statNum, fontSize: 22, color: '#16a34a' }}>{approved}</div><div style={S.statLabel}>Approved</div></div>
                  <div style={{ ...S.statCard, background: '#fefce8' }}><div style={{ ...S.statNum, fontSize: 22, color: '#ca8a04' }}>{pending}</div><div style={S.statLabel}>Pending</div></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ ...S.pill, ...S.pillGreen }} title="Based on AI's original categorisation confidence — does not update when you manually edit an account">✓ {highConf} AI high confidence</span>
                  {dupes > 0 && <span style={{ ...S.pill, ...S.pillRed }}>⚠ {dupes} possible duplicates</span>}
                  {pending > 0 && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {pendingNonDupe > 0 && (
                        <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '6px 14px', fontSize: 12 }}
                          onClick={() => approveAll(false)}>
                          ✅ Approve All ({pendingNonDupe})
                        </button>
                      )}
                      {pendingDupe > 0 && (
                        <button
                          style={{ ...S.btn, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => {
                            if (window.confirm(`Approve all ${pendingDupe} flagged duplicate transaction${pendingDupe > 1 ? 's' : ''}? These were flagged as possible duplicates — please confirm you want to include them.`)) {
                              approveAll(true);
                            }
                          }}>
                          ⚠ Approve All incl. Duplicates ({pendingDupe})
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ maxHeight: '52vh', overflowY: 'auto', paddingRight: 2 }}>
                  {transactions.map(txn => (
                    <TxnRow key={txn.id} txn={txn} expanded={expandedTxn === txn.id}
                      accounts={accounts}
                      onToggle={() => setExpandedTxn(expandedTxn === txn.id ? null : txn.id)}
                      onUpdate={patch => updateTxn(txn.id, patch)}
                      onAttach={file => attachFile(txn.id, file)}
                      onRemoveAttachment={() => removeAttachment(txn.id)}
                      onResolveDuplicate={resolveDuplicate}
                    />
                  ))}
                </div>
              </div>
              </>
            )}
          </div>
        )}
      </div>

      {transactions.length > 0 && approved > 0 && (
        <div ref={pushCardRef} style={{ ...S.card, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }} className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h3 style={{ ...S.h3, color: '#16a34a', marginBottom: 4 }}>✅ Ready to Push to Xero</h3>
              <p style={{ ...S.p, margin: 0 }}>{approved} transactions approved. Select your bank account then proceed.</p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={{ ...S.select, width: 220 }} value={selectedBank} onChange={e => setSelectedBank(e.target.value)}>
                <option value="">— Select bank account —</option>
                {bankAccounts.map(b => <option key={b.AccountID || b.account_code} value={b.AccountID || b.account_code}>{b.Name || b.name} ({b.Code || b.xero_code})</option>)}
              </select>
              <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '12px 24px' }} onClick={() => onProceed(selectedBank)} disabled={!selectedBank}>
                Proceed to Push →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Next Action Bar (Transactions tab guidance) ─────────────────────────────
function NextActionBar({ transactions, onGoToChecklist, onScrollToPush, onApproveAll }) {
  const total    = transactions.length;
  const approved = transactions.filter(t => t.user_status === 'approved').length;
  const pending  = transactions.filter(t => t.user_status === 'pending' && !t.is_duplicate).length;
  const pushed   = transactions.filter(t => t.push_status === 'pushed').length;

  let bg, border, icon, title, body, action;

  if (pushed === total && total > 0) {
    bg = '#f0fdf4'; border = '#bbf7d0'; icon = '🎉';
    title = 'All transactions pushed to Xero!';
    body = 'Switch back to the checklist to work through any remaining steps.';
    action = <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '8px 18px', fontSize: 13 }} onClick={onGoToChecklist}>← Back to Checklist</button>;
  } else if (approved > 0 && pending === 0) {
    bg = '#f0fdf4'; border = '#bbf7d0'; icon = '✅';
    title = `${approved} transaction${approved !== 1 ? 's' : ''} approved — ready to push!`;
    body = 'Scroll down to select your bank account and push to Xero.';
    action = <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '8px 18px', fontSize: 13 }} onClick={onScrollToPush}>Scroll to Push Card ↓</button>;
  } else if (pending > 0) {
    bg = '#fefce8'; border = '#fde68a'; icon = '📋';
    title = `${pending} transaction${pending !== 1 ? 's' : ''} need your review`;
    body = `AI has categorised them below. Check each one, then click Approve All (${pending}) when ready.`;
    action = <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '8px 18px', fontSize: 13 }} onClick={onApproveAll}>✅ Approve All ({pending})</button>;
  } else {
    return null;
  }

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: 18, lineHeight: '22px', flexShrink: 0 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e1b4b', marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{body}</div>
        </div>
      </div>
      {action}
    </div>
  );
}

// ─── Others Section (collapsible, all 'other' category steps) ────────────────
function OthersSection({ items, checkItems, toggleItem, activeStepId, tenant, closeMonth, closeYear, accounts, transactions, session, bankAccounts, stepBankMap, setStepBankMap, setSelectedBank, _uploadCsv, _uploadError, resolveDuplicate }) {
  const [open, setOpen] = useState(false);
  const doneCount = items.filter(c => c.done).length;
  return (
    <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f9fafb', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>🗂 Others ({doneCount}/{items.length} done)</span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Additional org-specific tasks — complete in Xero or mark done</span>
        </div>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '12px 16px', background: '#fff' }} className="fade-in">
          {items.map(item => {
            const globalIndex = checkItems.indexOf(item);
            const isActive = item.id === activeStepId && !item.done;
            const itemBank = stepBankMap?.[item.id] || '';
            return (
              <ChecklistItem key={item.id} item={item} index={globalIndex}
                onToggle={() => toggleItem(globalIndex)}
                onUpload={null} uploadingByBank={{}} uploadError=""
                bankAccounts={bankAccounts}
                selectedBank={itemBank}
                onSelectBank={val => { setStepBankMap(p => ({ ...p, [item.id]: val })); setSelectedBank(val); }}
                duplicateTransactions={transactions.filter(t => !!t.is_duplicate)}
                onResolveDuplicate={resolveDuplicate}
                tenant={tenant} closeMonth={closeMonth} closeYear={closeYear}
                accounts={accounts} isActive={isActive}
                transactions={transactions} sessionId={session}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shared: Xero report section row helper ───────────────────────────────────
function parseXeroReport(report) {
  if (!report?.Rows) return [];
  const result = [];
  for (const section of report.Rows) {
    if (section.RowType === 'Header') continue;
    if (section.Title) result.push({ title: section.Title, value: null, isSection: true, isSummary: false });
    for (const row of section.Rows || []) {
      if (!row.Cells?.length) continue;
      const label = row.Cells[0]?.Value || '';
      // Value is the second cell (index 1). Last cell could be a date header — use index 1 if there are exactly 2 cells, otherwise index 1
      const valCell = row.Cells[1];
      const val = valCell?.Value || '';
      const isSummary = row.RowType === 'SummaryRow';
      if (label) result.push({ title: label, value: val, isSection: false, isSummary });
    }
  }
  return result;
}

// ─── Create Bill Panel (for "raise bills" payables steps) ────────────────────
// Not currently wired to the checklist — kept for future use.
// eslint-disable-next-line no-unused-vars
function CreateBillPanel({ tenantId, accounts, closeMonth, closeYear }) {
  const lastDay = closeMonth && closeYear
    ? new Date(closeYear, new Date(`${closeMonth} 1`).getMonth() + 1, 0).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const [supplier, setSupplier] = useState('');
  const [date, setDate]         = useState(lastDay);
  const [ref, setRef]           = useState('');
  const [accountCode, setAC]    = useState('');
  const [amount, setAmount]     = useState('');
  const [desc, setDesc]         = useState('');
  const [submitting, setSub]    = useState(false);
  const [error, setError]       = useState('');
  const [posted, setPosted]     = useState([]);

  const canPost = supplier && amount && date;
  const acctOpts = (accounts || []).filter(a => a.Status === 'ACTIVE' && a.Type === 'EXPENSE');

  async function createBill() {
    setSub(true); setError('');
    try {
      const r = await apiFetch(`/close/${tenantId}/create-bill`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier, date, reference: ref, accountCode, amount: parseFloat(amount), description: desc })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPosted(prev => [...prev, { supplier, amount, date, id: d.invoiceId }]);
      setSupplier(''); setAmount(''); setRef(''); setDesc('');
    } catch (e) { setError(getUserFacingErrorMessage(e)); }
    setSub(false);
  }

  return (
    <div style={{ marginTop: 14 }}>
      {posted.map((b, i) => (
        <div key={i} style={{ ...S.alert, ...S.alertGreen, marginBottom: 8, fontSize: 13 }} className="fade-in">
          ✅ Bill raised: <strong>{b.supplier}</strong> ${parseFloat(b.amount).toFixed(2)} on {b.date}
          {b.id && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>Xero ID: {b.id}</span>}
        </div>
      ))}
      <div style={{ border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#f5f3ff', padding: '10px 16px', borderBottom: '1px solid #e0e7ff' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed' }}>📤 Raise a Bill in Xero</span>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="grid2-resp" style={S.grid2}>
            <div>
              <label style={S.label}>Supplier / Contact</label>
              <input style={S.input} placeholder="e.g. AWS, Slack, Adobe" value={supplier} onChange={e => setSupplier(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Bill Date</label>
              <input type="date" style={S.input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid2-resp" style={S.grid2}>
            <div>
              <label style={S.label}>Account (Expense)</label>
              <select style={S.select} value={accountCode} onChange={e => setAC(e.target.value)}>
                <option value="">— Select account —</option>
                {acctOpts.map(a => <option key={a.AccountID} value={a.Code}>{a.Code} — {a.Name}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Amount</label>
              <input type="number" step="0.01" style={S.input} placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid2-resp" style={S.grid2}>
            <div>
              <label style={S.label}>Description</label>
              <input style={S.input} placeholder="What is this bill for?" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Reference (optional)</label>
              <input style={S.input} placeholder="Invoice #, PO #, etc." value={ref} onChange={e => setRef(e.target.value)} />
            </div>
          </div>
          {error && <div style={{ ...S.alert, ...S.alertRed, fontSize: 13 }}>{error}</div>}
          <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '9px 22px', fontSize: 14, alignSelf: 'flex-start' }}
            onClick={createBill} disabled={!canPost || submitting}>
            {submitting ? <><Spinner size={15} color="#fff" /> Raising bill…</> : '📤 Raise Bill in Xero'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payables Panel ───────────────────────────────────────────────────────────
function PayablesPanel({ tenantId, month, year }) {
  const [bills, setBills]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [reviewed, setReviewed] = useState({});

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await apiFetch(`/close/${tenantId}/payables?month=${encodeURIComponent(month)}&year=${year}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBills(d);
    } catch (e) { setError(getUserFacingErrorMessage(e)); }
    setLoading(false);
  }

  if (!bills && !loading) return (
    <div style={{ marginTop: 14 }}>
      <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '8px 18px', fontSize: 13 }} onClick={load}>
        📤 Load Outstanding Bills for {month} {year}
      </button>
    </div>
  );

  if (loading) return <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6366f1' }}><Spinner size={14} /> Loading bills from Xero…</div>;
  if (error)   return <div style={{ ...S.alert, ...S.alertRed, marginTop: 14, fontSize: 13 }}>{error}</div>;

  const total = bills.reduce((s, b) => s + (parseFloat(b.AmountDue) || 0), 0);
  const overdueCount = bills.filter(b => b.DueDate && new Date(b.DueDate.replace(/\/Date\((\d+).*\)\//, (_, ms) => new Date(parseInt(ms)).toISOString())) < new Date()).length;
  const allReviewed = bills.length > 0 && bills.every(b => reviewed[b.InvoiceID]);

  return (
    <div style={{ marginTop: 14, border: `1px solid ${allReviewed ? '#bbf7d0' : '#e0e7ff'}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: allReviewed ? '#f0fdf4' : '#f5f3ff', padding: '10px 16px', borderBottom: `1px solid ${allReviewed ? '#bbf7d0' : '#e0e7ff'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: allReviewed ? '#16a34a' : '#7c3aed' }}>
          {allReviewed ? '✅' : '📤'} {bills.length} bill{bills.length !== 1 ? 's' : ''} — total due: ${total.toFixed(2)}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {overdueCount > 0 && <span style={{ ...S.pill, ...S.pillRed, fontSize: 11 }}>⚠ {overdueCount} overdue</span>}
          <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={load}>↻ Refresh</button>
        </div>
      </div>
      {bills.length === 0 ? (
        <div style={{ padding: '16px', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>✅ No outstanding bills for {month} {year}</div>
      ) : (
        <>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {bills.map(b => {
              const due = parseFloat(b.AmountDue) || 0;
              const isReviewed = !!reviewed[b.InvoiceID];
              const dueDateStr = b.DueDate?.match(/\/Date\((\d+)/)
                ? new Date(parseInt(b.DueDate.match(/\/Date\((\d+)/)[1])).toISOString().split('T')[0]
                : b.DueDate;
              const isOverdue = dueDateStr && new Date(dueDateStr) < new Date();
              return (
                <div key={b.InvoiceID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid #f3f4f6', background: isReviewed ? '#f9fff9' : '#fff' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isReviewed ? '#16a34a' : '#d1d5db'}`, background: isReviewed ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                    onClick={() => setReviewed(p => ({ ...p, [b.InvoiceID]: !p[b.InvoiceID] }))}>
                    {isReviewed && '✓'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>{b.Contact?.Name || '—'}</span>
                    {b.Reference && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>Ref: {b.Reference}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: isOverdue ? '#dc2626' : '#9ca3af', flexShrink: 0 }}>Due {dueDateStr || '—'}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b', width: 80, textAlign: 'right', flexShrink: 0 }}>${due.toFixed(2)}</span>
                  <span style={{ ...S.badge, background: b.Status === 'AUTHORISED' ? '#eff6ff' : '#fefce8', color: b.Status === 'AUTHORISED' ? '#1d4ed8' : '#ca8a04', flexShrink: 0 }}>{b.Status}</span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '8px 16px', background: '#fafbff', fontSize: 12, color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Tick each bill once reviewed. To pay, open Xero → Accounts Payable.</span>
            {!allReviewed && <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '4px 12px', fontSize: 11 }}
              onClick={() => { const r = {}; bills.forEach(b => r[b.InvoiceID] = true); setReviewed(r); }}>
              Mark All Reviewed
            </button>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Receivables Panel ────────────────────────────────────────────────────────
function ReceivablesPanel({ tenantId, month, year }) {
  const [invoices, setInvoices] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [reviewed, setReviewed] = useState({});

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await apiFetch(`/close/${tenantId}/receivables?month=${encodeURIComponent(month)}&year=${year}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setInvoices(d);
    } catch (e) { setError(getUserFacingErrorMessage(e)); }
    setLoading(false);
  }

  if (!invoices && !loading) return (
    <div style={{ marginTop: 14 }}>
      <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '8px 18px', fontSize: 13 }} onClick={load}>
        📥 Load Outstanding Invoices for {month} {year}
      </button>
    </div>
  );

  if (loading) return <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6366f1' }}><Spinner size={14} /> Loading invoices from Xero…</div>;
  if (error)   return <div style={{ ...S.alert, ...S.alertRed, marginTop: 14, fontSize: 13 }}>{error}</div>;

  const totalDue = invoices.reduce((s, i) => s + (parseFloat(i.AmountDue) || 0), 0);
  const allReviewed = invoices.length > 0 && invoices.every(i => reviewed[i.InvoiceID]);

  return (
    <div style={{ marginTop: 14, border: `1px solid ${allReviewed ? '#bbf7d0' : '#e0e7ff'}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: allReviewed ? '#f0fdf4' : '#ecfeff', padding: '10px 16px', borderBottom: `1px solid ${allReviewed ? '#bbf7d0' : '#a5f3fc'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: allReviewed ? '#16a34a' : '#0891b2' }}>
          {allReviewed ? '✅' : '📥'} {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} — total receivable: ${totalDue.toFixed(2)}
        </span>
        <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={load}>↻ Refresh</button>
      </div>
      {invoices.length === 0 ? (
        <div style={{ padding: '16px', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>✅ No outstanding invoices for {month} {year}</div>
      ) : (
        <>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {invoices.map(inv => {
              const due = parseFloat(inv.AmountDue) || 0;
              const isReviewed = !!reviewed[inv.InvoiceID];
              const dueDateStr = inv.DueDate?.match(/\/Date\((\d+)/)
                ? new Date(parseInt(inv.DueDate.match(/\/Date\((\d+)/)[1])).toISOString().split('T')[0]
                : inv.DueDate;
              const isOverdue = dueDateStr && new Date(dueDateStr) < new Date();
              return (
                <div key={inv.InvoiceID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid #f3f4f6', background: isReviewed ? '#f9fff9' : '#fff' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isReviewed ? '#16a34a' : '#d1d5db'}`, background: isReviewed ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                    onClick={() => setReviewed(p => ({ ...p, [inv.InvoiceID]: !p[inv.InvoiceID] }))}>
                    {isReviewed && '✓'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>{inv.Contact?.Name || '—'}</span>
                    {inv.InvoiceNumber && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>#{inv.InvoiceNumber}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: isOverdue ? '#dc2626' : '#9ca3af', flexShrink: 0 }}>{isOverdue ? '⚠ Overdue' : `Due ${dueDateStr || '—'}`}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', width: 80, textAlign: 'right', flexShrink: 0 }}>${due.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '8px 16px', background: '#f0fdff', fontSize: 12, color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Tick each invoice once reviewed/chased. To send reminders, use Xero → Accounts Receivable.</span>
            {!allReviewed && <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '4px 12px', fontSize: 11 }}
              onClick={() => { const r = {}; invoices.forEach(i => r[i.InvoiceID] = true); setReviewed(r); }}>
              Mark All Reviewed
            </button>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Journal Entry Panel ──────────────────────────────────────────────────────
function JournalEntryPanel({ tenantId, accounts, closeMonth, closeYear }) {
  const lastDay = closeMonth && closeYear
    ? new Date(closeYear, new Date(`${closeMonth} 1`).getMonth() + 1, 0).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const [date, setDate]         = useState(lastDay);
  const [narration, setNarration] = useState('');
  const [lines, setLines]       = useState([
    { accountCode: '', description: '', debit: '', credit: '' },
    { accountCode: '', description: '', debit: '', credit: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const [posted, setPosted]     = useState([]);

  function setLine(i, field, val) {
    setLines(prev => prev.map((l, j) => j === i ? { ...l, [field]: val } : l));
  }

  function addLine() { setLines(prev => [...prev, { accountCode: '', description: '', debit: '', credit: '' }]); }
  function removeLine(i) { if (lines.length > 2) setLines(prev => prev.filter((_, j) => j !== i)); }

  const apiLines = lines.map(l => ({
    accountCode: l.accountCode,
    description: l.description,
    lineAmount: (parseFloat(l.debit) || 0) - (parseFloat(l.credit) || 0)
  })).filter(l => l.accountCode && l.lineAmount !== 0);

  const totalDebits  = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced   = Math.abs(totalDebits - totalCredits) < 0.01;
  const canPost      = narration && apiLines.length >= 2 && isBalanced;

  async function postJournal() {
    setSubmitting(true); setError('');
    try {
      const r = await apiFetch(`/close/${tenantId}/journal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, narration, lines: apiLines })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPosted(prev => [...prev, { narration, date, lines: apiLines, id: d.journal?.ManualJournalID }]);
      setNarration(''); setLines([
        { accountCode: '', description: '', debit: '', credit: '' },
        { accountCode: '', description: '', debit: '', credit: '' },
      ]);
    } catch (e) { setError(getUserFacingErrorMessage(e)); }
    setSubmitting(false);
  }

  const acctOpts = (accounts || []).filter(a => a.Status === 'ACTIVE' && a.Type !== 'BANK');

  return (
    <div style={{ marginTop: 14 }}>
      {/* Posted journals */}
      {posted.length > 0 && posted.map((j, i) => (
        <div key={i} style={{ ...S.alert, ...S.alertGreen, marginBottom: 8, fontSize: 13 }} className="fade-in">
          ✅ Posted: <strong>{j.narration}</strong> ({j.date}) — {j.lines.length} lines
          {j.id && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>ID: {j.id}</span>}
        </div>
      ))}

      <div style={{ border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#f5f3ff', padding: '10px 16px', borderBottom: '1px solid #e0e7ff' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed' }}>📓 Post Manual Journal to Xero</span>
        </div>
        <div style={{ padding: '14px 16px' }}>
          <div className="grid2-resp" style={{ ...S.grid2, marginBottom: 12, maxWidth: 480 }}>
            <div>
              <label style={S.label}>Date</label>
              <input type="date" style={S.input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Narration / Description</label>
              <input style={S.input} placeholder="e.g. Accrued wages June 2026" value={narration} onChange={e => setNarration(e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div style={{ border: '1px solid #f3f4f6', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 28px', gap: 0, background: '#f8faff', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>
              <span>Account</span><span>Description</span><span style={{ textAlign: 'right' }}>Debit</span><span style={{ textAlign: 'right' }}>Credit</span><span/>
            </div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 28px', gap: 4, padding: '6px 10px', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                <select style={{ ...S.select, padding: '5px 8px', fontSize: 12 }} value={l.accountCode} onChange={e => setLine(i, 'accountCode', e.target.value)}>
                  <option value="">— Account —</option>
                  {acctOpts.map(a => <option key={a.AccountID} value={a.Code}>{a.Code} — {a.Name}</option>)}
                </select>
                <input style={{ ...S.input, padding: '5px 8px', fontSize: 12 }} placeholder="Description" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} />
                <input style={{ ...S.input, padding: '5px 8px', fontSize: 12, textAlign: 'right' }} type="number" step="0.01" placeholder="0.00" value={l.debit} onChange={e => { setLine(i, 'debit', e.target.value); if (e.target.value) setLine(i, 'credit', ''); }} />
                <input style={{ ...S.input, padding: '5px 8px', fontSize: 12, textAlign: 'right' }} type="number" step="0.01" placeholder="0.00" value={l.credit} onChange={e => { setLine(i, 'credit', e.target.value); if (e.target.value) setLine(i, 'debit', ''); }} />
                <button style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }} onClick={() => removeLine(i)} disabled={lines.length <= 2}>✕</button>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 28px', gap: 4, padding: '6px 10px', background: '#f8faff', borderTop: '1px solid #f3f4f6', fontSize: 12, fontWeight: 700 }}>
              <span style={{ color: '#6b7280' }}>Totals</span><span/>
              <span style={{ textAlign: 'right', color: '#1e1b4b' }}>{totalDebits > 0 ? totalDebits.toFixed(2) : ''}</span>
              <span style={{ textAlign: 'right', color: '#1e1b4b' }}>{totalCredits > 0 ? totalCredits.toFixed(2) : ''}</span>
              <span/>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '6px 14px', fontSize: 12 }} onClick={addLine}>+ Add Line</button>
            {!isBalanced && totalDebits > 0 && totalCredits > 0 && (
              <span style={{ ...S.pill, ...S.pillRed, fontSize: 11 }}>⚠ Out of balance by ${Math.abs(totalDebits - totalCredits).toFixed(2)}</span>
            )}
            {isBalanced && totalDebits > 0 && <span style={{ ...S.pill, ...S.pillGreen, fontSize: 11 }}>✓ Balanced</span>}
          </div>

          {error && <div style={{ ...S.alert, ...S.alertRed, marginTop: 10, fontSize: 13 }}>{error}</div>}

          <button
            className="btn-green"
            style={{ ...S.btn, ...S.btnGreen, marginTop: 14, padding: '9px 22px', fontSize: 14 }}
            onClick={postJournal}
            disabled={!canPost || submitting}
          >
            {submitting ? <><Spinner size={15} color="#fff" /> Posting…</> : '📓 Post Journal to Xero'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reports Panel ────────────────────────────────────────────────────────────
function ReportTable({ rows }) {
  return (
    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
      {rows.map((row, i) => {
        if (row.isSection) {
          return (
            <div key={i} style={{ fontWeight: 700, fontSize: 12, color: '#7c3aed', background: '#f5f3ff',
              padding: '6px 14px', borderBottom: '1px solid #ede9fe', marginTop: i > 0 ? 6 : 0, letterSpacing: '0.03em' }}>
              {row.title}
            </div>
          );
        }
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: `${row.isSummary ? '8px' : '5px'} 14px`,
            borderBottom: '1px solid #f3f4f6',
            background: row.isSummary ? '#f8faff' : '#fff',
            fontWeight: row.isSummary ? 700 : 400, fontSize: 13 }}>
            <span style={{ color: row.isSummary ? '#1e1b4b' : '#374151', paddingLeft: row.isSummary ? 0 : 8 }}>{row.title}</span>
            <span style={{ color: row.isSummary ? '#1e1b4b' : '#374151', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{row.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReportsPanel({ tenantId, month, year, plOnly = false, bsOnly = false }) {
  const [pl, setPl]         = useState(null);
  const [bs, setBs]         = useState(null);
  const [loadingPl, setLPl] = useState(false);
  const [loadingBs, setLBs] = useState(false);
  const [errorPl, setEPl]   = useState('');
  const [errorBs, setEBs]   = useState('');

  async function loadPl() {
    setLPl(true); setEPl('');
    try {
      const r = await apiFetch(`/close/${tenantId}/report/pl?month=${encodeURIComponent(month)}&year=${year}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPl(d);
    } catch (e) { setEPl(getUserFacingErrorMessage(e)); }
    setLPl(false);
  }

  async function loadBs() {
    setLBs(true); setEBs('');
    try {
      const r = await apiFetch(`/close/${tenantId}/report/bs?month=${encodeURIComponent(month)}&year=${year}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBs(d);
    } catch (e) { setEBs(getUserFacingErrorMessage(e)); }
    setLBs(false);
  }

  // Auto-load on mount — only what's needed
  useEffect(() => {
    if (!tenantId) return;
    if (!bsOnly) loadPl();
    if (!plOnly) loadBs();
  }, [tenantId, month, year]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...S.alert, ...S.alertYellow, fontSize: 12 }}>
        ⚠️ Figures are pulled live from Xero. If something looks off, click <strong>Refresh</strong> or use <strong>Open in Xero</strong> to see the authoritative report.
      </div>

      {/* P&L */}
      {!bsOnly && <div style={{ border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#f5f3ff', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed' }}>📊 Profit & Loss — {month} {year}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="https://go.xero.com/Reports/Report.aspx?reportType=PROFITANDLOSS" target="_blank" rel="noopener noreferrer"
              style={{ ...S.btn, ...S.btnSecondary, padding: '4px 12px', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Open in Xero ↗
            </a>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '4px 12px', fontSize: 12 }} onClick={loadPl} disabled={loadingPl}>
              {loadingPl ? <><Spinner size={12} /> Loading…</> : '↻ Refresh'}
            </button>
          </div>
        </div>
        {errorPl && <div style={{ ...S.alert, ...S.alertRed, margin: 12, fontSize: 13 }}>{errorPl} <button style={{ marginLeft: 8, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={loadPl}>Retry</button></div>}
        {loadingPl && <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#9ca3af' }}><Spinner size={14} /> Loading P&L from Xero…</div>}
        {pl && !loadingPl && <ReportTable rows={parseXeroReport(pl)} />}
      </div>}

      {/* Balance Sheet */}
      {!plOnly && <div style={{ border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#f5f3ff', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed' }}>📋 Balance Sheet — as at end of {month} {year}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="https://go.xero.com/Reports/Report.aspx?reportType=BALANCESHEET" target="_blank" rel="noopener noreferrer"
              style={{ ...S.btn, ...S.btnSecondary, padding: '4px 12px', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Open in Xero ↗
            </a>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '4px 12px', fontSize: 12 }} onClick={loadBs} disabled={loadingBs}>
              {loadingBs ? <><Spinner size={12} /> Loading…</> : '↻ Refresh'}
            </button>
          </div>
        </div>
        {errorBs && <div style={{ ...S.alert, ...S.alertRed, margin: 12, fontSize: 13 }}>{errorBs} <button style={{ marginLeft: 8, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={loadBs}>Retry</button></div>}
        {loadingBs && <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#9ca3af' }}><Spinner size={14} /> Loading Balance Sheet from Xero…</div>}
        {bs && !loadingBs && <ReportTable rows={parseXeroReport(bs)} />}
      </div>}
    </div>
  );
}

// ─── Duplicate Resolution Panel ───────────────────────────────────────────────
function DuplicateResolutionPanel({ duplicates, onResolve, compact = false }) {
  const [loading, setLoading] = useState({});   // txnId → true while resolving
  const [errors,  setErrors]  = useState({});   // txnId → error string
  const [resolved, setResolved] = useState({}); // txnId → action taken

  async function handle(txnId, action) {
    setLoading(prev => ({ ...prev, [txnId]: action }));
    setErrors(prev => ({ ...prev, [txnId]: null }));
    try {
      await onResolve(txnId, action);
      setResolved(prev => ({ ...prev, [txnId]: action }));
    } catch (e) {
      setErrors(prev => ({ ...prev, [txnId]: getUserFacingErrorMessage(e) }));
    }
    setLoading(prev => ({ ...prev, [txnId]: null }));
  }

  const unresolved = duplicates.filter(d => !resolved[d.id]);
  const allDone = duplicates.length > 0 && unresolved.length === 0;

  if (allDone) return (
    <div style={{ ...S.alert, ...S.alertGreen, marginTop: compact ? 12 : 14 }} className="fade-in">
      ✅ All duplicates resolved — transactions are ready to push.
    </div>
  );

  return (
    <div style={{ marginTop: compact ? 12 : 14, border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden' }}>
      {!compact && (
        <div style={{ background: '#fef2f2', padding: '10px 16px', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>⚠ {unresolved.length} Possible Duplicate{unresolved.length !== 1 ? 's' : ''} — Resolve Below</span>
          <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>Resolve each one to proceed with push</span>
        </div>
      )}
      {duplicates.map(d => {
        const res = resolved[d.id];
        const busy = loading[d.id];
        const err = errors[d.id];
        if (res) return (
          <div key={d.id} style={{ padding: '10px 16px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }} className="fade-in">
            <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
            <span style={{ color: '#374151', flex: 1 }}><strong>{d.payee || d.description}</strong> ${Number(d.amount).toFixed(2)}</span>
            <span style={{ color: '#6b7280', fontSize: 12 }}>
              {res === 'void_and_approve' ? 'Xero bill voided — approved for push' : res === 'reject' ? 'Skipped — Xero bill kept' : 'Approved as-is'}
            </span>
          </div>
        );
        return (
          <div key={d.id} style={{ padding: '12px 16px', borderBottom: '1px solid #fef2f2', background: '#fff' }}>
            {/* Transaction summary */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b' }}>{d.payee || d.description}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{d.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>${Number(d.amount).toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#92400e', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 8px', marginTop: 5 }}>
                  ⚠ {d.duplicate_reason}
                </div>
              </div>
            </div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button
                style={{ ...S.btn, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '7px 14px', fontSize: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => handle(d.id, 'void_and_approve')}
                disabled={!!busy}
                title={d.duplicate_xero_id ? `Will void Xero bill ${d.duplicate_xero_id}` : 'Will approve without voiding (no Xero ID found)'}
              >
                {busy === 'void_and_approve' ? <><Spinner size={12} color="#dc2626" /> Voiding…</> : '🗑 Void Xero Bill & Push This'}
              </button>
              <button
                style={{ ...S.btn, background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb', padding: '7px 14px', fontSize: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => handle(d.id, 'approve_anyway')}
                disabled={!!busy}
                title="Not actually a duplicate — approve and push"
              >
                {busy === 'approve_anyway' ? <><Spinner size={12} /> Working…</> : '✓ Not a Duplicate — Push Anyway'}
              </button>
              <button
                style={{ ...S.btn, background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb', padding: '7px 14px', fontSize: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => handle(d.id, 'reject')}
                disabled={!!busy}
                title="Skip this CSV transaction — keep the existing Xero bill"
              >
                {busy === 'reject' ? <><Spinner size={12} /> Working…</> : '✗ Skip — Keep Xero Bill'}
              </button>
            </div>
            {err && <div style={{ ...S.alert, ...S.alertRed, marginTop: 8, marginBottom: 0, fontSize: 12 }}>{err}</div>}
          </div>
        );
      })}
      {!compact && unresolved.length > 0 && (
        <div style={{ padding: '8px 16px', background: '#fef2f2', fontSize: 12, color: '#6b7280' }}>
          Resolve all duplicates above before pushing to Xero.
        </div>
      )}
    </div>
  );
}

// ─── Per-bank Reconcile Panel ─────────────────────────────────────────────────
// Not currently wired to the checklist — kept for future use.
// eslint-disable-next-line no-unused-vars
function PerBankReconcilePanel({ bankAccounts }) {
  // Only show accounts that have a code (filter out junk test accounts)
  const validBanks = (bankAccounts || []).filter(b => b.Code || b.xero_code);
  const [ticked, setTicked] = useState({});
  const toggle = id => setTicked(prev => ({ ...prev, [id]: !prev[id] }));
  const allDone = validBanks.length > 0 && validBanks.every(b => ticked[b.AccountID || b.account_code]);

  return (
    <div style={{ marginTop: 14, border: `1px solid ${allDone ? '#bbf7d0' : '#e0e7ff'}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: allDone ? '#f0fdf4' : '#f5f3ff', padding: '9px 14px', borderBottom: `1px solid ${allDone ? '#bbf7d0' : '#e0e7ff'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: allDone ? '#16a34a' : '#7c3aed' }}>
          {allDone ? '✅' : '🏦'} Reconcile each bank account
        </span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{validBanks.filter(b => ticked[b.AccountID || b.account_code]).length}/{validBanks.length} done</span>
      </div>
      <div>
        {validBanks.map(b => {
          const id = b.AccountID || b.account_code;
          const done = !!ticked[id];
          const xeroUrl = `https://go.xero.com/Bank/BankAccounts.aspx`;
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #f3f4f6', background: done ? '#f0fdf4' : '#fff' }}>
              <div
                style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${done ? '#16a34a' : '#d1d5db'}`, background: done ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                onClick={() => toggle(id)}
              >{done && '✓'}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: done ? '#15803d' : '#1e1b4b', textDecoration: done ? 'line-through' : 'none' }}>
                  {b.Name || b.name}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>({b.Code || b.xero_code})</span>
              </div>
              <a href={xeroUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'underline', flexShrink: 0, fontWeight: 500 }}>
                Open in Xero →
              </a>
            </div>
          );
        })}
      </div>
      {!allDone && (
        <div style={{ padding: '8px 14px', background: '#fafbff', fontSize: 12, color: '#6b7280' }}>
          Tick each account once you've reconciled it in Xero. Open Xero to compare your bank statement to transactions in the account.
        </div>
      )}
    </div>
  );
}

// ─── Recurring Bills Panel ────────────────────────────────────────────────────
function RecurringBillsPanel({ tenantId, closeMonth, closeYear }) {
  const [bills, setBills]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [pushed, setPushed] = useState({});
  const [pushing, setPushing] = useState({});
  const [pushErrors, setPushErrors] = useState({});

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await apiFetch(`/close/${tenantId}/recurring-bills`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBills(d);
    } catch (e) { setError(getUserFacingErrorMessage(e)); }
    setLoading(false);
  }

  async function pushBill(bill) {
    const id = bill.RepeatingInvoiceID;
    setPushing(p => ({ ...p, [id]: true }));
    setPushErrors(p => ({ ...p, [id]: '' }));
    try {
      const r = await apiFetch(`/close/${tenantId}/push-recurring-bill`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: id, month: closeMonth, year: closeYear })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPushed(p => ({ ...p, [id]: true }));
    } catch (e) { setPushErrors(p => ({ ...p, [id]: getUserFacingErrorMessage(e) })); }
    setPushing(p => ({ ...p, [id]: false }));
  }

  if (!bills && !loading) return (
    <div style={{ marginTop: 12 }}>
      <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '8px 18px', fontSize: 13 }} onClick={load}>
        🔄 Load Recurring Bills from Xero
      </button>
      {error && <div style={{ ...S.alert, ...S.alertRed, marginTop: 8, fontSize: 13 }}>{error}</div>}
    </div>
  );
  if (loading) return <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6366f1' }}><Spinner size={14} /> Loading recurring bills…</div>;

  if (!bills?.length) return <div style={{ ...S.alert, ...S.alertBlue, marginTop: 12, fontSize: 13 }}>No active recurring bills found in Xero.</div>;

  return (
    <div style={{ marginTop: 12, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: '#f5f3ff', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed' }}>🔄 {bills.length} Recurring Bill{bills.length !== 1 ? 's' : ''}</span>
        <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={load}>↻</button>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {bills.map(b => {
          const id = b.RepeatingInvoiceID;
          const contact = b.Contact?.Name || '—';
          const amount = b.SubTotal || 0;
          const schedule = b.Schedule ? `${b.Schedule.Period} ${b.Schedule.Unit}` : '';
          const isPushed = !!pushed[id];
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #f3f4f6', background: isPushed ? '#f9fff9' : '#fff' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>{contact}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{schedule} · {b.Type}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b', width: 80, textAlign: 'right', flexShrink: 0 }}>${parseFloat(amount).toFixed(2)}</span>
              {pushErrors[id] && <span style={{ fontSize: 11, color: '#dc2626', maxWidth: 120 }}>{pushErrors[id]}</span>}
              {isPushed
                ? <span style={{ ...S.pill, ...S.pillGreen, fontSize: 11, flexShrink: 0 }}>✓ Pushed</span>
                : <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '5px 12px', fontSize: 12, flexShrink: 0 }}
                    onClick={() => pushBill(b)} disabled={!!pushing[id]}>
                    {pushing[id] ? <Spinner size={12} color="#fff" /> : '↑ Push to Xero'}
                  </button>
              }
            </div>
          );
        })}
      </div>
      <div style={{ padding: '8px 16px', background: '#fafbff', fontSize: 12, color: '#6b7280' }}>
        Verify each bill matches the expected amount, then push to Xero. Already-existing bills won't be duplicated — check Xero after pushing.
      </div>
    </div>
  );
}

// ─── Approve Bills Panel ──────────────────────────────────────────────────────
function ApproveBillsPanel({ tenantId }) {
  const [bills, setBills]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [approved, setApproved] = useState({});
  const [approving, setApproving] = useState({});
  const [approveErrors, setApproveErrors] = useState({});

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await apiFetch(`/close/${tenantId}/unapproved-bills`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBills(d);
    } catch (e) { setError(getUserFacingErrorMessage(e)); }
    setLoading(false);
  }

  async function approveBill(invoiceId) {
    setApproving(p => ({ ...p, [invoiceId]: true }));
    setApproveErrors(p => ({ ...p, [invoiceId]: '' }));
    try {
      const r = await apiFetch(`/close/${tenantId}/approve-bill/${invoiceId}`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setApproved(p => ({ ...p, [invoiceId]: true }));
    } catch (e) { setApproveErrors(p => ({ ...p, [invoiceId]: getUserFacingErrorMessage(e) })); }
    setApproving(p => ({ ...p, [invoiceId]: false }));
  }

  async function approveAll() {
    const pending = (bills || []).filter(b => !approved[b.InvoiceID]);
    for (const b of pending) await approveBill(b.InvoiceID);
  }

  if (!bills && !loading) return (
    <div style={{ marginTop: 12 }}>
      <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '8px 18px', fontSize: 13 }} onClick={load}>
        📋 Load Unapproved Bills from Xero
      </button>
      {error && <div style={{ ...S.alert, ...S.alertRed, marginTop: 8, fontSize: 13 }}>{error}</div>}
    </div>
  );
  if (loading) return <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6366f1' }}><Spinner size={14} /> Loading…</div>;

  const pendingCount = (bills || []).filter(b => !approved[b.InvoiceID]).length;
  if (!bills?.length) return <div style={{ ...S.alert, ...S.alertGreen, marginTop: 12, fontSize: 13 }}>✅ No unapproved bills found — all bills are already authorised.</div>;

  return (
    <div style={{ marginTop: 12, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: '#f5f3ff', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed' }}>📋 {bills.length} Unapproved Bill{bills.length !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {pendingCount > 1 && <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '4px 10px', fontSize: 11 }} onClick={approveAll}>Approve All ({pendingCount})</button>}
          <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={load}>↻</button>
        </div>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {bills.map(b => {
          const isApproved = !!approved[b.InvoiceID];
          return (
            <div key={b.InvoiceID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #f3f4f6', background: isApproved ? '#f9fff9' : '#fff' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>{b.Contact || '—'}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{b.InvoiceNumber ? `#${b.InvoiceNumber}` : ''} · {b.Date}</div>
              </div>
              <span style={{ ...S.badge, background: '#fefce8', color: '#ca8a04', flexShrink: 0 }}>{b.Status}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b', width: 80, textAlign: 'right', flexShrink: 0 }}>${parseFloat(b.Total || 0).toFixed(2)}</span>
              {approveErrors[b.InvoiceID] && <span style={{ fontSize: 11, color: '#dc2626', maxWidth: 100 }}>{approveErrors[b.InvoiceID]}</span>}
              {isApproved
                ? <span style={{ ...S.pill, ...S.pillGreen, fontSize: 11, flexShrink: 0 }}>✓ Approved</span>
                : <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '5px 12px', fontSize: 12, flexShrink: 0 }}
                    onClick={() => approveBill(b.InvoiceID)} disabled={!!approving[b.InvoiceID]}>
                    {approving[b.InvoiceID] ? <Spinner size={12} color="#fff" /> : '✓ Approve'}
                  </button>
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Depreciation Journal Panel ───────────────────────────────────────────────
function DepreciationPanel({ tenantId, accounts, item, closeMonth, closeYear }) {
  const lastDay = closeMonth && closeYear
    ? new Date(closeYear, new Date(`${closeMonth} 1`).getMonth() + 1, 0).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const defaultLines = (item.depreciationAccounts || []).length
    ? item.depreciationAccounts.map(d => ({
        debitCode: d.debitCode || '', creditCode: d.creditCode || '',
        description: d.description || 'Monthly depreciation', amount: ''
      }))
    : [{ debitCode: '', creditCode: '', description: 'Monthly depreciation', amount: '' }];

  const [date, setDate] = useState(lastDay);
  const [lines, setLines] = useState(defaultLines);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState([]);

  const acctOpts = (accounts || []).filter(a => a.Status === 'ACTIVE' && a.Type !== 'BANK');
  const isValid = lines.every(l => l.debitCode && l.creditCode && parseFloat(l.amount) > 0);

  function setLine(i, field, val) {
    setLines(prev => prev.map((l, j) => j === i ? { ...l, [field]: val } : l));
  }

  async function post() {
    setSubmitting(true); setError('');
    try {
      // Build journal: each line = debit (debitCode, +amount) + credit (creditCode, -amount)
      const journalLines = [];
      for (const l of lines) {
        const amt = parseFloat(l.amount);
        journalLines.push({ accountCode: l.debitCode, description: l.description, lineAmount: amt });
        journalLines.push({ accountCode: l.creditCode, description: l.description, lineAmount: -amt });
      }
      const r = await apiFetch(`/close/${tenantId}/journal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, narration: `Monthly depreciation — ${closeMonth} ${closeYear}`, lines: journalLines })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPosted(prev => [...prev, { date, lines }]);
      setLines(defaultLines);
    } catch (e) { setError(getUserFacingErrorMessage(e)); }
    setSubmitting(false);
  }

  return (
    <div style={{ marginTop: 12 }}>
      {posted.map((p, i) => (
        <div key={i} style={{ ...S.alert, ...S.alertGreen, marginBottom: 8, fontSize: 13 }} className="fade-in">
          ✅ Depreciation journal posted for {p.date}
        </div>
      ))}
      <div style={{ border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#f5f3ff', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed' }}>📉 Post Depreciation Journal</span>
          <input type="date" style={{ ...S.input, width: 150, padding: '4px 8px', fontSize: 12 }} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ padding: '14px 16px' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ border: '1px solid #f3f4f6', borderRadius: 8, padding: '12px', marginBottom: 10, background: '#fafbff' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', marginBottom: 8 }}>Entry {i + 1}</div>
              <div className="grid2-resp" style={{ ...S.grid2, marginBottom: 8 }}>
                <div>
                  <label style={S.label}>Debit Account</label>
                  <select style={S.select} value={l.debitCode} onChange={e => setLine(i, 'debitCode', e.target.value)}>
                    <option value="">— Select —</option>
                    {acctOpts.map(a => <option key={a.AccountID} value={a.Code}>{a.Code} — {a.Name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Credit Account</label>
                  <select style={S.select} value={l.creditCode} onChange={e => setLine(i, 'creditCode', e.target.value)}>
                    <option value="">— Select —</option>
                    {acctOpts.map(a => <option key={a.AccountID} value={a.Code}>{a.Code} — {a.Name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid2-resp" style={S.grid2}>
                <div>
                  <label style={S.label}>Description</label>
                  <input style={S.input} value={l.description} onChange={e => setLine(i, 'description', e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Amount</label>
                  <input type="number" style={S.input} placeholder="0.00" value={l.amount} onChange={e => setLine(i, 'amount', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '6px 12px', fontSize: 12 }}
              onClick={() => setLines(prev => [...prev, { debitCode: '', creditCode: '', description: 'Monthly depreciation', amount: '' }])}>
              + Add Entry
            </button>
            {lines.length > 1 && <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '6px 12px', fontSize: 12 }}
              onClick={() => setLines(prev => prev.slice(0, -1))}>
              − Remove Last
            </button>}
          </div>
          {error && <div style={{ ...S.alert, ...S.alertRed, marginTop: 10, fontSize: 13 }}>{error}</div>}
          <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '9px 18px', marginTop: 14, opacity: isValid ? 1 : 0.5 }}
            onClick={post} disabled={submitting || !isValid}>
            {submitting ? <><Spinner size={14} color="#fff" /> Posting…</> : '📤 Post to Xero'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Accruals Panel ───────────────────────────────────────────────────────────
function AccrualsPanel({ tenantId, accounts, closeMonth, closeYear }) {
  // Reuse JournalEntryPanel with accruals-specific label
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ ...S.alert, ...S.alertBlue, fontSize: 13, marginBottom: 10 }}>
        💡 Post accrual and prepayment entries below. Common accruals: expenses incurred but not yet invoiced (credit Accruals account, debit Expense), prepayments to amortise (debit Prepayments, credit Expense).
      </div>
      <JournalEntryPanel tenantId={tenantId} accounts={accounts} closeMonth={closeMonth} closeYear={closeYear} />
    </div>
  );
}

// ─── Other Step Panel ─────────────────────────────────────────────────────────
function OtherStepPanel({ onToggle }) {
  return (
    <div style={{ marginTop: 12, background: '#fafbff', borderRadius: 8, padding: '14px 16px', border: '1px solid #e0e7ff' }}>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
        Complete this task in Xero, then mark it as done here.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="https://go.xero.com" target="_blank" rel="noopener noreferrer"
          style={{ ...S.btn, ...S.btnSecondary, padding: '7px 14px', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Open Xero ↗
        </a>
        <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '7px 14px', fontSize: 13 }} onClick={onToggle}>
          ✓ Mark as Done
        </button>
      </div>
    </div>
  );
}

// ─── Bank Upload Step Panel ────────────────────────────────────────────────────
function BankUploadStepPanel({ item, _sessionId, onUpload, uploading, uploadError, transactions, accounts, _bankAccounts, tenant, closeMonth, closeYear, _onResolveDuplicate }) {
  const [tab, setTab] = useState('upload');
  const fileRef = useRef();
  const bankId = item.bankAccountId;
  const bankName = item.bankAccountName || 'Bank Account';
  const tid = tenant?.tenant_id;

  // Transactions for this specific bank account
  const bankTxns = (transactions || []).filter(t =>
    !bankId || !t.bank_account_id || t.bank_account_id === bankId
  );

  // Amount is always stored as Math.abs — direction comes from type only
  // ACCPAY = outgoing (money out / expense); ACCREC = incoming (money in / receipt)
  const outgoing = bankTxns.filter(t => t.type === 'ACCPAY');
  const incoming = bankTxns.filter(t => t.type === 'ACCREC');

  const hasUploaded = bankTxns.length > 0;

  const tabs = [
    { id: 'upload', label: '① Upload Statement' },
    ...(hasUploaded && outgoing.length > 0 ? [{ id: 'bills', label: `② Bills (${outgoing.length} outgoing)` }] : []),
    ...(hasUploaded && incoming.length > 0 ? [{ id: 'ar',    label: `③ Match Receipts → AR (${incoming.length})` }] : []),
    ...(hasUploaded && tid ? [{ id: 'ap', label: '④ Payments → Bills' }] : []),
  ];

  return (
    <div style={{ marginTop: 12 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #f3f4f6', marginBottom: 12, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...S.btn, padding: '6px 14px', fontSize: 12, borderRadius: '6px 6px 0 0', marginBottom: -2,
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#6366f1' : '#6b7280',
              fontWeight: tab === t.id ? 700 : 400,
              borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
              border: 'none', cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ① Upload CSV */}
      {tab === 'upload' && (
        <div>
          <div style={{ ...S.alert, ...S.alertBlue, fontSize: 12, marginBottom: 10 }}>
            Upload the <strong>{bankName}</strong> CSV statement. Transactions will be AI-classified and grouped into outgoing (bills) and incoming (receipts).
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => onUpload(e.target.files[0], bankId)} />
          <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '9px 18px' }}
            onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <><Spinner size={16} color="#fff" /> Uploading…</> : '📤 Upload CSV'}
          </button>
          {uploading && <div style={{ marginTop: 10 }}><ProgressBar animated height={5} /></div>}
          {uploadError && <div style={{ ...S.alert, ...S.alertRed, marginTop: 10, fontSize: 13 }}>{uploadError}</div>}
          {hasUploaded && (
            <div style={{ ...S.alert, ...S.alertGreen, marginTop: 10, fontSize: 13 }}>
              ✅ {bankTxns.length} transactions loaded.
              {outgoing.length > 0 && <span> <strong>{outgoing.length} outgoing</strong> — use the Bills tab to create &amp; push bills to Xero.</span>}
              {incoming.length > 0 && <span> <strong>{incoming.length} incoming</strong> — use the Match Receipts tab to reconcile against open AR.</span>}
            </div>
          )}
          <div style={{ marginTop: 14, background: '#f8faff', border: '1px solid #e0e7ff', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>💡 Splitting across accounts</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              To split a transaction across multiple accounts, open it in the <strong>Transactions</strong> tab and click <strong>Split</strong> on the individual row.
            </div>
          </div>
        </div>
      )}

      {/* ② Create bills from outgoing transactions */}
      {tab === 'bills' && (
        <OutgoingBillsTab outgoing={outgoing} tenantId={tid} accounts={accounts} />
      )}

      {/* ③ Match incoming receipts to AR invoices */}
      {tab === 'ar' && tid && (
        <div>
          <div style={{ ...S.alert, ...S.alertBlue, fontSize: 12, marginBottom: 10 }}>
            <strong>{incoming.length} incoming receipts</strong> from <strong>{bankName}</strong>. Match each one to an open AR invoice below to mark it as paid in Xero.
          </div>
          <IncomingTxnARMatch txns={incoming} tenantId={tid} month={closeMonth} year={closeYear} />
        </div>
      )}

      {/* ④ Match payments to AP bills */}
      {tab === 'ap' && tid && (
        <div>
          <div style={{ ...S.alert, ...S.alertBlue, fontSize: 12, marginBottom: 10 }}>
            Review outstanding AP bills for <strong>{closeMonth} {closeYear}</strong>. Match each bank payment to an open bill, then tick it off below.
          </div>
          <PayablesPanel tenantId={tid} month={closeMonth} year={closeYear} />
        </div>
      )}
    </div>
  );
}

// ─── Outgoing Txn → Create Bill Row ───────────────────────────────────────────
const OutgoingTxnBillRow = React.forwardRef(function OutgoingTxnBillRow({ txn, tenantId, accounts, confirmed, onConfirmChange, onPushed }, fwdRef) {
  const [expanded, setExpanded] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null); // set after push
  const [err, setErr] = useState('');
  const [attachFile, setAttachFile] = useState(null);
  const [_attachUploading, setAttachUploading] = useState(false); // TODO: show spinner in JSX
  const attachRef = useRef();

  const amt = parseFloat(txn.amount || 0).toFixed(2);
  const contact = txn.payee || txn.contact_name || 'Unknown Payee';
  const date = txn.date ? txn.date.split('T')[0] : '';
  const suggestedCode = txn.ai_account_code || txn.account_code || '';
  const suggestedName = txn.ai_account_name || txn.account_name || '';
  const confidence = txn.ai_confidence || 0;

  const [accountCode, setAccountCode] = useState(suggestedCode);
  const [description, setDescription] = useState(txn.description || '');
  const [ref, setRef] = useState(txn.reference || '');

  const expenseAccounts = (accounts || []).filter(a =>
    a.Class === 'EXPENSE' || a.Type === 'OVERHEADS' || a.Type === 'DIRECTCOSTS' || a.Type === 'EXPENSE'
  );

  // Called by parent "Push All"
  async function pushBill() {
    if (!accountCode) { setErr('Select an account first'); return false; }
    setErr('');
    try {
      const r = await apiFetch(`/close/${tenantId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: { name: contact }, date, dueDate: date,
          lineItems: [{ description: description || contact, quantity: 1, unitAmount: parseFloat(amt), accountCode }],
          reference: ref, status: 'AUTHORISED'
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      const newInvoiceId = d.invoiceId;
      setInvoiceId(newInvoiceId);
      // Attach file if selected
      if (attachFile && newInvoiceId) {
        setAttachUploading(true);
        const fd = new FormData();
        fd.append('file', attachFile);
        await apiFetch(`/close/${tenantId}/bills/${newInvoiceId}/attachment`, { method: 'POST', body: fd }).catch(() => {});
        setAttachUploading(false);
      }
      onPushed(txn.id);
      return true;
    } catch (e) { setErr(getUserFacingErrorMessage(e)); return false; }
  }

  // Expose pushBill via ref for parent "Push All" orchestration
  React.useImperativeHandle(fwdRef, () => ({ pushBill }), [accountCode, description, ref, attachFile, confirmed]);

  if (invoiceId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13 }}>
        <span style={{ color: '#16a34a', fontSize: 16 }}>✅</span>
        <span style={{ flex: 1 }}><strong>{contact}</strong><span style={{ color: '#9ca3af', marginLeft: 8 }}>{date}</span></span>
        <span style={{ fontWeight: 700, color: '#dc2626' }}>−${amt}</span>
        <span style={{ color: '#16a34a', fontSize: 12 }}>Bill created in Xero</span>
      </div>
    );
  }

  return (
    <div style={{ border: `2px solid ${confirmed ? '#6366f1' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden', background: confirmed ? '#fafbff' : '#fff' }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        {/* Confirm checkbox */}
        <div onClick={() => onConfirmChange(!confirmed)}
          style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${confirmed ? '#6366f1' : '#d1d5db'}`,
            background: confirmed ? '#6366f1' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}>
          {confirmed && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{contact}</span>
            {date && <span style={{ fontSize: 12, color: '#9ca3af' }}>{date}</span>}
            <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>−${amt}</span>
            {suggestedCode && (
              <span style={{ ...S.pill, ...(confidence >= 0.8 ? S.pillGreen : S.pillYellow), fontSize: 11 }}>
                🤖 {suggestedCode} {suggestedName}{confidence ? ` (${Math.round(confidence * 100)}%)` : ''}
              </span>
            )}
            {attachFile && <span style={{ ...S.pill, ...S.pillBlue, fontSize: 11 }}>📎 {attachFile.name}</span>}
          </div>
          {txn.ai_reasoning && <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>💡 {txn.ai_reasoning}</div>}
        </div>
        <span style={{ color: '#9ca3af', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
          onClick={() => setExpanded(e => !e)}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid #f3f4f6' }} className="fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label}>Account <span style={{ color: '#ef4444' }}>*</span></label>
              <select style={S.select} value={accountCode} onChange={e => setAccountCode(e.target.value)}>
                <option value="">— Select account —</option>
                {expenseAccounts.map(a => (
                  <option key={a.Code} value={a.Code}>{a.Code} — {a.Name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Reference</label>
              <input style={S.input} value={ref} onChange={e => setRef(e.target.value)} placeholder="Invoice #, PO #…" />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Description</label>
            <input style={S.input} value={description} onChange={e => setDescription(e.target.value)} placeholder="Line item description" />
          </div>
          {/* File attachment */}
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Attach file (invoice / receipt)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input ref={attachRef} type="file" style={{ display: 'none' }}
                onChange={e => setAttachFile(e.target.files[0] || null)} />
              <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '6px 14px', fontSize: 12 }}
                onClick={() => attachRef.current?.click()}>
                📎 {attachFile ? 'Change file' : 'Attach file'}
              </button>
              {attachFile && (
                <>
                  <span style={{ fontSize: 12, color: '#374151' }}>{attachFile.name}</span>
                  <button style={{ ...S.btn, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setAttachFile(null)}>✕</button>
                </>
              )}
            </div>
          </div>
          {err && <div style={{ ...S.alert, ...S.alertRed, fontSize: 12 }}>{err}</div>}
        </div>
      )}
    </div>
  );
});

// ─── Bills Tab: list with "Push All Confirmed" ─────────────────────────────────
function OutgoingBillsTab({ outgoing, tenantId, accounts }) {
  const [confirmed, setConfirmed] = useState(() => {
    // Auto-confirm rows where AI has high confidence
    const init = {};
    outgoing.forEach(t => { init[t.id] = (t.ai_confidence || 0) >= 0.7; });
    return init;
  });
  const [pushed, setPushed] = useState({});
  const [pushing, setPushing] = useState(false);
  const [pushErr, setPushErr] = useState('');
  const rowRefs = useRef({});

  const confirmedCount = outgoing.filter(t => confirmed[t.id] && !pushed[t.id]).length;
  const pushedCount = Object.values(pushed).filter(Boolean).length;

  async function pushAll() {
    setPushing(true); setPushErr('');
    let failed = 0;
    for (const txn of outgoing) {
      if (!confirmed[txn.id] || pushed[txn.id]) continue;
      const rowEl = rowRefs.current[txn.id];
      if (rowEl?.pushBill) {
        const ok = await rowEl.pushBill();
        if (!ok) failed++;
      }
    }
    setPushing(false);
    if (failed) setPushErr(`${failed} bill(s) failed — expand those rows to see the error.`);
  }

  return (
    <div>
      {/* Push All header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: '#374151' }}>
          <strong>{confirmedCount}</strong> confirmed · <strong>{pushedCount}</strong> pushed to Xero
          <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>Tick the checkbox on each row to confirm, then push all at once.</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '6px 14px', fontSize: 12 }}
            onClick={() => { const all = {}; outgoing.forEach(t => { all[t.id] = true; }); setConfirmed(all); }}>
            Select All
          </button>
          <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '8px 18px', fontSize: 13,
            opacity: confirmedCount === 0 || pushing ? 0.5 : 1 }}
            disabled={confirmedCount === 0 || pushing}
            onClick={pushAll}>
            {pushing ? <><Spinner size={14} color="#fff" /> Pushing…</> : `⬆ Push ${confirmedCount} Bill${confirmedCount !== 1 ? 's' : ''} to Xero`}
          </button>
        </div>
      </div>
      {pushErr && <div style={{ ...S.alert, ...S.alertRed, fontSize: 12, marginBottom: 10 }}>{pushErr}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {outgoing.map(txn => (
          <OutgoingTxnBillRow
            key={txn.id}
            ref={el => { if (el) rowRefs.current[txn.id] = el; }}
            txn={txn}
            tenantId={tenantId}
            accounts={accounts}
            confirmed={!!confirmed[txn.id]}
            onConfirmChange={v => setConfirmed(prev => ({ ...prev, [txn.id]: v }))}
            onPushed={id => setPushed(prev => ({ ...prev, [id]: true }))}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Incoming Txn → AR Match ───────────────────────────────────────────────────
function IncomingTxnARMatch({ txns, tenantId, month, year }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  // pendingMatch: txnId → invoiceId (selected but not yet confirmed)
  const [pendingMatch, setPendingMatch] = useState({});
  // confirmed: txnId → { invoiceId, invoiceLabel }
  const [confirmed, setConfirmed] = useState({});
  // matched (pushed to Xero): txnId → true
  const [matched, setMatched] = useState({});
  const [matchingId, setMatchingId] = useState(null);
  const [matchErr, setMatchErr] = useState({});

  useEffect(() => {
    if (!tenantId) return;
    apiFetch(`/close/${tenantId}/open-invoices?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => {
        const invs = d.invoices || [];
        setInvoices(invs);
        // Auto-suggest: pre-populate pendingMatch for each txn
        setPendingMatch(prev => {
          const next = { ...prev };
          txns.forEach(txn => {
            if (next[txn.id]) return; // already set
            const amt = parseFloat(txn.amount || 0);
            const contact = (txn.payee || '').toLowerCase();
            // Prefer exact contact+amount match, then just amount match
            const best = invs.find(inv =>
              inv.Contact?.Name?.toLowerCase() === contact &&
              Math.abs(parseFloat(inv.AmountDue) - amt) < 0.02
            ) || invs.find(inv =>
              Math.abs(parseFloat(inv.AmountDue) - amt) < 0.02
            );
            if (best) next[txn.id] = best.InvoiceID;
          });
          return next;
        });
      })
      .catch(e => setLoadErr(getUserFacingErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [tenantId, month, year]);

  async function confirmMatch(txnId) {
    const invoiceId = pendingMatch[txnId];
    if (!invoiceId) return;
    setMatchingId(txnId);
    setMatchErr(prev => ({ ...prev, [txnId]: null }));
    try {
      const r = await apiFetch(`/close/${tenantId}/match-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txnId, invoiceId })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      const inv = invoices.find(i => i.InvoiceID === invoiceId);
      setConfirmed(prev => ({ ...prev, [txnId]: {
        invoiceId,
        label: inv ? `${inv.Contact?.Name} — $${parseFloat(inv.AmountDue).toFixed(2)} (${inv.InvoiceNumber || invoiceId.slice(0,8)})` : invoiceId
      }}));
      setMatched(prev => ({ ...prev, [txnId]: true }));
    } catch (e) {
      setMatchErr(prev => ({ ...prev, [txnId]: getUserFacingErrorMessage(e) }));
    }
    setMatchingId(null);
  }

  if (loading) return <div style={{ fontSize: 13, color: '#9ca3af', padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Spinner size={14} /> Loading open AR invoices…</div>;
  if (loadErr) return <div style={{ ...S.alert, ...S.alertRed, fontSize: 13 }}>Failed to load AR invoices: {loadErr}</div>;
  if (invoices.length === 0) return <div style={{ ...S.alert, ...S.alertGreen, fontSize: 13 }}>✅ No open (uncollected) AR invoices found — nothing to match.</div>;

  const matchedCount = Object.values(matched).filter(Boolean).length;

  return (
    <div>
      {matchedCount > 0 && (
        <div style={{ ...S.alert, ...S.alertGreen, fontSize: 13, marginBottom: 12 }}>
          ✅ {matchedCount} of {txns.length} receipts matched and recorded in Xero.
        </div>
      )}
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        Showing <strong>{invoices.length}</strong> open (uncollected) AR invoices. Select the invoice each receipt belongs to and confirm.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {txns.map((txn, i) => {
          const amt = parseFloat(txn.amount || 0).toFixed(2);
          const contact = txn.payee || txn.contact_name || 'Unknown';
          const date = txn.date ? txn.date.split('T')[0] : '';
          const isMatched = !!matched[txn.id];
          const selectedInvoiceId = pendingMatch[txn.id] || '';
          const selectedInvoice = invoices.find(inv => inv.InvoiceID === selectedInvoiceId);
          const isAutoSuggested = selectedInvoice &&
            (selectedInvoice.Contact?.Name?.toLowerCase() === contact.toLowerCase() ||
             Math.abs(parseFloat(selectedInvoice.AmountDue) - parseFloat(amt)) < 0.02);

          if (isMatched) {
            return (
              <div key={txn.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: '#16a34a', fontSize: 16 }}>✅</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{contact}</span>
                  {date && <span style={{ color: '#9ca3af', marginLeft: 8 }}>{date}</span>}
                  <span style={{ fontWeight: 700, color: '#16a34a', marginLeft: 8 }}>+${amt}</span>
                </div>
                <span style={{ fontSize: 12, color: '#16a34a' }}>Matched: {confirmed[txn.id]?.label}</span>
              </div>
            );
          }

          return (
            <div key={txn.id || i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{contact}</span>
                  {date && <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{date}</span>}
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginLeft: 8 }}>+${amt}</span>
                </div>
                {isAutoSuggested && <span style={{ ...S.pill, ...S.pillYellow, fontSize: 11 }}>🤖 Auto-suggested</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <select style={{ ...S.select, flex: 1, minWidth: 200, fontSize: 12 }}
                  value={selectedInvoiceId}
                  onChange={e => setPendingMatch(prev => ({ ...prev, [txn.id]: e.target.value }))}>
                  <option value="">— Select open AR invoice —</option>
                  {invoices.map(inv => {
                    const contactName = inv.Contact?.Name || 'Unknown';
                    const due = parseFloat(inv.AmountDue || 0).toFixed(2);
                    const invNum = inv.InvoiceNumber || inv.InvoiceID.slice(0, 8);
                    const dueDate = inv.DueDate ? inv.DueDate.split('T')[0] : '';
                    return (
                      <option key={inv.InvoiceID} value={inv.InvoiceID}>
                        {contactName} — ${due} outstanding · #{invNum}{dueDate ? ` · due ${dueDate}` : ''}
                      </option>
                    );
                  })}
                </select>
                <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '7px 16px', fontSize: 12,
                  opacity: !selectedInvoiceId || matchingId === txn.id ? 0.5 : 1 }}
                  disabled={!selectedInvoiceId || matchingId === txn.id}
                  onClick={() => confirmMatch(txn.id)}>
                  {matchingId === txn.id ? <><Spinner size={12} color="#fff" /> Matching…</> : '✓ Confirm Match'}
                </button>
                <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '7px 12px', fontSize: 12 }}
                  onClick={() => setPendingMatch(prev => ({ ...prev, [txn.id]: '' }))}>
                  Skip
                </button>
              </div>
              {matchErr[txn.id] && <div style={{ ...S.alert, ...S.alertRed, fontSize: 12, marginTop: 6 }}>{matchErr[txn.id]}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Completion Panel (shown after all checklist steps done) ──────────────────
// ─── Book Analysis Panel ──────────────────────────────────────────────────────
function BookAnalysisPanel({ tenantId, sessionId, closeMonth, closeYear, onGoBack, onResultChange }) {
  const [monthsBack, setMonthsBack] = useState(3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  async function runAnalysis() {
    setLoading(true); setErr(''); setResult(null);
    try {
      const r = await apiFetch(`/close/${tenantId}/analyse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: closeMonth, year: closeYear, monthsBack, sessionId })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d);
      onResultChange?.(d.analysis);
    } catch (e) { setErr(getUserFacingErrorMessage(e)); }
    setLoading(false);
  }

  const analysis = result?.analysis;
  const CATEGORY_LABELS = {
    bank_upload: 'Bank Upload', recurring_bills: 'Recurring Bills',
    approve_bills: 'Approve Bills', duplicates: 'Duplicates',
    depreciation: 'Depreciation', accruals: 'Accruals', other: 'Other Steps'
  };

  function typeStyle(type) {
    if (type === 'positive') return { border: '1px solid #bbf7d0', background: '#f0fdf4', icon: '✅' };
    if (type === 'negative') return { border: '1px solid #fecaca', background: '#fef2f2', icon: '⚠️' };
    return { border: '1px solid #e0e7ff', background: '#f8faff', icon: '💡' };
  }

  return (
    <div>
      {/* Controls */}
      {!result && !loading && (
        <div>
          <div style={{ ...S.alert, ...S.alertBlue, fontSize: 13, marginBottom: 14 }}>
            Compare <strong>{closeMonth} {closeYear}</strong> against previous months to spot trends, anomalies, and anything that needs fixing before you complete the close.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={S.label}>Compare against</label>
              <select style={{ ...S.select, width: 'auto' }} value={monthsBack} onChange={e => setMonthsBack(Number(e.target.value))}>
                {[1, 2, 3, 6].map(n => <option key={n} value={n}>{n} prior month{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '10px 22px', fontSize: 14, marginTop: 16 }}
              onClick={runAnalysis}>
              🔍 Analyse Books
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ marginBottom: 12 }}><Spinner size={28} color="#6366f1" /></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Analysing {monthsBack + 1} months of data…</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Fetching P&L reports and running AI comparison</div>
        </div>
      )}

      {err && <div style={{ ...S.alert, ...S.alertRed, fontSize: 13 }}>{err} <button style={{ marginLeft: 8, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={runAnalysis}>Retry</button></div>}

      {analysis && (
        <div className="fade-in">
          {/* Header row: summary + ok-to-close badge + re-analyse */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ ...S.pill, ...(analysis.okToClose ? S.pillGreen : S.pillRed), fontSize: 12, padding: '3px 10px' }}>
                  {analysis.okToClose ? '✅ Clear to close' : '⚠️ Review needed before closing'}
                </span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Compared {closeMonth} {closeYear} vs {monthsBack} prior month{monthsBack > 1 ? 's' : ''}
                </span>
              </div>
              <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>{analysis.summary}</p>
              {!analysis.okToClose && analysis.okToCloseReason && (
                <div style={{ ...S.alert, ...S.alertRed, fontSize: 13, marginTop: 10 }}>⚠️ {analysis.okToCloseReason}</div>
              )}
            </div>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '6px 14px', fontSize: 12, flexShrink: 0 }}
              onClick={() => { setResult(null); onResultChange?.(null); }}>
              ↺ Re-analyse
            </button>
          </div>

          {(analysis.readiness?.flags || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>🚦 Readiness Checks</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {analysis.readiness.flags.map(flag => {
                  const pillStyle = flag.status === 'clear' ? S.pillGreen : flag.status === 'blocked' ? S.pillRed : S.pillYellow;
                  const icon = flag.status === 'clear' ? '✓' : flag.status === 'blocked' ? '!' : '•';
                  return (
                    <div key={flag.key} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ ...S.pill, ...pillStyle, fontSize: 11 }}>{icon} {flag.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{flag.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trends */}
          {(analysis.trends || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📈 Trends</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {analysis.trends.map((t, i) => (
                  <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{t.direction === 'up' ? '↑' : t.direction === 'down' ? '↓' : '→'}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: t.direction === 'up' ? '#16a34a' : t.direction === 'down' ? '#dc2626' : '#374151' }}>{t.metric}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{t.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Highlights */}
          {(analysis.highlights || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>🔎 Key Observations</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {analysis.highlights.map((h, i) => {
                  const ts = typeStyle(h.type);
                  return (
                    <div key={i} style={{ border: ts.border, background: ts.background, borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{ts.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e1b4b', marginBottom: 3 }}>{h.title}</div>
                          <div style={{ fontSize: 13, color: '#374151' }}>{h.detail}</div>
                        </div>
                        {h.suggestGoBack && onGoBack && (
                          <button className="btn-secondary"
                            style={{ ...S.btn, ...S.btnSecondary, padding: '5px 12px', fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}
                            onClick={() => onGoBack(h.suggestGoBack)}>
                            ← Fix: {CATEGORY_LABELS[h.suggestGoBack] || h.suggestGoBack}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Anomalies */}
          {(analysis.anomalies || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>🚨 Anomalies Detected</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {analysis.anomalies.map((a, i) => (
                  <div key={i} style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>🚨</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 3 }}>{a.title}</div>
                        <div style={{ fontSize: 13, color: '#374151' }}>{a.detail}</div>
                      </div>
                      {a.suggestGoBack && onGoBack && (
                        <button className="btn-secondary"
                          style={{ ...S.btn, ...S.btnSecondary, padding: '5px 12px', fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap', borderColor: '#fca5a5', color: '#dc2626' }}
                          onClick={() => onGoBack(a.suggestGoBack)}>
                          ← Fix: {CATEGORY_LABELS[a.suggestGoBack] || a.suggestGoBack}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.anomalies?.length === 0 && (
            <div style={{ ...S.alert, ...S.alertGreen, fontSize: 13 }}>✅ No anomalies detected — books look consistent with prior months.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Completion Panel ─────────────────────────────────────────────────────────
function CompletionPanel({ sessionId, tenant, closeMonth, closeYear, _accounts, onComplete, onGoBack }) {
  const tid = tenant?.tenant_id;
  const [plReviewed, setPlReviewed] = useState(false);
  const [bsReviewed, setBsReviewed] = useState(false);
  const [analysisReviewed, setAnalysisReviewed] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [plOpen, setPlOpen] = useState(false);
  const [bsOpen, setBsOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [locking, setLocking] = useState(false);

  const canLock = plReviewed && bsReviewed && analysisReviewed && analysisResult?.okToClose;

  useEffect(() => {
    if (!analysisResult?.okToClose) setAnalysisReviewed(false);
  }, [analysisResult]);

  async function handleLock() {
    setLocking(true);
    await onComplete();
    setLocking(false);
  }

  const steps = [
    {
      num: 1, icon: '📊', title: 'Review Profit & Loss',
      subtitle: `${closeMonth} ${closeYear}`,
      done: plReviewed, open: plOpen, setOpen: setPlOpen,
      isAvailable: true,
      onConfirm: () => { setPlReviewed(true); setPlOpen(false); setBsOpen(true); },
      confirmLabel: '✓ P&L looks good — continue',
      content: tid ? <ReportsPanel tenantId={tid} month={closeMonth} year={closeYear} plOnly /> : null
    },
    {
      num: 2, icon: '📋', title: 'Review Balance Sheet',
      subtitle: `as at end of ${closeMonth} ${closeYear}`,
      done: bsReviewed, open: bsOpen, setOpen: setBsOpen,
      isAvailable: plReviewed,
      onConfirm: () => { setBsReviewed(true); setBsOpen(false); setAnalysisOpen(true); },
      confirmLabel: '✓ Balance Sheet looks good — continue',
      content: tid ? <ReportsPanel tenantId={tid} month={closeMonth} year={closeYear} bsOnly /> : null
    },
    {
      num: 3, icon: '🔍', title: 'Analyse & Compare Books',
      subtitle: `Compare ${closeMonth} ${closeYear} vs prior months`,
      done: analysisReviewed, open: analysisOpen, setOpen: setAnalysisOpen,
      isAvailable: bsReviewed,
      onConfirm: () => { setAnalysisReviewed(true); setAnalysisOpen(false); },
      confirmLabel: analysisResult?.okToClose ? '✓ Go decision confirmed — continue' : 'Resolve blockers before continuing',
      content: tid ? <BookAnalysisPanel tenantId={tid} sessionId={sessionId} closeMonth={closeMonth} closeYear={closeYear} onGoBack={onGoBack} onResultChange={setAnalysisResult} /> : null
    },
    {
      num: 4, icon: '✅', title: 'Complete Close',
      subtitle: `Mark ${closeMonth} ${closeYear} complete`,
      done: false, open: canLock, setOpen: () => {},
      isAvailable: canLock,
      content: null
    }
  ];

  return (
    <div className="fade-in" style={{ marginTop: 24 }}>
      {/* Celebration header */}
      <div style={{ textAlign: 'center', padding: '32px 24px 28px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '2px solid #bbf7d0', borderRadius: '12px 12px 0 0' }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
        <h2 style={{ ...S.h2, color: '#15803d', fontSize: 22, marginBottom: 8 }}>All close steps complete for {closeMonth} {closeYear}!</h2>
        <p style={{ fontSize: 14, color: '#166534', margin: 0 }}>
          Finalise the close by reviewing your reports, confirming the go/no-go decision, then marking this session complete.
        </p>
      </div>

      {/* Guided steps */}
      <div style={{ border: '2px solid #bbf7d0', borderTop: 'none', borderRadius: '0 0 12px 12px', background: '#fff', overflow: 'hidden' }}>
        {steps.map((step, idx) => {
          const isLast = step.num === 4;
          const isLocked = !step.isAvailable && !step.done;

          return (
            <div key={step.num} style={{ borderBottom: idx < steps.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                  cursor: step.isAvailable && !isLast && !step.done ? 'pointer' : 'default',
                  background: step.done ? '#f0fdf4' : step.open ? '#fafbff' : '#fff',
                  opacity: isLocked ? 0.4 : 1, transition: 'all 0.15s' }}
                onClick={() => step.isAvailable && !isLast && step.setOpen(o => !o)}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  background: step.done ? '#16a34a' : step.isAvailable ? '#fff' : '#f3f4f6',
                  border: `2px solid ${step.done ? '#16a34a' : step.isAvailable ? '#6366f1' : '#e5e7eb'}`,
                  color: step.done ? '#fff' : '#374151' }}>
                  {step.done ? '✓' : step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: step.done ? '#15803d' : step.isAvailable ? '#1e1b4b' : '#9ca3af' }}>
                    Step {step.num}: {step.title}
                  </div>
                  <div style={{ fontSize: 12, color: step.done ? '#16a34a' : '#9ca3af', marginTop: 1 }}>
                    {step.done ? 'Done ✓' : isLocked ? `Complete Step ${step.num - 1} first` : step.subtitle}
                  </div>
                </div>
                {step.isAvailable && !isLast && !step.done && (
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>{step.open ? '▲' : '▼'}</span>
                )}
              </div>

              {/* Step content */}
              {step.open && !isLast && (
                <div style={{ padding: '0 20px 20px', background: '#fafbff', borderTop: '1px solid #f3f4f6' }} className="fade-in">
                  {step.content}
                  <div style={{ marginTop: 16 }}>
                    <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '10px 22px', fontSize: 14 }}
                      onClick={step.onConfirm}
                      disabled={step.num === 3 && !analysisResult?.okToClose}>
                      {step.confirmLabel}
                    </button>
                  </div>
                </div>
              )}

              {/* Completion step */}
              {isLast && canLock && (
                <div style={{ padding: '0 20px 24px', borderTop: '1px solid #f3f4f6' }} className="fade-in">
                  <div style={{ ...S.alert, ...S.alertBlue, fontSize: 13, marginBottom: 16 }}>
                    This app marks the month-end session complete here. If you also want to lock the accounting period in Xero, do that manually in Xero after this step.
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '12px 28px', fontSize: 15, opacity: locking ? 0.6 : 1 }}
                      disabled={locking} onClick={handleLock}>
                      {locking ? <><Spinner size={16} color="#fff" /> Completing…</> : `✓ Complete ${closeMonth} ${closeYear} Close`}
                    </button>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>You can still set the lock date manually inside Xero afterwards.</span>
                  </div>
                </div>
              )}

              {isLast && !canLock && (
                <div style={{ padding: '12px 20px', fontSize: 13, color: '#9ca3af' }}>
                  Complete Steps 1–3 above and get a clear go decision to continue.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistItem({ item, index, onToggle, onUpload, uploadingByBank, uploadError, bankAccounts, selectedBank, onSelectBank, duplicateTransactions, onResolveDuplicate, tenant, closeMonth, closeYear, accounts, isActive, transactions, sessionId }) {
  const [open, setOpen] = useState(isActive);
  const fileRef = useRef();

  useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  const isDuplicateStep = /duplic/i.test((item.title || '') + (item.description || ''));
  const hasMultipleBanks = (bankAccounts || []).filter(b => b.Code).length > 1;
  const hasDupes = duplicateTransactions?.length > 0;

  return (
    <div
      className={!item.done ? 'checklist-item' : ''}
      style={{
        border: `2px solid ${item.done ? '#bbf7d0' : isActive ? '#6366f1' : '#f3f4f6'}`,
        borderRadius: 10, marginBottom: 8,
        background: item.done ? '#f0fdf4' : isActive ? '#fafbff' : '#fff',
        boxShadow: isActive ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
        transition: 'all 0.2s'
      }}>
      {isActive && !item.done && (
        <div style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '4px 16px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.04em' }}>▶ DO THIS NOW</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div
          style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${item.done ? '#16a34a' : isActive ? '#6366f1' : '#d1d5db'}`, background: item.done ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, flexShrink: 0, cursor: 'pointer', transition: 'all 0.2s' }}
          onClick={e => { e.stopPropagation(); onToggle(); }}>
          {item.done && '✓'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: item.done ? '#15803d' : isActive ? '#4f46e5' : '#1e1b4b', textDecoration: item.done ? 'line-through' : 'none' }}>
              {index + 1}. {item.title}
            </span>
            <span style={{ ...S.pill, ...(CAT_COLORS[item.category] || S.pillGray), padding: '2px 8px', fontSize: 11 }}>{item.category}</span>
            {isDuplicateStep && hasDupes && <span style={{ ...S.pill, ...S.pillRed, fontSize: 11 }}>⚠ {duplicateTransactions.length} dupes detected</span>}
          </div>
        </div>
        <span style={{ color: isActive ? '#6366f1' : '#9ca3af', fontSize: 12, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 16px 16px 56px' }} className="fade-in">
          <p style={{ ...S.p, marginBottom: 12 }}>{item.description}</p>
          {item.tips?.map((tip, i) => (
            <div key={i} style={{ fontSize: 13, color: '#7c3aed', background: '#f5f3ff', padding: '8px 12px', borderRadius: 8, marginBottom: 6, borderLeft: '3px solid #8b5cf6' }}>
              💡 {tip}
            </div>
          ))}

          {/* Category-specific in-app action panels */}
          {(() => {
            const tid = tenant?.tenant_id;

            // Bank upload step: tabbed panel (upload+push / AR / AP)
            if (item.category === 'bank_upload')
              return <BankUploadStepPanel
                item={item} sessionId={sessionId}
                onUpload={onUpload} uploading={!!(uploadingByBank || {})[item.bankAccountId]} uploadError={uploadError}
                transactions={transactions} accounts={accounts}
                bankAccounts={bankAccounts} tenant={tenant}
                closeMonth={closeMonth} closeYear={closeYear}
                onResolveDuplicate={onResolveDuplicate}
              />;

            // Recurring bills
            if (item.category === 'recurring_bills' && tid)
              return <RecurringBillsPanel tenantId={tid} closeMonth={closeMonth} closeYear={closeYear} />;

            // Duplicates
            if (item.category === 'duplicates')
              return hasDupes
                ? <DuplicateResolutionPanel duplicates={duplicateTransactions} onResolve={onResolveDuplicate} />
                : <div style={{ ...S.alert, ...S.alertGreen, marginTop: 12, fontSize: 13 }}>✅ No duplicate transactions detected in uploaded data.</div>;

            // Approve bills
            if (item.category === 'approve_bills' && tid)
              return <ApproveBillsPanel tenantId={tid} />;

            // Depreciation journal
            if (item.category === 'depreciation' && tid)
              return <DepreciationPanel tenantId={tid} accounts={accounts} item={item} closeMonth={closeMonth} closeYear={closeYear} />;

            // Accruals journal
            if (item.category === 'accruals' && tid)
              return <AccrualsPanel tenantId={tid} accounts={accounts} closeMonth={closeMonth} closeYear={closeYear} />;

            // Other steps: open Xero or mark done
            if (item.category === 'other')
              return <OtherStepPanel onToggle={onToggle} />;

            // Legacy categories (backwards compat)
            if (item.category === 'journals' && tid)
              return <JournalEntryPanel tenantId={tid} accounts={accounts} closeMonth={closeMonth} closeYear={closeYear} />;
            if (item.category === 'payables' && tid && !item.requiresCsvUpload)
              return <PayablesPanel tenantId={tid} month={closeMonth} year={closeYear} />;
            if (item.category === 'receivables' && tid && !item.requiresCsvUpload)
              return <ReceivablesPanel tenantId={tid} month={closeMonth} year={closeYear} />;

            return null;
          })()}

          {/* Bank account selector + CSV upload — only for non-bank_upload steps (bank_upload uses BankUploadStepPanel above) */}
          {onUpload && item.category !== 'bank_upload' && (
            <div style={{ marginTop: 14 }}>
              {hasMultipleBanks && (
                <div style={{ ...S.alert, ...S.alertBlue, fontSize: 12, marginBottom: 10 }}>
                  📋 You have <strong>{bankAccounts.filter(b => b.Code).length} bank accounts</strong>. Upload a separate CSV for each account — select the account first, then upload its statement. Each upload only affects that account's transactions.
                </div>
              )}
              {bankAccounts?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <label style={S.label}>Select bank account for this statement</label>
                  <select style={{ ...S.select, maxWidth: 320 }} value={selectedBank || ''} onChange={e => onSelectBank(e.target.value)}>
                    <option value="">— Select bank account —</option>
                    {bankAccounts.map(b => {
                      const id = b.AccountID || b.account_code;
                      return <option key={id} value={id}>{b.Name || b.name} ({b.Code || b.xero_code})</option>;
                    })}
                  </select>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => onUpload(e.target.files[0], selectedBank)} />
              <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '9px 18px', opacity: !selectedBank ? 0.5 : 1 }}
                onClick={() => { if (!selectedBank) { alert('Please select a bank account first.'); return; } fileRef.current?.click(); }}
                disabled={!!(uploadingByBank || {})[selectedBank]}>
                {(uploadingByBank || {})[selectedBank] ? <><Spinner size={16} color="#fff" /> Uploading & Categorising…</> : '📤 Upload Bank Statement CSV'}
              </button>
              {(uploadingByBank || {})[selectedBank] && <div style={{ marginTop: 10 }}><ProgressBar animated height={5} /></div>}
              {uploadError && <div style={{ ...S.alert, ...S.alertRed, marginTop: 10 }}>{uploadError}</div>}
            </div>
          )}
          {!item.done && item.category !== 'other' && (
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, marginTop: 14, padding: '6px 14px', fontSize: 12 }} onClick={onToggle}>
              ✓ Mark Done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TxnRow({ txn, expanded, accounts, onToggle, onUpdate, onAttach, onRemoveAttachment, onResolveDuplicate }) {
  const conf = txn.ai_confidence || 0;
  const confColor = conf >= 0.8 ? '#16a34a' : conf >= 0.5 ? '#ca8a04' : '#dc2626';
  const [editAccount, setEditAccount] = useState(txn.user_account_code || txn.ai_account_code || '');
  const [editDesc, setEditDesc]       = useState(txn.description || '');
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const attachRef = useRef();

  function saveEdit() {
    const acct = accounts.find(a => a.Code === editAccount);
    onUpdate({ user_account_code: editAccount, user_account_name: acct?.Name || txn.ai_account_name, description: editDesc });
  }

  async function handleAttach(file) {
    if (!file) return;
    setAttachUploading(true); setAttachError('');
    try {
      const data = await onAttach(file);
      if (data?.error) throw new Error(getUserFacingErrorMessage(data?.error));
    } catch (e) { setAttachError(getUserFacingErrorMessage(e)); }
    setAttachUploading(false);
  }

  const statusColors = {
    approved: { border: '#bbf7d0', bg: '#f9fff9' },
    rejected: { border: '#fecaca', bg: '#fff9f9' },
    pending:  { border: '#f3f4f6', bg: '#fff' },
  };
  const sc = statusColors[txn.user_status] || statusColors.pending;
  const hasAttachment = !!txn.attachment_filename;

  return (
    <div style={{ border: `1px solid ${txn.is_duplicate ? '#fecaca' : sc.border}`, borderRadius: 8, marginBottom: 5, background: sc.bg, transition: 'all 0.15s' }}>
      <div className="txn-row-click" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }} onClick={onToggle}>
        <span style={{ fontSize: 12, color: '#9ca3af', width: 82, flexShrink: 0 }}>{txn.date}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#1e1b4b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {txn.payee || txn.description}
        </span>
        <span style={{ fontSize: 12, color: '#6b7280', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {txn.user_account_name || txn.ai_account_name || '—'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: txn.type === 'ACCREC' ? '#16a34a' : '#1e1b4b', width: 80, textAlign: 'right', flexShrink: 0 }}>
          {txn.type === 'ACCREC' ? '+' : '-'}${Number(txn.amount).toFixed(2)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: confColor, width: 32, textAlign: 'center', flexShrink: 0 }}>{Math.round(conf * 100)}%</span>
        {/* Attachment indicator */}
        {hasAttachment && (
          <span title={txn.attachment_filename} style={{ fontSize: 13, flexShrink: 0 }}>📎</span>
        )}
        {txn.is_duplicate ? <span style={{ ...S.badge, background: '#fecaca', color: '#dc2626', flexShrink: 0 }}>DUP</span>
          : txn.user_status === 'approved' ? <span style={{ ...S.badge, background: '#bbf7d0', color: '#16a34a', flexShrink: 0 }}>✓</span>
          : txn.user_status === 'rejected' ? <span style={{ ...S.badge, background: '#fecaca', color: '#dc2626', flexShrink: 0 }}>✗</span>
          : <span style={{ ...S.badge, background: '#f3f4f6', color: '#9ca3af', flexShrink: 0 }}>—</span>}
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #f3f4f6' }} className="fade-in">
          {!!txn.is_duplicate && (
            <DuplicateResolutionPanel duplicates={[txn]} onResolve={onResolveDuplicate} compact />
          )}
          <div className="grid2-resp" style={{ ...S.grid2, marginTop: 14, marginBottom: 12 }}>
            <div>
              <label style={S.label}>Description</label>
              <input style={S.input} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Account</label>
              <select style={S.select} value={editAccount} onChange={e => setEditAccount(e.target.value)}>
                <option value="">— {txn.ai_account_name} (AI suggested) —</option>
                {accounts.map(a => <option key={a.AccountID} value={a.Code}>{a.Code} — {a.Name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#7c3aed', marginBottom: 14, background: '#f5f3ff', padding: '6px 10px', borderRadius: 6 }}>
            🤖 {txn.ai_reasoning}
          </div>

          {/* ── File Attachment ── */}
          <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f8faff', borderRadius: 10, border: '1px solid #e0e7ff' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              📎 Supporting Document
            </div>
            {hasAttachment ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#1e1b4b', background: '#ede9fe', padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📄 {txn.attachment_filename}
                </span>
                <button
                  className="btn-secondary"
                  style={{ ...S.btn, ...S.btnSecondary, padding: '4px 12px', fontSize: 12 }}
                  onClick={() => attachRef.current?.click()}
                >
                  Replace
                </button>
                <button
                  className="btn-danger"
                  style={{ ...S.btn, ...S.btnDanger, padding: '4px 12px', fontSize: 12 }}
                  onClick={onRemoveAttachment}
                >
                  ✕ Remove
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn-secondary"
                  style={{ ...S.btn, ...S.btnSecondary, padding: '6px 14px', fontSize: 12 }}
                  onClick={() => attachRef.current?.click()}
                  disabled={attachUploading}
                >
                  {attachUploading ? <><Spinner size={13} /> Uploading…</> : '📎 Attach File'}
                </button>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>PDF, image, or any document</span>
              </div>
            )}
            <input
              ref={attachRef}
              type="file"
              style={{ display: 'none' }}
              onChange={e => handleAttach(e.target.files[0])}
            />
            {attachError && <div style={{ ...S.alert, ...S.alertRed, marginTop: 8, marginBottom: 0 }}>{attachError}</div>}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-green" style={{ ...S.btn, ...S.btnGreen, padding: '6px 14px', fontSize: 12 }} onClick={() => { saveEdit(); onUpdate({ user_status: 'approved' }); }}>✓ Approve</button>
            <button className="btn-danger" style={{ ...S.btn, ...S.btnDanger, padding: '6px 14px', fontSize: 12 }} onClick={() => onUpdate({ user_status: 'rejected' })}>✗ Reject</button>
            <button className="btn-secondary" style={{ ...S.btn, ...S.btnSecondary, padding: '6px 14px', fontSize: 12 }} onClick={saveEdit}>Save Edits</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Push ─────────────────────────────────────────────────────────────
function PushStep({ session, transactions, bankAccounts, initialBankId, onDone }) {
  const initBank = bankAccounts.find(b => (b.AccountID || b.account_code) === initialBankId) || null;
  const sessionId = session?.id || session?.sessionId || '';
  const [bankAccountId,   setBankAccountId]   = useState(initialBankId || '');
  const [bankAccountName, setBankAccountName] = useState(initBank?.Name || '');
  const [results,   setResults]   = useState(null);
  const [pushing,   setPushing]   = useState(false);
  const [pushProgress, setPushProgress] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [error,     setError]     = useState('');

  const approved = transactions.filter(t => t.user_status === 'approved');
  const dupes    = approved.filter(t => t.is_duplicate);

  async function doPush() {
    setPushing(true); setError(''); setPushProgress(0);
    const interval = setInterval(() => setPushProgress(p => Math.min(p + Math.random() * 12, 90)), 800);
    try {
      if (!sessionId) throw new Error('Session not found. Please go back and create the close session again.');
      const r = await apiFetch(`/close/session/${sessionId}/push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAccountId, bankAccountName })
      });
      const data = await r.json();
      clearInterval(interval);
      if (!r.ok) throw new Error(getUserFacingErrorMessage(data?.error));
      setPushProgress(100);
      await new Promise(r => setTimeout(r, 400));
      setResults(data);
    } catch (e) { clearInterval(interval); setError(getUserFacingErrorMessage(e)); }
    setPushing(false);
  }

  if (results) {
    const success = results.results.filter(r => r.status === 'pushed');
    const failed  = results.results.filter(r => r.status !== 'pushed');
    return (
      <div style={S.card} className="fade-in">
        <h2 style={S.h2}>Push Results</h2>
        <div className="grid3-resp" style={{ ...S.grid3, marginBottom: 24 }}>
          <div style={{ ...S.statCard, background: '#f0fdf4', border: '1px solid #bbf7d0' }}><div style={{ ...S.statNum, color: '#16a34a' }}>{success.length}</div><div style={S.statLabel}>Pushed ✓</div></div>
          <div style={{ ...S.statCard, background: failed.length ? '#fef2f2' : '#f0fdf4', border: `1px solid ${failed.length ? '#fecaca' : '#bbf7d0'}` }}><div style={{ ...S.statNum, color: failed.length ? '#dc2626' : '#16a34a' }}>{failed.length}</div><div style={S.statLabel}>Failed</div></div>
          <div style={S.statCard}><div style={S.statNum}>{results.total}</div><div style={S.statLabel}>Total</div></div>
        </div>
        {success.length > 0 && (
          <div style={{ ...S.alert, ...S.alertGreen, marginBottom: 16 }}>
            ✅ {success.length} transaction{success.length !== 1 ? 's' : ''} pushed to Xero as reconciled bank transactions (Spend/Receive Money).
            {success.filter(r => r.hasAttachment).length > 0 && (
              <span> 📎 {success.filter(r => r.hasAttachment).length} supporting document{success.filter(r => r.hasAttachment).length !== 1 ? 's' : ''} attached to bills in Xero.</span>
            )}
          </div>
        )}
        {failed.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...S.alert, ...S.alertRed, marginBottom: 10 }}>⚠ {failed.length} transaction(s) failed. Review errors below.</div>
            {failed.map(f => {
              const txn = transactions.find(t => t.id === f.id);
              return <div key={f.id} style={{ fontSize: 13, padding: '8px 12px', background: '#fef2f2', borderRadius: 8, marginBottom: 6 }}><strong>{txn?.payee || txn?.description}</strong> — {f.error}</div>;
            })}
          </div>
        )}
        <div style={{ ...S.alert, ...S.alertBlue, marginBottom: 16, fontSize: 13 }}>
          ℹ️ Return to the checklist to tick off any remaining steps, then click <strong>"Complete Month-End Close"</strong> when all steps are done.
        </div>
        <button className="btn-primary" style={{ ...S.btn, ...S.btnPrimary, padding: '12px 28px', fontSize: 15 }} onClick={onDone}>← Back to Checklist →</button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={S.card}>
        <h2 style={S.h2}>🚀 Push to Xero</h2>
        <p style={S.p}>We'll create a <strong>Bill</strong> for each transaction, then post a <strong>Bank Payment</strong> to mark it as reconciled.</p>

        <div style={{ ...S.alert, ...S.alertBlue, marginBottom: 20 }}>
          <strong>What will happen:</strong>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
            <li>Each approved transaction is created as a <strong>Spend Money</strong> (expense) or <strong>Receive Money</strong> (income) bank transaction in Xero</li>
            <li>Linked directly to your selected bank account and marked as <strong>reconciled</strong></li>
            <li>Supporting documents (if attached) are uploaded to each transaction in Xero</li>
          </ol>
        </div>

        <div className="grid2-resp" style={{ ...S.grid2, marginBottom: 20, maxWidth: 420 }}>
          <div>
            <label style={S.label}>Transactions to Push</label>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#6366f1', paddingTop: 4 }}>{approved.length}</div>
          </div>
          <div>
            <label style={S.label}>Bank Account</label>
            <select style={S.select} value={bankAccountId} onChange={e => {
              const b = bankAccounts.find(b => (b.AccountID || b.account_code) === e.target.value);
              setBankAccountId(e.target.value);
              setBankAccountName(b?.Name || b?.name || '');
            }}>
              <option value="">— Select bank account —</option>
              {bankAccounts.map(b => {
                const id = b.AccountID || b.account_code;
                return <option key={id} value={id}>{b.Name || b.name} ({b.Code || b.xero_code})</option>;
              })}
            </select>
          </div>
        </div>

        {dupes.length > 0 && (
          <div style={{ ...S.alert, ...S.alertYellow, marginBottom: 20 }}>
            ⚠ {dupes.length} approved transaction(s) are flagged as possible duplicates.
            <div style={{ marginTop: 8 }}>
              {dupes.map(d => <div key={d.id} style={{ fontSize: 13, marginTop: 4 }}>• {d.payee || d.description} — ${Number(d.amount).toFixed(2)}</div>)}
            </div>
          </div>
        )}

        {/* Review table */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ background: '#f8faff', padding: '10px 16px', fontWeight: 600, fontSize: 13, color: '#1e1b4b', borderBottom: '1px solid #e5e7eb' }}>
            Review Before Pushing — {approved.length} transaction{approved.length !== 1 ? 's' : ''}
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {approved.map(txn => (
              <div key={txn.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #f9fafb', fontSize: 13 }}>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 86, flexShrink: 0 }}>{txn.date}</span>
                <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.payee || txn.description}</span>
                <span style={{ fontSize: 12, color: '#6b7280', width: 140, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{txn.user_account_name || txn.ai_account_name}</span>
                <span style={{ fontWeight: 600, color: txn.type === 'ACCREC' ? '#16a34a' : '#1e1b4b', width: 80, textAlign: 'right', flexShrink: 0 }}>
                  {txn.type === 'ACCREC' ? '+' : '-'}${Number(txn.amount).toFixed(2)}
                </span>
                {!!txn.is_duplicate && <span style={{ ...S.badge, background: '#fecaca', color: '#dc2626' }}>DUP</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Confirmation */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', background: '#f8faff', borderRadius: 10, marginBottom: 20, cursor: 'pointer', border: confirmed ? '1px solid #bbf7d0' : '1px solid #e5e7eb', transition: 'border 0.2s' }}>
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer', marginTop: 1, flexShrink: 0, accentColor: '#6366f1' }} />
          <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
            I have reviewed all <strong>{approved.length} transactions</strong> and confirm they are correct. I understand this will create bills and payments in Xero.
          </span>
        </label>

        {error && <div style={{ ...S.alert, ...S.alertRed }}>{error}</div>}

        {pushing && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Spinner size={16} />
              <span style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>Pushing to Xero… please wait</span>
            </div>
            <ProgressBar pct={pushProgress} height={6} />
          </div>
        )}

        <button
          className="btn-green"
          style={{ ...S.btn, ...S.btnGreen, padding: '14px 28px', fontSize: 15 }}
          onClick={doPush}
          disabled={!confirmed || !bankAccountId || pushing}
        >
          {pushing ? <><Spinner size={18} color="#fff" /> Pushing…</> : `🚀 Push ${approved.length} Transactions to Xero`}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Done ──────────────────────────────────────────────────────────────
function DoneStep({ _session, onNewMonth }) {
  return (
    <div style={{ ...S.card, maxWidth: 480, margin: '0 auto', textAlign: 'center', padding: '52px 40px' }} className="fade-in">
      <div style={{ fontSize: 72, marginBottom: 20 }}>🎉</div>
      <h2 style={{ ...S.h2, textAlign: 'center', fontSize: 24, marginBottom: 10 }}>Month-End Close Complete!</h2>
      <p style={{ ...S.p, textAlign: 'center', fontSize: 15, marginBottom: 32 }}>
        Your books have been closed. All approved transactions have been posted as Spend Money / Receive Money bank transactions and reconciled in Xero.
      </p>
      <div style={{ ...S.alert, ...S.alertGreen, textAlign: 'left', marginBottom: 32, lineHeight: 2 }}>
        ✅ Bank transactions posted (Spend / Receive Money)<br />
        ✅ Transactions reconciled against bank statement<br />
        ✅ Month-end close session saved
      </div>
      <button
        className="btn-primary"
        style={{ ...S.btn, ...S.btnPrimary, width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: 15 }}
        onClick={onNewMonth}
      >
        📅 Start Another Month
      </button>
    </div>
  );
}
