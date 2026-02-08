// LoginView Component - Building Hawk Login Screen
// Password authentication with role selection

import { useState, useCallback } from 'react'
import { roles, type Role, type UserSession } from '../styles/theme'

interface LoginViewProps {
  onLogin: (user: UserSession) => void
}

export function LoginView({ onLogin }: LoginViewProps) {
  // Form state
  const [selectedRole, setSelectedRole] = useState<Role>('Broker/Agent')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const [isLoading, setIsLoading] = useState(false)

  // Handle password login
  const handlePasswordLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password.trim()) {
      setError('Please enter the access password')
      return
    }

    setIsLoading(true)

    try {
      // Validate password against backend
      const apiUrl = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${apiUrl}/api/auth/check`, {
        headers: { 'x-api-key': password.trim() },
      })

      if (res.status === 401) {
        setError('Invalid password. Please try again.')
        setIsLoading(false)
        return
      }

      const user: UserSession = {
        email: email || 'user@buildinghawk.com',
        role: selectedRole,
        authenticated: true,
        apiKey: password.trim(),
        loginAt: Date.now(),
      }
      localStorage.setItem('buildingHawkUser', JSON.stringify(user))

      if (rememberMe && email) {
        localStorage.setItem('buildingHawkEmail', email)
      }

      onLogin(user)
    } catch {
      setError('Could not connect to server. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [email, password, selectedRole, rememberMe, onLogin])

  // Handle forgot password
  const handleForgotPassword = useCallback(() => {
    alert('Password reset link sent to your email!')
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-dark via-navy to-navy-light">
      {/* Login Form */}
      <div className="w-full max-w-md px-5 py-8">
        <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
          {/* Logo */}
          <div className="flex justify-center mb-2">
            <div className="w-28 h-28 rounded-full bg-white/10 border-2 border-gold flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-20 h-20">
                <circle cx="50" cy="50" r="45" fill="#2d9596" opacity="0.3" />
                <path
                  d="M50 20 C30 20 20 40 20 55 C20 75 35 85 50 85 C65 85 80 75 80 55 C80 40 70 20 50 20 Z M50 30 C40 30 35 45 35 55 C35 70 42 75 50 75 C58 75 65 70 65 55 C65 45 60 30 50 30 Z M45 50 L55 50 M50 45 L50 60"
                  fill="none"
                  stroke="#d4a84b"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="42" cy="48" r="3" fill="#d4a84b" />
                <circle cx="58" cy="48" r="3" fill="#d4a84b" />
                <path d="M35 55 Q50 65 65 55" fill="none" stroke="#d4a84b" strokeWidth="2" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-white text-center drop-shadow-lg">
            Building Hawk
          </h1>
          <p className="text-sm text-white/80 text-center mb-4">
            Commercial Real Estate Platform
          </p>

          {/* Role Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white">Select Your Role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role)}
              className="px-4 py-3 text-base rounded-lg border-none bg-teal text-white cursor-pointer appearance-none bg-no-repeat"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundPosition: 'right 16px center',
              }}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          {/* Email Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="px-4 py-3 text-base rounded-lg border-none bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gold"
              autoComplete="email"
            />
          </div>

          {/* Password Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-white">Password</label>
            <div className="relative flex">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="flex-1 px-4 py-3 pr-12 text-base rounded-lg border-none bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gold"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-lg p-1"
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/20 rounded-lg text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          {/* Password Login Button */}
          <button
            type="submit"
            disabled={isLoading}
            className={`px-5 py-3 text-base font-medium rounded-lg border-2 border-white bg-transparent text-white cursor-pointer transition-colors hover:bg-white/10 ${isLoading ? 'opacity-70' : ''}`}
          >
            {isLoading ? 'Verifying...' : 'Login with Password'}
          </button>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-white text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 accent-teal cursor-pointer"
              />
              <span>Remember Me</span>
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="bg-transparent border-none text-white text-sm cursor-pointer underline opacity-90 hover:opacity-100"
            >
              Forgot Password?
            </button>
          </div>

          {/* Freemium Teaser */}
          <div className="mt-4 p-4 bg-white/10 rounded-lg text-center text-white/85 text-sm leading-relaxed">
            <p>
              <strong>Individual Brokers</strong> – Free Service to list up to 50 deals.
              After 90 days, $100/mo capped.
            </p>
            <p className="text-xs mt-2 opacity-70">
              CAM/Data/Personal Storage = $20/mo
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LoginView
