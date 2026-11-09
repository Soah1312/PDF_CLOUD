import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight, Lock } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [unconfirmedUser, setUnconfirmedUser] = useState(false);

  const destination = location.state?.from?.pathname || '/workspace';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setUnconfirmedUser(false);

    if (!email || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      navigate(destination, { replace: true });
    } catch (err) {
      console.error('Login error:', err);
      const code = err.code || '';
      if (code === 'UserNotConfirmedException') {
        setUnconfirmedUser(true);
        setErrorMessage('Account pending verification. Enter the code sent to your email.');
      } else if (code === 'NotAuthorizedException') {
        setErrorMessage('Incorrect email or password. Please verify credentials.');
      } else if (code === 'UserNotFoundException') {
        setErrorMessage('No member account found with this email.');
      } else {
        setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
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
            <Lock className="w-3 h-3 text-ink-faint" />
            <span>Encrypted Cloud Vault</span>
          </div>
          <h1 className="font-display text-2xl tracking-tight text-ink">
            Sign In to Vault
          </h1>
          <p className="text-xs text-ink-soft">
            Access your AES-256 encrypted folios and forensic canary ledger.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded border border-red/40 bg-red/10 text-xs text-ink flex flex-col space-y-1.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red" />
              <span>{errorMessage}</span>
            </div>
            {unconfirmedUser && (
              <Link
                to={`/confirm?email=${encodeURIComponent(email)}`}
                className="text-[11px] text-red font-medium underline"
              >
                Enter your confirmation code →
              </Link>
            )}
          </div>
        )}

        {/* Login Form */}
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
              Password
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded bg-red text-vellum font-semibold text-xs tracking-tight hover:bg-red-dark transition-all duration-120 shadow-ink-button active:translate-y-px flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In to Bench</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
              </>
            )}
          </button>
        </form>

        {/* Footer links */}
        <div className="pt-3 border-t border-rule text-center text-xs text-ink-soft space-y-1.5">
          <p>
            Need a workspace?{' '}
            <Link to="/register" className="font-semibold text-red hover:underline">
              Create an account
            </Link>
          </p>
          <p>
            Have a verification code?{' '}
            <Link to="/confirm" className="font-mono text-[11px] text-ink-soft hover:text-ink">
              Confirm email code
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
