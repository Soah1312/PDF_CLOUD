import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      navigate(`/confirm?email=${encodeURIComponent(email)}`, {
        state: { message: 'Registration initiated. Please enter the verification code sent to your email.' }
      });
    } catch (err) {
      console.error('Registration error:', err);
      const code = err.code || '';
      if (code === 'UsernameExistsException') {
        setErrorMessage('An account with this email already exists. Try signing in.');
      } else if (code === 'InvalidPasswordException') {
        setErrorMessage('Password must contain uppercase, lowercase, numbers, and at least 8 characters.');
      } else {
        setErrorMessage(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full p-6 sm:p-8 rounded-md border border-rule bg-vellum space-y-6 shadow-ink-lift">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
            <ShieldCheck className="w-3.5 h-3.5 text-moss" />
            <span>Member Enrollment</span>
          </div>
          <h1 className="font-display text-2xl tracking-tight text-ink">
            Create Bench Account
          </h1>
          <p className="text-xs text-ink-soft">
            Get 500 MB cloud persistence and forensic leak tracking ledger.
          </p>
        </div>

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
              Password (min 8 characters)
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-3 pr-10 py-2 rounded border border-rule bg-paper text-base sm:text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-faint hover:text-ink min-w-[40px] min-h-[44px] justify-center"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 rounded border border-rule bg-paper text-base sm:text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
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
                <span>Enrolling...</span>
              </>
            ) : (
              <>
                <span>Create Vault Account</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
              </>
            )}
          </button>
        </form>

        <div className="pt-3 border-t border-rule text-center text-xs text-ink-soft">
          Already enrolled?{' '}
          <Link to="/login" className="font-semibold text-red hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
