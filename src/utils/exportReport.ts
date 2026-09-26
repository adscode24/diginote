import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Transaction, Debt } from '../types';
import { formatRupiah, formatDateIndo, formatMonthYearIndo } from './formatters';

export function exportToXLSX(
  monthYearStr: string,
  transactions: Transaction[],
  debts: Debt[],
  summary: { totalIncome: number; totalExpense: number; netBalance: number; savingsRate: number }
): void {
  const wb = XLSX.utils.book_new();

  // 1. Sheet Ringkasan
  const summaryData = [
    ['LAPORAN KEUANGAN BULANAN - NOTAKU'],
    ['Periode:', monthYearStr],
    ['Tanggal Ekspor:', new Date().toLocaleDateString('id-ID')],
    [],
    ['METRIK UTAMA', 'NOMINAL (IDR)'],
    ['Total Pemasukan', summary.totalIncome],
    ['Total Pengeluaran', summary.totalExpense],
    ['Arus Kas Bersih (Surplus/Defisit)', summary.netBalance],
    ['Tingkat Tabungan (Savings Rate)', `${summary.savingsRate.toFixed(1)}%`],
    [],
    ['Total Hutang Belum Lunas', debts.filter(d => d.type === 'payable' && d.status !== 'paid').reduce((s, d) => s + d.remainingAmount, 0)],
    ['Total Piutang Belum Diterima', debts.filter(d => d.type === 'receivable' && d.status !== 'paid').reduce((s, d) => s + d.remainingAmount, 0)],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

  // 2. Sheet Transaksi
  const txData = [
    ['Tanggal', 'Jenis', 'Kategori', 'Sumber Dana', 'Keterangan', 'Nominal (Rp)'],
    ...transactions.map(t => [
      t.date,
      t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      t.categoryName,
      t.accountName || t.paymentMethod.toUpperCase(),
      t.description || '-',
      t.amount,
    ])
  ];
  const wsTx = XLSX.utils.aoa_to_sheet(txData);
  XLSX.utils.book_append_sheet(wb, wsTx, 'Daftar Transaksi');

  // 3. Sheet Hutang & Piutang
  const debtData = [
    ['Nama Pihak', 'Jenis Catatan', 'Tanggal Mulai', 'Jatuh Tempo', 'Total Awal (Rp)', 'Sisa (Rp)', 'Status', 'Catatan'],
    ...debts.map(d => [
      d.counterparty,
      d.type === 'payable' ? 'Hutang Saya' : 'Piutang Orang Lain',
      d.startDate,
      d.dueDate,
      d.totalAmount,
      d.remainingAmount,
      d.status === 'paid' ? 'LUNAS' : d.status === 'partial' ? 'SEBAGIAN' : 'BELUM DIBAYAR',
      d.notes || '-',
    ])
  ];
  const wsDebt = XLSX.utils.aoa_to_sheet(debtData);
  XLSX.utils.book_append_sheet(wb, wsDebt, 'Hutang Piutang');

  // Save workbook
  const safeName = monthYearStr.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Laporan_Keuangan_${safeName}.xlsx`);
}

export function exportToPDF(
  year: number,
  month: number,
  transactions: Transaction[],
  debts: Debt[],
  summary: { totalIncome: number; totalExpense: number; netBalance: number; savingsRate: number }
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const periodTitle = formatMonthYearIndo(year, month);
  let y = 18;

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('NOTAKU - LAPORAN KEUANGAN', 14, y);

  y += 7;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Periode: ${periodTitle} | Diekspor: ${new Date().toLocaleDateString('id-ID')}`, 14, y);

  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y);

  y += 10;
  // Summary Grid Boxes
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Ringkasan Arus Kas', 14, y);

  y += 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, 182, 28, 3, 3, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL PEMASUKAN', 20, y + 8);
  doc.text('TOTAL PENGELUARAN', 68, y + 8);
  doc.text('SURPLUS / DEFISIT', 116, y + 8);
  doc.text('SAVINGS RATE', 160, y + 8);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); // green
  doc.text(formatRupiah(summary.totalIncome), 20, y + 17);

  doc.setTextColor(239, 68, 68); // red
  doc.text(formatRupiah(summary.totalExpense), 68, y + 17);

  if (summary.netBalance >= 0) {
    doc.setTextColor(15, 23, 42);
  } else {
    doc.setTextColor(239, 68, 68);
  }
  doc.text(formatRupiah(summary.netBalance), 116, y + 17);

  doc.setTextColor(15, 23, 42);
  doc.text(`${summary.savingsRate.toFixed(1)}%`, 160, y + 17);

  y += 38;

  // Transactions Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`2. Catatan Transaksi (${transactions.length} Data)`, 14, y);

  y += 6;
  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('TANGGAL', 18, y + 5.5);
  doc.text('KATEGORI', 45, y + 5.5);
  doc.text('DESKRIPSI', 90, y + 5.5);
  doc.text('METODE', 145, y + 5.5);
  doc.text('NOMINAL', 170, y + 5.5);

  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const displayTx = transactions.slice(0, 35); // Fits cleanly on page 1-2
  for (let i = 0; i < displayTx.length; i++) {
    const tx = displayTx[i];
    if (y > 275) {
      doc.addPage();
      y = 18;
      // Re-print sub-header on page 2
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, 182, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text('TANGGAL', 18, y + 5.5);
      doc.text('KATEGORI', 45, y + 5.5);
      doc.text('DESKRIPSI', 90, y + 5.5);
      doc.text('METODE', 145, y + 5.5);
      doc.text('NOMINAL', 170, y + 5.5);
      y += 9;
      doc.setFont('helvetica', 'normal');
    }

    doc.setTextColor(71, 85, 105);
    doc.text(tx.date, 18, y);
    doc.text(tx.categoryName.substring(0, 22), 45, y);
    doc.text((tx.description || '-').substring(0, 30), 90, y);
    doc.text(tx.paymentMethod.toUpperCase(), 145, y);

    if (tx.type === 'income') {
      doc.setTextColor(16, 185, 129);
      doc.text(`+${formatRupiah(tx.amount)}`, 170, y);
    } else {
      doc.setTextColor(239, 68, 68);
      doc.text(`-${formatRupiah(tx.amount)}`, 170, y);
    }

    y += 6;
  }

  if (transactions.length > 35) {
    doc.setTextColor(148, 163, 184);
    doc.text(`...dan ${transactions.length - 35} transaksi lainnya (lihat file XLSX untuk data lengkap)`, 18, y);
    y += 8;
  }

  // Debt summary section
  if (debts.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 18;
    } else {
      y += 6;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('3. Ringkasan Hutang & Piutang', 14, y);

    y += 6;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('NAMA PIHAK', 18, y + 5.5);
    doc.text('JENIS', 60, y + 5.5);
    doc.text('JATUH TEMPO', 100, y + 5.5);
    doc.text('SISA', 140, y + 5.5);
    doc.text('STATUS', 170, y + 5.5);

    y += 9;
    doc.setFont('helvetica', 'normal');

    debts.slice(0, 15).forEach(debt => {
      doc.setTextColor(71, 85, 105);
      doc.text(debt.counterparty.substring(0, 20), 18, y);
      doc.text(debt.type === 'payable' ? 'Hutang Saya' : 'Piutang Orang', 60, y);
      doc.text(formatDateIndo(debt.dueDate), 100, y);
      doc.text(formatRupiah(debt.remainingAmount), 140, y);
      doc.text(debt.status === 'paid' ? 'LUNAS' : debt.status === 'partial' ? 'SEBAGIAN' : 'BELUM BAYAR', 170, y);
      y += 6;
    });
  }

  // Footer page number
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Halaman ${i} dari ${pageCount} | Notaku`, 196, 290, { align: 'right' });
  }

  const safeName = periodTitle.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Laporan_Keuangan_${safeName}.pdf`);
}
