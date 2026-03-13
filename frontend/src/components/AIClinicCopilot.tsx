/**
 * AIClinicCopilot — Intelligent Clinical Assistant Chat.
 *
 * A floating AI chatbot that uses LLAMA-3 (via Groq) to provide real-time
 * clinical insights, lab summaries, and deterioration explanations.
 * It is context-aware: it automatically pulls the currently viewed patient's
 * vitals, alerts, and lab results into its prompt.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  X,
  Send,
  Loader2,
  Sparkles,
  ChevronUp,
  History,
  Info,
  User,
  Activity,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { useICUStore } from '@/store/useICUStore';
import { useAllPatients, usePatientAlerts, useLabResults } from '@/hooks/usePatientData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export default function AIClinicCopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello Dr. I'm Prahari AI. I have access to current patient data. How can I assist with clinical assessment today?",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const currentPatientId = useICUStore((s) => s.currentPatientId);
  const { data: patients = [] } = useAllPatients();
  const patient = patients.find((p) => p.id === currentPatientId);
  
  const { data: alerts = [] } = usePatientAlerts(currentPatientId);
  const { data: labs = [] } = useLabResults(currentPatientId);
  const latestVital = useICUStore((s) => currentPatientId ? s.latestVitals[currentPatientId] : null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const gkey = import.meta.env.VITE_GROQ_API_KEY;
      if (!gkey) {
        throw new Error('Groq API Key (VITE_GROQ_API_KEY) is missing.');
      }

      // Build context-rich prompt
      const contextString = patient ? `
        PATIENT CONTEXT:
        Name: ${patient.first_name} ${patient.last_name}
        MRN: ${patient.mrn}
        Diagnosis: ${patient.diagnosis || 'Unknown'}
        Risk Level: ${patient.risk_level}
        Vitals: ${JSON.stringify(latestVital || 'No recent vitals available')}
        Recent Alerts: ${alerts.filter(a => a.status === 'active').map(a => `${a.severity}: ${a.title}`).join('; ')}
        Recent Labs: ${labs.slice(0, 5).map(l => `${l.test_name}: ${l.result_value} ${l.units}`).join('; ')}
      ` : 'No patient selected.';

      const systemPrompt = `
        You are Prahari Clinical Copilot, an advanced AI assistant for ICU doctors.
        Rules:
        1. Be concise, professional, and evidence-based.
        2. Always summarize relevant vitals or labs if they explain the clinical state.
        3. Use Markdown for formatting (bold, lists).
        4. NEVER give definitive orders or prescriptions.
        5. DO NOT hallucinate patient data. Use ONLY the provided context.
        6. End responses with "Verify clinically."
        
        ${contextString}
      `;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gkey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: input }
          ],
          temperature: 0.5,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to get AI response');
      }

      const data = await response.json();
      const aiContent = data.choices[0].message.content;

      const aiMsg: Message = {
        role: 'assistant',
        content: aiContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: any) {
      console.error('Copilot Error:', error);
      toast.error(error.message || 'AI communication failed.');
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: "I'm having trouble connecting to my clinical reasoning engine. Please check your connection and API keys.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[400px] h-[600px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden mb-4"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-primary border-b border-primary/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Clinical Copilot</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-white/70 font-medium">Ready for {patient?.first_name || 'queries'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/80 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Context Summary Bar */}
            {patient && (
              <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{patient.last_name}, {patient.first_name}</span>
                </div>
                {latestVital && (
                  <div className="flex items-center gap-3 ml-auto">
                    <div className="flex items-center gap-1">
                      <Activity className="h-3 w-3 text-red-500" />
                      <span className="text-[10px] font-mono font-bold">{latestVital.heart_rate}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-[10px] font-mono font-bold">{latestVital.oxygen_saturation}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Message Area */}
            <ScrollArea className="flex-1 p-4 bg-background">
              <div ref={scrollRef} className="space-y-4">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-muted border border-border rounded-tl-none'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words prose prose-sm prose-slate dark:prose-invert">
                        {m.content}
                      </div>
                      <div
                        className={`text-[9px] mt-1.5 opacity-40 font-medium flex items-center gap-1 ${
                          m.role === 'user' ? 'justify-end' : ''
                        }`}
                      >
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted border border-border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-3">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      <span className="text-xs font-medium text-muted-foreground">Analyzing clinical data...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-card">
              <div className="flex gap-2">
                <Input
                  placeholder="Ask about vitals, lab results, or diagnosis..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="flex-1 text-sm bg-muted/30"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <p className="text-[9px] text-muted-foreground flex-1">
                  AI-driven decision support. Verify all suggestions clinically.
                </p>
                <div 
                  className="p-1 hover:bg-muted rounded text-muted-foreground transition-all cursor-help"
                  title="Context includes: Patient Details, Latest Vitals, Active Alerts, and Recent Lab Results"
                >
                  <Info className="h-3 w-3" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button
        layout
        initial={false}
        onClick={() => setIsOpen(!isOpen)}
        className={`pointer-events-auto h-14 w-14 rounded-full shadow-2xl flex items-center justify-center transition-all ${
          isOpen ? 'bg-background border border-border text-foreground hover:bg-muted' : 'bg-primary text-white hover:scale-105 active:scale-95'
        }`}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
            >
              <X className="h-6 w-6" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="relative"
            >
              <Brain className="h-6 w-6" />
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ repeat: Infinity, duration: 2.5 }}
                className="absolute -inset-2 bg-white/20 rounded-full -z-10"
              />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 h-3 w-3 bg-emerald-500 border-2 border-primary rounded-full"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
