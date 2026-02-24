import SvgOutlinedText from "../../common/SvgOutlinedText.tsx";

type Cotd = {
  category: string;
  description: string;
};

type FeaturedCategoryCardProps = {
  cotd: Cotd;
};

export default function FeaturedCategoryCard({ cotd }: FeaturedCategoryCardProps) {
  return (
    <div className="p-4 md:p-5 bg-gradient-to-br from-[#214a8d] via-[#2d66ba] to-[#1e4f95] rounded-2xl border border-blue-200/45 shadow-[0_14px_28px_rgba(16,42,92,0.26)]">
      <div className="text-center mb-4 md:mb-5">
        <span className="inline-block text-sm md:text-base uppercase tracking-[0.2em] text-blue-100/85 font-semibold">
          Featured Category
        </span>
      </div>

      <div className="h-16 md:h-20 lg:h-24 w-full mb-2">
        <SvgOutlinedText
          text={cotd.category}
          className="w-full h-full md:hidden"
          fill="#FFFFFF"
          shadowStyle="board"
          singleLine={false}
          maxLines={3}
          wrapAtChars={20}
          uppercase
        />
        <SvgOutlinedText
          text={cotd.category}
          className="hidden w-full h-full md:block"
          fill="#FFFFFF"
          shadowStyle="board"
          singleLine
          uppercase
        />
      </div>

      <p className="text-xs md:text-sm text-blue-50 text-center max-w-2xl mx-auto leading-relaxed">
        {cotd.description}
      </p>
    </div>
  );
}

