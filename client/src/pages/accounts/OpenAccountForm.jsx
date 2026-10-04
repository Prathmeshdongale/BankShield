import React, { useState, useEffect } from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { Loader2 }     from 'lucide-react';
import { accountService } from '@/services/accountService';
import { Input }       from '@/components/ui/input';
import Select          from '@/components/ui/Select';
import { Button }      from '@/components/ui/button';
import { FieldError }  from '@/components/ui/ErrorMessage';

const schema = z.object({
  customerId  : z.string().uuid('Must be a valid customer UUID.'),
  accountType : z.enum(['savings','current','salary','business'], { required_error:'Required.' }),
  currency    : z.string().default('INR'),
  nomineeName : z.string().max(150).optional().or(z.literal('')),
});

export const OpenAccountForm = ({ onSubmit, onCancel }) => {
  const [types, setTypes] = useState([]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(schema), defaultValues: { currency: 'INR' } });

  useEffect(() => {
    accountService.listTypes().then(r => setTypes(r.data?.types ?? [])).catch(() => {});
  }, []);

  const submit = async (data) => {
    const clean = { ...data };
    if (!clean.nomineeName) delete clean.nomineeName;
    await onSubmit(clean);
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Customer ID *</label>
        <Input placeholder="UUID of the customer" {...register('customerId')}
          className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        <FieldError message={errors.customerId?.message} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Account Type *</label>
        <Select {...register('accountType')} className="w-full">
          <option value="">— Select type —</option>
          {['savings','current','salary','business'].map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
          ))}
        </Select>
        <FieldError message={errors.accountType?.message} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Currency</label>
          <Select {...register('currency')} className="w-full">
            {['INR','USD','EUR','GBP','AED'].map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Nominee Name</label>
          <Input placeholder="Optional" {...register('nomineeName')}
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </div>
      </div>

      {types.length > 0 && (
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
          {types.find(t => t.type_name === 'savings') && (
            <p>Savings: min ₹{types.find(t=>t.type_name==='savings')?.min_balance ?? 500} · {types.find(t=>t.type_name==='savings')?.interest_rate ?? 3.5}% p.a.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Opening…' : 'Open Account'}
        </Button>
      </div>
    </form>
  );
};

export default OpenAccountForm;
