import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Activity, Shield, Radio, Brain, User } from 'lucide-react';
import WaveformSVG from '@/components/WaveformSVG';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-2 mb-6">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-primary tracking-wide uppercase">Prahari</span>
            </div>
            <h1 className="text-5xl font-extrabold text-foreground leading-tight tracking-tight mb-4">
              Aurora ICU<br />Intelligence
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-md">
              Proactive clinical monitoring powered by AI. Real-time telemetry, intelligent alerting, and decision support for intensive care.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate('/auth')}
                className="h-12 px-8 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
              >
                Enter Clinical Portal
              </button>
              <button
                onClick={() => navigate('/patient/auth')}
                className="h-12 px-8 rounded-xl border border-border bg-card text-foreground font-semibold text-sm hover:bg-muted transition-all"
              >
                <span className="inline-flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Patient Login
                </span>
              </button>
            </div>
          </motion.div>

          {/* Right — Waveform */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
            className="hidden lg:flex items-center justify-center"
          >
            <WaveformSVG />
          </motion.div>
        </div>
      </div>

      {/* Bottom strip */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="border-t border-border py-6 px-8"
      >
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-clinical-success" />
            <span>Ethical AI</span>
          </div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-vital-spo2" />
            <span>Real-time Monitoring</span>
          </div>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-vital-rr" />
            <span>Decision Support Only</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
