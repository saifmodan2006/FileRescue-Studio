import {Slot} from '@radix-ui/react-slot';
import {cva} from 'class-variance-authority';
import {clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';
import type {ComponentProps} from 'react';

const styles = cva('button',{variants:{variant:{primary:'button-primary',secondary:'button-secondary',ghost:'button-ghost',danger:'button-danger'}},defaultVariants:{variant:'primary'}});
export function Button({asChild,variant,className,type='button',...props}: ComponentProps<'button'> & {
  asChild?:boolean; variant?:'primary'|'secondary'|'ghost'|'danger';
}) {
  const Component = asChild ? Slot : 'button';
  return <Component data-slot="button" className={twMerge(clsx(styles({variant}),className))} {...(!asChild && {type})} {...props}/>;
}
