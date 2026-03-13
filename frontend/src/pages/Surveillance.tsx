import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Video, 
  VideoOff, 
  Wifi, 
  WifiOff, 
  AlertTriangle,
  Camera,
  Download,
  Trash2,
  Circle
} from 'lucide-react';
import RiskBadge from '@/components/RiskBadge';
import SkeletonCard from '@/components/SkeletonCard';

interface Detection {
  label: 'person' | 'fall_detected' | 'motion';
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, w, h] normalized 0-1
}

interface WebSocketMessage {
  type: 'frame' | 'detection' | 'error' | 'ping';
  frame?: string; // base64 encoded JPEG
  detections?: Detection[];
  fps?: number;
  timestamp?: string;
  message?: string;
}

interface DetectionEvent {
  id: string;
  timestamp: Date;
  type: 'person' | 'fall_detected' | 'motion';
  confidence: number;
  bbox: [number, number, number, number];
}

export default function Surveillance() {
  const { hasRole } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const animationFrameRef = useRef<number>();
  
  const [wsUrl, setWsUrl] = useState('ws://localhost:8000/ws/surveillance');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [detectionLog, setDetectionLog] = useState<DetectionEvent[]>([]);
  const [fps, setFps] = useState(0);
  const [detectionCounts, setDetectionCounts] = useState({
    persons: 0,
    falls: 0,
    motion: 0
  });

  const hasAccess = hasRole('admin', 'nurse', 'doctor');

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setConnectionStatus('connecting');
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setConnectionStatus('connected');
        ws.send(JSON.stringify({ type: 'start_stream' }));
      };
      
      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      ws.onclose = () => {
        setConnectionStatus('disconnected');
        wsRef.current = null;
      };
      
      ws.onerror = () => {
        setConnectionStatus('error');
        toast.error('WebSocket connection failed');
      };
      
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Failed to connect to WebSocket');
    }
  }, [wsUrl]);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'stop_stream' }));
      wsRef.current.close();
      wsRef.current = null;
      setConnectionStatus('disconnected');
    }
  }, []);

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'frame':
        if (message.frame) {
          drawFrameToCanvas(message.frame, message.detections || [], message.fps || 0);
        }
        break;
        
      case 'detection':
        if (message.detections) {
          handleDetections(message.detections, message.timestamp);
        }
        break;
        
      case 'error':
        toast.error(message.message || 'WebSocket error occurred');
        break;
        
      case 'ping':
        // Handle ping if needed
        break;
    }
  }, []);

  const drawFrameToCanvas = useCallback((frameBase64: string, detections: Detection[], fpsValue: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.onload = () => {
      // Resize canvas to fit container while maintaining aspect ratio
      const container = canvas.parentElement;
      if (!container) return;
      
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const aspectRatio = img.width / img.height;
      
      let canvasWidth = containerWidth;
      let canvasHeight = containerWidth / aspectRatio;
      
      if (canvasHeight > containerHeight) {
        canvasHeight = containerHeight;
        canvasWidth = canvasHeight * aspectRatio;
      }
      
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      
      // Draw the frame
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      
      // Draw detection boxes
      detections.forEach(detection => {
        const [x, y, w, h] = detection.bbox;
        const boxX = x * canvasWidth;
        const boxY = y * canvasHeight;
        const boxWidth = w * canvasWidth;
        const boxHeight = h * canvasHeight;
        
        // Set color based on detection type
        let color: string;
        switch (detection.label) {
          case 'person':
            color = '#3b82f6'; // blue
            break;
          case 'fall_detected':
            color = '#ef4444'; // red
            break;
          case 'motion':
            color = '#eab308'; // yellow
            break;
        }
        
        // Draw box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        
        // Draw label
        ctx.fillStyle = color;
        ctx.fillRect(boxX, boxY - 20, boxWidth, 20);
        
        ctx.fillStyle = 'white';
        ctx.font = '12px Inter';
        ctx.fillText(
          `${detection.label} (${Math.round(detection.confidence * 100)}%)`,
          boxX + 2,
          boxY - 5
        );
      });
      
      // Update FPS
      setFps(fpsValue);
    };
    
    img.src = `data:image/jpeg;base64,${frameBase64}`;
  }, []);

  const handleDetections = useCallback((detections: Detection[], timestamp?: string) => {
    const detectionTime = timestamp ? new Date(timestamp) : new Date();
    
    detections.forEach(detection => {
      const event: DetectionEvent = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: detectionTime,
        type: detection.label,
        confidence: detection.confidence,
        bbox: detection.bbox
      };
      
      setDetectionLog(prev => {
        const newLog = [event, ...prev].slice(0, 20); // Keep last 20 events
        return newLog;
      });
      
      // Update counts
      setDetectionCounts(prev => ({
        persons: prev.persons + (detection.label === 'person' ? 1 : 0),
        falls: prev.falls + (detection.label === 'fall_detected' ? 1 : 0),
        motion: prev.motion + (detection.label === 'motion' ? 1 : 0)
      }));
      
      // Handle fall detection alert
      if (detection.label === 'fall_detected' && hasAccess) {
        // Insert into Supabase alerts
        supabase.from('alerts').insert({
          type: 'fall_detection',
          severity: 'critical',
          title: 'Fall Detected',
          message: 'YOLOv9 detected a fall event in surveillance feed',
          source: 'surveillance',
          patient_id: null,
          status: 'active'
        });
        
        // Show toast notification
        toast.error('Fall detected!', {
          description: 'YOLOv9 detected a fall event in surveillance feed',
          icon: <AlertTriangle className="h-4 w-4" />
        });
      }
    });
  }, [hasAccess]);

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `surveillance-screenshot-${new Date().toISOString()}.png`;
    link.href = canvas.toDataURL();
    link.click();
    
    toast.success('Screenshot saved');
  }, []);

  const clearDetectionLog = useCallback(() => {
    setDetectionLog([]);
    setDetectionCounts({ persons: 0, falls: 0, motion: 0 });
    toast.success('Detection log cleared');
  }, []);

  useEffect(() => {
    return () => {
      disconnectWebSocket();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [disconnectWebSocket]);



  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Page Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">CCTV Surveillance</h1>
              <motion.div
                animate={{ scale: connectionStatus === 'connected' ? [1, 1.2, 1] : 1 }}
                transition={{ repeat: Infinity, duration: 2 }}
                className={`h-3 w-3 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500' :
                  connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
                }`}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered patient monitoring via YOLOv9 fall and motion detection
            </p>
          </div>
        </div>
        
        <Card className="card-clinical p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">AI decision support only — verify clinically.</p>
              <p className="text-xs text-amber-700 mt-1">Automated detection does not replace nursing observation.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Connection Panel */}
          <Card className="card-clinical p-6">
            <h3 className="text-lg font-semibold mb-4">Connection</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <Input
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder="WebSocket URL"
                  className="flex-1"
                />
                <Button
                  onClick={connectionStatus === 'connected' ? disconnectWebSocket : connectWebSocket}
                  variant={connectionStatus === 'connected' ? 'destructive' : 'default'}
                >
                  {connectionStatus === 'connected' ? 'Disconnect' : 'Connect'}
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connected' ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium capitalize">
                    {connectionStatus === 'connected' ? 'Connected' :
                     connectionStatus === 'connecting' ? 'Connecting...' :
                     connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}
                  </span>
                </div>
                
                {connectionStatus === 'connected' && (
                  <Badge variant="outline" className="text-xs">
                    {fps.toFixed(1)} FPS
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Live Feed Display */}
          <Card className="card-clinical p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Live Feed</h3>
              <div className="flex items-center gap-2">
                {isRecording && (
                  <motion.div
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="flex items-center gap-1 text-red-500"
                  >
                    <Circle className="h-3 w-3 fill-current" />
                    <span className="text-xs font-semibold">REC</span>
                  </motion.div>
                )}
                <Button
                  onClick={() => setIsRecording(!isRecording)}
                  variant="outline"
                  size="sm"
                >
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </Button>
                <Button
                  onClick={takeScreenshot}
                  variant="outline"
                  size="sm"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ height: '400px' }}>
              {connectionStatus === 'connected' ? (
                <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <VideoOff className="h-12 w-12 mb-3" />
                  <p className="text-sm font-medium">No feed</p>
                  <p className="text-xs">Connect to WebSocket to start surveillance</p>
                </div>
              )}
              
              {/* FPS Counter */}
              {connectionStatus === 'connected' && (
                <div className="absolute top-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono">
                  {fps.toFixed(1)} FPS
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Detection Sidebar */}
        <div className="space-y-6">
          <Card className="card-clinical p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Detection Log</h3>
              <Button
                onClick={clearDetectionLog}
                variant="ghost"
                size="sm"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <AnimatePresence>
                {detectionLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No detections yet</p>
                ) : (
                  detectionLog.map((event) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className={`p-3 rounded-lg border ${
                        event.type === 'fall_detected' 
                          ? 'bg-red-50 border-red-200' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <RiskBadge 
                          level={event.type === 'fall_detected' ? 'critical' : 'low'}
                          label={event.type.replace('_', ' ')}
                        />
                        <span className="text-xs text-muted-foreground">
                          {Math.round(event.confidence * 100)}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {event.timestamp.toLocaleTimeString()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Box: [{event.bbox.map(b => b.toFixed(2)).join(', ')}]
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </Card>

          <Card className="card-clinical p-6">
            <h3 className="text-lg font-semibold mb-4">Detection Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Persons detected</span>
                <span className="text-lg font-semibold">{detectionCounts.persons}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Falls detected (today)</span>
                <span className="text-lg font-semibold text-red-600">{detectionCounts.falls}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Motion events (today)</span>
                <span className="text-lg font-semibold">{detectionCounts.motion}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}