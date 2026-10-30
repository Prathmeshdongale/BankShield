/**
 * CustomerForm — React Hook Form for creating / editing a customer profile.
 * Used inside a <Modal> from CustomerList and CustomerDetail.
 */
import React from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { Loader2 }     from 'lucide-react';
import { Input }       from '@/components/ui/input';
import Select          from '@/components/ui/Select';
import { Button }      from '@/components/ui/button';
import { FieldError }  from '@/components/ui/ErrorMessage';

const createSchema = (isEdit) => z.object({
  firstName    : isEdit ? z.string().optional() : z.string().min(1, 'First name is required'),
  lastName     : isEdit ? z.string().optional() : z.string().min(1, 'Last name is required'),
  email        : isEdit ? z.string().optional() : z.string().email('Valid email is required'),
  phone        : z.string().optional(),
  password     : z.string().optional(),
  dateOfBirth  : z.string().optional(),
  gender       : z.enum(['male','female','other','prefer_not_to_say','']).optional(),
  nationality  : z.string().max(80).optional(),
  occupation   : z.string().max(150).optional(),
  annualIncome : z.coerce.number().nonnegative().optional().or(z.literal('')),
  riskRating   : z.enum(['low','medium','high','very_high']).optional(),
  isPep        : z.boolean().optional(),
  segment      : z.enum(['retail','premium','corporate','vip']).optional(),
});

const FIELD = ({ label, error, children }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
    {children}
    <FieldError message={error?.message} />
  </div>
);

export const CustomerForm = ({ defaultValues = {}, onSubmit, onCancel, isEdit = false }) => {
  const schema = createSchema(isEdit);
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(schema), defaultValues });

  const submit = async (data) => {
    // strip empty strings
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    );
    await onSubmit(clean);
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {!isEdit && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/30 dark:bg-blue-900/10 space-y-3">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-300">User Account Information</p>
          <div className="grid grid-cols-2 gap-3">
            <FIELD label="First Name *" error={errors.firstName}>
              <Input placeholder="e.g. John" {...register('firstName')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </FIELD>
            <FIELD label="Last Name *" error={errors.lastName}>
              <Input placeholder="e.g. Doe" {...register('lastName')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </FIELD>
            <FIELD label="Email Address *" error={errors.email}>
              <Input type="email" placeholder="john.doe@example.com" {...register('email')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </FIELD>
            <FIELD label="Phone Number" error={errors.phone}>
              <Input placeholder="+91 98765 43210" {...register('phone')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </FIELD>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <FIELD label="Date of Birth" error={errors.dateOfBirth}>
          <Input type="date" {...register('dateOfBirth')}
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </FIELD>

        <FIELD label="Gender" error={errors.gender}>
          <Select {...register('gender')} className="w-full">
            <option value="">— Select —</option>
            {['male','female','other','prefer_not_to_say'].map(g => (
              <option key={g} value={g}>{g.replace('_',' ')}</option>
            ))}
          </Select>
        </FIELD>

        <FIELD label="Nationality" error={errors.nationality}>
          <Input placeholder="e.g. Indian" {...register('nationality')}
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </FIELD>

        <FIELD label="Occupation" error={errors.occupation}>
          <Input placeholder="e.g. Software Engineer" {...register('occupation')}
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </FIELD>

        <FIELD label="Annual Income (₹)" error={errors.annualIncome}>
          <Input type="number" min="0" placeholder="1200000" {...register('annualIncome')}
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </FIELD>

        <FIELD label="Risk Rating" error={errors.riskRating}>
          <Select {...register('riskRating')} className="w-full">
            <option value="">— Select —</option>
            {['low','medium','high','very_high'].map(r => (
              <option key={r} value={r}>{r.replace('_',' ')}</option>
            ))}
          </Select>
        </FIELD>

        <FIELD label="Segment" error={errors.segment}>
          <Select {...register('segment')} className="w-full">
            <option value="">— Select —</option>
            {['retail','premium','corporate','vip'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </FIELD>

        <FIELD label="PEP (Politically Exposed)" error={errors.isPep}>
          <Select {...register('isPep', { setValueAs: v => v === 'true' })} className="w-full">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </Select>
        </FIELD>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Customer'}
        </Button>
      </div>
    </form>
  );
};

export default CustomerForm;
