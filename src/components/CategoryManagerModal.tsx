import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, Tag } from 'lucide-react';
import { Category, TransactionType } from '../types';
import { useFinance } from '../context/FinanceContext';
import { CATEGORY_ICON_OPTIONS, COLOR_PALETTE } from '../utils/constants';
import { CategoryIcon } from './CategoryIcon';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: TransactionType;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'expense',
}) => {
  const { categories, addCategory, updateCategory, deleteCategory } = useFinance();
  const [activeType, setActiveType] = useState<TransactionType>(defaultType);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Tag');
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [error, setError] = useState('');

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const filteredCategories = categories.filter(c => c.type === activeType);

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setName(cat.name);
    setSelectedIcon(cat.icon);
    setSelectedColor(cat.color);
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setSelectedIcon('Tag');
    setSelectedColor(COLOR_PALETTE[0]);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama kategori tidak boleh kosong');
      return;
    }

    if (editingId) {
      updateCategory(editingId, {
        name: name.trim(),
        icon: selectedIcon,
        color: selectedColor,
      });
      handleCancelEdit();
    } else {
      addCategory({
        name: name.trim(),
        type: activeType,
        icon: selectedIcon,
        color: selectedColor,
        isDefault: false,
      });
      setName('');
      setError('');
    }
  };

  const handleDelete = (cat: Category) => {
    if (cat.isDefault) {
      alert('Kategori bawaan sistem tidak dapat dihapus');
      return;
    }
    if (confirm(`Hapus kategori "${cat.name}"?`)) {
      deleteCategory(cat.id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Kelola Kategori
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sesuaikan nama, warna, dan ikon untuk mencatat pengeluaran & pemasukan
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Type Toggle */}
          <div className="px-6 pt-4">
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveType('expense');
                handleCancelEdit();
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                activeType === 'expense'
                  ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Kategori Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveType('income');
                handleCancelEdit();
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                activeType === 'income'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Kategori Pemasukan
            </button>
          </div>
        </div>

        {/* Add / Edit Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {editingId ? 'Edit Kategori Terpilih' : 'Tambah Kategori Baru'}
          </div>

          <div className="space-y-3">
            <div>
              <input
                type="text"
                placeholder="Contoh: Belanja Online, Bensin, dll"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            {/* Color selection */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Pilih Warna
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className="w-6 h-6 rounded-full transition-transform flex items-center justify-center"
                    style={{ backgroundColor: c, transform: selectedColor === c ? 'scale(1.2)' : 'scale(1)' }}
                  >
                    {selectedColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Icon selection */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Pilih Ikon
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950/60">
                {CATEGORY_ICON_OPTIONS.map(iconName => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setSelectedIcon(iconName)}
                    className={`p-2 rounded-lg transition ${
                      selectedIcon === iconName
                        ? 'bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-400'
                        : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <CategoryIcon name={iconName} className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white transition shadow-xs"
              >
                {editingId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{editingId ? 'Simpan Perubahan' : 'Tambah Kategori'}</span>
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="py-2 px-3 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Existing Categories List */}
        <div className="p-6">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Daftar Kategori ({filteredCategories.length})
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {filteredCategories.map(cat => (
              <div
                key={cat.id}
                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                    style={{ backgroundColor: cat.color }}
                  >
                    <CategoryIcon name={cat.icon} className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {cat.name}
                    </span>
                    {cat.isDefault && (
                      <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500">
                        (Bawaan)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartEdit(cat)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Edit"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {!cat.isDefault && (
                    <button
                      onClick={() => handleDelete(cat)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};
