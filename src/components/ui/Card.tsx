import React from 'react';
import { cn } from '../../lib/utils';

export function Card({ children, className, hover = true, decoration, decorationColor = 'yellow' }: { children: React.ReactNode, className?: string, hover?: boolean, decoration?: 'circle' | 'square' | 'triangle', decorationColor?: 'red' | 'blue' | 'yellow' }) {
  
  const colors = {
    red: "bg-[#D02020]",
    blue: "bg-[#1040C0]",
    yellow: "bg-[#F0C020]"
  };

  return (
    <div className={cn(
      "bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] p-6 transition-transform duration-200 ease-out relative",
      hover && "hover:-translate-y-1 md:hover:-translate-y-2",
      className
    )}>
      {decoration === 'circle' && <div className={cn("absolute -top-3 -right-3 w-8 h-8 rounded-full", colors[decorationColor])} />}
      {decoration === 'square' && <div className={cn("absolute -top-3 -right-3 w-8 h-8 rounded-none", colors[decorationColor])} />}
      {decoration === 'triangle' && (
         <div className={cn("absolute -top-3 -right-3 w-8 h-8", colors[decorationColor])} style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }} />
      )}
      {children}
    </div>
  );
}
