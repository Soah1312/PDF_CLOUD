import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, Loader2, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';

export const ConfirmEmail = () => {
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
      setErrorMessage('Please enter both your email and the 6-digit verification code.');
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
      <div className="max-w-sm w-full p-6 sm:p-8 rounded-2xl border border-white/10 bg-[#121214] space-y-6 shadow-2xl">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Verify Email
          </h1>
          <p className="mt-1 text-xs text-[#9E9E98]">
            Enter the 6-digit confirmation code sent to your email.
          </p>
        </div>

        {successMessage && (
          <div className="p-3 rounded-xl border border-emerald-900/60 bg-emerald-950/20 text-xs text-emerald-300 flex items-center space-x-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl border border-rose-900/60 bg-rose-950/20 text-xs text-rose-300 flex items-center space-x-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-medium text-[#DCDCD6] mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#DCDCD6] mb-1">
              Verification Code
            </label>
            <input
              type="text"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="123456"
              className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-base text-center text-white placeholder-[#666662] focus:outline-none focus:border-white/30 font-mono tracking-widest"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-full bg-[#E8E8E3] hover:bg-white text-[#111113] font-semibold text-xs tracking-tight flex items-center justify-center transition-all duration-150 active:scale-[0.97] disabled:opacity-40 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                Confirm Code <ArrowRight className="w-3.5 h-3.5 ml-1.5 stroke-[2.2]" />
              </>
            )}
          </button>
        </form>

        <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-[#9E9E98]">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="inline-flex items-center text-[11px] text-[#DCDCD6] hover:text-white disabled:opacity-50 active:scale-[0.95]"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${resending ? 'animate-spin' : ''}`} />
            Resend Code
          </button>
          <Link to="/login" className="text-[11px] text-[#9E9E98] hover:text-[#E8E8E3]">
            Back to sign in &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ConfirmEmail;
