import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Button from 'components/ui/Button';
import Icon from 'components/AppIcon';

export default function SupplierFormModal({ supplier, onSave, onClose, saving }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (supplier) {
      reset({
        name: supplier.name || '',
        contact_name: supplier.contact_name || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        notes: supplier.notes || '',
      });
    } else {
      reset({ name: '', contact_name: '', phone: '', email: '', notes: '' });
    }
  }, [supplier, reset]);

  const onSubmit = (values) => onSave(values);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--color-background)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            {supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" type="button">
            <Icon name="X" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              {...register('name', { required: 'Requerido' })}
              placeholder="Nombre del proveedor"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: errors.name ? 'var(--color-error)' : 'var(--color-border)', focusRingColor: 'var(--color-primary)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
            />
            {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>
              Nombre de contacto
            </label>
            <input
              {...register('contact_name')}
              placeholder="Persona de contacto"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Teléfono</label>
              <input
                {...register('phone')}
                placeholder="+54 9 11..."
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Email</label>
              <input
                {...register('email')}
                type="email"
                placeholder="proveedor@email.com"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Notas</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Condiciones, productos que provee, etc."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 resize-none"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" fullWidth onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" fullWidth loading={saving}>
              {supplier ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
