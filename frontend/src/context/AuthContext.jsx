import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  cognitoSignUp,
  cognitoConfirmSignUp,
  cognitoResendConfirmationCode,
  cognitoSignIn,
  parseJwtPayload,
} from '../services/cognito';
import { fetchAuthConfig, syncUserProfile, fetchCurrentUser } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState({
    userPoolId: '',
    clientId: '',
    region: 'ap-south-1',
    isConfigured: false,
  });

  // Fetch Cognito client configuration from backend
  const loadAuthConfig = useCallback(async () => {
    try {
      const config = await fetchAuthConfig();
      setAuthConfig(config);
      return config;
    } catch (error) {
      console.warn('[AuthContext] Could not retrieve Cognito config from backend:', error);
      return authConfig;
    }
  }, []);

  // Initialize session from local storage on mount
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      const conf = await loadAuthConfig();
      const savedToken = localStorage.getItem('cloudpdf_auth_token');

      if (savedToken) {
        const payload = parseJwtPayload(savedToken);
        const currentTime = Math.floor(Date.now() / 1000);

        if (payload && payload.exp && payload.exp > currentTime) {
          const email = payload.email || payload['cognito:username'] || 'user@cognito';
          const sub = payload.sub;
          setUser({ email, sub, ...payload });
          setToken(savedToken);
          setIsAuthenticated(true);

          // Verify/sync with backend in background
          try {
            await fetchCurrentUser();
          } catch (err) {
            console.warn('[AuthContext] Backend profile sync failed:', err);
          }
        } else {
          // Token expired
          localStorage.removeItem('cloudpdf_auth_token');
          setUser(null);
          setToken(null);
          setIsAuthenticated(false);
        }
      }

      setIsLoading(false);
    };

    initializeAuth();
  }, [loadAuthConfig]);

  // Sign In function
  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const currentConfig = authConfig.isConfigured ? authConfig : await loadAuthConfig();

      if (!currentConfig.clientId) {
        throw new Error(
          'Amazon Cognito is not configured. Please ensure COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are set in backend .env'
        );
      }

      const authResult = await cognitoSignIn({
        email,
        password,
        clientId: currentConfig.clientId,
        region: currentConfig.region,
      });

      // Use IdToken for API requests as it contains full user claims (email, sub)
      const jwtToken = authResult.IdToken;
      localStorage.setItem('cloudpdf_auth_token', jwtToken);
      if (authResult.RefreshToken) {
        localStorage.setItem('cloudpdf_refresh_token', authResult.RefreshToken);
      }

      const claims = parseJwtPayload(jwtToken);
      const userProfile = {
        email: claims.email || email,
        sub: claims.sub,
        ...claims,
      };

      setToken(jwtToken);
      setUser(userProfile);
      setIsAuthenticated(true);

      // Sync user profile to RDS
      try {
        await syncUserProfile();
      } catch (syncErr) {
        console.warn('[AuthContext] Post-login RDS sync warning:', syncErr);
      }

      return userProfile;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign Up function
  const register = async (email, password) => {
    setIsLoading(true);
    try {
      const currentConfig = authConfig.isConfigured ? authConfig : await loadAuthConfig();
      if (!currentConfig.clientId) {
        throw new Error(
          'Amazon Cognito is not configured. Please check COGNITO_CLIENT_ID in your backend configuration.'
        );
      }

      return await cognitoSignUp({
        email,
        password,
        clientId: currentConfig.clientId,
        region: currentConfig.region,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Confirm verification code
  const confirmCode = async (email, code) => {
    setIsLoading(true);
    try {
      const currentConfig = authConfig.isConfigured ? authConfig : await loadAuthConfig();
      return await cognitoConfirmSignUp({
        email,
        code,
        clientId: currentConfig.clientId,
        region: currentConfig.region,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Resend confirmation code
  const resendCode = async (email) => {
    const currentConfig = authConfig.isConfigured ? authConfig : await loadAuthConfig();
    return await cognitoResendConfirmationCode({
      email,
      clientId: currentConfig.clientId,
      region: currentConfig.region,
    });
  };

  // Sign Out function
  const logout = () => {
    localStorage.removeItem('cloudpdf_auth_token');
    localStorage.removeItem('cloudpdf_refresh_token');
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        authConfig,
        login,
        register,
        confirmCode,
        resendCode,
        logout,
        refreshAuthConfig: loadAuthConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

