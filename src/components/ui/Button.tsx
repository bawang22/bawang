import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  children?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'yellow' | 'outline' | 'ghost';
  shape?: 'square' | 'pill';
}

export function Button({ variant = 'primary', shape = 'square', className, ...props }: ButtonProps) {
  const baseStyle = "inline-flex gap-2 items-center justify-center uppercase font-bold tracking-wider border-[3px] border-[#121212] transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed";
  const shadowStyle = variant !== 'ghost' ? "shadow-[4px_4px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none" : "active:translate-x-[1px] active:translate-y-[1px]";

  const variants = {
    primary: "bg-[#D02020] text-white hover:bg-[#D02020]/90",
    secondary: "bg-[#1040C0] text-white hover:bg-[#1040C0]/90",
    yellow: "bg-[#F0C020] text-[#121212] hover:bg-[#F0C020]/90",
    outline: "bg-white text-[#121212] hover:bg-gray-50 text-xl shadow-[4px_4px_0px_0px_#121212]",
    ghost: "border-none shadow-none text-[#121212] hover:bg-black/5"
  };

  const shapes = {
    square: "rounded-none px-6 py-3",
    pill: "rounded-full px-6 py-3"
  };

  return (
    <button className={cn(baseStyle, shadowStyle, variants[variant], shapes[shape], className)} {...props} />
  );
}


