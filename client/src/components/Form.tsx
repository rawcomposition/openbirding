import { FormProvider, type UseFormReturn, type FieldValues } from "react-hook-form";

type FormProps<T extends FieldValues = FieldValues> = {
  form: UseFormReturn<T>;
  onSubmit: (data: T) => void;
  children: React.ReactNode;
  className?: string;
};

const Form = ({ form, onSubmit, children, className }: FormProps) => {
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={className}>
        {children}
      </form>
    </FormProvider>
  );
};

export { Form };
