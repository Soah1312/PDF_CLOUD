import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, Loader2, AlertCircle, ArrowRight, RefreshCw, KeyRound } from 'lucide-react';

export default function ConfirmEmail() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { confirmCode, resendCode } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [successMessage, setSuccessMessage] = useState(location.state?.message || '');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const qEmail = searchParams.get('email');
    if (qEmail) {
      setEmail(qEmail);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !code) {
      setErrorMessage('Please enter both your email and the 6-digit confirmation code.');
      return;
    }

    setLoading(true);
    try {
      await confirmCode(email, code);
      setSuccessMessage('Email verified successfully! Redirecting you to sign in...');
      setTimeout(() => {
        navigate('/login', {
          state: { message: 'Your account is verified! You may now sign in.' }
        });
      }, 1500);
    } catch (err) {
      console.error('Confirmation error:', err);
      const errCode = err.code || '';
      if (errCode === 'CodeMismatchException') {
        setErrorMessage('Invalid verification code. Please check your email and try again.');
      } else if (errCode === 'ExpiredCodeException') {
        setErrorMessage('Verification code has expired. Click below to request a new code.');
      } else {
        setErrorMessage(err.message || 'Verification failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setErrorMessage('Please provide your email address first.');
      return;
    }

    setResending(true);
    setErrorMessage('');
    try {
      await resendCode(email);
      setSuccessMessage('A fresh verification code has been dispatched to your email.');
    } catch (err) {
      console.error('Resend error:', err);
      setErrorMessage(err.message || 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full p-6 sm:p-8 rounded-md border border-rule bg-vellum space-y-6 shadow-ink-lift">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
            <KeyRound className="w-3.5 h-3.5 text-moss" />
            <span>Cryptographic Verification</span>
          </div>
          <h1 className="font-display text-2xl tracking-tight text-ink">
            Verify Email
          </h1>
          <p className="text-xs text-ink-soft">
            Enter the 6-digit confirmation code dispatched to your email.
          </p>
        </div>

        {successMessage && (
          <div className="p-3 rounded border border-moss/40 bg-moss/10 text-xs text-ink flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-moss" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded border border-red/40 bg-red/10 text-xs text-ink flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3 py-2 rounded border border-rule bg-paper text-base sm:text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              6-Digit Code
            </label>
            <input
              type="text"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="123456"
              className="w-full px-3 py-2.5 rounded border border-rule bg-paper text-center text-lg font-mono font-bold tracking-widest text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded bg-red text-vellum font-semibold text-xs tracking-tight hover:bg-red-dark transition-all duration-120 shadow-ink-button active:translate-y-px flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying code...</span>
              </>
            ) : (
              <>
                <span>Confirm Code</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
              </>
            )}
          </button>
        </form>

        <div className="pt-3 border-t border-rule flex items-center justify-between text-xs text-ink-soft">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="inline-flex items-center text-[11px] font-mono text-ink-soft hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${resending ? 'animate-spin' : ''}`} />
            <span>Resend Code</span>
          </button>
          <Link to="/login" className="text-[11px] font-mono text-red hover:underline">
            Back to sign in →
          </Link>
        </div>
      </div>
    </div>
  );
}
