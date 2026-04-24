import { ReactNode } from "react";

/** Mobile-first frame. On large screens, simulates a phone for prototype feel. */
export const PhoneFrame = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Mobile: full width. Desktop: centered phone-like container */}
      <div className="mx-auto min-h-screen w-full max-w-[440px] bg-background md:my-6 md:min-h-[calc(100vh-3rem)] md:rounded-[2.5rem] md:border md:border-border/60 md:shadow-pop md:overflow-hidden md:relative">
        {children}
      </div>
    </div>
  );
};
