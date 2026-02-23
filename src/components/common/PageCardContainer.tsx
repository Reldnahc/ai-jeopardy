import React from "react";

interface PageCardContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageCardContainer({ children, className }: PageCardContainerProps) {
  return (
    <div
      className={[
        "bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl lg:max-w-7xl",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
