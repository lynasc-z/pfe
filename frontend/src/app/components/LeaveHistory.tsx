import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, CheckCircle, Clock, Edit2, Eye, FileText, Search, Trash2, Upload, XCircle, Download } from 'lucide-react';
import * as api from '../../lib/api';
import { getToken } from '../../lib/api';
import type { LeaveRequest } from '../../types';

function mapStatus(status: string): 'approved' | 'pending' | 'rejected' | 'cancelled' {
  if (status === 'TREATED') return 'approved';
  if (status === 'CANCELLED') return 'cancelled';
  if (status.startsWith('REJECTED')) return 'rejected';
  return 'pending';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING_MANAGER: 'Pending Manager',
    APPROVED_BY_MANAGER: 'Manager Approved',
    PENDING_ADMIN: 'Awaiting Assignment',
    PENDING_HR_ACCEPT: 'Awaiting HR Accept',
    PENDING_HR: 'Pending HR',
    RESERVED: 'Reserved',
    AWAITING_DOCUMENT: 'Document Required',
    TREATED: 'Treated',
    REJECTED_BY_MANAGER: 'Rejected by Manager',
    REJECTED_BY_HR: 'Rejected by HR',
    CANCELLED: 'Cancelled',
  };
  return map[status] || status;
}

export function LeaveHistory({ onBack, onEdit }: { onBack: () => void; onEdit?: (req: LeaveRequest) => void }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending' | 'rejected' | 'cancelled'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const docInputRef = useRef<HTMLInputElement>(null);

  const reload = () => api.getMyRequests().then(data => { setRequests(data); }).catch(() => {});

  useEffect(() => {
    api.getMyRequests().then(data => {
      setRequests(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleDocUpload = async (file: File) => {
    if (!selectedLeave) return;
    setUploadingDoc(true);
    setUploadError('');
    try {
      const updated = await api.uploadAdditionalDocument(selectedLeave.id, file);
      toast.success('Document uploaded successfully');
      setSelectedLeave(updated);
      await reload();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploadingDoc(false);
    }
  };

  const filteredHistory = requests
    .filter(r => filter === 'all' || mapStatus(r.status) === filter)
    .filter(r => !search || r.leaveType.name.toLowerCase().includes(search.toLowerCase()));

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-600 hover:text-[#FF6B00] transition-colors mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>Back to Dashboard</span>
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Leave History
            </h1>
            <p className="text-gray-600">View and manage all your leave requests</p>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by type…"
                className="pl-9 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/30"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['all', 'approved', 'pending', 'rejected', 'cancelled'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f as typeof filter)}
                  className={`px-3 py-1.5 rounded-lg transition-all text-sm ${
                    filter === f
                      ? 'bg-[#FF6B00] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Type
                </th>
                <th className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Dates
                </th>
                <th className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Days
                </th>
                <th className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Status
                </th>
                <th className="text-left py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Submitted
                </th>
                <th className="text-right py-4 px-4 text-sm text-gray-600" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((leave, index) => {
                const display = mapStatus(leave.status);
                return (
                <motion.tr
                  key={leave.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-all"
                >
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#FF6B00]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-[#FF6B00]" />
                      </div>
                      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                        {leave.leaveType.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-600">
                    {new Date(leave.startDate).toLocaleDateString()} to {new Date(leave.endDate).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4">
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      {leave.daysCount} {leave.daysCount === 1 ? 'day' : 'days'}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(display)}
                      <span
                        className={`px-3 py-1 rounded-full text-xs ${
                          display === 'approved'
                            ? 'bg-green-100 text-green-700'
                            : display === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                      >
                        {statusLabel(leave.status)}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-600">
                    {new Date(leave.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedLeave(leave)}
                        className="p-2 text-gray-600 hover:text-[#FF6B00] hover:bg-[#FF6B00]/10 rounded-lg transition-all"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {leave.status === 'PENDING_MANAGER' && onEdit && (
                        <button
                          onClick={() => onEdit(leave)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Request"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {display === 'pending' && (
                        <button
                          onClick={async () => {
                            if (!confirm('Are you sure you want to cancel this request?')) return;
                            try {
                              await api.cancelRequest(leave.id);
                              toast.success('Request cancelled');
                              setRequests(prev => prev.filter(r => r.id !== leave.id));
                            } catch (err: any) {
                              toast.error(err?.message || 'Failed to cancel');
                            }
                          }}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Cancel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredHistory.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">No leave requests found</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLeave && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedLeave(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  Leave Request Details
                </h2>
                <p className="text-gray-600">Request ID: #{selectedLeave.id}</p>
              </div>
              <button
                onClick={() => setSelectedLeave(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Leave Type</p>
                  <p className="text-lg" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {selectedLeave.leaveType.name}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Duration</p>
                  <p className="text-lg" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {selectedLeave.daysCount} {selectedLeave.daysCount === 1 ? 'day' : 'days'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Start Date</p>
                  <p className="text-lg" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {new Date(selectedLeave.startDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">End Date</p>
                  <p className="text-lg" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {new Date(selectedLeave.endDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {selectedLeave.reason && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Reason</p>
                  <p className="text-gray-800">{selectedLeave.reason}</p>
                </div>
              )}

              {selectedLeave.recoveryDate && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Recovery Date</p>
                  <p className="text-gray-800">{new Date(selectedLeave.recoveryDate).toLocaleDateString()}</p>
                </div>
              )}

              {selectedLeave.documentPath && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Attached Document</p>
                  <a
                    href={`/uploads/${selectedLeave.documentPath}?token=${encodeURIComponent(getToken() || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF6B00]/10 text-[#FF6B00] rounded-lg hover:bg-[#FF6B00]/20 transition-all text-sm"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                  >
                    <Download className="w-4 h-4" />
                    View / Download PDF
                  </a>
                </div>
              )}

              {/* Action Timeline */}
              {selectedLeave.actions && selectedLeave.actions.length > 0 && (
              <div>
                <h3 className="text-lg mb-4" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  Request Tracking
                </h3>
                <div className="space-y-4">
                  {/* Submitted step */}
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#FF6B00] text-white">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      {selectedLeave.actions.length > 0 && (
                        <div className="w-0.5 h-12 bg-[#FF6B00]" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="mb-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>Submitted</p>
                      <p className="text-sm text-gray-600">{new Date(selectedLeave.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  {/* Action steps */}
                  {selectedLeave.actions.map((action, index) => (
                    <div key={action.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          action.action === 'APPROVE' ? 'bg-[#FF6B00] text-white' : 'bg-red-500 text-white'
                        }`}>
                          {action.action === 'APPROVE' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                        </div>
                        {index < selectedLeave.actions!.length - 1 && (
                          <div className="w-0.5 h-12 bg-[#FF6B00]" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="mb-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                          {action.action === 'APPROVE' ? 'Approved' : action.action === 'RESERVE' ? 'Reserved' : action.action === 'TREAT' ? 'Treated' : action.action === 'CANCEL' ? 'Cancelled' : 'Rejected'} by {action.actor.fullName} ({action.actor.role})
                        </p>
                        <p className="text-sm text-gray-600">{new Date(action.createdAt).toLocaleString()}</p>
                        {action.comment && <p className="text-sm text-gray-500 mt-1">"{action.comment}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* AWAITING_DOCUMENT — upload panel */}
              {selectedLeave.status === 'AWAITING_DOCUMENT' && (
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-300">
                  <p className="text-sm text-amber-800 mb-1 font-semibold">Document Required</p>
                  {(() => {
                    const reqDoc = selectedLeave.actions?.find(a => a.action === 'REQUEST_DOCUMENT');
                    return reqDoc?.comment ? (
                      <p className="text-sm text-amber-700 mb-3">HR note: "{reqDoc.comment}"</p>
                    ) : (
                      <p className="text-sm text-amber-700 mb-3">HR has requested an additional supporting document for this request.</p>
                    );
                  })()}
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await handleDocUpload(file);
                      e.target.value = '';
                    }}
                  />
                  {uploadError && <p className="text-sm text-red-600 mb-2">{uploadError}</p>}
                  <button
                    onClick={() => docInputRef.current?.click()}
                    disabled={uploadingDoc}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all text-sm disabled:opacity-50"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}
                  >
                    {uploadingDoc ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Upload PDF Document</>
                    )}
                  </button>
                </div>
              )}

              {/* Status banner */}
              {mapStatus(selectedLeave.status) === 'approved' && (
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-green-700 mb-1">Status</p>
                  <p className="text-lg text-green-900" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    Treated
                  </p>
                </div>
              )}
              {mapStatus(selectedLeave.status) === 'rejected' && (
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <p className="text-sm text-red-700 mb-1">Status</p>
                  <p className="text-lg text-red-900" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {statusLabel(selectedLeave.status)}
                  </p>
                  {(() => {
                    const rejection = selectedLeave.actions?.find(a => a.action === 'REJECT');
                    return rejection?.comment ? (
                      <p className="text-sm text-red-700 mt-2">
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>Reason:</span> "{rejection.comment}"
                      </p>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
