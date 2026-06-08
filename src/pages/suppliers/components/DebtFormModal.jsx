import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Button from 'components/ui/Button';
import Icon from 'components/AppIcon';

export default function DebtFormModal({ debt, supplierId, onSave, onClose, saving }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (debt) {
      reset({
        description: debt.description || '',
        amount: debt.amount || '',
        due_date: debt.due_date || '',
        status: debt.status || 'pending',
      });
    } else {
      reset({ description: '', amount: '', due_date: '', status: 'pending' });
    }
  }, [debt, reset]);

  const onSubmit = (values) => {
    onSave({
      ...values,
      supplier_id: supplierId,
      amount: parseFloat(values.amount),
      due_date: values.due_date || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--color-background)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            {debt ? 'Editar deuda' : 'Registrar deuda'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" type="button">
            <Icon name="X" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>
              Descripción <span className="text-red-500">*</span>
            </label>
            <input
              {...register('description', { required: 'Requerido' })}
              placeholder="Factura #123, compra de insumos..."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: errors.description ? 'var(--color-error)' : 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
            />
            {errors.description && <p className="text-xs text-red-500 mt-0.5">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>
                Monto <span className="text-red-500">*</span>
              </label>
              <input
                {...register('amount', { required: 'Requerido', min: { value: 0, message: 'Debe ser mayor a 0' } })}
                type="number"
                step="0.01"
                placeholder="0.00"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: errors.amount ? 'var(--color-error)' : 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
              />
              {errors.amount && <p className="text-xs text-red-500 mt-0.5">{errors.amount.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Vencimiento</label>
              <input
                {...register('due_date')}
                type="date"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Estado</label>
            <select
              {...register('status')}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
            >
              <option value="pending">Pendiente</option>
              <option value="paid">Pagado</option>
              <option value="overdue">Vencido</option>
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" fullWidth onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" fullWidth loading={saving}>
              {debt ? 'Guardar cambios' : 'Registrar deuda'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
