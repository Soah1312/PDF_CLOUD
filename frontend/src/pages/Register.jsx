import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

export const Register = () => {
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
      <div className="max-w-sm w-full p-6 sm:p-8 rounded-2xl border border-white/10 bg-[#121214] space-y-6 shadow-2xl">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Create Free Account
          </h1>
          <p className="mt-1 text-xs text-[#9E9E98]">
            Get 500 MB cloud persistence and forensic leak tracking.
          </p>
        </div>

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
              Password (min 8 characters)
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

          <div>
            <label className="block text-xs font-medium text-[#DCDCD6] mb-1">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30"
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
                Creating account...
              </>
            ) : (
              <>
                Create Account <ArrowRight className="w-3.5 h-3.5 ml-1.5 stroke-[2.2]" />
              </>
            )}
          </button>
        </form>

        <div className="pt-3 border-t border-white/5 text-center text-xs text-[#9E9E98]">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[#E8E8E3] hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
