import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWards, useHospital, useWardOccupancy, wardKeys } from '@/hooks/useWardData';
import { useAuth } from '@/contexts/AuthContext';
import { useAlertCounts } from '@/hooks/useAlerts';
import { useICUStore } from '@/store/useICUStore';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import AnimatedNumber from '@/components/AnimatedNumber';
import SkeletonCard from '@/components/SkeletonCard';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    Building2,
    Users,
    AlertTriangle,
    Activity,
    ArrowRight,
    TrendingUp,
    LayoutGrid,
    Plus,
    Edit2,
    Trash2
} from 'lucide-react';

export default function Wards() {
    const navigate = useNavigate();
    const { hasRole } = useAuth();
    const queryClient = useQueryClient();
    const { data: hospital } = useHospital();
    const { data: wards = [], isLoading: wardsLoading } = useWards();
    const { data: globalCounts } = useAlertCounts();
    const { setCurrentWard } = useICUStore();

    // Modals state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedWard, setSelectedWard] = useState<any>(null);

    const [wardForm, setWardForm] = useState({
        name: '',
        code: '',
        floor_number: 1,
        bed_capacity: 10,
        status: 'active',
        description: ''
    });

    const resetForm = () => {
        setWardForm({
            name: '',
            code: '',
            floor_number: 1,
            bed_capacity: 10,
            status: 'active',
            description: ''
        });
    };

    const handleAddWard = async () => {
        try {
            if (!hospital?.id) {
                toast.error('Hospital not found. Cannot create ward.');
                return;
            }
            if (!wardForm.name || !wardForm.code) {
                toast.error('Name and Code are required.');
                return;
            }

            const { error } = await supabase.from('wards').insert({
                hospital_id: hospital.id,
                name: wardForm.name,
                code: wardForm.code,
                type: 'icu', // Default to ICU for this dashboard
                floor_number: wardForm.floor_number,
                bed_capacity: wardForm.bed_capacity,
                current_occupancy: 0,
                status: wardForm.status,
                description: wardForm.description
            });

            if (error) throw error;
            toast.success('Ward created successfully');
            setIsAddModalOpen(false);
            resetForm();
            queryClient.invalidateQueries({ queryKey: wardKeys.wards });
        } catch (error: any) {
            console.error('Error adding ward:', error);
            toast.error(error.message || 'Failed to add ward');
        }
    };

    const handleEditWardClick = (e: React.MouseEvent, ward: any) => {
        e.stopPropagation();
        setSelectedWard(ward);
        setWardForm({
            name: ward.name,
            code: ward.code,
            floor_number: ward.floor_number,
            bed_capacity: ward.bed_capacity,
            status: ward.status,
            description: ward.description || ''
        });
        setIsEditModalOpen(true);
    };

    const handleUpdateWard = async () => {
        try {
            if (!selectedWard) return;

            const { error } = await supabase.from('wards').update({
                name: wardForm.name,
                code: wardForm.code,
                floor_number: wardForm.floor_number,
                bed_capacity: wardForm.bed_capacity,
                status: wardForm.status,
                description: wardForm.description
            }).eq('id', selectedWard.id);

            if (error) throw error;
            toast.success('Ward updated successfully');
            setIsEditModalOpen(false);
            setSelectedWard(null);
            resetForm();
            queryClient.invalidateQueries({ queryKey: wardKeys.wards });
        } catch (error: any) {
            console.error('Error updating ward:', error);
            toast.error(error.message || 'Failed to update ward');
        }
    };

    const handleDeleteWardClick = (e: React.MouseEvent, ward: any) => {
        e.stopPropagation();
        setSelectedWard(ward);
        setIsDeleteModalOpen(true);
    };

    const handleDeleteWard = async () => {
        if (!selectedWard) return;
        try {
            const { error } = await supabase.from('wards').delete().eq('id', selectedWard.id);
            if (error) throw error;
            toast.success('Ward deleted successfully');
            setIsDeleteModalOpen(false);
            setSelectedWard(null);
            queryClient.invalidateQueries({ queryKey: wardKeys.wards });
        } catch (error: any) {
            console.error('Error deleting ward:', error);
            toast.error(error.message || 'Failed to delete ward');
        }
    };

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    if (wardsLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="space-y-2">
                    <SkeletonCard className="h-8 w-48" />
                    <SkeletonCard className="h-4 w-32" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                    {[...Array(3)].map((_, i) => (
                        <SkeletonCard key={i} className="h-48" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">ICU Wards</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-500">{hospital?.name || 'Prahari Medical Center'}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="bg-white px-4 py-2 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-sm font-bold text-gray-600 tabular-nums">
                            <AnimatedNumber value={wards.length} /> Wards Active
                        </span>
                    </div>
                    {hasRole('admin', 'doctor') && (
                        <Button 
                          onClick={() => { resetForm(); setIsAddModalOpen(true); }}
                          className="rounded-2xl flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Add Ward
                        </Button>
                    )}
                </div>
            </div>

            {/* Ward Cards Grid */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
                {wards.map((ward) => (
                    <WardCard
                        key={ward.id}
                        ward={ward}
                        onClick={() => {
                            setCurrentWard(ward.id);
                            navigate(`/dashboard/ward/${ward.id}`);
                        }}
                        onEdit={(e) => handleEditWardClick(e, ward)}
                        onDelete={(e) => handleDeleteWardClick(e, ward)}
                        hasRole={hasRole}
                    />
                ))}
            </motion.div>

            {/* Hospital Stats Strip */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-1 md:grid-cols-4 gap-4"
            >
                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                        <Users className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Total Patients</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        <AnimatedNumber value={globalCounts?.admitted || 0} />
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 text-red-500 mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Critical Alerts</span>
                    </div>
                    <div className="text-2xl font-bold text-red-600 font-mono">
                        <AnimatedNumber value={globalCounts?.critical || 0} />
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-500 mb-1">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Unacked</span>
                    </div>
                    <div className="text-2xl font-bold text-amber-600">
                        <AnimatedNumber value={globalCounts?.unacked || 0} />
                    </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 text-blue-500 mb-1">
                        <Activity className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">System Status</span>
                    </div>
                    <div className="text-sm font-bold text-blue-600 flex items-center gap-1.5">
                        Operational
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                    </div>
                </div>
            </motion.div>

            {/* Modals */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Add New Ward</DialogTitle>
                        <DialogDescription>Create a new ICU ward in the system.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="add-name">Name</Label>
                            <Input id="add-name" value={wardForm.name} onChange={(e) => setWardForm({ ...wardForm, name: e.target.value })} placeholder="e.g. Surgical ICU" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="add-code">Code</Label>
                            <Input id="add-code" value={wardForm.code} onChange={(e) => setWardForm({ ...wardForm, code: e.target.value })} placeholder="e.g. SICU-1" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="add-floor">Floor Number</Label>
                                <Input id="add-floor" type="number" value={wardForm.floor_number} onChange={(e) => setWardForm({ ...wardForm, floor_number: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="add-capacity">Bed Capacity</Label>
                                <Input id="add-capacity" type="number" value={wardForm.bed_capacity} onChange={(e) => setWardForm({ ...wardForm, bed_capacity: parseInt(e.target.value) || 0 })} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="add-status">Status</Label>
                            <Select value={wardForm.status} onValueChange={(val) => setWardForm({ ...wardForm, status: val })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="maintenance">Maintenance</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="add-desc">Description</Label>
                            <Textarea id="add-desc" value={wardForm.description} onChange={(e) => setWardForm({ ...wardForm, description: e.target.value })} placeholder="Optional description..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddWard}>Create Ward</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Edit Ward</DialogTitle>
                        <DialogDescription>Update details for {selectedWard?.name}.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input id="edit-name" value={wardForm.name} onChange={(e) => setWardForm({ ...wardForm, name: e.target.value })} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-code">Code</Label>
                            <Input id="edit-code" value={wardForm.code} onChange={(e) => setWardForm({ ...wardForm, code: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit-floor">Floor Number</Label>
                                <Input id="edit-floor" type="number" value={wardForm.floor_number} onChange={(e) => setWardForm({ ...wardForm, floor_number: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-capacity">Bed Capacity</Label>
                                <Input id="edit-capacity" type="number" value={wardForm.bed_capacity} onChange={(e) => setWardForm({ ...wardForm, bed_capacity: parseInt(e.target.value) || 0 })} />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-status">Status</Label>
                            <Select value={wardForm.status} onValueChange={(val) => setWardForm({ ...wardForm, status: val })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="maintenance">Maintenance</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-desc">Description</Label>
                            <Textarea id="edit-desc" value={wardForm.description} onChange={(e) => setWardForm({ ...wardForm, description: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateWard}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-red-600">Delete Ward</DialogTitle>
                        <DialogDescription>
                            Are you absolutely sure you want to delete <b>{selectedWard?.name}</b>?
                            This action cannot be undone. All beds and associated records will be orphaned or deleted.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteWard}>Yes, Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function WardCard({ ward, onClick, onEdit, onDelete, hasRole }: { ward: any, onClick: () => void, onEdit: (e: any) => void, onDelete: (e: any) => void, hasRole: any }) {
    const { data: occupancy } = useWardOccupancy(ward.id);

    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, scale: 0.95 },
                show: { opacity: 1, scale: 1 }
            }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            onClick={onClick}
            className="group bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all cursor-pointer relative overflow-hidden"
        >
            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-primary/10 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all">
                        <LayoutGrid className="w-6 h-6" />
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Capacity</div>
                        <div className="text-lg font-bold text-gray-900">
                            {ward.capacity} <span className="text-sm text-gray-400 font-medium">beds</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-primary transition-colors">{ward.name}</h3>
                    {hasRole('admin', 'doctor') && (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50" onClick={onEdit}>
                                <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={onDelete}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </div>
                <p className="text-sm text-gray-500 mt-1 mb-6 line-clamp-2 font-medium">
                    {ward.description || 'Dedicated intensive care monitoring with real-time AI-driven anomaly detection.'}
                </p>

                <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-tighter">
                        <span className="text-gray-400">Occupancy</span>
                        <span className="text-gray-900">{occupancy?.occupancy_rate || 0}%</span>
                    </div>
                    <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${occupancy?.occupancy_rate || 0}%` }}
                            className="h-full bg-primary"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between mt-8">
                    <div className="flex -space-x-2">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400">
                                {String.fromCharCode(65 + i)}
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5 text-primary font-bold text-sm">
                        Enter Ward
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
