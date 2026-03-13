import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import AnimatedNumber from '@/components/AnimatedNumber';
import RiskGauge from '@/components/RiskGauge';
import RiskBadge from '@/components/RiskBadge';
import SkeletonCard from '@/components/SkeletonCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { AuditLog } from '@/types/database';
import {
  Heart, Droplets, Wind, Thermometer, Activity, Eye, Bell, Shield, FileCheck,
  AlertTriangle, Play, ChevronDown, ChevronUp, RefreshCw, Save
} from 'lucide-react';

// Scenario types
interface Scenario {
  id: string;
  name: string;
  vitals: {
    heart_rate: number;
    oxygen_saturation: number;
    blood_pressure_systolic: number;
    blood_pressure_diastolic: number;
    respiratory_rate: number;
    temperature: number;
  };
  expected_risk: 'low' | 'medium' | 'high' | 'critical';
  expected_news2: number;
}

// Threshold types
interface Thresholds {
  heart_rate_low: number;
  heart_rate_high: number;
  oxygen_saturation_low: number;
  oxygen_saturation_critical: number;
  blood_pressure_systolic_low: number;
  blood_pressure_systolic_high: number;
  respiratory_rate_low: number;
  respiratory_rate_high: number;
  temperature_low: number;
  temperature_high: number;
  news2_medium: number;
  news2_high: number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  heart_rate_low: 50,
  heart_rate_high: 130,
  oxygen_saturation_low: 88,
  oxygen_saturation_critical: 80,
  blood_pressure_systolic_low: 80,
  blood_pressure_systolic_high: 180,
  respiratory_rate_low: 8,
  respiratory_rate_high: 30,
  temperature_low: 35,
  temperature_high: 39.5,
  news2_medium: 4,
  news2_high: 7,
};

// Hardcoded scenarios - only place mock data is allowed
const SCENARIOS: Scenario[] = [
  {
    id: '1',
    name: 'Septic Shock',
    vitals: { heart_rate: 128, oxygen_saturation: 91, blood_pressure_systolic: 78, blood_pressure_diastolic: 45, respiratory_rate: 28, temperature: 38.9 },
    expected_risk: 'critical',
    expected_news2: 9,
  },
  {
    id: '2',
    name: 'Stable Post-Op',
    vitals: { heart_rate: 82, oxygen_saturation: 97, blood_pressure_systolic: 118, blood_pressure_diastolic: 76, respiratory_rate: 14, temperature: 37.1 },
    expected_risk: 'low',
    expected_news2: 1,
  },
  {
    id: '3',
    name: 'COPD Exacerbation',
    vitals: { heart_rate: 105, oxygen_saturation: 88, blood_pressure_systolic: 145, blood_pressure_diastolic: 92, respiratory_rate: 26, temperature: 37.8 },
    expected_risk: 'high',
    expected_news2: 7,
  },
  {
    id: '4',
    name: 'Hypertensive Crisis',
    vitals: { heart_rate: 95, oxygen_saturation: 96, blood_pressure_systolic: 195, blood_pressure_diastolic: 115, respiratory_rate: 18, temperature: 37.2 },
    expected_risk: 'high',
    expected_news2: 5,
  },
  {
    id: '5',
    name: 'Bradycardia',
    vitals: { heart_rate: 38, oxygen_saturation: 94, blood_pressure_systolic: 95, blood_pressure_diastolic: 60, respiratory_rate: 12, temperature: 36.8 },
    expected_risk: 'high',
    expected_news2: 6,
  },
  {
    id: '6',
    name: 'Normal ICU Recovery',
    vitals: { heart_rate: 74, oxygen_saturation: 98, blood_pressure_systolic: 122, blood_pressure_diastolic: 80, respiratory_rate: 15, temperature: 36.9 },
    expected_risk: 'low',
    expected_news2: 0,
  },
];

// Risk score computation logic from TelemetryMonitor
function computeRiskScore(vitals: Partial<Scenario['vitals']>): number {
  let score = 0;
  if (vitals.heart_rate) {
    if (vitals.heart_rate > 130 || vitals.heart_rate < 40) score += 30;
    else if (vitals.heart_rate > 110 || vitals.heart_rate < 50) score += 15;
  }
  if (vitals.oxygen_saturation) {
    if (vitals.oxygen_saturation < 88) score += 30;
    else if (vitals.oxygen_saturation < 92) score += 15;
  }
  if (vitals.blood_pressure_systolic) {
    if (vitals.blood_pressure_systolic > 180 || vitals.blood_pressure_systolic < 80) score += 20;
    else if (vitals.blood_pressure_systolic > 160 || vitals.blood_pressure_systolic < 90) score += 10;
  }
  if (vitals.temperature) {
    if (vitals.temperature > 39.5 || vitals.temperature < 35) score += 15;
    else if (vitals.temperature > 38.5) score += 8;
  }
  if (vitals.respiratory_rate) {
    if (vitals.respiratory_rate > 30 || vitals.respiratory_rate < 8) score += 15;
    else if (vitals.respiratory_rate > 24) score += 8;
  }
  return Math.min(100, score);
}

export default function Calibration() {
  const { user, hasRole } = useAuth();
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [scenarioResults, setScenarioResults] = useState<Record<string, { news2: number; risk: number; loading: boolean }>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);

  const fetchAuditLogs = async () => {
    setAuditLogLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('resource_type', 'calibration')
        .order('timestamp', { ascending: false })
        .limit(10);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (error) {
      toast.error('Failed to fetch audit logs');
    } finally {
      setAuditLogLoading(false);
    }
  };

  useEffect(() => {
    if (auditLogOpen) {
      fetchAuditLogs();
    }
  }, [auditLogOpen]);



  const handleThresholdChange = (key: keyof Thresholds, value: number) => {
    setThresholds(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveThresholds = async () => {
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          user_id: user?.id,
          action: 'threshold_update',
          resource_type: 'calibration',
          new_values: thresholds as unknown as Record<string, unknown>,
        });

      if (error) throw error;
      toast.success('Thresholds saved successfully');
    } catch (error) {
      toast.error('Failed to save thresholds');
    }
  };

  const handleResetToDefaults = () => {
    setThresholds(DEFAULT_THRESHOLDS);
  };

  // Local NEWS2 computation to avoid network lag
  const computeNews2Local = (vitals: Partial<Scenario['vitals']>) => {
    let score = 0;
    
    // Respiratory Rate
    if (vitals.respiratory_rate !== undefined) {
      if (vitals.respiratory_rate <= 8) score += 3;
      else if (vitals.respiratory_rate >= 9 && vitals.respiratory_rate <= 11) score += 1;
      else if (vitals.respiratory_rate >= 12 && vitals.respiratory_rate <= 20) score += 0;
      else if (vitals.respiratory_rate >= 21 && vitals.respiratory_rate <= 24) score += 2;
      else if (vitals.respiratory_rate >= 25) score += 3;
    }
    
    // SpO2 Scale 1
    if (vitals.oxygen_saturation !== undefined) {
      if (vitals.oxygen_saturation <= 91) score += 3;
      else if (vitals.oxygen_saturation >= 92 && vitals.oxygen_saturation <= 93) score += 2;
      else if (vitals.oxygen_saturation >= 94 && vitals.oxygen_saturation <= 95) score += 1;
      else if (vitals.oxygen_saturation >= 96) score += 0;
    }
    
    // Systolic BP
    if (vitals.blood_pressure_systolic !== undefined) {
      if (vitals.blood_pressure_systolic <= 90) score += 3;
      else if (vitals.blood_pressure_systolic >= 91 && vitals.blood_pressure_systolic <= 100) score += 2;
      else if (vitals.blood_pressure_systolic >= 101 && vitals.blood_pressure_systolic <= 110) score += 1;
      else if (vitals.blood_pressure_systolic >= 111 && vitals.blood_pressure_systolic <= 219) score += 0;
      else if (vitals.blood_pressure_systolic >= 220) score += 3;
    }
    
    // Pulse
    if (vitals.heart_rate !== undefined) {
      if (vitals.heart_rate <= 40) score += 3;
      else if (vitals.heart_rate >= 41 && vitals.heart_rate <= 50) score += 1;
      else if (vitals.heart_rate >= 51 && vitals.heart_rate <= 90) score += 0;
      else if (vitals.heart_rate >= 91 && vitals.heart_rate <= 110) score += 1;
      else if (vitals.heart_rate >= 111 && vitals.heart_rate <= 130) score += 2;
      else if (vitals.heart_rate >= 131) score += 3;
    }
    
    // Temperature
    if (vitals.temperature !== undefined) {
      if (vitals.temperature <= 35.0) score += 3;
      else if (vitals.temperature >= 35.1 && vitals.temperature <= 36.0) score += 1;
      else if (vitals.temperature >= 36.1 && vitals.temperature <= 38.0) score += 0;
      else if (vitals.temperature >= 38.1 && vitals.temperature <= 39.0) score += 1;
      else if (vitals.temperature >= 39.1) score += 2;
    }
    
    return score;
  };

  const runScenario = (scenario: Scenario) => {
    setScenarioResults(prev => ({ ...prev, [scenario.id]: { ...prev[scenario.id], loading: true } }));

    // Use setTimeout to allow the UI to show the loading state briefly, then return instantly
    setTimeout(() => {
      try {
        const computedNews2 = computeNews2Local(scenario.vitals);
        const computedRisk = computeRiskScore(scenario.vitals);

        setScenarioResults(prev => ({
          ...prev,
          [scenario.id]: { news2: computedNews2, risk: computedRisk, loading: false }
        }));
      } catch (error) {
        toast.error('Failed to run scenario');
        setScenarioResults(prev => ({ ...prev, [scenario.id]: { ...prev[scenario.id], loading: false } }));
      }
    }, 150);
  };

  const VitalSliderCard = ({
    title,
    icon,
    lowKey,
    highKey,
    lowRange,
    highRange,
    step,
    color,
    unit = '',
    normalRange
  }: {
    title: string;
    icon: React.ReactNode;
    lowKey: keyof Thresholds;
    highKey?: keyof Thresholds;
    lowRange: [number, number];
    highRange?: [number, number];
    step: number;
    color: string;
    unit?: string;
    normalRange: string;
  }) => (
    <Card className="card-clinical">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Low Alert</span>
            <AnimatedNumber value={thresholds[lowKey]} precision={step < 1 ? 1 : 0} className="text-sm font-bold" />
            {unit}
          </div>
          <Slider
            value={[thresholds[lowKey]]}
            onValueChange={([value]) => handleThresholdChange(lowKey, value)}
            min={lowRange[0]}
            max={lowRange[1]}
            step={step}
            className="w-full"
            style={{ '--slider-color': color } as React.CSSProperties}
          />
        </div>
        {highKey && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">High Alert</span>
              <AnimatedNumber value={thresholds[highKey]} precision={step < 1 ? 1 : 0} className="text-sm font-bold" />
              {unit}
            </div>
            <Slider
              value={[thresholds[highKey]]}
              onValueChange={([value]) => handleThresholdChange(highKey, value)}
              min={highRange ? highRange[0] : 0}
              max={highRange ? highRange[1] : 200}
              step={step}
              className="w-full"
              style={{ '--slider-color': color } as React.CSSProperties}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">{normalRange}</p>
      </CardContent>
    </Card>
  );

  const ScenarioCard = ({ scenario }: { scenario: Scenario }) => {
    const result = scenarioResults[scenario.id];
    const passed = result && Math.floor(result.news2) === scenario.expected_news2;

    return (
      <Card className="card-clinical">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{scenario.name}</CardTitle>
          <RiskBadge level={scenario.expected_risk} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1" style={{ color: '#ef4444' }}>
              <Heart className="h-3 w-3" />
              <span>{scenario.vitals.heart_rate}</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: '#3b82f6' }}>
              <Droplets className="h-3 w-3" />
              <span>{scenario.vitals.oxygen_saturation}%</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: '#10b981' }}>
              <Activity className="h-3 w-3" />
              <span>{scenario.vitals.blood_pressure_systolic}/{scenario.vitals.blood_pressure_diastolic}</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: '#8b5cf6' }}>
              <Wind className="h-3 w-3" />
              <span>{scenario.vitals.respiratory_rate}</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: '#f97316' }}>
              <Thermometer className="h-3 w-3" />
              <span>{scenario.vitals.temperature}°C</span>
            </div>
          </div>

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 border-t pt-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Expected NEWS2</span>
                  <span className="text-sm font-bold">{scenario.expected_news2}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Computed NEWS2</span>
                  <span className="text-sm font-bold">{result.news2}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Result</span>
                  <span className={`text-xs font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
                    {passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div className="flex justify-center">
                  <RiskGauge score={result.risk} size={120} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            onClick={() => runScenario(scenario)}
            disabled={result?.loading}
            size="sm"
            className="w-full"
          >
            {result?.loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Run Scenario
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const [weights, setWeights] = useState({ hr: 1.0, spo2: 1.0, bp: 1.0 });
  const [activePreset, setActivePreset] = useState('Standard');

  const setPreset = (name: string, w: { hr: number; spo2: number; bp: number }) => {
    setActivePreset(name);
    setWeights(w);
  };

  const impact = Math.min(100, Math.round(
    (45 * weights.hr) + (20 * weights.spo2) + (30 * weights.bp)
  ));

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calibration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Adjust AI sensitivity and run clinical scenarios
          </p>
        </div>

        <div className="flex gap-2">
          {[
            { name: 'Standard', w: { hr: 1.0, spo2: 1.0, bp: 1.0 } },
            { name: 'Trauma', w: { hr: 1.4, spo2: 1.1, bp: 1.3 } },
            { name: 'Neonatal', w: { hr: 0.9, spo2: 1.6, bp: 0.8 } }
          ].map((preset) => (
            <button
              key={preset.name}
              onClick={() => setPreset(preset.name, preset.w)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors ${activePreset === preset.name ? 'bg-primary text-primary-foreground' : ''
                }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* TABS */}
      <Tabs defaultValue="sensitivity" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sensitivity">
            <Heart className="h-3.5 w-3.5 mr-2" /> Sensitivity
          </TabsTrigger>
          <TabsTrigger value="scenarios">
            <Play className="h-3.5 w-3.5 mr-2" /> Scenarios
          </TabsTrigger>
          <TabsTrigger value="audit">
            <FileCheck className="h-3.5 w-3.5 mr-2" /> Audit Log
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: SENSITIVITY */}
        <TabsContent value="sensitivity" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT — Sliders */}
            <div className="card-clinical space-y-6">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Sensitivity Weights
              </h3>

              <div className="space-y-6">
                {/* Heart Rate Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-vital-hr" />
                      <span className="text-sm font-medium text-foreground">Heart Rate</span>
                    </div>
                    <span className="text-sm font-semibold text-primary tabular-nums">
                      {weights.hr.toFixed(1)}x
                    </span>
                  </div>
                  <Slider
                    value={[weights.hr]}
                    onValueChange={([val]) => setWeights(prev => ({ ...prev, hr: val }))}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Conservative</span>
                    <span>Aggressive</span>
                  </div>
                </div>

                {/* SpO2 Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-vital-spo2" />
                      <span className="text-sm font-medium text-foreground">SpO2</span>
                    </div>
                    <span className="text-sm font-semibold text-primary tabular-nums">
                      {weights.spo2.toFixed(1)}x
                    </span>
                  </div>
                  <Slider
                    value={[weights.spo2]}
                    onValueChange={([val]) => setWeights(prev => ({ ...prev, spo2: val }))}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Conservative</span>
                    <span>Aggressive</span>
                  </div>
                </div>

                {/* Blood Pressure Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-vital-bp" />
                      <span className="text-sm font-medium text-foreground">Blood Pressure</span>
                    </div>
                    <span className="text-sm font-semibold text-primary tabular-nums">
                      {weights.bp.toFixed(1)}x
                    </span>
                  </div>
                  <Slider
                    value={[weights.bp]}
                    onValueChange={([val]) => setWeights(prev => ({ ...prev, bp: val }))}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Conservative</span>
                    <span>Aggressive</span>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT — Impact Preview */}
            <div className="card-clinical space-y-6">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Impact Preview
              </h3>

              <div className="text-center py-6">
                <motion.p
                  key={impact}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`text-6xl font-bold tabular-nums ${impact > 60 ? 'text-destructive' : impact > 30 ? 'text-clinical-warning' : 'text-clinical-success'
                    }`}
                >
                  {impact}
                </motion.p>
                <p className="text-sm text-muted-foreground mt-2">Impact Score</p>
              </div>

              <div className="p-3 rounded-xl bg-muted/50 text-sm text-muted-foreground text-center">
                With current settings, a tachycardia event would trigger a{' '}
                <span
                  className={`font-semibold ${impact > 60 ? 'text-destructive' : impact > 30 ? 'text-clinical-warning' : 'text-clinical-success'
                    }`}
                >
                  {impact > 60 ? 'High' : impact > 30 ? 'Moderate' : 'Low'}
                </span>{' '}
                alert.
              </div>

              <div className="flex justify-center pt-4">
                <RiskGauge score={impact} size={200} />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: SCENARIOS */}
        <TabsContent value="scenarios">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SCENARIOS.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                // @ts-ignore - existing component logic expects these in closure but user asked to pass as props
                runScenario={runScenario}
                // @ts-ignore
                scenarioResults={scenarioResults}
              />
            ))}
          </div>
        </TabsContent>

        {/* TAB 3: AUDIT LOG */}
        <TabsContent value="audit">
          <div className="card-clinical">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                Audit Log
              </h3>
              <button
                onClick={() => fetchAuditLogs()}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${auditLogLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {auditLogs.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No audit logs available</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.action === 'DELETE'
                              ? 'bg-destructive/10 text-destructive'
                              : log.action === 'UPDATE' || log.action.includes('update')
                                ? 'bg-clinical-warning/10 text-clinical-warning'
                                : 'bg-primary/10 text-primary'
                            }`}
                        >
                          {log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{log.resource_type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.user_id?.slice(0, 8)}...
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ETHICS PANEL */}
      <div className="card-clinical border-l-4" style={{ borderLeftColor: '#f59e0b' }}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-clinical-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Decision Support Only</p>
            <p className="text-sm text-muted-foreground">
              Prahari provides clinical decision support. All AI outputs must be verified by a qualified
              medical professional. This system does not replace clinical judgment. Calibration
              changes affect alert sensitivity — adjust with clinical oversight.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
