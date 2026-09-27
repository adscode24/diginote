import React, { useState } from 'react';
import {
  Plus,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Edit2,
  Trash2,
  Receipt,
  X,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Debt, DebtType, DebtPayment } from '../types';
import { useFinance } from '../context/FinanceContext';
import { formatRupiah, formatDateIndo, calculateDueDateStatus, getNextDueDate } from '../utils/formatters';
import { AddDebtModal } from './AddDebtModal';
import { PayDebtModal } from './PayDebtModal';
import { ReceiptViewerModal } from './ReceiptViewerModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export const DebtsView: React.FC = () => {
  const { debts, deleteDebt, deleteDebtPayment } = useFinance();

  const [activeType, setActiveType] = useState<DebtType>('payable');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [debtToEdit, setDebtToEdit] = useState<Debt | null>(null);
  const [selectedDebtForPay, setSelectedDebtForPay] = useState<Debt | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<{ url: string; title: string } | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<{ debt: Debt; payment: DebtPayment } | null>(null);
  useBodyScrollLock(isAddModalOpen || selectedDebtForPay !== null || selectedReceipt !== null || selectedPaymentDetail !== null);

  const handleOpenAdd = () => {
    setDebtToEdit(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (debt: Debt) => {
    setDebtToEdit(debt);
    setIsAddModalOpen(true);
  };

  const handleDeletePayment = (debt: Debt, payment: DebtPayment) => {
    if (
      confirm(
        `Hapus riwayat pembayaran sebesar ${formatRupiah(payment.amount)} dari "${debt.counterparty}"?\n\nTransaksi pencatatan terkait di daftar transaksi akan otomatis dihapus dan sisa nominal hutang akan dikembalikan.`
      )
    ) {
      deleteDebtPayment(debt.id, payment.id);
      setSelectedPaymentDetail(null);
    }
  };

  // Filtered debts
  const filteredDebts = debts.filter(d => {
    if (d.type !== activeType) return false;
    if (statusFilter === 'unpaid' && d.status === 'paid') return false;
    if (statusFilter === 'paid' && d.status !== 'paid') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return d.counterparty.toLowerCase().includes(q) || (d.notes && d.notes.toLowerCase().includes(q));
    }
    return true;
  });

  // Calculate summaries
  const totalPayableRemaining = debts
    .filter(d => d.type === 'payable' && d.status !== 'paid')
    .reduce((sum, d) => sum + d.remainingAmount, 0);

  const totalReceivableRemaining = debts
    .filter(d => d.type === 'receivable' && d.status !== 'paid')
    .reduce((sum, d) => sum + d.remainingAmount, 0);

  const overdueCount = debts.filter(d => {
    if (d.status === 'paid') return false;
    const st = calculateDueDateStatus(d.dueDate);
    return st.isOverdue;
  }).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Catatan Hutang & Piutang
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pantau tanggal jatuh tempo bulanan, cicilan pembayaran, dan upload bukti bayar
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Catatan Hutang</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Hutang Saya (Kewajiban)
            </span>
            <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-2">
            {formatRupiah(totalPayableRemaining)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Harus dibayar ke pihak peminjam
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Piutang Saya (Tagihan)
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-2">
            {formatRupiah(totalReceivableRemaining)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Uang yang dipinjamkan ke orang lain
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Status Jatuh Tempo
            </span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              overdueCount > 0
                ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
            }`}>
              {overdueCount > 0 ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-2">
            {overdueCount > 0 ? `${overdueCount} Lewat Tempo` : 'Semua Terkontrol'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Periksa tanggal jatuh tempo bulanan
          </p>
        </div>
      </div>

      {/* Type Switcher Tabs & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1 p-1 bg-slate-200/60 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setActiveType('payable')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeType === 'payable'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Hutang Saya ({debts.filter(d => d.type === 'payable').length})
          </button>
          <button
            onClick={() => setActiveType('receivable')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeType === 'receivable'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Piutang Saya ({debts.filter(d => d.type === 'receivable').length})
          </button>
        </div>

        {/* Status segmented filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
            {(['all', 'unpaid', 'paid'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                  statusFilter === f
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {f === 'all' ? 'Semua' : f === 'unpaid' ? 'Belum Lunas' : 'Sudah Lunas'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Debt Cards List */}
      <div className="space-y-3">
        {filteredDebts.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
            <Receipt className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Belum Ada Catatan Hutang
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {activeType === 'payable'
                ? 'Catat hutang ke bank, teman, atau cicilan agar tidak terlambat bayar saat jatuh tempo.'
                : 'Catat piutang orang lain yang meminjam dana ke Anda untuk penagihan tepat waktu.'}
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Catatan Sekarang</span>
            </button>
          </div>
        ) : (
          filteredDebts.map(debt => {
            const isPaid = debt.status === 'paid';
            const paidAmount = debt.totalAmount - debt.remainingAmount;
            const progressPercent = Math.min(100, Math.round((paidAmount / debt.totalAmount) * 100));
            const effectiveDueDate = debt.dueDayOfMonth ? getNextDueDate(debt.dueDayOfMonth) : debt.dueDate;
            const dueStatus = calculateDueDateStatus(effectiveDueDate);
            const isExpanded = expandedDebtId === debt.id;
            const isInstallment = debt.installmentCategory && debt.installmentCategory !== 'non_installment';

            return (
              <div
                key={debt.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-slate-900 dark:text-white">
                          {debt.counterparty}
                        </span>
                        {isInstallment && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>
                              {debt.installmentCategory === 'tiered_installment'
                                ? 'KPR / Berjangka'
                                : 'Cicilan Tetap'}
                            </span>
                          </span>
                        )}
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Lunas
                          </span>
                        ) : dueStatus.isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded-md">
                            <AlertCircle className="w-3.5 h-3.5" /> {dueStatus.label}
                          </span>
                        ) : dueStatus.isDueSoon ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                            <Clock className="w-3.5 h-3.5" /> {dueStatus.label}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {dueStatus.label}
                          </span>
                        )}
                      </div>

                      {/* Installment details banner if installment */}
                      {isInstallment && debt.monthlyInstallment && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                          <span className="font-bold text-red-600 dark:text-red-400">
                            Cicilan: {formatRupiah(debt.monthlyInstallment)} / bln
                          </span>
                          {debt.remainingTenor !== undefined && (
                            <>
                              <span className="text-slate-300 dark:text-slate-700">·</span>
                              <span className="text-slate-600 dark:text-slate-400 font-medium">
                                Sisa Tenor: <strong>{debt.remainingTenor}x</strong> lagi
                              </span>
                            </>
                          )}
                          {debt.estimatedPayoffDate && (
                            <>
                              <span className="text-slate-300 dark:text-slate-700">·</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span>Lunas: {debt.estimatedPayoffDate}</span>
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Due date information */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>Mulai: {formatDateIndo(debt.startDate)}</span>
                        <span>·</span>
                        <span>
                          Jatuh Tempo: <strong>{formatDateIndo(effectiveDueDate)}</strong>
                        </span>
                        {debt.dueDayOfMonth && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Siklus tgl {debt.dueDayOfMonth} setiap bulan
                            </span>
                          </>
                        )}
                      </div>

                      {/* Tiered periods preview for KPR */}
                      {debt.tieredPeriods && debt.tieredPeriods.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {debt.tieredPeriods.map((tp, idx) => (
                            <span
                              key={tp.id || idx}
                              className={`text-[10px] px-2 py-0.5 rounded border ${
                                tp.isFloating
                                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {tp.name}: {tp.interestRate}% ({formatRupiah(tp.monthlyAmount)}/bln)
                            </span>
                          ))}
                        </div>
                      )}

                      {debt.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">
                          "{debt.notes}"
                        </p>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isPaid && (
                        <button
                          onClick={() => setSelectedDebtForPay(debt)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          <span>{activeType === 'payable' ? 'Bayar Hutang' : 'Terima Pembayaran'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEdit(debt)}
                        className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Edit Catatan Hutang"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Hapus catatan hutang "${debt.counterparty}"?`)) {
                            deleteDebt(debt.id);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Hapus Catatan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Financial Numbers & Progress Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                      <div>
                        <span className="text-slate-400 text-[11px]">Total Pinjaman</span>
                        <div className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                          {formatRupiah(debt.totalAmount)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px]">Sudah Dibayar</span>
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatRupiah(paidAmount)} ({progressPercent}%)
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px]">Sisa Hutang</span>
                        <div className="font-bold text-red-600 dark:text-red-400 tabular-nums text-sm">
                          {formatRupiah(debt.remainingAmount)}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Toggle Payments History */}
                  <div className="mt-3 flex items-center justify-between pt-1">
                    <button
                      onClick={() => setExpandedDebtId(isExpanded ? null : debt.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                    >
                      <span>Riwayat Pembayaran ({debt.payments.length})</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Payments History */}
                {isExpanded && (
                  <div className="bg-slate-50/80 dark:bg-slate-950/60 p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Daftar Pembayaran Tercatat:
                    </div>

                    {debt.payments.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                        Belum ada pembayaran yang dicatat untuk hutang ini.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {debt.payments.map((p, idx) => (
                          <div
                            key={p.id || idx}
                            onClick={() => setSelectedPaymentDetail({ debt, payment: p })}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-xs hover:border-emerald-400 dark:hover:border-emerald-600 transition cursor-pointer group"
                            title="Klik untuk melihat detail atau menghapus pembayaran ini"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-[10px]">
                                {debt.payments.length - idx}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                  <span>{formatRupiah(p.amount)}</span>
                                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition font-medium">
                                    · Klik untuk detail
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {formatDateIndo(p.paymentDate)}{' '}
                                  {p.accountName && <span>· Via {p.accountName}</span>}
                                  {p.notes && <span>· "{p.notes}"</span>}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {p.receiptImage && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedReceipt({
                                      url: p.receiptImage!,
                                      title: `Bukti Bayar ${debt.counterparty} - ${formatDateIndo(
                                        p.paymentDate
                                      )}`,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition"
                                  title="Lihat Bukti Foto"
                                >
                                  <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="hidden sm:inline">Bukti</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePayment(debt, p);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                                title="Hapus Pembayaran Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Payment Detail Modal */}
      {selectedPaymentDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Detail Riwayat Pembayaran
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {selectedPaymentDetail.debt.type === 'payable' ? 'Pembayaran Hutang' : 'Penerimaan Piutang'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPaymentDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info Details */}
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Pihak Terkait</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {selectedPaymentDetail.debt.counterparty}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Nominal Dibayar</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums text-sm">
                  {formatRupiah(selectedPaymentDetail.payment.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Tanggal Pembayaran</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatDateIndo(selectedPaymentDetail.payment.paymentDate)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Sumber Dana</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedPaymentDetail.payment.accountName || 'Tidak ditentukan'}
                </span>
              </div>
              <div className="flex flex-col gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Catatan</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 italic">
                  {selectedPaymentDetail.payment.notes || 'Tidak ada catatan'}
                </span>
              </div>
            </div>

            {/* Receipt Preview if available */}
            {selectedPaymentDetail.payment.receiptImage && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Bukti Pembayaran:
                </span>
                <div
                  onClick={() =>
                    setSelectedReceipt({
                      url: selectedPaymentDetail.payment.receiptImage!,
                      title: `Bukti Bayar ${selectedPaymentDetail.debt.counterparty}`,
                    })
                  }
                  className="relative group cursor-pointer overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 max-h-40 flex items-center justify-center bg-black/5"
                >
                  <img
                    src={selectedPaymentDetail.payment.receiptImage}
                    alt="Bukti Bayar"
                    className="max-h-40 w-full object-cover group-hover:scale-105 transition"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold gap-1 transition">
                    <ImageIcon className="w-4 h-4" />
                    <span>Perbesar Gambar</span>
                  </div>
                </div>
              </div>
            )}

            {/* Impact Notice */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200/80 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <span>
                Menghapus pembayaran ini akan mengembalikan nominal ke sisa hutang/piutang serta <strong>menghapus transaksi pencatatan terkait dari daftar transaksi</strong>.
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleDeletePayment(selectedPaymentDetail.debt, selectedPaymentDetail.payment)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-bold transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Pembayaran</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentDetail(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Debt Modal */}
      <AddDebtModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setDebtToEdit(null);
        }}
        defaultType={activeType}
        debtToEdit={debtToEdit}
      />

      {/* Pay Debt Modal */}
      <PayDebtModal
        isOpen={!!selectedDebtForPay}
        onClose={() => setSelectedDebtForPay(null)}
        debt={selectedDebtForPay}
      />

      {/* High-res Receipt Viewer Modal */}
      <ReceiptViewerModal
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        imageUrl={selectedReceipt?.url}
        title={selectedReceipt?.title}
      />
    </div>
  );
};
