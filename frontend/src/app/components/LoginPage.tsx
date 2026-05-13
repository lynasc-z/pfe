import { useState } from 'react';
import { motion } from 'motion/react';
import { SonatrachLogo } from './SonatrachLogo';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center px-8 py-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="mb-12">
            <SonatrachLogo size="default" />
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8 text-4xl text-[#0A0A0A]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            >
              LeaveRec
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-3 text-gray-600"
            >
              Employee Leave Management System
            </motion.p>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                  placeholder="your.name@sonatrach.dz"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-[#0A0A0A]" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-[#FAFAFA] border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-all"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#FF6B00] text-white rounded-lg hover:bg-[#E05F00] transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
              whileHover={{ scale: loading ? 1 : 1.01 }}
              whileTap={{ scale: loading ? 1 : 0.99 }}
            >
              <span className={loading ? 'opacity-0' : ''}>Sign In</span>
              {loading && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </motion.div>
              )}
            </motion.button>



            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg"
              >
                <p className="text-sm text-red-600">{error}</p>
              </motion.div>
            )}
          </motion.form>

          {/* Demo accounts */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-8"
          >
            <p className="text-xs text-gray-400 mb-3 text-center" style={{ fontFamily: 'var(--font-body)' }}>
              Demo accounts — click to fill &nbsp;·&nbsp; password: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">password123</code>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { role: 'Admin', email: 'admin@sonatrach.dz', name: 'Mouloud Ouali', color: 'bg-purple-50 border-purple-200 hover:border-purple-400 text-purple-700' },
                { role: 'Manager', email: 'manager1@sonatrach.dz', name: 'Karim Hadj-Ahmed', color: 'bg-blue-50 border-blue-200 hover:border-blue-400 text-blue-700' },
                { role: 'HR', email: 'fatima@sonatrach.dz', name: 'Fatima Hadj', color: 'bg-green-50 border-green-200 hover:border-green-400 text-green-700' },
                { role: 'Employee', email: 'ahmed@sonatrach.dz', name: 'Ahmed Benali', color: 'bg-orange-50 border-orange-200 hover:border-orange-400 text-orange-700' },
              ].map(({ role, email: demoEmail, name, color }) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => { setEmail(demoEmail); setPassword('password123'); }}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-all ${color}`}
                >
                  <p className="text-xs font-bold" style={{ fontFamily: 'var(--font-body)' }}>{role}</p>
                  <p className="text-xs opacity-80 truncate">{name}</p>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Right side - Geometric decoration */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:flex flex-1 bg-gradient-to-br from-[#0A0A0A] to-[#1A1A1A] relative overflow-hidden items-center justify-center"
      >
        {/* Geometric shapes */}
        <div className="absolute inset-0">
          <motion.div
            className="absolute top-1/4 right-1/4 w-64 h-64 border-8 border-[#FF6B00] opacity-20"
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute bottom-1/4 left-1/4 w-48 h-48 bg-[#FF6B00] opacity-10"
            animate={{ rotate: -360, scale: [1, 1.1, 1] }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border-4 border-white opacity-5 rounded-full" />
        </div>

        <div className="relative z-10 text-white text-center px-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-5xl mb-6"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}
          >
            Streamline Your Leave Management
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="text-xl text-gray-300"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Track, request, and approve employee leave with ease
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}
