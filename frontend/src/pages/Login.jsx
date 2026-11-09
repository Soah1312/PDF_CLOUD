import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

export const Login = () => {
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
        setErrorMessage('Incorrect email or password. Please try again.');
      } else if (code === 'UserNotFoundException') {
        setErrorMessage('No account found with this email. Please sign up first.');
      } else {
        setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full p-6 sm:p-8 rounded-2xl border border-white/10 bg-[#121214] space-y-6 shadow-2xl">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Sign In to CloudPDF
          </h1>
          <p className="mt-1 text-xs text-[#9E9E98]">
            Access your encrypted document vault and canary tracking.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-xl border border-rose-900/60 bg-rose-950/20 text-xs text-rose-300 flex flex-col space-y-1.5">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            {unconfirmedUser && (
              <Link
                to={`/confirm?email=${encodeURIComponent(email)}`}
                className="text-[11px] text-[#E8E8E3] underline hover:text-white"
              >
                Enter your confirmation code &rarr;
              </Link>
            )}
          </div>
        )}

        {/* Login Form */}
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
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-3 pr-9 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#9E9E98] hover:text-white"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-full bg-[#E8E8E3] hover:bg-white text-[#111113] font-semibold text-xs tracking-tight flex items-center justify-center transition-all duration-150 active:scale-[0.97] disabled:opacity-40 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign In <ArrowRight className="w-3.5 h-3.5 ml-1.5 stroke-[2.2]" />
              </>
            )}
          </button>
        </form>

        {/* Footer links */}
        <div className="pt-3 border-t border-white/5 text-center text-xs text-[#9E9E98] space-y-1.5">
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-[#E8E8E3] hover:underline">
              Create an account
            </Link>
          </p>
          <p>
            Have a verification code?{' '}
            <Link to="/confirm" className="text-[11px] text-[#9E9E98] hover:text-[#E8E8E3]">
              Confirm email code
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
