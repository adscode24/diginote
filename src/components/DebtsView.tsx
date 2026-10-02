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
  BellRing,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Debt, DebtType, DebtPayment, Bill, BillPayment } from '../types';
import { useFinance } from '../context/FinanceContext';
import { formatRupiah, formatDateIndo, calculateDueDateStatus, getNextDueDate, getDebtCycleStatus } from '../utils/formatters';
import { AddDebtModal } from './AddDebtModal';
import { PayDebtModal } from './PayDebtModal';
import { ReceiptViewerModal } from './ReceiptViewerModal';
import { BillModal } from './BillModal';
import { BillPayModal } from './BillPayModal';
import { useBillCards } from '../hooks/useBillCards';
import { useAmountPrivacy } from '../hooks/useAmountPrivacy';
import { useToast } from './Toast';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

type DebtsTab = 'debts' | 'bills';

export const DebtsView: React.FC = () => {
  const { debts, deleteDebt, deleteDebtPayment, deleteBill, billPayments, deleteBillPayment } = useFinance();
  const billCards = useBillCards();
  const { isHidden, toggleHidden, masked } = useAmountPrivacy();
  const { pushToast } = useToast();

  const [mainTab, setMainTab] = useState<DebtsTab>('debts');
  const [activeType, setActiveType] = useState<DebtType>('payable');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [debtToEdit, setDebtToEdit] = useState<Debt | null>(null);
  const [selectedDebtForPay, setSelectedDebtForPay] = useState<Debt | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<{ url: string; title: string } | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [showOverdueDetail, setShowOverdueDetail] = useState(false);
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<{ debt: Debt; payment: DebtPayment } | null>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [billToPay, setBillToPay] = useState<Bill | null>(null);
  useBodyScrollLock(isAddModalOpen || selectedDebtForPay !== null || selectedReceipt !== null || selectedPaymentDetail !== null || isBillModalOpen || billToPay !== null);

  const handleOpenAdd = () => {
    setDebtToEdit(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (debt: Debt) => {
    setDebtToEdit(debt);
    setIsAddModalOpen(true);
  };

  const handleDeleteBillPayment = (billName: string, payment: BillPayment) => {
    if (
      confirm(
        `Hapus riwayat pembayaran ${formatRupiah(payment.amount)} untuk "${billName}"?\n\nTransaksi pengeluaran terkait di daftar transaksi akan otomatis dihapus dan saldo sumber dana dikembalikan.`
      )
    ) {
      deleteBillPayment(payment.id);
      pushToast('Data berhasil dihapus.');
    }
  };

  const handleDeletePayment = (debt: Debt, payment: DebtPayment) => {
    if (
      confirm(
        `Hapus riwayat pembayaran sebesar ${formatRupiah(payment.amount)} dari "${debt.counterparty}"?\n\nTransaksi pencatatan terkait di daftar transaksi akan otomatis dihapus dan sisa nominal hutang akan dikembalikan.`
      )
    ) {
      deleteDebtPayment(debt.id, payment.id);
      setSelectedPaymentDetail(null);
      pushToast('Data berhasil dihapus.');
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
    // Status berbasis siklus + pembayaran (lihat getDebtCycleStatus):
    // cicilan yang dibayar tepat waktu tak lagi dihitung lewat tempo.
    return getDebtCycleStatus(d).overdue;
  }).length;

  // Rincian lewat tempo (predikat SAMA dengan penghitung di atas +
  // tagihan yang belum lunas: yang sudah dibayar tak pernah masuk list)
  const overdueDebts = debts
    .filter(d => {
      if (d.status === 'paid') return false;
      return getDebtCycleStatus(d).overdue;
    })
    .map(d => ({
      id: d.id,
      label: d.counterparty,
      sub: d.type === 'payable' ? 'Hutang' : 'Piutang',
      amount: d.remainingAmount,
      due: d.dueDayOfMonth ? getNextDueDate(d.dueDayOfMonth) : d.dueDate,
    }));
  const overdueBills = billCards
    .filter(b => !b.paid && b.statusInfo.isOverdue)
    .map(b => ({
      id: b.id,
      label: b.name,
      sub: `Tagihan · Tgl ${b.dueDayOfMonth}`,
      amount: b.amount,
      due: b.dueDateStr,
    }));

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
          onClick={() => {
            if (mainTab === 'bills') {
              setBillToEdit(null);
              setIsBillModalOpen(true);
            } else {
              handleOpenAdd();
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>{mainTab === 'bills' ? 'Tambah Tagihan Rutin' : 'Tambah Catatan Hutang'}</span>
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
          <div className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-2 flex items-center gap-1.5">
            {masked('hutang:all', totalPayableRemaining)}
            <button
              onClick={() => toggleHidden('hutang:all')}
              className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
              title={isHidden('hutang:all') ? 'Tampilkan semua angka' : 'Sembunyikan semua angka'}
            >
              {isHidden('hutang:all') ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
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
            <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-orange-600 dark:text-orange-400 tabular-nums mt-2 flex items-center gap-1.5">
            {masked('hutang:all', totalReceivableRemaining)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Uang yang dipinjamkan ke orang lain
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowOverdueDetail(v => !v)}
          title={overdueCount > 0 ? 'Klik untuk melihat rincian' : 'Tidak ada yang lewat tempo'}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs text-left hover:border-amber-500 transition w-full"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Status Jatuh Tempo
            </span>
            <div className="flex items-center gap-1.5">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                overdueCount > 0
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                  : 'bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400'
              }`}>
                {overdueCount > 0 ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </div>
              {showOverdueDetail ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-2">
            {overdueCount > 0 ? `${overdueCount} Lewat Tempo` : 'Semua Terkontrol'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {overdueCount > 0 ? 'Klik untuk melihat rincian' : 'Periksa tanggal jatuh tempo bulanan'}
          </p>
        </button>
      </div>

      {/* Rincian lewat tempo (hanya yang belum lunas) */}
      {showOverdueDetail && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/40 shadow-xs p-4 space-y-2">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Rincian Lewat Tempo ({overdueDebts.length + overdueBills.length})
          </div>
          {overdueDebts.length + overdueBills.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              Tidak ada tunggakan. Semua yang sudah dibayar tidak masuk daftar ini.
            </p>
          ) : (
            <div className="space-y-2">
              {overdueDebts.map(o => (
                <div
                  key={`debt-${o.id}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{o.label}</div>
                    <div className="text-[11px] text-slate-400">
                      {o.sub} · Jatuh tempo {formatDateIndo(o.due)}
                    </div>
                  </div>
                  <div className="font-bold text-red-600 dark:text-red-400 tabular-nums shrink-0">
                    {masked('hutang:all', o.amount)}
                  </div>
                </div>
              ))}
              {overdueBills.map(o => (
                <div
                  key={`bill-${o.id}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{o.label}</div>
                    <div className="text-[11px] text-slate-400">
                      {o.sub} · Jatuh tempo {formatDateIndo(o.due)}
                    </div>
                  </div>
                  <div className="font-bold text-red-600 dark:text-red-400 tabular-nums shrink-0">
                    {masked('hutang:all', o.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Type Switcher Tabs & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1 p-1 bg-slate-200/60 dark:bg-slate-800 rounded-xl overflow-x-auto">
          <button
            onClick={() => {
              setMainTab('debts');
              setActiveType('payable');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
              mainTab === 'debts' && activeType === 'payable'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Hutang Saya ({debts.filter(d => d.type === 'payable').length})
          </button>
          <button
            onClick={() => {
              setMainTab('debts');
              setActiveType('receivable');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
              mainTab === 'debts' && activeType === 'receivable'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Piutang Saya ({debts.filter(d => d.type === 'receivable').length})
          </button>
          <button
            onClick={() => setMainTab('bills')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              mainTab === 'bills'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>Tagihan Rutin ({billCards.filter(b => !b.paid).length})</span>
          </button>
        </div>

        {/* Status segmented filters (khusus hutang/piutang) */}
        {mainTab === 'debts' && (
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
        )}
      </div>

      {/* Bills List (diurut jatuh tempo terdekat) */}
      {mainTab === 'bills' && (
        <div className="space-y-3">
          {billCards.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <BellRing className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Belum Ada Tagihan Rutin
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Buat daftar tagihan (WiFi, listrik, air) beserta nominal dan tanggal jatuh tempo
                tiap bulan. Kartu pengingatnya muncul otomatis di Beranda.
              </p>
              <button
                onClick={() => {
                  setBillToEdit(null);
                  setIsBillModalOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Tagihan Sekarang</span>
              </button>
            </div>
          ) : (
            billCards.map(bill => {
              const history = billPayments
                .filter(p => p.billId === bill.id)
                .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));
              const isExpanded = expandedBillId === bill.id;
              return (
              <div
                key={bill.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden"
              >
                <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {bill.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        bill.paid
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/80 dark:text-orange-300'
                          : bill.statusInfo.isOverdue
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300'
                          : bill.statusInfo.isDueSoon
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {bill.paid ? 'Lunas' : bill.statusInfo.label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1.5">
                    <strong className="tabular-nums">{masked('hutang:all', bill.amount)}</strong>
                    <span className="text-[11px] text-slate-400"> · Tgl {bill.dueDayOfMonth} tiap bulan</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Jatuh tempo: {formatDateIndo(bill.dueDateStr)}
                    {bill.categoryName && ` · ${bill.categoryName}`}
                    {bill.notes && ` · ${bill.notes}`}
                  </div>
                  <button
                    onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}
                    className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                  >
                    <span>Riwayat Pembayaran ({history.length})</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setBillToPay(bill)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition shadow-xs"
                  >
                    Bayar
                  </button>
                  <button
                    onClick={() => {
                      setBillToEdit(bill);
                      setIsBillModalOpen(true);
                    }}
                    className="p-2 text-slate-400 hover:text-orange-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Edit tagihan"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Hapus tagihan rutin "${bill.name}"?`)) {
                        deleteBill(bill.id);
                        pushToast('Data berhasil dihapus.');
                      }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                    title="Hapus tagihan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                </div>
                {isExpanded && (
                  <div className="bg-slate-50/80 dark:bg-slate-950/60 px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 pt-2">
                      Daftar Pembayaran Tercatat:
                    </div>
                    {history.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                        Belum ada pembayaran yang dicatat untuk tagihan ini.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {history.map(p => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                                {p.monthKey ? p.monthKey.slice(5) : '•'}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                                  {masked('hutang:all', p.amount)}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {formatDateIndo(p.paymentDate)} · Periode {p.monthKey || '-'}
                                  {p.accountName && <span> · Via {p.accountName}</span>}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteBillPayment(bill.name, p)}
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition shrink-0"
                              title="Hapus Pembayaran Ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
      )}

      {/* Debt Cards List */}
      {mainTab === 'debts' && (
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
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition"
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
            // Status siklus: pembayaran pada siklus berjalan menutup status lewat tempo
            const cycle = getDebtCycleStatus(debt);
            const cycleDueStatus = calculateDueDateStatus(cycle.judgedDue || effectiveDueDate);
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
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Lunas
                          </span>
                        ) : cycle.covered ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Sudah Dibayar
                          </span>
                        ) : cycle.overdue ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded-md">
                            <AlertCircle className="w-3.5 h-3.5" /> {cycleDueStatus.label}
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
                              <span className="text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1">
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
                            <span className="text-orange-600 dark:text-orange-400 font-medium">
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
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          <span>{activeType === 'payable' ? 'Bayar Hutang' : 'Terima Pembayaran'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEdit(debt)}
                        className="p-2 text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Edit Catatan Hutang"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm('Apakah Anda yakin untuk menghapus data ini?')) {
                            deleteDebt(debt.id);
                            pushToast('Data berhasil dihapus.');
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
                          {masked('hutang:all', debt.totalAmount)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px]">Sudah Dibayar</span>
                        <div className="font-semibold text-orange-600 dark:text-orange-400 tabular-nums">
                          {masked('hutang:all', paidAmount)} ({progressPercent}%)
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px]">Sisa Hutang</span>
                        <div className="font-bold text-red-600 dark:text-red-400 tabular-nums text-sm">
                          {masked('hutang:all', debt.remainingAmount)}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-orange-500 h-full rounded-full transition-all duration-300"
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
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-xs hover:border-orange-400 dark:hover:border-orange-600 transition cursor-pointer group"
                            title="Klik untuk melihat detail atau menghapus pembayaran ini"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold text-[10px]">
                                {debt.payments.length - idx}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                  <span>{formatRupiah(p.amount)}</span>
                                  <span className="text-[10px] text-orange-600 dark:text-orange-400 opacity-0 group-hover:opacity-100 transition font-medium">
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
                                  <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
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
      )}

      {/* Payment Detail Modal */}
      {selectedPaymentDetail && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedPaymentDetail(null)}
        >
          <div
            className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl border-t sm:border border-slate-200 dark:border-slate-800 space-y-4 animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-2 mb-1 sm:hidden shrink-0" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center">
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
                <span className="font-extrabold text-orange-600 dark:text-orange-400 tabular-nums text-sm">
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

      {/* Bill Modal (Create / Edit Tagihan Rutin) */}
      <BillModal
        isOpen={isBillModalOpen}
        onClose={() => {
          setIsBillModalOpen(false);
          setBillToEdit(null);
        }}
        billToEdit={billToEdit}
      />

      {/* Bill Pay Modal */}
      <BillPayModal
        isOpen={!!billToPay}
        onClose={() => setBillToPay(null)}
        bill={billToPay}
      />
    </div>
  );
};
